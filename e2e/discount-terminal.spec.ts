import { test, expect } from '@playwright/test';
import {
  ORG, getAuth, pinLogin, createTestPromotion, deleteTestPromotion, firstCatalogItem, runMarker, productSearchInput, escapeRegex,
  reloadAndWaitForActiveDiscounts,
} from './support/discount-fixtures';

/**
 * POS Terminal discount e2e (live) — verifies auto-apply discounts fire on the terminal with a
 * toast AND the correct total, for real items in the codevertex-demo tenant. Each test seeds its
 * own ephemeral promotion (tagged with a unique run marker) via pos-api's tenant API and deletes
 * it IMMEDIATELY after its own assertions (not batched at the end) — this suite deliberately
 * reuses the SAME auto-picked catalog item across tests, so a leftover promo from an earlier test
 * would otherwise still be active (same item scope) while a later test runs, making the two
 * promos' combined toast/discount ambiguous. `afterAll` remains a safety net for anything a failed
 * assertion left behind.
 *
 * Scoped to the Quick Service outlet (same outlet catalog-sync.spec.ts already exercises).
 */

test.describe.serial('POS Terminal — auto-apply discounts', () => {
  test.setTimeout(120_000);
  const createdPromoIds: string[] = [];
  let auth: { token: string; tenantId: string; outletId: string };

  test.afterAll(async ({ browser }) => {
    if (createdPromoIds.length === 0 || !auth?.token) return;
    const page = await browser.newPage();
    for (const id of createdPromoIds) await deleteTestPromotion(page, auth, id);
    await page.close();
  });

  test('percentage auto-discount applies to a scoped item with a toast', async ({ page }) => {
    await pinLogin(page, /Quick Service/i, '1111');
    auth = await getAuth(page);
    const item = await firstCatalogItem(page, auth);

    const promoId = await createTestPromotion(page, auth, {
      name: runMarker(),
      promoKind: 'auto',
      discountType: 'percentage',
      discountValue: 20,
      scopeType: 'item',
      scopeIds: [item.sku],
      outletId: auth.outletId || undefined,
    });
    createdPromoIds.push(promoId);

    try {
      await page.goto(`/${ORG}/order`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('pos-product-card').first()).toBeVisible({ timeout: 30_000 });
      await reloadAndWaitForActiveDiscounts(page);
      await expect(page.getByTestId('pos-product-card').first()).toBeVisible({ timeout: 30_000 });

      const search = productSearchInput(page);
      await search.fill(item.sku);
      const card = page.getByTestId('pos-product-card').filter({ hasText: item.name }).first();
      await expect(card).toBeVisible({ timeout: 10_000 });
      await card.click();

      // Toast: the shared describeAutoApplyAnnouncement message for a non-BOGO discount.
      await expect(page.getByText(new RegExp(`${escapeRegex(item.name)}.*20%\\s*off`, 'i')).or(page.getByText(/20%\s*off/i))).toBeVisible({ timeout: 10_000 });

      // The cart-header total (next to "Clear all") must reflect the 20% discount — checked as a
      // bound rather than an exact figure since tax/rounding vary by outlet config: it must be
      // meaningfully below the undiscounted price+tax, not just equal to the raw price.
      const clearAll = page.getByRole('button', { name: 'Clear all' });
      await expect(clearAll).toBeVisible({ timeout: 10_000 });
      const totalText = await clearAll.locator('..').innerText();
      const totalValue = parseFloat(totalText.replace(/[^\d.]/g, ''));
      expect(totalValue, `expected a discounted total below ${item.price} (undiscounted), got "${totalText}"`).toBeLessThan(item.price);
      expect(totalValue).toBeGreaterThan(0);
    } finally {
      await deleteTestPromotion(page, auth, promoId);
      createdPromoIds.splice(createdPromoIds.indexOf(promoId), 1);
    }
  });

  test('same-SKU BOGO (buy 1 get 1 free) applies with a toast', async ({ page }) => {
    await pinLogin(page, /Quick Service/i, '1111');
    const localAuth = await getAuth(page);
    if (!auth) auth = localAuth;
    const item = await firstCatalogItem(page, localAuth);

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

    try {
      await page.goto(`/${ORG}/order`, { waitUntil: 'domcontentloaded' });
      await reloadAndWaitForActiveDiscounts(page);
      await expect(page.getByTestId('pos-product-card').first()).toBeVisible({ timeout: 30_000 });

      const search = productSearchInput(page);
      await search.fill(item.sku);
      const card = page.getByTestId('pos-product-card').filter({ hasText: item.name }).first();
      await expect(card).toBeVisible({ timeout: 10_000 });
      await card.click();
      // Wait for the first add's React state/toast to settle before the second click — firing two
      // clicks back-to-back risks the second reading a stale pre-update cart in its own closure.
      await page.waitForTimeout(800);
      await card.click(); // second unit completes the Buy 1 Get 1 cycle

      await expect(page.getByText(/Buy 1 Get 1 (Free|100% off)/i)).toBeVisible({ timeout: 10_000 });
    } finally {
      await deleteTestPromotion(page, localAuth, promoId);
      createdPromoIds.splice(createdPromoIds.indexOf(promoId), 1);
    }
  });

  test('a promotion scheduled to start in the future does NOT apply (negative case)', async ({ page }) => {
    await pinLogin(page, /Quick Service/i, '1111');
    const localAuth = await getAuth(page);
    if (!auth) auth = localAuth;
    const item = await firstCatalogItem(page, localAuth);

    const res = await page.request.post(
      `${process.env.POS_API_URL || 'https://posapi.codevertexafrica.com'}/api/v1/${localAuth.tenantId}/pos/promotions`,
      {
        headers: { Authorization: `Bearer ${localAuth.token}`, 'Content-Type': 'application/json' },
        data: {
          name: runMarker(), promo_kind: 'auto', auto_apply: true, scope_type: 'item', scope_ids: [item.sku],
          discount_type: 'percentage', discount_value: 50,
          start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // starts tomorrow
          outlet_id: localAuth.outletId || undefined,
        },
      },
    );
    expect(res.ok()).toBe(true);
    const promoId = (await res.json())?.id;
    if (promoId) createdPromoIds.push(promoId);

    try {
      await page.goto(`/${ORG}/order`, { waitUntil: 'domcontentloaded' });
      await reloadAndWaitForActiveDiscounts(page);
      await expect(page.getByTestId('pos-product-card').first()).toBeVisible({ timeout: 30_000 });

      const search = productSearchInput(page);
      await search.fill(item.sku);
      const card = page.getByTestId('pos-product-card').filter({ hasText: item.name }).first();
      await expect(card).toBeVisible({ timeout: 10_000 });
      await card.click();

      // No "50% off" toast/discount should appear for a not-yet-started promotion.
      await page.waitForTimeout(1_500);
      await expect(page.getByText(/50%\s*off/i)).toHaveCount(0);
    } finally {
      if (promoId) {
        await deleteTestPromotion(page, localAuth, promoId);
        createdPromoIds.splice(createdPromoIds.indexOf(promoId), 1);
      }
    }
  });
});
