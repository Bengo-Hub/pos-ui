import { Locator, Page, test } from '@playwright/test';
import { pinLogin, selectOutlet, goToViaSidebar, waitForSpinnerGone, DEMO_OUTLETS } from './lib/pin-login';
import { screenshotWithCallouts } from './lib/annotate';
import { assetPath } from './lib/paths';

/**
 * Screenshots for "Selling & Checkout" (docs/user-guide/pos/selling-and-checkout.md) — an
 * exhaustive pass over every POS Terminal toolbar action and cart control, on the retail outlet.
 * Non-destructive throughout: every dialog opened here is closed WITHOUT submitting (Clear/close/
 * click-outside, never Apply/Save/Generate-and-redeem against a real order), and any cart item
 * added is removed with "Clear all" before the test ends — no real order/payment is created.
 */

const DIR = 'terminal';

// Every toolbar/cart dialog here (except the Calculator's floating panel and the Browse drawer)
// is a centered card over a full-viewport backdrop that closes on an outside click (ModalShell /
// the bespoke pos-* modals all share this shape) — clicking a corner is a reliable universal
// "close without submitting" that doesn't depend on each dialog having its own close button.
async function closeByBackdrop(page: Page) {
  await page.mouse.click(8, 8);
  await page.waitForTimeout(300);
}

// Several of these modals' own tab/button labels (Draft, Quotation) also match a same-named
// control on the terminal page UNDERNEATH the modal (e.g. the bottom tender row's own "Draft"
// button) — an unscoped getByRole() can silently resolve to the hidden one behind the overlay
// instead of the modal's own control. Scope to the topmost modal card explicitly.
function modalCard(page: Page): Locator {
  return page.locator('.rounded-2xl.shadow-2xl').last();
}

test('retail terminal — toolbar, cart, and every dialog', async ({ page }) => {
  await pinLogin(page);
  await selectOutlet(page, DEMO_OUTLETS.retail);
  await goToViaSidebar(page, 'POS Terminal');
  await page.waitForTimeout(800);

  // Two structurally-identical order-builder instances render at once (desktop panel + mobile
  // drawer, per terminal-shell.tsx's own doc comment) — always scope to the visible one.
  const searchInput = () => page.locator('input[placeholder*="Scan barcode" i]').locator('visible=true').first();

  // 1. Empty terminal — toolbar, search, categories, empty cart.
  await screenshotWithCallouts(page, assetPath(DIR, '01-terminal-overview.png'), [
    { locator: searchInput(), number: 1 },
    { locator: page.getByRole('tablist', { name: 'Categories' }), number: 2 },
    { locator: page.getByText('Cart is empty'), number: 3 },
  ]);

  // 2. Top quick-action toolbar.
  const toolbar = page.getByTitle('Recent Transactions').locator('..');
  await toolbar.scrollIntoViewIfNeeded().catch(() => {});
  await screenshotWithCallouts(page, assetPath(DIR, '02-quick-action-toolbar.png'), [
    { locator: page.getByTitle('Recent Transactions'), number: 1 },
    { locator: page.getByTitle('Sell Return'), number: 2 },
    { locator: page.getByTitle('Register Details'), number: 3 },
    { locator: page.getByTitle('Suspended Sales'), number: 4 },
    { locator: page.getByTitle('Calculator'), number: 5 },
    { locator: page.getByTitle('Add Expense'), number: 6 },
    { locator: page.getByRole('button', { name: /approval code/i }), number: 7 },
  ]);

  // 3. Browse — the full-screen Category/Brand picker drawer (no backdrop-click-to-close, only
  // its own X button does, so close via that specific aria-label rather than closeByBackdrop).
  const browseBtn = page.getByRole('button', { name: /^browse$/i }).locator('visible=true').first();
  if (await browseBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await browseBtn.click();
    await page.waitForTimeout(700);
    await screenshotWithCallouts(page, assetPath(DIR, '03-browse-categories.png'), [
      { locator: page.getByRole('button', { name: 'All Categories' }), number: 1 },
      { locator: page.getByRole('button').nth(1), number: 2 },
      { locator: page.getByLabel('Close', { exact: true }), number: 3 },
    ]);
    await page.getByLabel('Close', { exact: true }).first().click();
    await page.waitForTimeout(300);
  }

  // 4. Sale Date — admin/manager backdate control.
  const saleDateBtn = page.getByTitle(/backdate this sale/i);
  if (await saleDateBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await saleDateBtn.click();
    await page.waitForTimeout(400);
    await screenshotWithCallouts(page, assetPath(DIR, '04-sale-date.png'), [
      { locator: page.locator('input[type="date"]'), number: 1 },
    ]);
    await saleDateBtn.click(); // toggle closed without picking a date
    await page.waitForTimeout(300);
  }

  // 5. Search for a product and add it to the cart.
  const search = searchInput();
  await search.click();
  await search.fill('a');
  await page.waitForTimeout(700);
  const firstCard = page.locator('[data-testid="pos-product-card"]').first();
  const hasProduct = await firstCard.isVisible({ timeout: 3_000 }).catch(() => false);
  if (hasProduct) {
    await firstCard.click();
    await page.waitForTimeout(500);
    await search.fill('');
    await page.waitForTimeout(400);

    await screenshotWithCallouts(page, assetPath(DIR, '05-item-added-to-cart.png'), [
      { locator: page.getByLabel('Line quantity').first(), number: 1 },
      { locator: page.getByText('Clear all'), number: 2 },
    ]);

    // 6. Line-level editing — the cart row's Margin/Discount/Price cells are edited INLINE (a
    // pencil turns the cell into an input directly, no popup) for a manager/admin session; the
    // pencil buttons have no accessible name, so target the lucide Pencil icon directly.
    const pricePencil = page.locator('button:has(svg.lucide-pencil)').locator('visible=true').first();
    if (await pricePencil.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await pricePencil.click();
      await page.waitForTimeout(400);
      // The app's own UI already highlights the now-editable cell (a filled input replaces the
      // static value) — no extra callout needed, and the cart row's numeric inputs have no
      // distinguishing accessible name to target safely from the many other inputs on this page.
      await page.screenshot({ path: assetPath(DIR, '06-inline-line-edit.png') });
      await closeByBackdrop(page);
    }

    // 7. Add discount (order-level).
    const addDiscount = page.getByRole('button', { name: /add discount/i });
    if (await addDiscount.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await addDiscount.click();
      await page.waitForTimeout(500);
      const tabs: { locator: Locator; number: number }[] = [];
      for (const [name, num] of [['Defined', 1], ['Code', 2], ['One-time', 3]] as const) {
        const tab = page.getByRole('button', { name });
        if (await tab.isVisible({ timeout: 800 }).catch(() => false)) tabs.push({ locator: tab, number: num });
      }
      tabs.push({ locator: page.getByRole('button', { name: /^clear$/i }), number: 4 });
      await screenshotWithCallouts(page, assetPath(DIR, '07-apply-discount.png'), tabs);
      await closeByBackdrop(page);
    }

    // 8. Add charges.
    const addCharges = page.getByRole('button', { name: /add charges/i });
    if (await addCharges.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await addCharges.click();
      await page.waitForTimeout(400);
      await page.getByPlaceholder('e.g. 200').fill('150').catch(() => {});
      await screenshotWithCallouts(page, assetPath(DIR, '08-additional-charges.png'), [
        { locator: page.getByPlaceholder('e.g. 50'), number: 1 },
        { locator: page.getByPlaceholder('e.g. 200'), number: 2 },
        { locator: page.getByRole('button', { name: /^apply$/i }), number: 3 },
      ]);
      await page.getByRole('button', { name: /^clear$/i }).click().catch(() => {});
    }
  }

  // 9. Multi-cart Sale tabs (retail only) — open a second tab.
  const newSale = page.getByRole('button', { name: /new sale/i });
  if (await newSale.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await newSale.click();
    await page.waitForTimeout(500);
    await screenshotWithCallouts(page, assetPath(DIR, '09-sale-tabs.png'), [
      { locator: newSale, number: 1 },
    ]);
  }

  // 10. Recent Transactions — waits for its own list fetch, not just a fixed delay.
  const recentBtn = page.getByTitle('Recent Transactions');
  await recentBtn.click();
  await page.waitForTimeout(300);
  await waitForSpinnerGone(page);
  {
    const modal = modalCard(page);
    await screenshotWithCallouts(page, assetPath(DIR, '10-recent-transactions.png'), [
      { locator: modal.getByRole('button', { name: 'Final' }), number: 1 },
      { locator: modal.getByRole('button', { name: 'Quotation' }), number: 2 },
      { locator: modal.getByRole('button', { name: 'Draft', exact: true }), number: 3 },
      { locator: modal.getByRole('button', { name: 'Edit' }).first(), number: 4 },
    ]);
  }
  await closeByBackdrop(page);

  // 11. Sell Return.
  const sellReturnBtn = page.getByTitle('Sell Return');
  await sellReturnBtn.click();
  await page.waitForTimeout(400);
  await screenshotWithCallouts(page, assetPath(DIR, '11-sell-return.png'), [
    { locator: page.getByPlaceholder('Invoice No.'), number: 1 },
    { locator: page.getByRole('button', { name: /find sale/i }), number: 2 },
  ]);
  await closeByBackdrop(page);

  // 12. Register Details — genuinely async (its own report query); wait for the spinner to clear
  // before screenshotting, not a fixed delay.
  const registerBtn = page.getByTitle('Register Details');
  await registerBtn.click();
  await page.waitForTimeout(300);
  await waitForSpinnerGone(page);
  await screenshotWithCallouts(page, assetPath(DIR, '12-register-details.png'), [
    { locator: page.getByText('Total Sales', { exact: true }), number: 1 },
    { locator: page.getByText('Total Payment', { exact: true }), number: 2 },
    { locator: page.getByText('Details of products sold', { exact: true }), number: 3 },
  ]);
  await closeByBackdrop(page);

  // 13. Suspended Sales (Parked Sales) — same async-load consideration.
  const suspendedBtn = page.getByTitle('Suspended Sales');
  await suspendedBtn.click();
  await page.waitForTimeout(300);
  await waitForSpinnerGone(page);
  {
    const modal = modalCard(page);
    const firstParked = modal.getByText(/^\d/).first();
    await screenshotWithCallouts(page, assetPath(DIR, '13-suspended-sales.png'), [
      { locator: firstParked, number: 1 },
    ]);
  }
  await closeByBackdrop(page);

  // 14. Calculator — a floating panel, not a backdrop modal; only its own X (or Escape) closes it.
  const calcBtn = page.getByTitle('Calculator');
  if (await calcBtn.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await calcBtn.click();
    await page.waitForTimeout(400);
    await screenshotWithCallouts(page, assetPath(DIR, '14-calculator.png'), [
      { locator: page.getByRole('button', { name: '=', exact: true }), number: 1 },
      { locator: page.getByRole('button', { name: 'C', exact: true }), number: 2 },
    ]);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // 15. Add Expense — its category/account dropdowns load from treasury; wait them out.
  const expenseBtn = page.getByTitle('Add Expense');
  await expenseBtn.click();
  await page.waitForTimeout(300);
  await waitForSpinnerGone(page);
  await screenshotWithCallouts(page, assetPath(DIR, '15-add-expense.png'), [
    { locator: page.getByPlaceholder(/reference/i).or(page.locator('input[type="date"]').first()), number: 1 },
    { locator: page.locator('input[type="number"], input[inputmode="decimal"]').first(), number: 2 },
  ]);
  await closeByBackdrop(page);

  // Leave the terminal clean — clear whatever cart(s) this run created.
  const clearAllTabs = page.getByRole('button', { name: /^clear all$/i });
  if (await clearAllTabs.isVisible({ timeout: 1_000 }).catch(() => false)) await clearAllTabs.click().catch(() => {});
  const clearCartLink = page.getByText('Clear all', { exact: true });
  if (await clearCartLink.isVisible({ timeout: 1_000 }).catch(() => false)) await clearCartLink.click().catch(() => {});
});

test('customer search and add-new-customer', async ({ page }) => {
  await pinLogin(page);
  await selectOutlet(page, DEMO_OUTLETS.retail);
  await goToViaSidebar(page, 'POS Terminal');
  await page.waitForTimeout(800);

  // 1. Default Walk-in Customer chip + the search field, before typing anything.
  const customerSearch = page.getByPlaceholder('Search by name, phone or email').locator('visible=true').first();
  await screenshotWithCallouts(page, assetPath(DIR, '17-customer-walk-in-default.png'), [
    { locator: page.getByText('Walk-in Customer', { exact: true }).locator('visible=true').first(), number: 1 },
    { locator: customerSearch, number: 2 },
  ]);

  // 2. Type a phone number very unlikely to already exist in this demo tenant — triggers the
  // "No match" add-new prompt without needing to know the real customer list up front.
  await customerSearch.click();
  await customerSearch.fill('0700000001');
  await page.waitForTimeout(900); // 400ms debounce + the search round trip
  await waitForSpinnerGone(page);
  const noMatch = page.getByRole('button', { name: /no match/i });
  if (await noMatch.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await screenshotWithCallouts(page, assetPath(DIR, '18-customer-no-match.png'), [
      { locator: noMatch, number: 1 },
    ]);

    // 3. The inline "add new customer" form — filled in for the screenshot, then Cancelled
    // (never actually submitted) so no fake customer is created in the shared demo tenant.
    await noMatch.click();
    await page.waitForTimeout(400);
    await page.getByPlaceholder('Customer name').fill('Docs Example Customer');
    await screenshotWithCallouts(page, assetPath(DIR, '19-customer-add-new-form.png'), [
      { locator: page.getByPlaceholder('Customer name'), number: 1 },
      { locator: page.getByPlaceholder(/phone/i), number: 2 },
      { locator: page.getByPlaceholder(/email/i), number: 3 },
      { locator: page.getByRole('button', { name: /^add customer$/i }), number: 4 },
    ]);
    // .first(): the terminal's own tender row also has an unrelated "Cancel" button.
    await page.getByRole('button', { name: /^cancel$/i }).first().click();
    await page.waitForTimeout(300);
  }

  // 4. A real match, if this tenant's demo data happens to have one searchable by a broad term —
  // shows the picked-customer chip (name/phone, and any real account balance). Best-effort: skip
  // cleanly if nothing matches rather than fabricating a customer just for this screenshot.
  await customerSearch.fill('');
  await customerSearch.fill('a');
  await page.waitForTimeout(900);
  await waitForSpinnerGone(page);
  // Scoped to the matches dropdown's own distinctive container (customer-search.tsx), not just
  // "any button with a middle dot" — safer against an unrelated coincidental match elsewhere.
  const firstMatch = page.locator('div.divide-y.divide-border.max-h-44').getByRole('button').locator('visible=true').first();
  if (await firstMatch.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await firstMatch.click();
    await page.waitForTimeout(500);
    await screenshotWithCallouts(page, assetPath(DIR, '20-customer-selected.png'), [
      { locator: page.getByLabel('Change customer'), number: 1 },
    ]);
    // Deselect back to Walk-in so the terminal is left clean.
    await page.getByLabel('Change customer').click().catch(() => {});
  } else {
    await customerSearch.fill('');
  }
});

test('drafts (held sales) list', async ({ page }) => {
  await pinLogin(page);
  await selectOutlet(page, DEMO_OUTLETS.retail);
  await goToViaSidebar(page, 'Drafts');
  await page.waitForTimeout(600);
  await waitForSpinnerGone(page);
  await screenshotWithCallouts(page, assetPath(DIR, '16-drafts-list.png'), [
    { locator: page.getByRole('link', { name: /resume/i }).first(), number: 1 },
    { locator: page.getByRole('button', { name: /^print$/i }).first(), number: 2 },
    { locator: page.getByRole('button', { name: /^delete$/i }).first(), number: 3 },
  ]);
});
