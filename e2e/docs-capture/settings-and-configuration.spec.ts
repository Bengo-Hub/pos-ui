import { test } from '@playwright/test';
import { pinLogin, selectOutlet, goToViaSidebar, expandSidebarGroup, waitForSpinnerGone, DEMO_OUTLETS } from './lib/pin-login';
import { screenshotWithCallouts } from './lib/annotate';
import { assetPath } from './lib/paths';

/**
 * Screenshots for "Settings & Configuration" (docs/user-guide/pos/settings-and-configuration.md).
 * Read-only: fields are viewed, never Saved.
 */

const DIR = 'settings';

// Every tab's real content (settings/page.tsx renders an <h2>{label}</h2> heading right above
// it) starts below the tab-groups block, which alone fills the first viewport — scroll to that
// heading after switching tabs so the actual fields land in the screenshot, not just the strip.
async function openSettingsTab(page: import('@playwright/test').Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.waitForTimeout(500);
  await waitForSpinnerGone(page);
  await page.getByRole('heading', { name: label, level: 2 }).scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
}

test('outlet config, tax, and payment display', async ({ page }) => {
  await pinLogin(page);
  await selectOutlet(page, DEMO_OUTLETS.retail);
  await expandSidebarGroup(page, 'Management');
  await goToViaSidebar(page, 'Settings');
  await page.waitForTimeout(800);

  // Tab strip overview, once, at the top of the run.
  await screenshotWithCallouts(page, assetPath(DIR, '00-settings-tab-groups.png'), [
    { locator: page.getByText('General & Localization'), number: 1 },
    { locator: page.getByText('Sales & Payments'), number: 2 },
    { locator: page.getByText('Use-Case Modules'), number: 3 },
    { locator: page.getByText('Team & Security'), number: 4 },
  ]);

  // 1. Outlet Config (General tab) — Currency, Discount Limits, Cashier Price Edits. These 4
  // cards sit below the tab strip — scroll to the Discount Limits card (the middle one) first so
  // all three land in the viewport instead of being drawn off-screen at the bottom edge.
  await page.getByText('Discount Limits').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await screenshotWithCallouts(page, assetPath(DIR, '01-outlet-config.png'), [
    { locator: page.getByText('Currency', { exact: true }).first(), number: 1 },
    { locator: page.getByText('Discount Limits'), number: 2 },
    { locator: page.getByText('Cashier Price Edits'), number: 3 },
  ]);

  // 2. Tax tab — "Default Tax Code & Receipt Display" is the SECOND card, below "Tax is managed
  // in Treasury"; scroll straight to it rather than relying on the tab heading alone.
  await openSettingsTab(page, 'Tax');
  const taxCard = page.getByText('Default Tax Code & Receipt Display');
  await taxCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await screenshotWithCallouts(page, assetPath(DIR, '02-tax.png'), [
    { locator: taxCard, number: 1 },
  ]);

  // 3. Cashier & Terminal policy.
  await openSettingsTab(page, 'Cashier & Terminal');
  const cashierHeading = page.getByText('Sales visibility, auto-logout');
  await cashierHeading.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: assetPath(DIR, '03-cashier-and-terminal.png') });

  // 4. Document Numbering.
  await openSettingsTab(page, 'Document Numbering');
  await page.screenshot({ path: assetPath(DIR, '04-document-numbering.png') });

  // 5. Payment Display — paybill/till and bank details shown on receipts.
  await openSettingsTab(page, 'Payment Display');
  await page.screenshot({ path: assetPath(DIR, '05-payment-display.png') });
});

test('modules', async ({ page }) => {
  await pinLogin(page);
  await selectOutlet(page, DEMO_OUTLETS.retail);
  await expandSidebarGroup(page, 'Management');
  await goToViaSidebar(page, 'Settings');
  await page.waitForTimeout(800);
  await openSettingsTab(page, 'Modules');
  await page.screenshot({ path: assetPath(DIR, '06-modules.png') });
});
