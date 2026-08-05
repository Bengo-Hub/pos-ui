import { expect, type Page } from '@playwright/test';

/**
 * Shared helpers for the discount e2e suite (discount-terminal / discount-add-sale /
 * discount-apply-modal-code specs). Centralizes what catalog-sync.spec.ts duplicates inline
 * (getAuth/pinLogin) since three new specs need it too — extend, don't re-duplicate again.
 */

export const ORG = process.env.E2E_ORG_SLUG || 'codevertex-demo';
// Demo cashier PIN (auth-api cmd/seed/seed_users.go): 2222, valid across every demo POS outlet.
// Using the cashier role (not admin PIN 0000) exercises the discount flows as the actual role
// that rings up sales. Re-confirm against the live seeder/admin panel if this has rotated.
export const CASHIER_PIN = process.env.E2E_POS_PIN || '2222';

/** Reloads the page and waits for the ACTUAL /promotions/happy-hour/active network response to
 *  land (not just a fixed timeout) before returning — a freshly-created promo must be visible to
 *  useActiveHappyHours()'s query before an item is added, or the add-time toast/discount won't
 *  fire (the reactive total recomputes on the next poll regardless, which is why a fixed-delay
 *  wait masks this: the total ends up correct even when the toast was missed). */
export async function reloadAndWaitForActiveDiscounts(page: Page) {
  const activeHH = page.waitForResponse((r) => r.url().includes('/promotions/happy-hour/active') && r.ok(), { timeout: 20_000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await activeHH.catch(() => {});
  await page.waitForTimeout(500); // let React Query commit the new data to state
}

/** The terminal's product-search input — placeholder text varies by use-case profile
 *  (searchPlaceholderFor: "Search menu items…" for hospitality/quick_service, "Search
 *  services…" for services, "Product name / SKU / Scan barcode" for retail/pharmacy). Excludes
 *  the unrelated header search ("Search orders, tables…") which renders earlier in the DOM and
 *  would otherwise win a bare `:first()` match. */
export function productSearchInput(page: Page) {
  return page.locator('input[placeholder*="menu" i], input[placeholder*="services" i], input[placeholder*="Product name" i]').first();
}

export async function getAuth(page: Page): Promise<{ token: string; tenantId: string; outletId: string }> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('pos-auth-storage');
    const s = raw ? JSON.parse(raw).state : {};
    return {
      token: s?.session?.accessToken ?? '',
      tenantId: s?.user?.tenant_id ?? '',
      outletId: s?.outlet?.id ?? s?.selectedOutletId ?? localStorage.getItem('pos-selected-outlet-id') ?? '',
    };
  });
}

/**
 * PIN login as the demo cashier at a given outlet. `outletNamePattern` matches the outlet-select
 * button's accessible name loosely (case-insensitive substring, mirroring catalog-sync.spec.ts's
 * `/Quick Service/i` convention) — confirm exact outlet display names at authoring time if a
 * pattern doesn't match (seeded as demo-retail/demo-hospitality/demo-quick/etc.).
 */
export async function pinLogin(page: Page, outletNamePattern: RegExp, pin: string = CASHIER_PIN) {
  await page.goto(`/${ORG}/pin-login`, { waitUntil: 'domcontentloaded' });
  const outlet = page.getByRole('button', { name: outletNamePattern }).first();
  const key = (d: string) => page.locator(`[data-testid="pin-key-${d}"]:visible`).first();
  const onOutletStep = await outlet.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
  if (onOutletStep) await outlet.click();
  await expect(key('1')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(600);
  for (const d of pin.split('')) {
    await key(d).click();
    await page.waitForTimeout(150);
  }
  await page.waitForURL(new RegExp(`/${ORG}/(dashboard|order|orders|sell)`), { timeout: 30_000 });
}

// Demo HQ admin (SSO) — used for Add Sale (back-office) and any manager-gated flow, per the
// sso-login-and-landing.spec.ts convention.
const SSO_EMAIL = process.env.E2E_LOGIN_EMAIL || 'admin@demo.codevertexafrica.com';
const SSO_PASSWORD = process.env.E2E_LOGIN_PASSWORD || 'DemoAdmin2024!';

export async function ssoLogin(page: Page) {
  await page.goto(`/${ORG}/`, { waitUntil: 'domcontentloaded' });
  const alreadyAuthed = await page.getByText(/dashboard/i).first().isVisible().catch(() => false);
  if (alreadyAuthed) return;
  const ssoLoginBtn = page.locator('button:not([disabled])', { hasText: /^Login$/ }).locator('visible=true').first();
  await ssoLoginBtn.click({ timeout: 15_000 }).catch(() => {});
  const onAccounts = await page.waitForURL(/accounts\.codevertexitsolutions\.com/, { timeout: 20_000 }).then(() => true).catch(() => false);
  if (onAccounts) {
    await page.getByRole('textbox', { name: /email/i }).first().fill(SSO_EMAIL);
    await page.getByRole('textbox', { name: /password/i }).first().fill(SSO_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).first().click();
    await page.waitForURL(/pos\.codevertexitsolutions\.com|pos\.codevertexafrica\.com|localhost/, { timeout: 40_000 }).catch(() => {});
  }
  const authedContent = page.getByRole('link', { name: /dashboard|profile/i })
    .or(page.getByText(/dashboard|start shift|select outlet|switch outlet|point of sale|welcome/i));
  await expect(authedContent.first()).toBeVisible({ timeout: 20_000 });
}

/** First sellable catalog item for the current session's outlet — used to scope an ephemeral
 *  test promotion to a REAL item instead of a hardcoded SKU that might not exist/drift. */
export async function firstCatalogItem(page: Page, auth: { token: string; tenantId: string; outletId: string }) {
  const api = process.env.POS_API_URL || 'https://posapi.codevertexafrica.com';
  const res = await page.request.get(`${api}/api/v1/${auth.tenantId}/pos/catalog/items?limit=25`, {
    headers: { Authorization: `Bearer ${auth.token}`, ...(auth.outletId ? { 'X-Outlet-ID': auth.outletId } : {}) },
  });
  expect(res.ok(), `catalog items lookup failed: ${res.status()}`).toBe(true);
  const body = await res.json();
  const rows: any[] = body?.data ?? [];
  // Skip free/complimentary accompaniments (price 0 — a discount on them is meaningless) and
  // names carrying regex-special characters (e.g. "[ACC]") that a caller might build a dynamic
  // toast-text pattern from — pick a plain, real, billable item.
  const item = rows.find((r) => (r.price ?? 0) > 0 && !r.non_billable && !r.is_complimentary && !/[[\](){}.*+?^$|\\]/.test(r.name ?? ''));
  expect(item, 'outlet must have at least one plain, billable catalog item for discount tests').toBeTruthy();
  return item as { id: string; sku: string; name: string; category: string; price: number };
}

/** Escapes regex metacharacters so a catalog item's real name/sku can be safely embedded in a
 *  dynamically-built RegExp (names occasionally carry brackets/parens, e.g. "Item [SKU]"). */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface TestPromotionOpts {
  name: string;
  promoKind: 'code' | 'auto' | 'happy_hour';
  discountType: 'percentage' | 'fixed_amount' | 'bogo';
  discountValue?: number;
  scopeType?: 'all' | 'category' | 'item';
  scopeIds?: string[];
  promoCode?: string;
  autoApply?: boolean;
  windowStart?: string;
  windowEnd?: string;
  daysOfWeek?: number[];
  mealPeriod?: string;
  buyQuantity?: number;
  getQuantity?: number;
  getDiscountPercent?: number;
  outletId?: string;
}

/** A unique per-run marker so tests never collide with each other or with hand-seeded demo data. */
export const runMarker = () => `E2E-DISC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Create an ephemeral promotion via pos-api's tenant-facing API, tagged with the run marker so
 *  afterAll cleanup can find and delete exactly what this test created. */
export async function createTestPromotion(
  page: Page,
  auth: { token: string; tenantId: string },
  opts: TestPromotionOpts,
): Promise<string> {
  const res = await page.request.post(
    `${process.env.POS_API_URL || 'https://posapi.codevertexafrica.com'}/api/v1/${auth.tenantId}/pos/promotions`,
    {
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      data: {
        name: opts.name,
        promo_kind: opts.promoKind,
        promo_code: opts.promoCode,
        auto_apply: opts.autoApply ?? opts.promoKind !== 'code',
        scope_type: opts.scopeType ?? 'all',
        scope_ids: opts.scopeIds ?? [],
        discount_type: opts.discountType,
        discount_value: opts.discountValue ?? 0,
        buy_quantity: opts.buyQuantity,
        get_quantity: opts.getQuantity,
        get_discount_percent: opts.getDiscountPercent,
        window_start: opts.windowStart,
        window_end: opts.windowEnd,
        days_of_week: opts.daysOfWeek,
        meal_period: opts.mealPeriod,
        outlet_id: opts.outletId,
        start_at: new Date(Date.now() - 60_000).toISOString(),
      },
    },
  );
  expect(res.ok(), `create test promotion "${opts.name}" failed: ${res.status()} ${await res.text()}`).toBe(true);
  const body = await res.json();
  const id = body?.id ?? body?.data?.id;
  expect(id, 'created promotion must return an id').toBeTruthy();
  return id;
}

export async function deleteTestPromotion(page: Page, auth: { token: string; tenantId: string }, id: string) {
  await page.request.delete(
    `${process.env.POS_API_URL || 'https://posapi.codevertexafrica.com'}/api/v1/${auth.tenantId}/pos/promotions/${id}`,
    { headers: { Authorization: `Bearer ${auth.token}` } },
  ).catch(() => {}); // best-effort cleanup — never fail a test run over a cleanup hiccup
}
