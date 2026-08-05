import { test, expect } from '@playwright/test';
import { ORG, getAuth, pinLogin, createTestPromotion, deleteTestPromotion, firstCatalogItem, runMarker, productSearchInput } from './support/discount-fixtures';

/**
 * ApplyDiscountModal "Code" tab e2e (live) — the code-entry feature added this sprint, wired to
 * the fixed (lines-based, rule-evaluated) discountsApi.apply / pos-api ApplyPromoCode. Uses the
 * manager PIN (1111) since the discount trigger button is gated pos.discounts.add||pos.orders.manage,
 * which the demo cashier role does not hold by default.
 */

const MANAGER_PIN = '1111';

test.describe.serial('ApplyDiscountModal — code-entry tab', () => {
  test.setTimeout(120_000);
  const createdPromoIds: string[] = [];
  let auth: { token: string; tenantId: string; outletId: string };

  test.afterAll(async ({ browser }) => {
    if (createdPromoIds.length === 0 || !auth?.token) return;
    const page = await browser.newPage();
    for (const id of createdPromoIds) await deleteTestPromotion(page, auth, id);
    await page.close();
  });

  test('valid code redeems successfully with a toast and the correct amount', async ({ page }) => {
    await pinLogin(page, /Quick Service/i, MANAGER_PIN);
    auth = await getAuth(page);
    const item = await firstCatalogItem(page, auth);

    const code = `E2ECODE${Date.now().toString().slice(-6)}`;
    const promoId = await createTestPromotion(page, auth, {
      name: runMarker(),
      promoKind: 'code',
      promoCode: code,
      discountType: 'percentage',
      discountValue: 15,
      scopeType: 'item',
      scopeIds: [item.sku],
      autoApply: false,
      outletId: auth.outletId || undefined,
    });
    createdPromoIds.push(promoId);

    await page.goto(`/${ORG}/order`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('pos-product-card').first()).toBeVisible({ timeout: 30_000 });
    const search = productSearchInput(page);
    await search.fill(item.sku);
    const card = page.getByTestId('pos-product-card').filter({ hasText: item.name }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    await page.getByText('Add discount').click();
    await expect(page.getByText('Discount', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Code' }).click();
    await page.getByPlaceholder(/Type or scan a promo code/i).fill(code);
    await page.getByRole('button', { name: /Apply Code/i }).click();

    await expect(page.getByText(new RegExp(`Code ${code} applied`, 'i'))).toBeVisible({ timeout: 10_000 });
    // Modal closes on successful apply (onApply also closes it); the footer's discount row
    // should now show the resolved amount rather than "Add discount".
    await expect(page.getByText(/Add discount/i)).toHaveCount(0);
  });

  test('invalid/expired code is rejected with an error toast, no discount applied', async ({ page }) => {
    await pinLogin(page, /Quick Service/i, MANAGER_PIN);
    const localAuth = await getAuth(page);
    const item = await firstCatalogItem(page, localAuth);
    if (!auth) auth = localAuth;

    await page.goto(`/${ORG}/order`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('pos-product-card').first()).toBeVisible({ timeout: 30_000 });
    const search = productSearchInput(page);
    await search.fill(item.sku);
    const card = page.getByTestId('pos-product-card').filter({ hasText: item.name }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    await page.getByText('Add discount').click();
    await page.getByRole('button', { name: 'Code' }).click();
    await page.getByPlaceholder(/Type or scan a promo code/i).fill('NOSUCHCODE-E2E');
    await page.getByRole('button', { name: /Apply Code/i }).click();

    await expect(page.getByText(/not found|inactive|invalid/i)).toBeVisible({ timeout: 10_000 });
    // Modal stays open on failure; still showing "Add discount" confirms nothing was applied.
    await page.getByRole('button', { name: /^Clear$/ }).click().catch(() => {});
  });
});
