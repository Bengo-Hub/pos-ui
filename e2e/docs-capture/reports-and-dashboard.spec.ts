import { test } from '@playwright/test';
import { pinLogin, selectOutlet, goToViaSidebar, expandSidebarGroup, waitForSpinnerGone, DEMO_OUTLETS } from './lib/pin-login';
import { screenshotWithCallouts } from './lib/annotate';
import { assetPath } from './lib/paths';

/**
 * Screenshots for "Reports & Dashboard" (docs/user-guide/pos/reports-and-dashboard.md).
 */

const DIR = 'reports';

test('dashboard with range filter', async ({ page }) => {
  await pinLogin(page);
  await selectOutlet(page, DEMO_OUTLETS.retail);
  await goToViaSidebar(page, 'Dashboard');
  await page.waitForTimeout(800);
  await waitForSpinnerGone(page);

  await screenshotWithCallouts(page, assetPath(DIR, '01-dashboard.png'), [
    { locator: page.getByText('Quick Actions'), number: 1 },
    { locator: page.getByRole('button', { name: 'Week' }), number: 2 },
    { locator: page.getByRole('button', { name: 'Custom' }), number: 3 },
  ]);
});

test('reports landing and a couple of report pages', async ({ page }) => {
  await pinLogin(page);
  await selectOutlet(page, DEMO_OUTLETS.retail);
  await expandSidebarGroup(page, 'Management');
  await goToViaSidebar(page, 'Reports');
  await page.waitForTimeout(800);
  await waitForSpinnerGone(page);
  await screenshotWithCallouts(page, assetPath(DIR, '02-reports-landing.png'), [
    { locator: page.getByRole('button', { name: 'Daily' }), number: 1 },
    { locator: page.getByRole('button', { name: /export csv/i }), number: 2 },
  ]);

  // Analytics and Tax Report are deliberately NOT captured here: both hit a real, live
  // "rate limit exceeded" response from this demo tenant's analytics endpoint during this
  // session's testing (confirmed — not a docs-capture bug), and the Tax Report page crashed
  // outright after that. Re-run this manually, alone, well after any other docs-capture
  // activity against codevertex-demo, if screenshots of those two pages are wanted later.
});
