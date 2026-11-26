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
 *      POS_API_URL (default https://posapi.codevertexafrica.com).
 */

const ORG = process.env.E2E_ORG_SLUG || 'codevertex-demo';
const PIN = process.env.E2E_POS_PIN || '0000';
const API = process.env.POS_API_URL || 'https://posapi.codevertexafrica.com';
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

// ── PIN login, selecting the outlet (Quick Service by default) before entering the PIN ──
async function pinLogin(page: Page, outletName: RegExp = /Quick Service/i) {
  page.on('response', async (res) => {
    if (res.url().includes('/auth/pin')) {
      // Status only — never log the response body (it carries the access token).
      console.log(`[PIN ${res.request().method()} ${res.status()}] ${res.url().split('?')[0]}`);
    }
  });
  await page.goto(`/${ORG}/pin-login`, { waitUntil: 'domcontentloaded' });

  // Quick Service outlet: pay-mode inline checkout (not hospitality send-to-kitchen) and the
  // richest demo catalog, so the product grid actually populates.
  const outlet = page.getByRole('button', { name: outletName }).first();
  // The redesigned pin-login renders BOTH the mobile stack and the desktop 3-zone layout in
  // the DOM (one is display-hidden), so every pin-key testid resolves twice — always target
  // the visible instance to satisfy strict mode.
  const key = (d: string) => page.locator(`[data-testid="pin-key-${d}"]:visible`).first();

  // The keypad renders first (default step), then an effect switches multi-outlet tenants to
  // the outlet step once outlets load. So wait for the outlet step to APPEAR (don't trust an
  // early keypad), pick the outlet, and only THEN enter the PIN — otherwise digits are lost
  // when the keypad is swapped out mid-entry.
  const onOutletStep = await outlet.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
  if (onOutletStep) {
    await outlet.click();
  }

  await expect(key('1')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(600);
  for (const d of PIN.split('')) {
    await key(d).click();
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

/** Reload, retrying a navigation the service worker aborts while it claims the page. */
async function reloadWithRetry(page: Page) {
  for (let i = 0; i < 3; i++) {
    const ok = await page.reload({ waitUntil: 'domcontentloaded' }).then(() => true).catch(() => false);
    if (ok) break;
    await page.waitForTimeout(2500);
  }
}

/** Wait for the next-pwa service worker to install and control the page, so later offline
 *  reloads of routes visited online are served from its cache. */
async function waitForServiceWorker(page: Page) {
  const swActive = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const ready = navigator.serviceWorker.ready.then(() => true);
    const timeout = new Promise<boolean>((r) => setTimeout(() => r(false), 90000));
    return Promise.race([ready, timeout]);
  });
  expect(swActive, 'a service worker must be active for offline cold-start').toBe(true);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

/** The newest offline order row whose local_id was not in `before`. */
async function newOfflineOrder(page: Page, before: any[]): Promise<any | undefined> {
  const known = new Set(before.map((o) => o.local_id));
  const rows = await idbGetAll(page, 'offlineOrders');
  return rows.filter((o) => !known.has(o.local_id)).pop();
}

/** API client authenticated as the terminal, retrying through the IP rate limiter. */
async function terminalApi(auth: { token: string; tenantId: string }, outletId: string) {
  const api = await pwRequest.newContext({
    baseURL: API,
    extraHTTPHeaders: {
      Authorization: `Bearer ${auth.token}`,
      'X-Tenant-ID': auth.tenantId,
      'X-Tenant-Slug': ORG,
      'X-Outlet-ID': outletId,
    },
  });
  const withRetry = async (fn: () => Promise<any>) => {
    for (let i = 0; i < 6; i++) {
      const res = await fn();
      if (res.status() !== 429) return res;
      await new Promise((r) => setTimeout(r, 12_000)); // rate-limit window cooldown
    }
    return fn();
  };
  return { api, withRetry };
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
      // next-pwa precaches the whole app on first install (~50s on a cold cache), so allow ample
      // time before the offline cold-start checks.
      const timeout = new Promise<boolean>((r) => setTimeout(() => r(false), 90000));
      return Promise.race([ready, timeout]);
    });
    console.log('SERVICE_WORKER_ACTIVE:', swActive);
    expect(swActive, 'a service worker must be active for offline cold-start').toBe(true);
    // Wait until the SW actually controls this page (clientsClaim) before reloading, so the
    // reload isn't aborted mid-claim. Then reload so the now-active SW caches this navigation.
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await reloadWithRetry(page);
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
    // (→ pay flow, not dine-in send-to-kitchen). Retail outlets don't show this selector.
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

    // The shared OfflineBar ribbon should reflect offline/pending work (the bottom pill is now
    // reserved for dead-lettered items only).
    await expect(page.getByText(/Offline mode|Syncing offline data/i).first()).toBeVisible({ timeout: 5_000 });

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
        // Generous: the IP rate-limit window (100/60s) can throttle the first sync attempts
        // after a busy login+catalog+precache burst; the 10s periodic re-drain succeeds once it
        // rolls. Widened so re-drains outlast repeated 429s.
        { timeout: 180_000, polling: 3000 },
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
    // Include X-Outlet-ID (the order is outlet-scoped) and retry through the IP rate limiter.
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
        await new Promise((r) => setTimeout(r, 12_000)); // rate-limit window cooldown
      }
      return fn();
    };

    const getOrder = await withRetry(() => api.get(`/api/v1/${auth.tenantId}/pos/orders/${serverOrderId}`));
    expect(getOrder.ok(), `GET order ${serverOrderId} should be 200 (got ${getOrder.status()})`).toBeTruthy();
    const orderBody = await getOrder.json();
    expect(orderBody.client_reference ?? orderBody.data?.client_reference).toBe(newOrder.local_id);

    // Idempotency: replay the create with the SAME Idempotency-Key + client_reference.
    // get-or-create must return the SAME order, not a duplicate.
    const replay = await withRetry(() =>
      api.post(`/api/v1/${auth.tenantId}/pos/orders`, {
        headers: { 'Idempotency-Key': newOrder.local_id },
        data: {
          outlet_id: newOrder.outlet_id,
          currency: newOrder.currency,
          lines: newOrder.lines,
          client_reference: newOrder.local_id,
        },
      }),
    );
    expect(replay.ok(), `idempotent replay should succeed (got ${replay.status()})`).toBeTruthy();
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

  // A dine-in bill rung up offline must hold its table across an offline reload, accept more
  // items while still queued, and reach the server as ONE order carrying the table and every
  // line exactly once. Before the 2026-11-26 fix such a bill synced without its table and the
  // waiter re-rang it, so this guards both the table carry-over and the no-duplicate replay.
  //
  // Env: E2E_DINE_IN_OUTLET names a table-service outlet (default "Restaurant").
  test('dine-in offline → reload → pending table bill → add item → reconnect → one order', async ({ page, context }) => {
    test.setTimeout(300_000);
    const outletName = new RegExp(process.env.E2E_DINE_IN_OUTLET || 'Restaurant', 'i');
    const logs: string[] = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));

    // 1) Online login on a table-service outlet, warm the terminal and the Tables page so both
    // routes and the tables dataset are cached for the offline part.
    await pinLogin(page, outletName);
    await page.goto(`/${ORG}/order`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('pos-product-card').first()).toBeVisible({ timeout: 30_000 });
    await waitForServiceWorker(page);
    await reloadWithRetry(page);
    await expect(page.getByTestId('pos-product-card').first()).toBeVisible({ timeout: 30_000 });

    const auth = await getAuth(page);
    expect(auth.token, 'should have a terminal access token').not.toEqual('');
    expect(auth.tenantId).not.toEqual('');
    expect(auth.outletId, 'a table-service outlet must be selected').not.toEqual('');

    // Pick a free table from the live list (no hard-coded table ids).
    const { api, withRetry } = await terminalApi(auth, auth.outletId);
    const tablesRes = await withRetry(() => api.get(`/api/v1/${auth.tenantId}/pos/tables`));
    expect(tablesRes.ok(), `GET tables should be 200 (got ${tablesRes.status()})`).toBeTruthy();
    const tablesBody = await tablesRes.json();
    const tables: any[] = tablesBody.data ?? tablesBody ?? [];
    const table = tables.find((t) => t.status === 'available' && !t.order_id);
    expect(table, 'the outlet needs at least one available table').toBeTruthy();

    await page.goto(`/${ORG}/tables`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(table.name, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await reloadWithRetry(page);

    // Open the terminal on that table while still online (the waiter seats the guests), so this
    // exact URL is in the service worker cache for the offline reload below.
    const orderUrl = `/${ORG}/order?table_id=${table.id}&table_name=${encodeURIComponent(table.name)}&covers=2`;
    await page.goto(orderUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('pos-product-card').first()).toBeVisible({ timeout: 30_000 });
    await reloadWithRetry(page);
    await expect(page.getByTestId('pos-product-card').first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1000);

    const ordersBefore = await idbGetAll(page, 'offlineOrders');

    // 2) Go OFFLINE and send a dine-in order to the kitchen.
    await context.setOffline(true);
    await expect(page.getByText(/Offline/i).first()).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('pos-product-card').first().click();
    const dineIn = page.getByRole('button', { name: /^Dine-In$/i });
    if (await dineIn.isVisible().catch(() => false)) await dineIn.click();

    const placeOrder = page.getByRole('button', { name: /Place Order|Send to Kitchen/i }).first();
    if (!(await placeOrder.isVisible().catch(() => false))) {
      await page.locator('button:has-text("Cart"), button:has-text("View order"), [aria-label*="cart" i]').first().click().catch(() => {});
    }
    await expect(placeOrder).toBeVisible({ timeout: 10_000 });
    await placeOrder.click();

    await expect
      .poll(async () => !!(await newOfflineOrder(page, ordersBefore)), { timeout: 10_000, message: 'offline dine-in order should be queued' })
      .toBe(true);
    const queued = await newOfflineOrder(page, ordersBefore);
    expect(queued.synced, 'queued order should be unsynced').toBeFalsy();
    expect(queued.table_id, 'the queued order must carry its table').toBe(table.id);
    const firstLineCount = (queued.lines ?? []).length;
    expect(firstLineCount).toBeGreaterThan(0);

    // 3) Cold start on the Tables page while still offline: the table shows the queued bill.
    await page.goto(`/${ORG}/tables`, { waitUntil: 'domcontentloaded' });
    await reloadWithRetry(page);
    await expect(page.getByText(/Offline/i).first()).toBeVisible({ timeout: 10_000 });
    const pending = page.getByText('Pending sync', { exact: true });
    await expect(pending.first(), 'the table should show the queued offline bill').toBeVisible({ timeout: 30_000 });
    const tableCard = page
      .locator('div.rounded-2xl')
      .filter({ has: page.getByText(table.name, { exact: true }) })
      .filter({ has: pending })
      .first();
    await expect(tableCard).toBeVisible();

    // 4) Add one item to that bill, still offline. The bill is queued, so the lines append to the
    // queued order itself rather than a separate add-lines batch.
    await tableCard.getByRole('button', { name: /Add to bill/i }).click();
    await expect(page.getByTestId('pos-product-card').first()).toBeVisible({ timeout: 30_000 });
    const cards = page.getByTestId('pos-product-card');
    await ((await cards.count()) > 1 ? cards.nth(1) : cards.first()).click();
    const addToBill = page.getByRole('button', { name: /Add to Bill/i }).last();
    if (!(await addToBill.isVisible().catch(() => false))) {
      await page.locator('button:has-text("Cart"), button:has-text("View order"), [aria-label*="cart" i]').first().click().catch(() => {});
    }
    await expect(addToBill).toBeVisible({ timeout: 10_000 });
    await addToBill.click();

    await expect
      .poll(
        async () => ((await idbGetAll(page, 'offlineOrders')).find((o) => o.local_id === queued.local_id)?.lines ?? []).length,
        { timeout: 10_000, message: 'the added item should append to the queued order' },
      )
      .toBe(firstLineCount + 1);
    const grown = (await idbGetAll(page, 'offlineOrders')).find((o) => o.local_id === queued.local_id);
    const addedSku: string = grown.lines[grown.lines.length - 1].sku;
    const expectedAddedSkuCount = grown.lines.filter((l: any) => l.sku === addedSku).length;
    const pendingAdds = (await idbGetAll(page, 'offlineLineAdds')).filter((b) => b.local_order_id === queued.local_id && !b.synced);
    expect(pendingAdds.length, 'no separate add-lines batch for a still-queued bill').toBe(0);

    // 5) Reconnect and let the worker drain the queue.
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.dispatchEvent(new Event('pos:sync-now')));

    await expect
      .poll(
        async () => {
          const row = (await idbGetAll(page, 'offlineOrders')).find((o) => o.local_id === queued.local_id);
          return !!(row?.synced && row?.server_order_id);
        },
        { timeout: 180_000, intervals: [3000], message: 'the dine-in order should sync' },
      )
      .toBe(true)
      .catch(async (e) => {
        console.log('SYNC CONSOLE:\n' + logs.slice(-30).join('\n'));
        throw e;
      });
    const synced = (await idbGetAll(page, 'offlineOrders')).find((o) => o.local_id === queued.local_id);
    const serverOrderId = synced.server_order_id as string;
    // The sync records the server number so the "Offline XXXXXX" chit maps to the real bill.
    expect(synced.server_order_number, 'the synced row should keep the server order number').toBeTruthy();

    // 6) Exactly ONE server order for this client_reference, seated at the table, with the added
    // line present once.
    const listRes = await withRetry(() =>
      api.get(`/api/v1/${auth.tenantId}/pos/orders?order_subtype=dine_in&limit=100`),
    );
    expect(listRes.ok(), `GET orders should be 200 (got ${listRes.status()})`).toBeTruthy();
    const listBody = await listRes.json();
    const listed: any[] = listBody.data ?? listBody.items ?? [];
    const matches = listed.filter((o) => o.client_reference === queued.local_id);
    expect(matches.length, 'exactly one server order for the client_reference').toBe(1);
    expect(matches[0].id).toBe(serverOrderId);

    const getOrder = await withRetry(() => api.get(`/api/v1/${auth.tenantId}/pos/orders/${serverOrderId}`));
    expect(getOrder.ok(), `GET order ${serverOrderId} should be 200 (got ${getOrder.status()})`).toBeTruthy();
    const orderRaw = await getOrder.json();
    const order = orderRaw.data ?? orderRaw;
    expect(order.metadata?.table_id, 'the server order should keep its table').toBe(table.id);
    const serverLines: any[] = order.edges?.lines ?? order.lines ?? [];
    expect(serverLines.length, 'every queued line once, no duplicates').toBe(firstLineCount + 1);
    expect(serverLines.filter((l) => l.sku === addedSku).length, 'the added line is present once').toBe(expectedAddedSkuCount);

    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync(
      path.join('test-results', 'offline-dine-in-created.json'),
      JSON.stringify(
        {
          tenantId: auth.tenantId,
          serverOrderId,
          clientReference: queued.local_id,
          orderNumber: order.order_number,
          tableId: table.id,
        },
        null,
        2,
      ),
    );

    await api.dispose();
    console.log('OFFLINE DINE-IN OK: server order', serverOrderId, 'table', table.name);
  });
});
