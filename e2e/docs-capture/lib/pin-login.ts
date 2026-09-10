import type { Page } from '@playwright/test';

const ORIGIN = (process.env.BASE_URL || 'https://pos.codevertexafrica.com').replace(/\/$/, '');
const ORG_SLUG = process.env.E2E_ORG_SLUG || 'codevertex-demo';
const ADMIN_PIN = process.env.E2E_ADMIN_PIN || '0000';

export function orgUrl(path: string) {
  return `${ORIGIN}/${ORG_SLUG}${path}`;
}

// codevertex-demo's outlet display names (auth-api/cmd/seed/seed_tenants.go), scoped to the
// use cases pos-ui's PIN login actually offers (POS_OUTLET_USE_CASES in pin-login/page.tsx —
// logistics/warehouse/manufacturing outlets never show here, unlike inventory-ui).
export const DEMO_OUTLETS = {
  hospitality: /Demo Grand Hotel/i,
  retail: /Demo City Supermarket/i,
  quickService: /Demo Express Kiosk/i,
  pharmacy: /Demo Health Pharmacy/i,
  services: /Demo Beauty & Wellness/i,
} as const;

// Demo PINs seeded per role (pos-ui pin-login/page.tsx's DEMO_HINTS_ALL, mirrors
// auth-api/cmd/seed/seed_users.go) — reusable for screenshots that need a non-admin role.
export const DEMO_PINS = {
  admin: '0000',
  manager: '1111',
  cashier: '2222',
  waiter: '3333',
  kitchen: '4444',
  bar: '5555',
  reception: '6666',
  stylist: '8888',
  therapist: '9999',
} as const;

export interface PinLoginOptions {
  pin?: string;
}

// Ported from inventory-ui's e2e/docs-capture/lib/pin-login.ts (see
// codevertex-demo-pin-login-flakiness-and-docs-capture-2026-09-02.md for the full list of
// flakiness causes this encodes) and adapted to pos-ui's actual routes/DOM:
//   - pos-ui's PIN screen is `/{org}/pin-login` (a single page whose internal `step` state
//     toggles between 'outlet' and 'pin' — NOT a separate `/auth/pin-login` route or a
//     separate post-login outlet gate for the terminal-session path).
//   - The outlet cards (`OutletCard`, shared-ui-lib pin-login) are real `<button type="button">`
//     elements, same as inventory-ui's — the "click whatever's first, then use the header's
//     OutletFilter dropdown to drill into a specific outlet" pattern applies unchanged.
//   - PIN entry auto-submits at 4 digits via a real window-level keydown handler
//     ("Physical-keyboard support" in pin-login/page.tsx) — `page.keyboard.press(digit)` is
//     both more robust than clicking keypad buttons and a genuinely supported input path.
async function rateLimited(page: Page): Promise<boolean> {
  return page.getByText(/too many attempts|too many requests/i).isVisible({ timeout: 1_000 }).catch(() => false);
}

export async function pinLogin(page: Page, opts: PinLoginOptions = {}) {
  await page.goto(orgUrl('/pin-login'));
  if (await rateLimited(page)) {
    await page.waitForTimeout(20_000);
    await page.goto(orgUrl('/pin-login'));
  }
  await page.waitForTimeout(500);

  // Outlet step: pos-ui's pin-login page DEFAULTS its internal `step` state to 'pin' and only
  // flips to 'outlet' via a useEffect once the async outlets-list query resolves (unlike
  // inventory-ui, which renders its outlet prompt synchronously) — confirmed live: checking with
  // a non-waiting isVisible() right after goto races that fetch and misses the prompt entirely,
  // typing digits into the still-'pin'-by-default screen with no outlet resolved yet, which then
  // fails and leaves the page stranded on the outlet screen once the effect finally fires. Use a
  // real waitFor (polls until the timeout, unlike isVisible) so this can't race.
  const outletPrompt = page.getByText(/select your outlet to continue/i);
  const sawOutletPrompt = await outletPrompt
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (sawOutletPrompt) {
    await page.waitForTimeout(600);
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.getByRole('button').first().click();
      const left = await outletPrompt.waitFor({ state: 'hidden', timeout: 4_000 }).then(() => true).catch(() => false);
      if (left) break;
    }
    await page.waitForTimeout(400);
  }

  const pin = opts.pin || ADMIN_PIN;
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const digit of pin.split('')) {
      await page.keyboard.press(digit);
      await page.waitForTimeout(120);
    }

    const arrived = await page
      .waitForURL((url) => url.pathname.startsWith(`/${ORG_SLUG}`) && !url.pathname.includes('/pin-login'), { timeout: 6_000 })
      .then(() => true)
      .catch(() => false);
    if (arrived) {
      await page.waitForTimeout(500);
      return;
    }

    if (page.url().includes('/pin-login')) {
      if (await rateLimited(page)) {
        await page.waitForTimeout(20_000);
        await page.goto(orgUrl('/pin-login'));
        await page.waitForTimeout(500);
        continue;
      }
      // A rejected PIN clears itself (shake animation) after ~600ms — give it a beat before retrying.
      await page.waitForTimeout(800);
    }
  }

  throw new Error(`pinLogin: never left ${orgUrl('/pin-login')} after PIN entry retries`);
}

/**
 * Switches the active outlet via the header's admin-only "Switch outlet" chip
 * (src/components/header.tsx HeaderOutletChip — a bespoke button + portalled dropdown panel,
 * NOT the unused src/components/outlet-filter.tsx). Reliable where the login-time outlet picker
 * isn't. Requires an already-authenticated admin/manager session (pinLogin() with an admin PIN).
 */
export async function selectOutlet(page: Page, outletName: RegExp | string) {
  const trigger = page.getByTitle('Switch outlet');
  await trigger.waitFor({ state: 'visible', timeout: 8_000 });

  // Already on the requested outlet — skip. Also sidesteps a real trap below: the trigger
  // chip's OWN visible text is the active outlet's name, so a naive `getByRole('button', {name:
  // outletName})` matches the trigger itself (not just the dropdown option) whenever the desired
  // outlet is already active, and the trigger sits underneath the dropdown's own full-viewport
  // backdrop (z-[90], portalled to <body> so paint order wins over an unstyled header ancestor) —
  // clicking it times out waiting for the backdrop to stop intercepting the click.
  const already = await trigger.getByText(outletName).first().isVisible({ timeout: 1_000 }).catch(() => false);
  if (already) return;

  for (let attempt = 0; attempt < 4; attempt++) {
    await trigger.click();
    // Scope strictly to real dropdown options (exclude the trigger chip itself, which also
    // matches on outlet name via getByRole) via its distinct title attribute.
    const option = page.locator('button:not([title="Switch outlet"])').filter({ hasText: outletName });
    const optionVisible = await option
      .first()
      .waitFor({ state: 'visible', timeout: 4_000 })
      .then(() => true)
      .catch(() => false);
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

// Several sidebar groups (nav-config.ts's `defaultCollapsed: true` — Management, among others)
// render collapsed by default: their links don't exist in the DOM at all until the group header
// is expanded (same pattern documented in inventory-ui's docs-capture suite). Settings lives
// under "Management" — call this before goToViaSidebar(page, 'Settings'). Idempotent.
export async function expandSidebarGroup(page: Page, groupLabel: string) {
  const header = page.getByRole('button', { name: groupLabel, exact: true });
  if (await header.isVisible({ timeout: 3_000 }).catch(() => false)) {
    if ((await header.getAttribute('aria-expanded')) === 'false') {
      await header.click();
      await page.waitForTimeout(300);
    }
  }
}

// In-app navigation must go through client-side <Link> clicks, not page.goto() — a hard reload
// on a non-/auth route re-triggers a silent SSO probe before the PIN/terminal session rehydrates
// (same root cause documented in inventory-ui's docs-capture suite).
export async function goToViaSidebar(page: Page, linkName: string | RegExp) {
  await page.getByRole('navigation').getByRole('link', { name: linkName, exact: typeof linkName === 'string' }).first().click();
  await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => {});
  await page.waitForTimeout(600);
}

// Several admin pages (Settings) fetch their active tab's data async after the shell renders —
// a flat waitForTimeout sometimes lands inside that window and captures a spinner instead of the
// finished page (same class of race documented in inventory-ui's docs-capture suite).
export async function waitForSpinnerGone(page: Page) {
  await page.locator('.animate-spin').first().waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(300);
}

// Some pages (e.g. reports/analytics's data tables) load with skeleton shimmer bars
// (Tailwind's animate-pulse) rather than a spinner — confirmed live: a flat wait sometimes
// captures the placeholder bars, not the real numbers.
export async function waitForSkeletonsGone(page: Page) {
  await page.locator('.animate-pulse').first().waitFor({ state: 'hidden', timeout: 6_000 }).catch(() => {});
  await page.waitForTimeout(300);
}
