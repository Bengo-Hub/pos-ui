import { test, expect } from '@playwright/test';
import { ORG, ssoLogin, pinLogin, getAuth, firstCatalogItem, productSearchInput } from './support/discount-fixtures';

/**
 * Regression coverage for the 2026-08-15 "search field doesn't clear after adding an item" fix:
 * the POS terminal's product search (terminal-context.tsx handleItemTap) and the Add Sale page's
 * item search (now the shared SearchAddTable component) must both go back to empty immediately
 * after a search result is clicked/tapped — ready for the next lookup — instead of leaving the
 * typed query sitting in the box. Read-only interactions (adding to the in-memory cart/sale line
 * list, never submitting/paying), so no backend cleanup is needed.
 */

test.describe('Search field clears on select', () => {
  test.setTimeout(60_000);

  test('POS terminal: tapping a product tile clears the search box', async ({ page }) => {
    await pinLogin(page, /Quick Service/i, '1111');
    const auth = await getAuth(page);
    const item = await firstCatalogItem(page, auth);

    await page.goto(`/${ORG}/order`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('pos-product-card').first()).toBeVisible({ timeout: 30_000 });

    const search = productSearchInput(page);
    await search.fill(item.sku);
    const card = page.getByTestId('pos-product-card').filter({ hasText: item.name }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    await expect(search).toHaveValue('', { timeout: 5_000 });
  });

  test('Add Sale: clicking a search result clears the search box', async ({ page }) => {
    await ssoLogin(page);
    const auth = await getAuth(page);
    const item = await firstCatalogItem(page, auth);

    await page.goto(`/${ORG}/sell/add`, { waitUntil: 'domcontentloaded' });
    const search = page.getByPlaceholder(/Search product name \/ SKU to add/i);
    await expect(search).toBeVisible({ timeout: 30_000 });

    await search.fill(item.sku);
    const resultRow = page.getByText(item.name, { exact: false }).first();
    await expect(resultRow).toBeVisible({ timeout: 10_000 });
    await resultRow.click();

    await expect(search).toHaveValue('', { timeout: 5_000 });
  });
});
