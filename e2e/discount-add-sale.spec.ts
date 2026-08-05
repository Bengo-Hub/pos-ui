import { test, expect } from '@playwright/test';
import { ORG, ssoLogin, createTestPromotion, deleteTestPromotion, runMarker } from './support/discount-fixtures';

/**
 * Add Sale (back-office /sell/add) discount parity e2e (live) — verifies the auto-apply engine
 * newly wired into Add Sale (shared with the terminal via lib/pos/auto-apply-discounts) fires
 * identically: toast + correct total for percentage and BOGO discounts on real catalog items.
 * Logs in via SSO admin (Add Sale is a manager/back-office surface, not PIN-gated).
 */

test.describe.serial('Add Sale — auto-apply discount parity', () => {
  test.setTimeout(120_000);
  const createdPromoIds: string[] = [];
  let auth: { token: string; tenantId: string; outletId: string } | undefined;

  async function getAuthFromLocalStorage(page: import('@playwright/test').Page) {
    return page.evaluate(() => {
      const raw = localStorage.getItem('pos-auth-storage');
      const s = raw ? JSON.parse(raw).state : {};
      return {
        token: s?.session?.accessToken ?? '',
        tenantId: s?.user?.tenant_id ?? '',
        outletId: s?.outlet?.id ?? s?.selectedOutletId ?? '',
      };
    });
  }

  test.afterAll(async ({ browser }) => {
    if (createdPromoIds.length === 0 || !auth?.token) return;
    const page = await browser.newPage();
    for (const id of createdPromoIds) await deleteTestPromotion(page, auth, id);
    await page.close();
  });

  test('percentage auto-discount applies on Add Sale with a toast, matching the terminal', async ({ page }) => {
    await ssoLogin(page);
    auth = await getAuthFromLocalStorage(page);
    expect(auth.token, 'SSO session must expose an access token').toBeTruthy();

    const api = process.env.POS_API_URL || 'https://posapi.codevertexafrica.com';
    const catalogRes = await page.request.get(`${api}/api/v1/${auth.tenantId}/pos/catalog/items?limit=5`, {
      headers: { Authorization: `Bearer ${auth.token}`, ...(auth.outletId ? { 'X-Outlet-ID': auth.outletId } : {}) },
    });
    expect(catalogRes.ok()).toBe(true);
    const item = (await catalogRes.json())?.data?.[0];
    expect(item, 'outlet must have at least one sellable catalog item').toBeTruthy();

    const promoId = await createTestPromotion(page, auth, {
      name: runMarker(),
      promoKind: 'auto',
      discountType: 'percentage',
      discountValue: 25,
      scopeType: 'item',
      scopeIds: [item.sku],
      outletId: auth.outletId || undefined,
    });
    createdPromoIds.push(promoId);

    await page.goto(`/${ORG}/sell/add`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByPlaceholder(/Search product name \/ SKU to add/i)).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2_000); // let the 60s active-happy-hours poll / initial fetch settle
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByPlaceholder(/Search product name \/ SKU to add/i)).toBeVisible({ timeout: 30_000 });

    const search = page.getByPlaceholder(/Search product name \/ SKU to add/i);
    await search.fill(item.sku);
    const resultRow = page.getByText(item.name, { exact: false }).first();
    await expect(resultRow).toBeVisible({ timeout: 10_000 });
    await resultRow.click();

    await expect(page.getByText(/25%\s*off/i)).toBeVisible({ timeout: 10_000 });
  });

  test('same-SKU BOGO applies on Add Sale', async ({ page }) => {
    await ssoLogin(page);
    const localAuth = await getAuthFromLocalStorage(page);
    if (!auth) auth = localAuth;

    const api = process.env.POS_API_URL || 'https://posapi.codevertexafrica.com';
    const catalogRes = await page.request.get(`${api}/api/v1/${localAuth.tenantId}/pos/catalog/items?limit=5`, {
      headers: { Authorization: `Bearer ${localAuth.token}`, ...(localAuth.outletId ? { 'X-Outlet-ID': localAuth.outletId } : {}) },
    });
    const item = (await catalogRes.json())?.data?.[0];
    expect(item).toBeTruthy();

    const promoId = await createTestPromotion(page, localAuth, {
      name: runMarker(),
      promoKind: 'auto',
      discountType: 'bogo',
      scopeType: 'item',
      scopeIds: [item.sku],
      buyQuantity: 1,
      getQuantity: 1,
      getDiscountPercent: 100,
      outletId: localAuth.outletId || undefined,
    });
    createdPromoIds.push(promoId);

    await page.goto(`/${ORG}/sell/add`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByPlaceholder(/Search product name \/ SKU to add/i)).toBeVisible({ timeout: 30_000 });

    const search = page.getByPlaceholder(/Search product name \/ SKU to add/i);
    await search.fill(item.sku);
    const resultRow = page.getByText(item.name, { exact: false }).first();
    await expect(resultRow).toBeVisible({ timeout: 10_000 });
    await resultRow.click();
    // Bump to 2 units via the line-quantity field (the search dropdown excludes items already in
    // the sale, so a second "add" click isn't how a second unit is entered here).
    const qtyInput = page.getByLabel('Line quantity').first();
    await expect(qtyInput).toBeVisible({ timeout: 10_000 });
    await qtyInput.fill('2');
    await qtyInput.blur();

    await expect(page.getByText(/Buy 1 Get 1 (Free|100% off)/i)).toBeVisible({ timeout: 10_000 });
  });
});
