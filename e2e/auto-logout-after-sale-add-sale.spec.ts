import { test, expect, type Page } from '@playwright/test';
import { pinLogin, DEMO_OUTLETS, DEMO_PINS } from './docs-capture/lib/pin-login';

/**
 * Live regression test for the "auto-logout after completing a sale" outlet policy on the
 * Add Sale (/sell/add) surface.
 *
 * Root cause (2026-09-17, gachie/alpha-china-market bug report): the policy
 * (`OutletSetting.auto_logout_after_sale`, resolved server-side via outletpolicy and correctly
 * surfaced as `terminal-context.autoLogoutAfterSale`) was only ever WIRED into the main POS
 * Terminal's `handleReceiptClose` (via OrderPlacedDialog for dine-in / the terminal's own
 * handleReceiptClose for retail-QSR). Add Sale — a real, nav-exposed, cashier-reachable
 * sale-completion surface for retail/pharmacy/services outlets (nav-config.ts's "Add Sale"
 * entry is only hidden for hospitality/quick_service, and the default "cashier" role grants
 * pos.orders.add, which is all that surface requires) — called `useReceiptAfterSale`'s
 * `closeReceipt` DIRECTLY on the receipt dialog's onClose, which never consulted the setting at
 * all. So a cashier ringing up sales via Add Sale (gachie's outlet is `retail`, and its real
 * cashiers Jenipher/Cheryl are plain "cashier" role, not manager/admin) was never logged out
 * even with the policy explicitly ON. Fixed by adding the same autoLogoutAfterSale/
 * handleReceiptClose pair terminal-context.tsx already uses, verbatim, to sell/add/page.tsx
 * (and, for the same reason, to tables/page.tsx's MyBillsTab settle flow).
 *
 * This test runs ONLY against codevertex-demo's Retail outlet ("Demo City Supermarket") — it
 * never touches gachie or any other real tenant's data. It forces the policy ON via the
 * settings API (admin session), logs in as a PLAIN CASHIER PIN (never a manager/admin — the
 * fix must never auto-logout those), completes one real cash sale through the actual Add Sale
 * UI, and asserts that closing the receipt lands back on /pin-login. The outlet's original
 * setting is restored in a `finally` regardless of outcome.
 */

const ORG = process.env.E2E_ORG_SLUG || 'codevertex-demo';
const API = process.env.POS_API_URL || 'https://posapi.codevertexafrica.com';

// This spec is meant to be run with BASE_URL pointed at a LOCAL `next dev` server (serving the
// uncommitted fix under test) while POS_API_URL stays the real live backend, so it exercises real
// prod data end to end without deploying anything. pos-api's CORS allowlist is production-origin
// only (confirmed live: an OPTIONS preflight from http://localhost:<port> gets a 200 with no
// Access-Control-Allow-Origin header at all, vs. a real allow-origin echo for
// https://pos.codevertexafrica.com) — disabling web security is scoped to ONLY this local test
// browser instance; it changes nothing about any deployed system.
test.use({
  launchOptions: { args: ['--disable-web-security', '--disable-site-isolation-trials'] },
});

async function getAuth(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('pos-auth-storage');
    const s = raw ? JSON.parse(raw).state : {};
    return {
      token: s?.session?.accessToken ?? '',
      tenantId: s?.user?.tenant_id ?? '',
      outletId: s?.outlet?.id ?? s?.selectedOutletId ?? '',
    };
  });
}

test('cashier is auto-logged-out after completing a sale via Add Sale, when the policy is ON', async ({ browser }) => {
  test.setTimeout(150_000);

  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await pinLogin(adminPage, { pin: DEMO_PINS.admin, outletName: DEMO_OUTLETS.retail });
  const admin = await getAuth(adminPage);
  expect(admin.token && admin.tenantId && admin.outletId, 'admin session must resolve tenant/outlet').toBeTruthy();

  const settingsUrl = `${API}/api/v1/${admin.tenantId}/pos/outlets/${admin.outletId}/settings`;
  const authHeaders = { Authorization: `Bearer ${admin.token}` };

  const beforeRes = await adminPage.request.get(settingsUrl, { headers: authHeaders });
  expect(beforeRes.ok(), 'GET settings must succeed').toBe(true);
  const before = await beforeRes.json();
  const hadOverride: boolean = !!before?.cashier_policy_overrides?.auto_logout_after_sale;
  const originalValue: boolean = !!before?.auto_logout_after_sale;

  async function restoreSetting() {
    const restoreTo = hadOverride ? (originalValue ? 'on' : 'off') : 'default';
    await adminPage.request
      .put(settingsUrl, {
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        data: { auto_logout_after_sale: restoreTo },
      })
      .catch(() => {});
  }

  let cashierCtx: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    // Force the policy ON (tri-state PUT: 'on' sets an explicit override=true).
    const putRes = await adminPage.request.put(settingsUrl, {
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      data: { auto_logout_after_sale: 'on' },
    });
    expect(putRes.ok(), 'PUT settings (force ON) must succeed').toBe(true);

    const afterRes = await adminPage.request.get(settingsUrl, { headers: authHeaders });
    const after = await afterRes.json();
    expect(after.auto_logout_after_sale, 'GET must resolve the override back as true').toBe(true);
    expect(after.cashier_policy_overrides?.auto_logout_after_sale, 'override flag must be set').toBe(true);

    // A real sellable catalog item to ring up, via the admin's own outlet-scoped catalog.
    const catalogRes = await adminPage.request.get(
      `${API}/api/v1/${admin.tenantId}/pos/catalog/items?limit=5`,
      { headers: { ...authHeaders, 'X-Outlet-ID': admin.outletId } },
    );
    expect(catalogRes.ok(), 'catalog fetch must succeed').toBe(true);
    const item = (await catalogRes.json())?.data?.[0];
    expect(item, 'the retail demo outlet must have at least one sellable catalog item').toBeTruthy();

    // Fresh, independent session: log in as a PLAIN CASHIER at the same outlet.
    cashierCtx = await browser.newContext();
    const cashierPage = await cashierCtx.newPage();
    await pinLogin(cashierPage, { pin: DEMO_PINS.cashier, outletName: DEMO_OUTLETS.retail });

    await cashierPage.goto(`/${ORG}/sell/add`, { waitUntil: 'domcontentloaded' });
    const search = cashierPage.getByPlaceholder(/Search product name \/ SKU to add/i);
    await expect(search).toBeVisible({ timeout: 30_000 });
    // Local dev server only: the FIRST navigation to a not-yet-warm route triggers Turbopack lazy
    // compilation / Fast Refresh, which can remount the page mid-keystroke and silently drop a
    // `.fill()` (confirmed live: inputValue() read back empty immediately after fill, correlated
    // with a "[Fast Refresh] rebuilding/done" console pair). Let that settle, then retry the fill
    // until it actually sticks. Never an issue against a real (pre-compiled) deployment.
    await cashierPage.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    await cashierPage.waitForTimeout(1_500);
    let filled = '';
    for (let attempt = 0; attempt < 5 && filled !== item.sku; attempt++) {
      await search.fill(item.sku);
      await cashierPage.waitForTimeout(400);
      filled = await search.inputValue();
    }
    expect(filled, 'the search box must retain the typed SKU').toBe(item.sku);
    const resultRow = cashierPage.getByText(item.name, { exact: false }).first();
    await expect(resultRow).toBeVisible({ timeout: 10_000 });
    await resultRow.click();

    await cashierPage.getByRole('button', { name: /Save & Pay/i }).click();
    await cashierPage.getByRole('button', { name: /^Pay\s/i }).click();
    await cashierPage.getByRole('button', { name: /Accept cash/i }).click();
    await cashierPage.getByRole('button', { name: /Confirm Cash/i }).click();

    // The receipt opening proves the sale genuinely completed (money moved), not just a UI click.
    const closeReceiptBtn = cashierPage.getByLabel('Close receipt');
    await expect(closeReceiptBtn).toBeVisible({ timeout: 20_000 });
    await closeReceiptBtn.click();

    // THE ASSERTION: policy ON + plain cashier ⇒ closing the receipt must log them out back to
    // the PIN screen. Before the fix, this never happened (stayed on /sell/add indefinitely).
    await expect(cashierPage).toHaveURL(/\/pin-login/, { timeout: 10_000 });
  } finally {
    await cashierCtx?.close().catch(() => {});
    await restoreSetting();
    await adminCtx.close();
  }
});
