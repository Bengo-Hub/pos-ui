import { test, expect, type Page } from '@playwright/test';

/**
 * Catalog completeness + cache-first + live version-poll E2E against the LIVE platform.
 *
 * Verifies the three catalog-sync guarantees:
 *  1. COMPLETENESS — the terminal receives the tenant's FULL sellable catalog (pos-api now
 *     paginates past inventory-api's 100-row cap), and every item is written through to the
 *     IndexedDB offline cache.
 *  2. CACHE-FIRST — a reload paints the product grid from IndexedDB without waiting on the
 *     network (catalog API responses are deliberately delayed; the grid must still paint fast).
 *  3. VERSION POLL — the shell polls GET /pos/catalog/version (rate-limit-exempt fingerprint)
 *     so inventory changes surface without a refresh or re-login.
 *
 * Env: BASE_URL, E2E_ORG_SLUG (default codevertex-demo), E2E_POS_PIN (default 0000=Admin),
 *      POS_API_URL (default https://posapi.codevertexitsolutions.com).
 *
 * READ-ONLY: creates no orders/items — nothing to clean up afterwards.
 */

const ORG = process.env.E2E_ORG_SLUG || 'codevertex-demo';
const PIN = process.env.E2E_POS_PIN || '0000';
const API = process.env.POS_API_URL || 'https://posapi.codevertexitsolutions.com';

async function idbCatalogCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open('pos_offline_db');
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('catalogItems')) return resolve(0);
          const tx = db.transaction('catalogItems', 'readonly');
          const count = tx.objectStore('catalogItems').count();
          count.onsuccess = () => resolve(count.result);
          count.onerror = () => resolve(0);
        };
        req.onerror = () => resolve(0);
      }),
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

async function pinLogin(page: Page) {
  await page.goto(`/${ORG}/pin-login`, { waitUntil: 'domcontentloaded' });
  const outlet = page.getByRole('button', { name: /Quick Service/i }).first();
  // The redesigned pin-login renders BOTH the mobile stack and the desktop 3-zone layout in the
  // DOM (one is display-hidden), so every pin-key testid resolves twice — always target the
  // visible instance to satisfy strict mode.
  const key = (d: string) => page.locator(`[data-testid="pin-key-${d}"]:visible`).first();
  const onOutletStep = await outlet.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
  if (onOutletStep) await outlet.click();
  await expect(key('1')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(600);
  for (const d of PIN.split('')) {
    await key(d).click();
    await page.waitForTimeout(150);
  }
  await page.waitForURL(new RegExp(`/${ORG}/(dashboard|order|orders|sell)`), { timeout: 30_000 });
}

test.describe('POS catalog sync (live)', () => {
  test.setTimeout(180_000);

  test('full catalog reaches the terminal + IndexedDB; version endpoint live; poll wired', async ({ page }) => {
    // Capture version-poll requests fired by the shell.
    const versionCalls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/catalog/version')) versionCalls.push(req.url());
    });

    await pinLogin(page);
    await page.goto(`/${ORG}/order`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('pos-product-card').first()).toBeVisible({ timeout: 30_000 });
    // Give the background revalidation + write-through a moment to finish.
    await page.waitForTimeout(5_000);

    const { token, tenantId, outletId } = await getAuth(page);
    expect(token, 'PIN session must expose an access token').toBeTruthy();
    expect(tenantId, 'PIN session must expose the tenant id').toBeTruthy();

    // 1) COMPLETENESS: OUTLET-SCOPED API total == what the terminal cached locally (the
    //    terminal caches its outlet's catalog; nothing truncated by the 100-row upstream cap).
    const res = await page.request.get(`${API}/api/v1/${tenantId}/pos/catalog/items?limit=1`, {
      headers: { Authorization: `Bearer ${token}`, ...(outletId ? { 'X-Outlet-ID': outletId } : {}) },
    });
    expect(res.ok(), `catalog items endpoint responded ${res.status()}`).toBe(true);
    const body = await res.json();
    const apiTotal: number = body?.total ?? 0;
    console.log('CATALOG_API_TOTAL:', apiTotal);
    expect(apiTotal, 'tenant must expose a non-trivial catalog').toBeGreaterThan(0);

    const cached = await idbCatalogCount(page);
    console.log('IDB_CACHED_ITEMS:', cached);
    // The IndexedDB cache accumulates across tenants/outlets in dev runs, so >= is the
    // correct bound: every API item must be present locally.
    expect(cached, 'IndexedDB must hold the complete catalog').toBeGreaterThanOrEqual(apiTotal);

    // 2) VERSION ENDPOINT: live, cheap, fingerprint-shaped.
    const vres = await page.request.get(`${API}/api/v1/${tenantId}/pos/catalog/version`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(vres.ok(), `catalog version endpoint responded ${vres.status()}`).toBe(true);
    const vbody = await vres.json();
    console.log('CATALOG_VERSION:', vbody?.version);
    expect(String(vbody?.version ?? '')).toMatch(/^\d+-\d+$/);

    // 3) POLL WIRED: the shell fires the version poll on mount (45s cadence thereafter).
    await page.waitForTimeout(2_000);
    console.log('VERSION_POLLS_SEEN:', versionCalls.length);
    expect(versionCalls.length, 'shell must poll /catalog/version').toBeGreaterThan(0);
  });

  test('cache-first: grid paints from IndexedDB while catalog API is slow', async ({ page }) => {
    // Warm login + cache first.
    await pinLogin(page);
    await page.goto(`/${ORG}/order`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('pos-product-card').first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(4_000); // let the write-through land
    const cached = await idbCatalogCount(page);
    expect(cached, 'cache must be warm before the slow-network phase').toBeGreaterThan(0);

    // Throttle ONLY the catalog items API: hold responses for 15s to simulate a slow link.
    await page.route('**/pos/catalog/items**', async (route) => {
      await new Promise((r) => setTimeout(r, 15_000));
      await route.continue().catch(() => route.abort().catch(() => {}));
    });

    // Reload the terminal. Cache-first must paint the grid from IndexedDB long before the
    // throttled network answers.
    const t0 = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('pos-product-card').first()).toBeVisible({ timeout: 12_000 });
    const paintMs = Date.now() - t0;
    console.log('GRID_PAINT_MS_UNDER_SLOW_NETWORK:', paintMs);
    // Must beat the 15s network hold by a wide margin — i.e. it came from the local cache.
    expect(paintMs).toBeLessThan(12_000);
  });
});
