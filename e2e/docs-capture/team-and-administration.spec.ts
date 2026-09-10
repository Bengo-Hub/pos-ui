import { test } from '@playwright/test';
import { pinLogin, selectOutlet, goToViaSidebar, expandSidebarGroup, waitForSpinnerGone, orgUrl, DEMO_OUTLETS } from './lib/pin-login';
import { screenshotWithCallouts } from './lib/annotate';
import { assetPath } from './lib/paths';

/**
 * Screenshots for "Team, Shifts & Cash Management" (docs/user-guide/pos/team-and-administration.md).
 * Read-only throughout — no PIN reset, no role change, no discount actually saved.
 */

const DIR = 'team';

async function openSettingsTab(page: import('@playwright/test').Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.waitForTimeout(500);
  await waitForSpinnerGone(page);
}

test('team members and roles & permissions', async ({ page }) => {
  await pinLogin(page);
  await selectOutlet(page, DEMO_OUTLETS.retail);
  await expandSidebarGroup(page, 'Management');
  await goToViaSidebar(page, 'Settings');
  await page.waitForTimeout(800);
  await openSettingsTab(page, 'Team');

  // 1. Members list — the Team card sits below the tab strip; scroll it into view first so the
  // callouts land inside the viewport instead of past the bottom edge.
  const addMember = page.getByRole('button', { name: /add team member/i });
  await addMember.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await screenshotWithCallouts(page, assetPath(DIR, '01-team-members.png'), [
    { locator: addMember, number: 1 },
    { locator: page.getByRole('button', { name: /reset pin|set pin/i }).first(), number: 2 },
    { locator: page.getByTitle(/extra roles/i).first(), number: 3 },
  ]);

  // 2. Roles & Permissions.
  await page.getByRole('button', { name: 'Roles & Permissions' }).click();
  await page.waitForTimeout(600);
  await waitForSpinnerGone(page);
  const rolesHeading = page.getByText('Roles & Permissions', { exact: true }).last();
  await rolesHeading.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: assetPath(DIR, '02-roles-and-permissions.png') });
});

test('shifts', async ({ page }) => {
  await pinLogin(page);
  await selectOutlet(page, DEMO_OUTLETS.retail);
  await goToViaSidebar(page, 'Shifts');
  await page.waitForTimeout(800);
  await waitForSpinnerGone(page);
  await screenshotWithCallouts(page, assetPath(DIR, '03-shifts.png'), [
    { locator: page.getByRole('button', { name: /start shift/i }).or(page.getByRole('button', { name: /end shift/i })), number: 1 },
  ]);
});

test('cash drawer', async ({ page }) => {
  await pinLogin(page);
  await selectOutlet(page, DEMO_OUTLETS.retail);
  await goToViaSidebar(page, 'Cash Drawer');
  await page.waitForTimeout(800);
  await waitForSpinnerGone(page);
  await page.screenshot({ path: assetPath(DIR, '04-cash-drawer.png') });
});

test('discounts administration', async ({ page }) => {
  // No sidebar entry exists for this page (confirmed: not in sidebar.tsx's nav list) — it's
  // reached from the terminal's own discount picker ("New standard discount") in normal use.
  // Direct navigation is the simpler, equally-valid way to reach it for a screenshot.
  await pinLogin(page);
  await selectOutlet(page, DEMO_OUTLETS.retail);
  await page.goto(orgUrl('/sell/discounts'));
  await page.waitForTimeout(800);
  await waitForSpinnerGone(page);

  const newDiscount = page.getByRole('button', { name: /new discount/i });
  if (await newDiscount.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await screenshotWithCallouts(page, assetPath(DIR, '05-discounts-list.png'), [
      { locator: newDiscount, number: 1 },
    ]);
    await newDiscount.click();
    await page.waitForTimeout(500);
    // discount-form-modal.tsx's own card: bg-card rounded-2xl border shadow-2xl, filtered to the
    // one actually titled "New Discount"/"Edit Discount" rather than trusting DOM order (see
    // approvals-and-overrides.spec.ts's note on why .last() alone is unreliable here).
    const dialog = page.locator('.rounded-2xl.shadow-2xl').filter({ hasText: /Discount$/ });
    await screenshotWithCallouts(page, assetPath(DIR, '06-new-discount.png'), [
      { locator: dialog.getByText('Promo Code'), number: 1 },
      { locator: dialog.getByText('Automatic', { exact: true }), number: 2 },
    ]);
  }
});
