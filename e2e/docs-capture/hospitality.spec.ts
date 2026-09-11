import { Locator, Page, test } from '@playwright/test';
import {
  pinLogin, selectOutlet, goToViaSidebar, expandSidebarGroup, waitForSpinnerGone, waitForSkeletonsGone,
  DEMO_OUTLETS, DEMO_PINS,
} from './lib/pin-login';
import { screenshotWithCallouts, Callout } from './lib/annotate';
import { assetPath } from './lib/paths';

/**
 * Screenshots for the hospitality-specific terminal workflow (tables, order type, courses, the
 * kitchen/bar display, and reservations) — everything a retail outlet doesn't have, captured on
 * "Demo Grand Hotel & Restaurant" (DEMO_OUTLETS.hospitality). Retail's own toolbar/cart/checkout
 * screenshots live in terminal.spec.ts and are NOT repeated here — the two pages are meant to be
 * read together.
 *
 * Non-destructive throughout: Seat Guests → Start Order only navigates the terminal with a
 * table_id in the URL (no server write happens until Place Order/Send to Kitchen is actually
 * clicked, which this suite never does); every table/reservation state observed is whatever the
 * shared demo tenant already has, never created here. Screenshots that depend on state this run
 * doesn't find (an already-occupied table, an active KDS ticket, an existing bill) are captured
 * best-effort and skipped gracefully rather than manufactured.
 *
 * KNOWN APP GAP (not fixed here, worked around below): the header's "Switch outlet" chip updates
 * only the outlet-filter store used for data fetching, not `useAuthStore().outlet` — and
 * terminal-context.tsx's `cfg`/`isHospitality` read the LATTER. So an admin who logs in and then
 * switches outlets via the header sees the correct tables/data for the new outlet, but the /order
 * terminal keeps rendering the use-case profile (search placeholder, Order Type selector,
 * course/seat controls, multi-cart, Place Order vs Pay) of whichever outlet was active AT LOGIN,
 * not the one just switched to. Logging in directly with a role PIN that only ever resolves to
 * the hospitality outlet (the seeded Waiter PIN) sidesteps this entirely for terminal.spec.ts-style
 * captures — used for the one test below that needs the terminal itself, not just the Tables page.
 */

const DIR = 'hospitality';

// The Tables page's own loading states have no shared class/testid to hook a generic spinner-gone
// helper onto reliably (a plain 5s "wait for .animate-spin to hide" can resolve instantly if the
// fetch hasn't started yet, capturing "Loading tables…" instead of real rows — confirmed live).
// Wait for the indicator to actually APPEAR first (if it's going to), then for it to clear.
async function waitForLoadingGone(page: Page, indicator: Locator) {
  const appeared = await indicator.first().waitFor({ state: 'visible', timeout: 2_500 }).then(() => true).catch(() => false);
  if (appeared) {
    await indicator.first().waitFor({ state: 'hidden', timeout: 12_000 }).catch(() => {});
  } else {
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(300);
}

async function openTablesPage(page: Page) {
  await goToViaSidebar(page, 'Tables');
  await waitForLoadingGone(page, page.getByText(/loading tables/i));
}

async function openTablesTab(page: Page, tab: 'tables' | 'bills') {
  const label = tab === 'tables' ? 'Tables' : 'My Bills';
  await page.getByRole('button', { name: label, exact: true }).click();
  await waitForLoadingGone(page, page.locator('.animate-spin'));
}

// The table action sheet is the only `fixed inset-0 z-50 flex items-end … sm:items-center` overlay
// in the app (SeatGuestsModal uses `items-center justify-center` with no `items-end`, so this
// combination is unique to it) — scoping to it matters because an unscoped getByRole() can match a
// same-named control on a DIFFERENT table card still sitting (visibly, just behind the backdrop)
// underneath the sheet.
function actionSheet(page: Page): Locator {
  return page.locator('div.items-end.sm\\:items-center').last();
}

test('tables — floor plan overview, filters, and seat guests', async ({ page }) => {
  await pinLogin(page);
  await selectOutlet(page, DEMO_OUTLETS.hospitality);
  await openTablesPage(page);

  const availableCard = page.getByRole('button', { name: /seat guests/i }).first();
  const callouts: Callout[] = [
    { locator: page.getByRole('button', { name: 'Tables', exact: true }), number: 1 },
    { locator: page.getByRole('button', { name: 'My Bills', exact: true }), number: 2 },
    { locator: page.getByRole('button', { name: 'All', exact: true }).first(), number: 3 },
    { locator: page.getByRole('button', { name: /^Available$/ }), number: 4 },
  ];
  if (await availableCard.isVisible({ timeout: 3_000 }).catch(() => false)) {
    callouts.push({ locator: availableCard, number: 5 });
  }
  await screenshotWithCallouts(page, assetPath(DIR, '01-tables-overview.png'), callouts);

  if (await availableCard.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await availableCard.click();
    await page.waitForTimeout(400);
    const startOrder = page.getByRole('button', { name: /start order/i });
    if (await startOrder.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // The increment/decrement icons are plain icon-only buttons with no accessible name, so an
      // unscoped `button:has(svg.lucide-plus)` can resolve to an unrelated "+" elsewhere on the
      // page (a background table card's own controls, still technically visible behind the
      // backdrop) — confirmed live. Scope to the modal panel (its `rounded-3xl w-72` classes are
      // unique to this dialog). The minus/count/plus trio also sits too close together for
      // separate callouts to stay legible (badges/arrows land on top of each other) — one ring
      // around the whole spinner reads far more clearly than three crowded arrows.
      const modal = page.locator('div.rounded-3xl.w-72');
      const spinner = modal.locator('div.flex.items-center.gap-5');
      await screenshotWithCallouts(page, assetPath(DIR, '02-seat-guests-modal.png'), [
        { locator: spinner, number: 1 },
        { locator: modal.getByRole('button', { name: /^back$/i }), number: 2 },
        { locator: startOrder, number: 3 },
      ]);
      await page.getByRole('button', { name: /^back$/i }).click();
      await page.waitForTimeout(300);
    }
  }
});

test('table action sheet — merge, transfer, and status controls', async ({ page }) => {
  await pinLogin(page);
  await selectOutlet(page, DEMO_OUTLETS.hospitality);
  await openTablesPage(page);

  // Open the action sheet for whichever table sorts first — works for available or occupied.
  const firstTableName = page.locator('button.text-left.flex-1').first();
  if (!(await firstTableName.isVisible({ timeout: 3_000 }).catch(() => false))) {
    test.skip(true, 'No tables rendered for this outlet.');
    return;
  }
  await firstTableName.click();
  const sheet = actionSheet(page);
  await sheet.waitFor({ state: 'visible', timeout: 3_000 });
  await page.waitForTimeout(300);

  const candidates: Array<{ name: RegExp; num: number }> = [
    { name: /seat guests/i, num: 1 },
    { name: /add items to bill/i, num: 1 },
    { name: /view.*manage bill/i, num: 2 },
    { name: /reserve table/i, num: 3 },
    { name: /^merge table$/i, num: 4 },
    { name: /^unmerge table$/i, num: 4 },
    { name: /^transfer table$/i, num: 5 },
    { name: /^release table$/i, num: 6 },
  ];
  const callouts: Callout[] = [];
  for (const c of candidates) {
    const loc = sheet.getByRole('button', { name: c.name }).first();
    if (await loc.isVisible({ timeout: 1_000 }).catch(() => false)) {
      callouts.push({ locator: loc, number: c.num });
    }
  }
  const statusGrid = sheet.getByRole('button', { name: /^available$/i, exact: true }).last();
  if (await statusGrid.isVisible({ timeout: 1_000 }).catch(() => false)) {
    callouts.push({ locator: statusGrid, number: 7 });
  }
  await screenshotWithCallouts(page, assetPath(DIR, '03-table-action-sheet.png'), callouts);

  // Close without changing anything.
  await page.keyboard.press('Escape').catch(() => {});
  await page.mouse.click(8, 8).catch(() => {});
});

// Uses the seeded Waiter PIN directly (see the KNOWN APP GAP note above) so the terminal actually
// renders the hospitality use-case profile, instead of admin-login-then-switch-outlet.
test('terminal — order type, table, courses, and Place Order', async ({ page }) => {
  await pinLogin(page, { pin: DEMO_PINS.waiter, outletName: DEMO_OUTLETS.hospitality });
  await openTablesPage(page);

  const availableCard = page.getByRole('button', { name: /seat guests/i }).first();
  if (!(await availableCard.isVisible({ timeout: 3_000 }).catch(() => false))) {
    test.skip(true, 'No available table to seat guests at.');
    return;
  }
  await availableCard.click();
  await page.waitForTimeout(400);
  const startOrder = page.getByRole('button', { name: /start order/i });
  await startOrder.click();
  await page.waitForURL(/\/order\?/, { timeout: 6_000 }).catch(() => {});
  await page.waitForTimeout(900);
  await waitForSpinnerGone(page);

  // Order Type selector + attached table chip. The four order-type pills sit with almost no gap
  // between them, so labeling more than one crowds/overlaps arrows illegibly — callout only the
  // row itself (via the active Dine-In pill) and the table chip; the other pill labels are legible
  // straight off the screenshot without an arrow.
  const orderTypeCallouts: Callout[] = [];
  const dineIn = page.getByRole('button', { name: /dine-in/i });
  if (await dineIn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    orderTypeCallouts.push({ locator: dineIn, number: 1 });
    const tableChip = page.getByText(/^Table /).first();
    if (await tableChip.isVisible({ timeout: 2_000 }).catch(() => false)) orderTypeCallouts.push({ locator: tableChip, number: 2 });
    await screenshotWithCallouts(page, assetPath(DIR, '04-order-type-and-table.png'), orderTypeCallouts);
  }

  // Add an item so a cart line (with course + seat controls) exists.
  const firstProduct = page.locator('[data-testid="pos-product-card"]').locator('visible=true').first();
  if (await firstProduct.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await firstProduct.click();
    await page.waitForTimeout(500);

    const courseSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Starter' }) }).locator('visible=true').first();
    if (await courseSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Course and Seat are two <select>s sitting directly side by side with almost no gap —
      // separate callouts' badges/arrows land on top of each other (confirmed live). One ring
      // around their shared parent row reads far more clearly than two crowded arrows.
      const controlsRow = courseSelect.locator('xpath=..');
      await screenshotWithCallouts(page, assetPath(DIR, '05-course-and-seat-controls.png'), [
        { locator: controlsRow, number: 1 },
      ]);
    }
    // Fire Courses only appears once a course has already been sent to the kitchen on a PRIOR
    // round (fired_courses on the order) — a brand-new, not-yet-placed cart never shows it, so
    // there's nothing to capture here non-destructively; documented in prose instead.

    const placeOrderBtn = page.getByRole('button', { name: /place order/i });
    if (await placeOrderBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await screenshotWithCallouts(page, assetPath(DIR, '06-place-order-button.png'), [{ locator: placeOrderBtn, number: 1 }]);
    }
  }

  // Test ends here without ever clicking Place Order — nothing was submitted, and the page
  // (a fresh Playwright context per test) is torn down regardless, so no explicit navigate-away
  // cleanup is needed.
});

test('my bills — a waiter/cashier bill list', async ({ page }) => {
  await pinLogin(page);
  await selectOutlet(page, DEMO_OUTLETS.hospitality);
  await openTablesPage(page);
  await openTablesTab(page, 'bills');

  const callouts: Callout[] = [];
  const addToBill = page.getByRole('button', { name: /add to bill/i }).first();
  const settleBill = page.getByRole('button', { name: /settle bill/i }).first();
  const splitOrder = page.getByRole('button', { name: /split order/i }).first();
  for (const [loc, num] of [[addToBill, 1], [settleBill, 2], [splitOrder, 3]] as const) {
    if (await loc.isVisible({ timeout: 1_500 }).catch(() => false)) callouts.push({ locator: loc, number: num });
  }
  // Always label the period filter, whether or not any bill rows exist yet.
  const periodFilter = page.getByRole('button', { name: /today/i }).first();
  if (await periodFilter.isVisible({ timeout: 2_000 }).catch(() => false)) callouts.push({ locator: periodFilter, number: 4 });

  await screenshotWithCallouts(page, assetPath(DIR, '07-my-bills.png'), callouts);
});

test('kitchen display (KDS) — stations and tickets', async ({ page }) => {
  await pinLogin(page);
  await selectOutlet(page, DEMO_OUTLETS.hospitality);
  await expandSidebarGroup(page, 'Display Board');
  await goToViaSidebar(page, 'KDS');
  await waitForSpinnerGone(page);
  await waitForSkeletonsGone(page);
  await waitForLoadingGone(page, page.getByText(/no active tickets/i));

  const callouts: Callout[] = [];
  const kitchenTab = page.getByText('Kitchen Main', { exact: false }).first();
  if (await kitchenTab.isVisible({ timeout: 3_000 }).catch(() => false)) callouts.push({ locator: kitchenTab, number: 1 });
  const barTab = page.getByText('Bar Display', { exact: false }).first();
  if (await barTab.isVisible({ timeout: 1_500 }).catch(() => false)) callouts.push({ locator: barTab, number: 2 });

  const startBtn = page.getByRole('button', { name: /^start$/i }).first();
  const readyBtn = page.getByRole('button', { name: /^ready$/i }).first();
  const servedBtn = page.getByRole('button', { name: /^served$/i }).first();
  if (await startBtn.isVisible({ timeout: 1_500 }).catch(() => false)) {
    callouts.push({ locator: startBtn, number: 3 });
  } else if (await readyBtn.isVisible({ timeout: 1_500 }).catch(() => false)) {
    callouts.push({ locator: readyBtn, number: 3 });
  } else if (await servedBtn.isVisible({ timeout: 1_500 }).catch(() => false)) {
    callouts.push({ locator: servedBtn, number: 3 });
  }

  await screenshotWithCallouts(page, assetPath(DIR, '08-kds-stations.png'), callouts);
});

test('reservations — booking a table ahead', async ({ page }) => {
  await pinLogin(page);
  await selectOutlet(page, DEMO_OUTLETS.hospitality);
  await goToViaSidebar(page, 'Reservations');
  await waitForSpinnerGone(page);
  await page.waitForTimeout(500);

  const newReservation = page.getByRole('button', { name: /new reservation/i }).first();
  if (!(await newReservation.isVisible({ timeout: 3_000 }).catch(() => false))) {
    test.skip(true, 'New Reservation button not visible for this role/outlet.');
    return;
  }
  await newReservation.click();
  await page.waitForTimeout(500);

  await screenshotWithCallouts(page, assetPath(DIR, '09-new-reservation-form.png'), [
    { locator: page.getByPlaceholder('Full name'), number: 1 },
    { locator: page.getByPlaceholder('+254712345678'), number: 2 },
    { locator: page.getByText('Party Size', { exact: false }), number: 3 },
    { locator: page.getByText('Preferred Table', { exact: false }), number: 4 },
    { locator: page.getByPlaceholder(/dietary requirements/i), number: 5 },
    { locator: page.getByRole('button', { name: /^cancel$/i }), number: 6 },
  ]);

  await page.getByRole('button', { name: /^cancel$/i }).click();
  await page.waitForTimeout(300);
});
