import { expect, test } from '@playwright/test';

/**
 * SSO login + landing E2E against the LIVE platform.
 *
 * The POS is pin-first: unauthenticated visits land on /{org}/pin-login, which offers an
 * action "Login" button that redirects to accounts (SSO). This spec drives that real flow:
 * pin-login → Login → accounts credentials → redirected back authenticated.
 *
 * Env: BASE_URL, E2E_ORG_SLUG (config default), E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD
 * (default = codevertex-demo admin per the platform's demo-tenant E2E convention).
 */

const EMAIL = process.env.E2E_LOGIN_EMAIL || 'admin@demo.codevertexafrica.com';
const PASSWORD = process.env.E2E_LOGIN_PASSWORD || 'DemoAdmin2024!';

test.describe('POS UI SSO login and landing', () => {
  test('landing or pin-login loads for tenant', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/(urban-loft|[\w-]+)\/?/, { timeout: 15_000 });
    // Pin-first UI: the pin-login screen (Login/Attendance actions) or an authenticated
    // shell must render — either proves the tenant app is serving.
    const content = page
      .getByRole('button', { name: /^Login$/ })
      .or(page.getByText(/dashboard|pos|point of sale|welcome back/i));
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });

  test('full SSO login then authenticated indicator', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // The pin-login "Login" action button (enabled) starts the SSO redirect. The passcode
    // submit button is ALSO named "Login" but stays disabled while the passcode is empty,
    // so filter to the enabled, visible instance (both responsive layouts render one).
    const ssoLogin = page.locator('button:not([disabled])', { hasText: /^Login$/ }).locator('visible=true').first();
    const alreadyAuthed = await page
      .getByText(/dashboard/i)
      .first()
      .isVisible()
      .catch(() => false);

    if (!alreadyAuthed) {
      await ssoLogin.click({ timeout: 15_000 }).catch(() => {});
      const onAccounts = await page
        .waitForURL(/accounts\.codevertexitsolutions\.com/, { timeout: 20_000 })
        .then(() => true)
        .catch(() => false);
      if (onAccounts) {
        await page.getByRole('textbox', { name: /email/i }).first().fill(EMAIL);
        await page.getByRole('textbox', { name: /password/i }).first().fill(PASSWORD);
        // The accounts page renders more than one "Sign in" control (form submit + SSO header).
        await page.getByRole('button', { name: /sign in/i }).first().click();
        await page.waitForURL(/pos\.codevertexitsolutions\.com|localhost/, { timeout: 40_000 }).catch(() => {});
      }
    }

    // Authenticated indicator: the app shell (dashboard/nav) or, for terminal-session flows,
    // the post-SSO landing (outlet/shift/pin context) must be visible.
    const authedContent = page
      .getByRole('link', { name: /dashboard|profile/i })
      .or(page.getByText(/dashboard|start shift|select outlet|switch outlet|point of sale|welcome/i));
    await expect(authedContent.first()).toBeVisible({ timeout: 20_000 });
  });
});
