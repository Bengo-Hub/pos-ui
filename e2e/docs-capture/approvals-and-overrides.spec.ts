import { Locator, Page, test } from '@playwright/test';
import { pinLogin, selectOutlet, goToViaSidebar, waitForSpinnerGone, DEMO_OUTLETS, DEMO_PINS } from './lib/pin-login';
import { screenshotWithCallouts } from './lib/annotate';
import { assetPath } from './lib/paths';

/**
 * Screenshots for "Approvals & Manager Overrides"
 * (docs/user-guide/pos/approvals-and-overrides.md). Non-destructive: the one-time approval code
 * generated here is never redeemed (it just expires unused); the out-of-stock override below
 * never reaches checkout — it's purely a client-side quantity guard, closed without ever
 * authorizing it, and the cart is cleared before the test ends.
 */

const DIR = 'approvals';

async function closeByBackdrop(page: Page) {
  await page.mouse.click(8, 8);
  await page.waitForTimeout(300);
}

// Several dialogs' own labels (Draft, Code) exactly match a same-named control on the terminal
// page UNDERNEATH them (the bottom tender row's own "Draft"/"M-Pesa Code" buttons) — scope to the
// topmost dialog card explicitly rather than risk a strict-mode multi-match or a wrong click.
function modalCard(page: Page): Locator {
  return page.locator('.rounded-2xl').last();
}

test('manager generates a one-time approval code', async ({ page }) => {
  await pinLogin(page); // admin
  await selectOutlet(page, DEMO_OUTLETS.retail);
  await goToViaSidebar(page, 'POS Terminal');
  await page.waitForTimeout(800);

  const approvalCodeBtn = page.getByRole('button', { name: /approval code/i });
  await approvalCodeBtn.click();
  await page.waitForTimeout(400);
  // NOT scoped via modalCard()/.last(): GenerateApprovalCodeButton renders its own dialog
  // inline (no portal) from inside the TOOLBAR, which mounts BEFORE the product grid in the
  // component tree — unlike the TerminalModals-hosted dialogs (Recent Transactions, Approval
  // dialog, etc.), it is very much NOT the last .rounded-2xl element in DOM order. Anchor on
  // its own distinctive heading text instead, which is unambiguous regardless of DOM position.
  const codeDialog = page.locator('div.rounded-2xl', { hasText: 'Generate approval code' });
  await screenshotWithCallouts(page, assetPath(DIR, '01-approval-code-action-picker.png'), [
    { locator: codeDialog.locator('select'), number: 1 },
  ]);

  await codeDialog.getByRole('button', { name: /^generate code$/i }).click();
  await page.waitForTimeout(700);
  // Result heading is "{action label} code" (e.g. "Over-limit discount code") — not literally
  // "authorization code" (that exact phrase belongs to the separate Void/Complimentary code
  // buttons' own dialogs). Target the generated code's own distinctive styling instead of
  // guessing at copy that doesn't actually appear on this specific dialog.
  await screenshotWithCallouts(page, assetPath(DIR, '02-approval-code-generated.png'), [
    { locator: page.locator('span.font-mono.font-bold'), number: 1 },
    { locator: page.getByTitle('Copy'), number: 2 },
  ]);
  await closeByBackdrop(page);
});

test('a below-preset price override triggers the manager-approval dialog', async ({ page }) => {
  // A plain cashier lands directly on the POS Terminal after PIN login (cashierLandingPath) —
  // no sidebar nav needed. Uses a price override rather than a discount: the demo Cashier role
  // has no pos.discounts.add grant (confirmed live — the discount controls don't even render for
  // it). The out-of-stock override was ALSO tried and confirmed non-viable in this specific demo
  // catalog: cart lines here carry no stockQuantity at all (StockCell shows "—", not a number,
  // confirmed via a debug screenshot), so the oversell guard's `stockQuantity !== undefined`
  // condition never fires regardless of quantity typed or how many times "+" is clicked — a real
  // data gap in this tenant's catalog projection, not something to work around here.
  await pinLogin(page, { pin: DEMO_PINS.cashier });
  await page.waitForTimeout(800);
  await waitForSpinnerGone(page);

  const searchInput = () => page.locator('input[placeholder*="Scan barcode" i]').locator('visible=true').first();
  const search = searchInput();
  await search.click();
  await search.fill('laundry');
  await page.waitForTimeout(700);
  const firstCard = page.locator('[data-testid="pos-product-card"]').first();
  if (!(await firstCard.isVisible({ timeout: 3_000 }).catch(() => false))) {
    test.skip(true, 'no catalog item matched the search — cannot build a cart to price-override');
  }
  await firstCard.click();
  await page.waitForTimeout(500);
  await search.fill('');

  // The price cell IS the pencil button (InlineEditCell) — clicking it swaps the whole button
  // for a plain autoFocus-ed, auto-selected <input> in place (no type="number", no separate
  // input to locate) — a cashier without cost/margin visibility sees only this one editable
  // cell on the row (unlike a manager's three). Typing directly replaces the pre-selected text.
  const pricePencil = page.locator('button:has(svg.lucide-pencil)').locator('visible=true').first();
  await pricePencil.click();
  await page.waitForTimeout(300);
  await page.keyboard.type('1');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);

  // Attempting to tender now hits pos-api's require_approval_below_base check server-side (a
  // 422 — no order is created); this is exactly what raises the approval dialog.
  const cashTender = page.locator('[data-testid="pos-tender-cash"]').locator('visible=true').first();
  await cashTender.scrollIntoViewIfNeeded().catch(() => {});
  await cashTender.click();
  await page.waitForTimeout(400);
  const cashCapture = page.getByRole('button', { name: /confirm cash/i });
  if (await cashCapture.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await cashCapture.click();
    await page.waitForTimeout(900);
  }

  const dialogVisible = await page.getByText('Manager approval')
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!dialogVisible) {
    await page.screenshot({ path: assetPath(DIR, '_debug-no-approval-dialog.png') });
  }
  if (dialogVisible) {
    // Anchored on its own heading, not DOM-order .last() — this fires while the inline cash-
    // capture bar (InlinePaymentBar) is ALSO still on screen underneath it, and that bar's own
    // markup interferes with a plain "last .rounded-2xl" guess (confirmed via a hang here, same
    // failure family as the GenerateApprovalCodeButton dialog earlier in this file).
    const dialog = page.locator('div.rounded-2xl', { hasText: 'Manager approval' });
    await screenshotWithCallouts(page, assetPath(DIR, '03-approval-dialog-scan.png'), [
      { locator: dialog.getByRole('button', { name: 'Scan card' }), number: 1 },
      { locator: dialog.getByRole('button', { name: 'PIN', exact: true }), number: 2 },
      { locator: dialog.getByRole('button', { name: 'Code', exact: true }), number: 3 },
    ]);
    await dialog.getByRole('button', { name: 'Code', exact: true }).click();
    await page.waitForTimeout(300);
    // The Code tab's confirm button label is caller-supplied (confirmLabel prop) — "Approve"
    // for this price-override flow, "Authorize"/"Authorize complimentary" elsewhere. Match
    // broadly rather than hardcoding one caller's copy (a zero-match role locator inside
    // screenshotWithCallouts silently eats Playwright's ~30s actionability wait per callout).
    await screenshotWithCallouts(page, assetPath(DIR, '04-approval-dialog-code-tab.png'), [
      { locator: dialog.getByPlaceholder(/authorization code/i), number: 1 },
      { locator: dialog.getByRole('button', { name: /approve|authorize/i }), number: 2 },
    ]);
    await closeByBackdrop(page);
  }

  // Leave the terminal clean.
  const clearCartLink = page.getByText('Clear all', { exact: true });
  if (await clearCartLink.isVisible({ timeout: 1_000 }).catch(() => false)) await clearCartLink.click().catch(() => {});
});

test('an open order\'s void/complimentary code buttons, if one exists', async ({ page }) => {
  // Best-effort only: GenerateVoidCodeButton/GenerateComplimentaryCodeButton self-hide on every
  // terminal order status (completed/paid/cancelled/voided/refunded), so this needs a real
  // open/pending_payment order to already exist in the shared demo tenant. Reuses the Recent
  // Transactions modal's "Draft" tab (queries status draft,open,pending_payment together) rather
  // than risking a new, unverified navigation path — its Edit action routes a genuine open order
  // straight to the order detail page (drafts route to Add Sale instead, and are skipped here).
  await pinLogin(page); // admin
  await selectOutlet(page, DEMO_OUTLETS.retail);
  await goToViaSidebar(page, 'POS Terminal');
  await page.waitForTimeout(800);

  await page.getByTitle('Recent Transactions').click();
  await page.waitForTimeout(300);
  await waitForSpinnerGone(page);
  const recentModal = modalCard(page);
  await recentModal.getByRole('button', { name: 'Draft', exact: true }).click();
  await page.waitForTimeout(300);
  await waitForSpinnerGone(page);

  // Best-effort, first row only — this is a nice-to-have capture, not worth the complexity/
  // fragility of retrying across multiple rows with a goBack() in between.
  const firstEdit = recentModal.getByRole('button', { name: /^edit$/i }).first();
  if (!(await firstEdit.isVisible({ timeout: 2_000 }).catch(() => false))) {
    test.skip(true, 'no draft/open order exists in this demo tenant right now');
  }
  await firstEdit.click();
  await page.waitForURL(/\/(orders|sell\/add)\//, { timeout: 5_000 }).catch(() => {});

  if (!page.url().includes('/orders/')) {
    test.skip(true, 'the only draft/open row found was a plain draft — no order detail page to capture');
  }
  await page.waitForTimeout(600);
  const voidCode = page.getByRole('button', { name: /void code/i });
  if (await voidCode.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await screenshotWithCallouts(page, assetPath(DIR, '05-order-void-and-complimentary-codes.png'), [
      { locator: voidCode, number: 1 },
      { locator: page.getByRole('button', { name: /complimentary code/i }), number: 2 },
      { locator: page.getByRole('button', { name: /void bill/i }), number: 3 },
    ]);
  }
});
