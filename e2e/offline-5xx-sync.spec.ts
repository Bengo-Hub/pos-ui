import { test, expect, type Page, request as pwRequest } from '@playwright/test';

/**
 * Offline-on-5xx E2E against the LIVE platform — the scenario that was actually broken
 * (2026-08-16 incident): backend REACHABLE (navigator.onLine stays true, GETs succeed) but
 * write endpoints return HTTP 500 (a crash-looping/erroring backend, not a dead network).
 * Complements e2e/offline-sync.spec.ts, which covers full network loss (context.setOffline).
 *
 * Flow: PIN-login (online) -> warm catalog -> intercept POST .../pos/orders and
 * .../payment-intents to return 500 -> place a cash sale through the real terminal -> assert
 * it queues offline exactly like a network outage would -> remove the 500 intercept (server
 * "recovers") -> assert the queue drains and the order lands on the backend exactly once.
 *
 * Env: same as offline-sync.spec.ts (BASE_URL, E2E_ORG_SLUG, E2E_POS_PIN, POS_API_URL).
 */

const ORG = process.env.E2E_ORG_SLUG || 'codevertex-demo';
const PIN = process.env.E2E_POS_PIN || '0000';
const API = process.env.POS_API_URL || 'https://posapi.codevertexafrica.com';

async function idbGetAll(page: Page, store: string): Promise<any[]> {
  return page.evaluate(
    (store) =>
      new Promise<any[]>((resolve) => {
        const req = indexedDB.open('pos_offline_db');
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(store)) return resolve([]);
          const tx = db.transaction(store, 'readonly');
          const all = tx.objectStore(store).getAll();
          all.onsuccess = () => resolve(all.result as any[]);
          all.onerror = () => resolve([]);
        };
        req.onerror = () => resolve([]);
      }),
    store,
  );
}

async function getAuth(page: Page): Promise<{ token: string; tenantId: string }> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('pos-auth-storage');
    const s = raw ? JSON.parse(raw).state : {};
    return { token: s?.session?.accessToken ?? '', tenantId: s?.user?.tenant_id ?? '' };
  });
}

async function pinLogin(page: Page) {
  await page.goto(`/${ORG}/pin-login`, { waitUntil: 'domcontentloaded' });
  const outlet = page.getByRole('button', { name: /Quick Service/i }).first();
  const key = (d: string) => page.locator(`[data-testid="pin-key-${d}"]:visible`).first();
  const onOutletStep = await outlet.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
  if (onOutletStep) await outlet.click();
  await expect(key('1')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(600);
  for (const d of PIN.split('')) {
    // force: true — local `next dev` renders a floating "Open Next.js Dev Tools" button
    // (bottom-right) that doesn't exist in production builds and isn't part of the app;
    // it can overlap the keypad. Not an app bug, just a dev-server-only test artifact.
    await key(d).click({ force: true });
    await page.waitForTimeout(150);
  }
  const navigated = await page
    .waitForURL(new RegExp(`/${ORG}/(dashboard|order|orders|sell)`), { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!navigated) {
    const err = await page.getByText(/Incorrect PIN|Too many/i).first().textContent().catch(() => null);
    throw new Error(`PIN login did not navigate (still on ${page.url()}). Error shown: ${err ?? 'none'}`);
  }
}

test.describe('POS offline-on-5xx sync (live)', () => {
  test.setTimeout(180_000);

  test('server 500s on writes (network otherwise fine) -> sale queues offline -> server recovers -> syncs exactly once', async ({
    page,
    context,
  }) => {
    const logs: string[] = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));

    // 1) Normal online login + warm the terminal/catalog — no failure injection yet.
    await pinLogin(page);
    await page.goto(`/${ORG}/order`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('pos-product-card').first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);

    const auth = await getAuth(page);
    expect(auth.token, 'should have a terminal access token').not.toEqual('');

    const ordersBefore = await idbGetAll(page, 'offlineOrders');

    // 2) Start injecting 500s on WRITE endpoints only — GETs (catalog, /auth/me, etc.) still
    //    succeed, and navigator.onLine stays true throughout. This is the actual incident shape:
    //    the backend is up and reachable, just erroring — not a dead network.
    let intercepting = true;
    await page.route('**/pos/orders', async (route) => {
      if (route.request().method() !== 'POST' || !intercepting) return route.continue();
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal_error' }) });
    });
    await page.route('**/payment-intents', async (route) => {
      if (route.request().method() !== 'POST' || !intercepting) return route.continue();
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal_error' }) });
    });

    // 3) Place a cash sale through the real UI while the backend is "erroring."
    // force: true throughout — see the dev-tools-overlay note in pinLogin() above.
    await page.getByTestId('pos-product-card').first().click({ force: true });
    const takeaway = page.getByRole('button', { name: /^Takeaway$/i });
    if (await takeaway.isVisible().catch(() => false)) await takeaway.click({ force: true });
    // :visible — the terminal renders both a mobile and desktop layout in the DOM
    // simultaneously (one display-hidden), same gotcha as pinLogin()'s keypad above.
    const cashTender = page.locator('[data-testid="pos-tender-cash"]:visible').first();
    if (!(await cashTender.isVisible().catch(() => false))) {
      await page.locator('button:has-text("Cart"), button:has-text("View order"), [aria-label*="cart" i]').first().click({ force: true }).catch(() => {});
    }
    await expect(cashTender).toBeVisible({ timeout: 10_000 });

    const onlineAtPlacement = await page.evaluate(() => navigator.onLine);
    console.log('navigator.onLine while backend 500s:', onlineAtPlacement);
    expect(onlineAtPlacement, 'the OS network layer is fine — this is a server error, not a dead connection').toBe(true);

    await cashTender.click({ force: true });
    await page.locator('[data-testid="pos-confirm-cash"]:visible').first().click({ force: true });

    const toastText = await page.locator('[data-sonner-toast], .toast, [role="status"]').first().textContent({ timeout: 4000 }).catch(() => null);
    if (toastText) console.log('TOAST after confirm:', toastText);

    // 4) Assert it queued offline DESPITE navigator.onLine being true the whole time — this is
    //    exactly the bug: before the fix, a plain 500 was misclassified as "server reached fine"
    //    and this queue never engaged, the sale just errored and blocked the till.
    await expect
      .poll(async () => (await idbGetAll(page, 'offlineOrders')).length, { timeout: 10_000, message: 'offline order should appear despite 5xx (not offline) responses' })
      .toBeGreaterThan(ordersBefore.length);
    if (logs.length) console.log('PAGE CONSOLE:\n' + logs.slice(-25).join('\n'));

    const ordersAfter = await idbGetAll(page, 'offlineOrders');
    const newOrder = ordersAfter[ordersAfter.length - 1];
    expect(newOrder.synced, 'queued order should be unsynced').toBeFalsy();
    expect(newOrder.local_id, 'queued order should carry a client local_id').toBeTruthy();

    const stillOnline = await page.evaluate(() => navigator.onLine);
    expect(stillOnline, 'navigator.onLine must remain true — this test never touches the real network').toBe(true);

    await expect(page.getByText(/Offline mode|Syncing offline data/i).first()).toBeVisible({ timeout: 5_000 });

    // 5) "Server recovers": stop injecting 500s and let real requests through again.
    intercepting = false;
    page.on('response', (res) => {
      if (res.url().includes('/pos/orders') && res.request().method() === 'POST') {
        res.text().then((b) => console.log(`[SYNC POST ${res.status()}] ${res.url()} :: ${b.slice(0, 160)}`)).catch(() => {});
      }
    });
    await page.evaluate(() => window.dispatchEvent(new Event('pos:sync-now')));

    const syncedId = await page
      .waitForFunction(
        () =>
          new Promise((resolve) => {
            const req = indexedDB.open('pos_offline_db');
            req.onsuccess = () => {
              const tx = req.result.transaction('offlineOrders', 'readonly');
              const all = tx.objectStore('offlineOrders').getAll();
              all.onsuccess = () => {
                const o = (all.result as any[]).find((x) => x.synced && x.server_order_id);
                resolve(o ? o.server_order_id : null);
              };
              all.onerror = () => resolve(null);
            };
            req.onerror = () => resolve(null);
          }),
        null,
        { timeout: 90_000, polling: 3000 },
      )
      .then((h) => h.jsonValue())
      .catch(() => null);

    if (!syncedId) {
      const row = (await idbGetAll(page, 'offlineOrders')).find((x) => x.local_id === newOrder.local_id);
      console.log('UNSYNCED ORDER ROW:', JSON.stringify(row));
      console.log('SYNC CONSOLE:\n' + logs.slice(-30).join('\n'));
    }
    expect(syncedId, 'order should sync once the backend stops 500ing').toBeTruthy();

    // 6) Backend + idempotency verification, same pattern as offline-sync.spec.ts.
    const api = await pwRequest.newContext({
      baseURL: API,
      extraHTTPHeaders: {
        Authorization: `Bearer ${auth.token}`,
        'X-Tenant-ID': auth.tenantId,
        'X-Tenant-Slug': ORG,
        'X-Outlet-ID': newOrder.outlet_id,
      },
    });
    const withRetry = async (fn: () => Promise<any>) => {
      for (let i = 0; i < 6; i++) {
        const res = await fn();
        if (res.status() !== 429) return res;
        await new Promise((r) => setTimeout(r, 12_000));
      }
      return fn();
    };
    const getOrder = await withRetry(() => api.get(`/api/v1/${auth.tenantId}/pos/orders/${syncedId}`));
    expect(getOrder.ok(), `GET order ${syncedId} should be 200`).toBeTruthy();
    const orderBody = await getOrder.json();
    expect(orderBody.client_reference ?? orderBody.data?.client_reference).toBe(newOrder.local_id);

    const replay = await withRetry(() =>
      api.post(`/api/v1/${auth.tenantId}/pos/orders`, {
        headers: { 'Idempotency-Key': newOrder.local_id },
        data: { outlet_id: newOrder.outlet_id, currency: newOrder.currency, lines: newOrder.lines, client_reference: newOrder.local_id },
      }),
    );
    expect(replay.ok(), 'idempotent replay should succeed').toBeTruthy();
    const replayBody = await replay.json();
    const replayId = replayBody.id ?? replayBody.data?.id;
    expect(replayId, 'replay must return the SAME order id (no duplicate)').toBe(syncedId);

    await api.dispose();
    console.log('OFFLINE-5XX-SYNC OK — server order:', syncedId, 'client_ref:', newOrder.local_id);
  });
});
