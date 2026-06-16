import { test, expect, type Page, request as pwRequest } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Offline-sync E2E against the LIVE platform.
 *
 * Flow: PIN-login (online, warms catalog/profile) → go offline → place a cash sale through the
 * real terminal → reload offline (cold-start) → reconnect → assert the queue drains and the order
 * is created on the backend EXACTLY ONCE (idempotent replay), then clean up the created order.
 *
 * Env: BASE_URL, E2E_ORG_SLUG (default codevertex-demo), E2E_POS_PIN (default 0000=Admin),
 *      POS_API_URL (default https://posapi.codevertexitsolutions.com).
 */

const ORG = process.env.E2E_ORG_SLUG || 'codevertex-demo';
const PIN = process.env.E2E_POS_PIN || '0000';
const API = process.env.POS_API_URL || 'https://posapi.codevertexitsolutions.com';
const ARTIFACT = path.join('test-results', 'offline-created.json');

// ── IndexedDB helpers (read pos_offline_db directly in the page) ──────────────────
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

async function getAuth(page: Page): Promise<{ token: string; tenantId: string; outletId: string }> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('pos-auth-storage');
    const s = raw ? JSON.parse(raw).state : {};
    return {
      token: s?.session?.accessToken ?? '',
      tenantId: s?.user?.tenant_id ?? '',
      outletId: s?.outlet?.id ?? s?.selectedOutletId ?? localStorage.getItem('pos-selected-outlet-id') ?? '',
    };
  });
}

// ── PIN login, selecting the Retail outlet (inline-pay flow) before entering the PIN ──
async function pinLogin(page: Page) {
  page.on('response', async (res) => {
    if (res.url().includes('/auth/pin')) {
      const body = await res.text().catch(() => '');
      console.log(`[PIN ${res.request().method()} ${res.status()}] ${res.url()} :: ${body.slice(0, 200)}`);
    }
  });
  await page.goto(`/${ORG}/pin-login`, { waitUntil: 'domcontentloaded' });

  // Quick Service outlet: pay-mode inline checkout (not hospitality send-to-kitchen) and the
  // richest demo catalog, so the product grid actually populates.
  const outlet = page.getByRole('button', { name: /Quick Service/i }).first();
  const keypad = page.getByTestId('pin-key-1');

  // The keypad renders first (default step), then an effect switches multi-outlet tenants to
  // the outlet step once outlets load. So wait for the outlet step to APPEAR (don't trust an
  // early keypad), pick the outlet, and only THEN enter the PIN — otherwise digits are lost
  // when the keypad is swapped out mid-entry.
  const onOutletStep = await outlet.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
  if (onOutletStep) {
    await outlet.click();
  }

  await expect(keypad).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(600);
  for (const d of PIN.split('')) {
    await page.getByTestId(`pin-key-${d}`).click();
    await page.waitForTimeout(150);
  }

  // Surface a wrong-PIN error fast instead of waiting the full timeout.
  const navigated = await page
    .waitForURL(new RegExp(`/${ORG}/(dashboard|order|orders|sell)`), { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!navigated) {
    const err = await page.getByText(/Incorrect PIN|Too many/i).first().textContent().catch(() => null);
    throw new Error(`PIN login did not navigate (still on ${page.url()}). Error shown: ${err ?? 'none'}`);
  }
}

test.describe('POS offline sync (live)', () => {
  test.setTimeout(180_000);

  test('place sale offline → reload offline → reconnect → syncs exactly once', async ({ page, context }) => {
    const logs: string[] = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));

    // 1) Online login + warm the terminal/catalog.
    await pinLogin(page);
    await page.goto(`/${ORG}/order`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('pos-product-card').first()).toBeVisible({ timeout: 30_000 });
    // Give the catalog prewarm a moment to write through to IndexedDB.
    await page.waitForTimeout(1500);

    // The offline shell needs an ACTIVE service worker that has cached this route's document.
    // Wait for it to register+activate, then do one online reload so the SW (now controlling
    // the page) intercepts and caches the navigation — mirroring a terminal that's warm before
    // an outage. Without this, an offline reload has no cached document → blank page.
    const swActive = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const ready = navigator.serviceWorker.ready.then(() => true);
      const timeout = new Promise<boolean>((r) => setTimeout(() => r(false), 15000));
      return Promise.race([ready, timeout]);
    });
    console.log('SERVICE_WORKER_ACTIVE:', swActive);
    expect(swActive, 'a service worker must be active for offline cold-start').toBe(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('pos-product-card').first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1000);

    const auth = await getAuth(page);
    expect(auth.token, 'should have a terminal access token').not.toEqual('');
    expect(auth.tenantId).not.toEqual('');

    const ordersBefore = await idbGetAll(page, 'offlineOrders');

    // 2) Go OFFLINE and place a cash sale through the real UI.
    await context.setOffline(true);
    await expect(page.getByText(/Offline/i).first()).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('pos-product-card').first().click();

    // Quick-service/hospitality outlets require an order type before placing. Pick Takeaway
    // (→ pay flow, not dine-in send-to-kitchen). Retail/pharmacy don't show this selector.
    const takeaway = page.getByRole('button', { name: /^Takeaway$/i });
    if (await takeaway.isVisible().catch(() => false)) {
      await takeaway.click();
    }

    // Open the cart/tender area if the cash tender isn't already visible (narrow layouts).
    const cashTender = page.getByTestId('pos-tender-cash');
    if (!(await cashTender.isVisible().catch(() => false))) {
      await page.locator('button:has-text("Cart"), button:has-text("View order"), [aria-label*="cart" i]').first().click().catch(() => {});
    }
    await expect(cashTender).toBeVisible({ timeout: 10_000 });
    console.log('navigator.onLine at placement:', await page.evaluate(() => navigator.onLine));
    await cashTender.click();
    await page.getByTestId('pos-confirm-cash').click();

    // Surface any failure toast (e.g. "Failed to create order") for diagnosis.
    const toastText = await page.locator('[data-sonner-toast], .toast, [role="status"]').first().textContent({ timeout: 4000 }).catch(() => null);
    if (toastText) console.log('TOAST after confirm:', toastText);

    // 3) Assert it was queued offline (order + payment) — this is the core wiring that was broken.
    // Poll briefly in case the mutation resolves a beat after the click.
    await expect
      .poll(async () => (await idbGetAll(page, 'offlineOrders')).length, { timeout: 8000, message: 'offline order should appear' })
      .toBeGreaterThan(ordersBefore.length)
      .catch(() => {});
    if (logs.length) console.log('PAGE CONSOLE:\n' + logs.slice(-25).join('\n'));
    const ordersAfter = await idbGetAll(page, 'offlineOrders');
    const payments = await idbGetAll(page, 'offlinePayments');
    expect(ordersAfter.length, 'an offline order should be queued').toBeGreaterThan(ordersBefore.length);
    const newOrder = ordersAfter[ordersAfter.length - 1];
    expect(newOrder.synced, 'queued order should be unsynced').toBeFalsy();
    expect(newOrder.local_id, 'queued order should carry a client local_id').toBeTruthy();
    expect(payments.some((p) => !p.synced), 'an offline payment should be queued').toBeTruthy();

    // Sync pill should reflect pending work.
    const pill = page.getByTestId('pos-sync-pill');
    await expect(pill).toBeVisible({ timeout: 5_000 });

    // 4) Cold-start: reload while still offline — the terminal must still work.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Offline/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('pos-product-card').first()).toBeVisible({ timeout: 30_000 });
    const stillQueued = await idbGetAll(page, 'offlineOrders');
    expect(stillQueued.some((o) => o.local_id === newOrder.local_id && !o.synced)).toBeTruthy();

    // 5) Reconnect → the worker drains the queue.
    page.on('response', (res) => {
      if (res.url().includes('/pos/orders') && res.request().method() === 'POST') {
        res.text().then((b) => console.log(`[SYNC POST ${res.status()}] ${res.url()} :: ${b.slice(0, 160)}`)).catch(() => {});
      }
    });
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    // Also nudge the worker directly (covers any missed online-event timing).
    await page.waitForTimeout(2500);
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
        { timeout: 60_000, polling: 2000 },
      )
      .then((h) => h.jsonValue())
      .catch(() => null);

    if (!syncedId) {
      const row = (await idbGetAll(page, 'offlineOrders')).find((x) => x.local_id === newOrder.local_id);
      console.log('UNSYNCED ORDER ROW:', JSON.stringify(row));
      console.log('SYNC CONSOLE:\n' + logs.slice(-30).join('\n'));
    }
    expect(syncedId, 'order should sync and get a server id').toBeTruthy();

    const syncedOrders = await idbGetAll(page, 'offlineOrders');
    const synced = syncedOrders.find((x) => x.local_id === newOrder.local_id);
    const serverOrderId = synced.server_order_id as string;

    // Payment should drain too.
    await expect
      .poll(async () => (await idbGetAll(page, 'offlinePayments')).filter((p) => !p.synced && !p.dead_letter).length, {
        timeout: 30_000,
        message: 'offline payments should drain',
      })
      .toBe(0);

    // 6) Backend verification + idempotency via API (using the captured terminal token).
    const api = await pwRequest.newContext({
      baseURL: API,
      extraHTTPHeaders: { Authorization: `Bearer ${auth.token}`, 'X-Tenant-ID': auth.tenantId },
    });

    const getOrder = await api.get(`/api/v1/${auth.tenantId}/pos/orders/${serverOrderId}`);
    expect(getOrder.ok(), `GET order ${serverOrderId} should be 200`).toBeTruthy();
    const orderBody = await getOrder.json();
    expect(orderBody.client_reference ?? orderBody.data?.client_reference).toBe(newOrder.local_id);

    // Idempotency: replay the create with the SAME Idempotency-Key + client_reference.
    // get-or-create must return the SAME order, not a duplicate.
    const replay = await api.post(`/api/v1/${auth.tenantId}/pos/orders`, {
      headers: { 'Idempotency-Key': newOrder.local_id },
      data: {
        outlet_id: newOrder.outlet_id,
        currency: newOrder.currency,
        lines: newOrder.lines,
        client_reference: newOrder.local_id,
      },
    });
    expect(replay.ok(), 'idempotent replay should succeed').toBeTruthy();
    const replayBody = await replay.json();
    const replayId = replayBody.id ?? replayBody.data?.id;
    expect(replayId, 'replay must return the SAME order id (no duplicate)').toBe(serverOrderId);

    // Persist what we created so cleanup can remove it across DBs.
    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync(
      ARTIFACT,
      JSON.stringify(
        {
          tenantId: auth.tenantId,
          serverOrderId,
          clientReference: newOrder.local_id,
          orderNumber: orderBody.order_number ?? orderBody.data?.order_number,
          skus: newOrder.lines.map((l: any) => ({ sku: l.sku, qty: l.quantity })),
        },
        null,
        2,
      ),
    );

    await api.dispose();
    console.log('OFFLINE-SYNC OK — server order:', serverOrderId, 'client_ref:', newOrder.local_id);
  });
});
