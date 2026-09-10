import { test } from '@playwright/test';
import { pinLogin, selectOutlet, goToViaSidebar, expandSidebarGroup, waitForSpinnerGone, DEMO_OUTLETS } from './lib/pin-login';
import { screenshotWithCallouts } from './lib/annotate';
import { assetPath } from './lib/paths';

/**
 * Screenshots for "Receipts & Printing" (docs/user-guide/pos/receipts-and-printing.md) — the
 * Settings page's Receipt & Printing, Card Terminal, and Devices tabs. Read-only throughout:
 * "Detect Printers" is a real, harmless hardware scan; no field here is ever Saved.
 */

const DIR = 'receipts';

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

test('receipt & printing settings', async ({ page }) => {
  await pinLogin(page);
  await selectOutlet(page, DEMO_OUTLETS.retail);
  // Settings lives under the "Management" sidebar group, collapsed by default (nav-config.ts) —
  // its link doesn't exist in the DOM at all until the group header is expanded.
  await expandSidebarGroup(page, 'Management');
  await goToViaSidebar(page, 'Settings');
  await page.waitForTimeout(800);

  await openSettingsTab(page, 'Receipt & Printing');

  // 1. Header/Footer text + logo/email/name toggles.
  await screenshotWithCallouts(page, assetPath(DIR, '01-receipt-content.png'), [
    { locator: page.getByPlaceholder(/business name, address/i), number: 1 },
    { locator: page.getByPlaceholder(/thank you message/i), number: 2 },
    { locator: page.getByText('Show Business Logo'), number: 3 },
    { locator: page.getByText('Show Business Email'), number: 4 },
  ]);

  // 2. Auto-Print Behavior card. "Auto-Print Station Tickets" is a hospitality/quick-service-only
  // toggle — a zero-match callout locator makes screenshotWithCallouts hang (Playwright's
  // ~30s actionability wait on boundingBox()), so only include it when it actually exists for
  // this outlet's use case (retail, in this docs-capture run, won't show it).
  const autoPrintHeading = page.getByText('Auto-Print Behavior');
  if (await autoPrintHeading.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await autoPrintHeading.scrollIntoViewIfNeeded();
    const callouts = [{ locator: page.getByText('Auto-Print Receipt on Completion'), number: 1 }];
    const stationTickets = page.getByText('Auto-Print Station Tickets');
    if (await stationTickets.isVisible({ timeout: 1_000 }).catch(() => false)) {
      callouts.push({ locator: stationTickets, number: 2 });
    }
    await screenshotWithCallouts(page, assetPath(DIR, '02-auto-print-behavior.png'), callouts);
  }

  // 3. Printer profile card — Detect Printers is a real, harmless local hardware scan.
  const stationHeading = page.getByText('Order Printing — Station Printers');
  if (await stationHeading.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await stationHeading.scrollIntoViewIfNeeded();
    const detectBtn = page.getByRole('button', { name: /detect printers/i });
    await screenshotWithCallouts(page, assetPath(DIR, '03-printer-profiles.png'), [
      { locator: stationHeading, number: 1 },
      { locator: detectBtn, number: 2 },
    ]);
    await detectBtn.click().catch(() => {});
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: assetPath(DIR, '04-detect-printers-result.png') });
  }

  // 4. Background Printing (Print Agent) status card.
  const agentHeading = page.getByText('Background Printing (Print Agent)');
  if (await agentHeading.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await agentHeading.scrollIntoViewIfNeeded();
    await page.screenshot({ path: assetPath(DIR, '05-print-agent-status.png') });
  }
});

test('card terminal settings', async ({ page }) => {
  await pinLogin(page);
  await selectOutlet(page, DEMO_OUTLETS.retail);
  // Settings lives under the "Management" sidebar group, collapsed by default (nav-config.ts) —
  // its link doesn't exist in the DOM at all until the group header is expanded.
  await expandSidebarGroup(page, 'Management');
  await goToViaSidebar(page, 'Settings');
  await page.waitForTimeout(800);

  await openSettingsTab(page, 'Card Terminal');
  // "Card Terminal Mode" is the first real card, below the tab heading+description — scroll
  // straight to it (the h2-heading scroll in openSettingsTab isn't enough on its own).
  const manualPdq = page.getByText('Manual PDQ');
  await manualPdq.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await screenshotWithCallouts(page, assetPath(DIR, '06-card-terminal-mode.png'), [
    { locator: manualPdq, number: 1 },
    { locator: page.getByText('Integrated Terminal', { exact: true }), number: 2 },
    { locator: page.getByText('Require Approval Code'), number: 3 },
  ]);
});

test('linked devices', async ({ page }) => {
  await pinLogin(page);
  await selectOutlet(page, DEMO_OUTLETS.retail);
  // Settings lives under the "Management" sidebar group, collapsed by default (nav-config.ts) —
  // its link doesn't exist in the DOM at all until the group header is expanded.
  await expandSidebarGroup(page, 'Management');
  await goToViaSidebar(page, 'Settings');
  await page.waitForTimeout(800);

  await openSettingsTab(page, 'Devices');
  await page.screenshot({ path: assetPath(DIR, '07-devices.png') });
});
