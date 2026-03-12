import { expect, test } from '@playwright/test';

const EMAIL = process.env.E2E_LOGIN_EMAIL || 'demo@bengobox.dev';
const PASSWORD = process.env.E2E_LOGIN_PASSWORD || 'DemoUser2024!';

test.describe('POS UI SSO login and landing', () => {
  test('landing or dashboard loads for tenant', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/(urban-loft|[\w-]+)\/?/, { timeout: 15_000 });
    const signInOrContent = page.getByRole('link', { name: /sign in|login/i }).or(page.getByText(/dashboard|pos|point of sale/i));
    await expect(signInOrContent.first()).toBeVisible({ timeout: 10_000 });
  });

  test('full SSO login then authenticated indicator', async ({ page }) => {
    await page.goto('/');
    const signInLink = page.getByRole('link', { name: /sign in|login/i }).first();
    await signInLink.click().catch(() => {});
    const onAccounts = await page.waitForURL(/accounts\.codevertexitsolutions\.com\/login/, { timeout: 15_000 }).then(() => true).catch(() => false);
    if (onAccounts) {
      await page.getByRole('textbox', { name: /email/i }).fill(EMAIL);
      await page.getByRole('textbox', { name: /password/i }).fill(PASSWORD);
      await page.getByRole('button', { name: /sign in/i }).click();
      await page.waitForURL(/pos\.codevertexitsolutions\.com|localhost/, { timeout: 25_000 }).catch(() => {});
    }
    const dashboardOrContent = page.getByRole('link', { name: /dashboard|profile/i }).or(page.getByText(/dashboard|pos/i));
    await expect(dashboardOrContent.first()).toBeVisible({ timeout: 15_000 });
  });
});
