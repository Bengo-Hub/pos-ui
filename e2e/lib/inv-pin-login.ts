import type { Page } from '@playwright/test';

/**
 * Verbatim copy of inventory-ui's `e2e/docs-capture/lib/pin-login.ts` (as of 2026-09-04),
 * duplicated here rather than imported across the repo boundary — pos-ui and inventory-ui are
 * separate git repos (confirmed: each has its own independent `git status`), so a relative
 * cross-repo import would break the moment either repo is cloned/checked out on its own (e.g. in
 * CI). Used by `oversell-settlement.spec.ts` to drive a SECOND browser page against inventory-ui
 * (item creation, stock adjustments, stock-level polling) alongside the pos-ui page that drives
 * the actual sale. See that memory file for the full list of flakiness causes this encodes:
 * d:/Projects/Codevertex/.claude/memory/codevertex-demo-pin-login-flakiness-and-docs-capture-2026-09-02.md
 *
 * If inventory-ui's copy of this file changes, re-sync this one too.
 */

const ORIGIN = (process.env.INV_BASE_URL || 'https://inventory.codevertexafrica.com').replace(/\/$/, '');
const ORG_SLUG = process.env.E2E_ORG_SLUG || 'codevertex-demo';
const ADMIN_PIN = process.env.E2E_ADMIN_PIN || '0000';

export function orgUrl(path: string) {
  return `${ORIGIN}/${ORG_SLUG}${path}`;
}

// codevertex-demo's outlet display names (auth-service/auth-api/cmd/seed/seed_tenants.go),
// scoped to the ones inventory-ui actually shows.
export const DEMO_OUTLETS = {
  hospitality: /Demo Grand Hotel/i,
  retail: /Demo City Supermarket/i,
  quickService: /Demo Express Kiosk/i,
  pharmacy: /Demo Health Pharmacy/i,
  services: /Demo Beauty & Wellness/i,
  warehouse: /Demo Central Warehouse/i,
  manufacturing: /Demo Production Facility/i,
} as const;

export interface PinLoginOptions {
  pin?: string;
}

async function recoverFromOutletsLoadFailure(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const failed = await page.getByText(/failed to load outlets/i).isVisible({ timeout: 1_500 }).catch(() => false);
    if (!failed) return;
    await page.waitForTimeout(1500 * (i + 1));
    await page.reload();
    await page.waitForTimeout(800);
  }
}

async function rateLimited(page: Page): Promise<boolean> {
  return page.getByText(/too many requests/i).isVisible({ timeout: 1_000 }).catch(() => false);
}

export async function pinLogin(page: Page, opts: PinLoginOptions = {}) {
  await page.goto(orgUrl('/auth/pin-login'));
  if (await rateLimited(page)) {
    await page.waitForTimeout(20_000);
    await page.goto(orgUrl('/auth/pin-login'));
  }
  await recoverFromOutletsLoadFailure(page);

  const outletPrompt = page.getByText(/select your outlet/i);
  const sawOutletPrompt = await outletPrompt.isVisible({ timeout: 5000 }).catch(() => false);
  if (sawOutletPrompt) {
    await page.waitForTimeout(600);
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.getByRole('button').first().click();
      const left = await outletPrompt.waitFor({ state: 'hidden', timeout: 4_000 }).then(() => true).catch(() => false);
      if (left) break;
    }
  }

  await page.waitForTimeout(400);
  const pin = opts.pin || ADMIN_PIN;
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const digit of pin.split('')) {
      await page.keyboard.press(digit);
      await page.waitForTimeout(120);
    }

    await page
      .waitForURL((url) => url.pathname.startsWith(`/${ORG_SLUG}`) || url.href.includes('auth/callback'), { timeout: 8_000 })
      .catch(() => {});
    if (page.url().includes('auth/callback') || page.url().includes('login_required')) {
      await page.goto(orgUrl(''));
    }

    if (page.url().includes('/auth/select-outlet')) {
      await recoverFromOutletsLoadFailure(page);
      await page
        .waitForURL(new RegExp(`/${ORG_SLUG}(/)?($|\\?)`), { timeout: 8_000 })
        .catch(() => {});
    }

    const arrived = await page
      .waitForURL(new RegExp(`/${ORG_SLUG}(/)?($|\\?)`), { timeout: 4_000 })
      .then(() => true)
      .catch(() => false);
    if (arrived) return;

    if (page.url().includes('/auth/pin-login')) {
      if (await rateLimited(page)) {
        await page.waitForTimeout(20_000);
        await page.goto(orgUrl('/auth/pin-login'));
        await recoverFromOutletsLoadFailure(page);
        continue;
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  }

  throw new Error(`pinLogin: never reached ${orgUrl('')} after PIN entry retries`);
}

export async function selectOutlet(page: Page, outletName: RegExp | string) {
  const trigger = page.locator('button[aria-haspopup="listbox"]');
  for (let attempt = 0; attempt < 4; attempt++) {
    if (page.url().includes('/auth/select-outlet')) {
      await recoverFromOutletsLoadFailure(page);
      await page.waitForURL((url) => !url.pathname.includes('/auth/select-outlet'), { timeout: 8_000 }).catch(() => {});
    }
    await trigger.click();
    const option = page.locator('.max-h-56').getByRole('button', { name: outletName });
    const optionVisible = await option.first().isVisible({ timeout: 3_000 }).catch(() => false);
    if (!optionVisible) {
      await page.keyboard.press('Escape').catch(() => {});
      continue;
    }
    await option.first().click();
    const confirmed = await trigger.getByText(outletName).first().isVisible({ timeout: 3_000 }).catch(() => false);
    if (confirmed) return;
  }
  throw new Error(`selectOutlet: could not select outlet matching ${String(outletName)}`);
}

export async function expandSidebarGroup(page: Page, groupLabel: string) {
  const header = page.getByRole('button', { name: groupLabel, exact: true });
  if (await header.isVisible({ timeout: 3_000 }).catch(() => false)) {
    if ((await header.getAttribute('aria-expanded')) === 'false') {
      await header.click();
      await page.waitForTimeout(300);
    }
  }
}

export async function goToViaSidebar(page: Page, linkName: string) {
  await page.getByRole('navigation').getByRole('link', { name: linkName, exact: true }).click();
  await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => {});
  await page.waitForTimeout(600);
}
