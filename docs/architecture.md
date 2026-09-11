# pos-ui — Architecture

**Service**: pos-ui (Next.js 16 PWA)  
**Last updated**: 2026-05-25  
**Purpose**: Touch-optimized, offline-capable Point of Sale terminal — multi-vertical (hospitality, retail, services, quick_service)  
**Status**: Sprints 1–10 substantially complete. PWA offline, PIN terminal login, multi-vertical module gating, and loyalty all shipped.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4 + shadcn/ui (`@base-ui/react`) + custom `@theme` tokens |
| UI primitives | shadcn (initialized 2026-05-25, uses `@base-ui/react` not Radix; add via `pnpm dlx shadcn@latest add <name>`) |
| State | Zustand (global: cart, drawer, session) + TanStack Query (server state) |
| API client | Axios with auth interceptors + tenant/outlet headers (`src/lib/api/client.ts`) |
| PWA | Hand-written `public/sw.js` (Next 16 builds with Turbopack, which `@ducanh2912/next-pwa` — a webpack plugin — does not run under; see sw.js header comment) |
| Forms | React Hook Form + Zod |
| Offline DB | Dexie.js / IndexedDB (`src/lib/db/pos-db.ts`) |
| Auth | SSO via auth-api OIDC/OAuth2 PKCE; PIN terminal login (Sprint 10 ✅) |
| Toast | Sonner v2 (`<Toaster>` in `app/layout.tsx`) |
| Error handling | Central error parser: `src/lib/api/error-handler.ts` |

---

## Implemented Route Structure (as of 2026-05-21)

```
src/app/
  page.tsx                              # Root redirect to /[orgSlug]
  [orgSlug]/
    page.tsx                            # Dashboard / analytics overview
    auth/callback/page.tsx              # SSO OAuth2 callback
    auth/select-outlet/page.tsx         # Outlet selector after SSO login
    pin-login/page.tsx                  # PIN terminal login (staff avatar grid + keypad)
    unauthorized/page.tsx               # 403 access denied
    order/page.tsx                      # Main POS terminal (menu grid + cart + payment)
    orders/page.tsx                     # Orders list (open, completed)
    tables/page.tsx                     # Floor plan (sections, table status, release)
    kds/page.tsx                        # Kitchen Display System (polling, ticket management)
    bar/page.tsx                        # Bar Display (KDS filtered to bar station)
    drawer/page.tsx                     # Cash drawer management
    shifts/page.tsx                     # Shift open/close + float entry
    hotel/
      page.tsx                          # Hotel overview (occupancy KPIs + quick links)
      rooms/page.tsx                    # Rooms grid with status filter
      rooms/[roomId]/page.tsx           # Room detail (folio, check-in/out)
      facilities/page.tsx               # Facilities + inline booking
    appointments/page.tsx               # Appointments list (services use case)
    commissions/page.tsx                # Commissions table
    staff/[staffId]/schedule/page.tsx   # 7-day schedule grid
    layaway/page.tsx                    # Layaway plans list
    layaway/new/page.tsx                # New layaway plan
    layaway/[id]/page.tsx               # Layaway plan detail + payments
    loyalty/page.tsx                    # Loyalty programs
    loyalty/[id]/page.tsx               # Loyalty program detail + transactions
    reports/page.tsx                    # Sales reports (KPI cards, payment breakdown, charts)
    settings/page.tsx                   # Outlet and device settings
    platform/page.tsx                   # Platform admin (superuser only)
```

**Not yet implemented (planned):**
- `/appointments/[id]/page.tsx` — appointment detail + action buttons
- `/appointments/new/page.tsx` — booking form
- `/queue/page.tsx` — walk-in service queue
- `/clients/` — client lookup and profiles
- `/packages/` — service package management
- `/webhooks/` — webhook management UI
- `/online-orders/` — online order pickup queue UI

---

## Multi-Tenancy Model

| Concept | Implementation |
|---------|---------------|
| Tenant context | Dynamic route `[orgSlug]` — also resolved from JWT `tenant_slug` claim |
| Outlet context | Resolved from auth context (`outlet_id` claim) |
| API scoping | All calls include `/{orgSlug}/` in path |
| Request headers | `Authorization: Bearer {token}`, `X-Tenant-Slug`, `X-Outlet-ID` |
| SSO | Auth-api OIDC PKCE flow; tokens stored in Zustand (persisted to localStorage) |

### Access Tiers

| Role | Access | UI scope |
|------|--------|----------|
| `pos_admin` | Full access to all modules | All sections |
| `store_manager` | Orders, tables, drawer, KDS, reports | All except platform |
| `cashier` | Order entry, payment, own shift | POS + shifts + drawer |
| `waiter` | Order entry, KDS (view), tables | POS + tables + KDS |
| `receptionist` | Hotel module + orders | Hotel + orders |
| `kitchen` | KDS terminal view only | KDS |
| `bar` | Bar display only | Bar |
| `viewer` | Read-only across all modules | View only |

Module-level access gated via `useModuleAccess()` hook (`src/hooks/use-module-access.ts`).

---

## Module Access System

```typescript
// src/hooks/use-module-access.ts
const USE_CASE_MODULES = {
  hospitality: ['dashboard','orders','new_order','tables','kds','appointments','hotel','shifts','reports','cash_drawer','settings','platform'],
  retail:      ['dashboard','orders','new_order','shifts','reports','cash_drawer','settings','platform'],
  services:    ['dashboard','orders','new_order','appointments','shifts','reports','cash_drawer','settings','platform'],
  quick_service: ['dashboard','orders','new_order','kds','shifts','reports','cash_drawer','settings','platform'],
}
```

`useCase` resolved from JWT claims: `outlet_use_case` → `tenant_use_case` → `'hospitality'` fallback.

---

## Offline Architecture

```
[Online]
  pos-api  ←── TanStack Query ←── pos-ui  ──→  Dexie.js (IndexedDB)
                                                  ├── catalogItems (offline menu)
                                                  ├── offlineOrders (queued orders)
                                                  ├── offlinePayments (pending)
                                                  ├── drawerSessions
                                                  ├── drawerCloses
                                                  └── staffProfiles (PIN bcrypt cache)

[Reconnect]
  Dexie.js  ──→  SyncManager  ──→  pos-api (bulk POST)
```

**Status:** ✅ Implemented (Sprint 6).
- `src/lib/db/pos-db.ts` — Dexie.js instance with 6 tables
- `src/hooks/use-offline-pos.ts` — mutation hooks that fall back to IndexedDB when offline
- `src/hooks/use-sync-offline-orders.ts` — full sync worker draining on reconnect
- `src/components/OfflineBanner.tsx` — fixed banner shown when `navigator.onLine` is false
- `src/lib/register-sync.ts` — SyncManager background sync tag registration
- Payment modal: offline restricts to cash only; card/M-Pesa disabled offline

---

## Auth Flow

1. User opens pos-ui on tablet/terminal
2. If no valid session: redirect to auth-api OAuth2 PKCE endpoint
3. Auth-api handles login (SSO/email) and issues access token (15 min) + refresh (30 days)
4. Callback stores tokens in Zustand, persisted to `localStorage['pos-ui-auth']`
5. Axios interceptor attaches `Authorization: Bearer {token}` + tenant/outlet headers
6. Session auto-refresh on 401; terminal session = 8 hours (shift-aligned)

**Sprint 10 (✅ Complete):** PIN terminal login implemented. Touchscreen 4-digit PIN for kitchen, bar, and cashier terminals.
- `/pin-login` page: staff avatar grid → PIN keypad → POST `/pos/auth/pin` → short-lived 4-hour terminal JWT
- Offline path: bcrypt comparison against IndexedDB `staffProfiles`
- `setTerminalSession` in Zustand auth store (`isTerminalSession = true`)
- `AuthProvider` skips SSO redirect for `pin-login`; terminal 401 redirects back to `pin-login`
- Screensaver with `useIdleTimer`, animated blobs, tenant logo
- "Admin Login" button for SSO manager flow
- Trinity Layer 3: `GET /pos/auth/me` merges POS permissions into auth store after SSO login

---

## Branding & Theming

- Tenant brand colors fetched from auth-api v2 `TenantResponse` (`logo_url`, `brand_colors: {primary, secondary, accent}`)
- Provider: `src/providers/tenant-branding-provider.tsx`
- CSS: `--primary` (HSL triplet), `--ring`, `--brand-primary` / `--brand-emphasis` (RGB triplets) set dynamically
- Fallback primary: `#ea8022` (Codevertex orange)

---

## Error Handling Architecture

All API errors are surfaced to the user — **no silent failures**.

### Subscription & Server Errors (Global)
- `src/lib/api/error-handler.ts` — `parseApiError()`, `isSubscriptionError()`, `subscriptionErrorMessage()`
- `src/lib/api/client.ts` — `setOnSubscription403(cb)` (all subscription error codes) + `setOnServerError(cb)` (5xx)
- `src/providers/auth-provider.tsx` — wires both callbacks on mount; subscription 403 shows sonner toast with "Upgrade plan" action button; 5xx shows server error toast
- Handled subscription codes: `subscription_inactive`, `subscription_expired`, `feature_not_available`, `usage_limit_exceeded`, `device_limit_reached`, `plan_upgrade_required`

### Sensitive Action Confirmation
- `src/components/ui/confirm-dialog.tsx` — reusable `ConfirmDialog` (shadcn AlertDialog)
- **All** delete, deactivate, force-close, revoke actions MUST use `ConfirmDialog` — never `window.confirm()`
- Variants: `danger` (delete/destructive), `warning` (caution), `info` (informational)

```typescript
// Usage pattern
const [open, setOpen] = useState(false);
<ConfirmDialog
  open={open}
  onOpenChange={setOpen}
  title="Delete item?"
  description="This cannot be undone."
  confirmLabel="Delete"
  variant="danger"
  onConfirm={handleDelete}
/>
```

---

## Component Architecture

```
src/
  app/[orgSlug]/           ← Page components (one per route)
  components/
    ui/
      base.tsx             ← Custom Button, Card, Badge (plain Tailwind)
      button.tsx           ← shadcn Button (used by shadcn components)
      alert-dialog.tsx     ← shadcn AlertDialog (via @base-ui/react)
      dialog.tsx           ← shadcn Dialog
      confirm-dialog.tsx   ← Reusable ConfirmDialog wrapper
    subscription/
      subscription-banner.tsx  ← Wraps SharedSubscriptionBanner from shared-ui-lib
    sidebar.tsx            ← Module-aware navigation
    header.tsx             ← Outlet context, user, shift indicator
    pos/
      modifier-modal.tsx   ← Modifier selection bottom sheet
      payment-modal.tsx    ← Full-screen payment flow (cash/card/M-Pesa/room-charge)
    kds/                   ← KDS ticket cards (used by both /kds and /bar)
  hooks/
    useKDS.ts              ← KDS stations + tickets + mutations
    usePOS.ts              ← Orders, catalog, tables, drawers, shifts
    use-module-access.ts   ← Vertical module gating
  lib/
    api/
      client.ts            ← Axios client; setOn401, setOnSubscription403, setOnServerError
      error-handler.ts     ← Central error parser + subscription error types
  store/
    auth.ts                ← Zustand: user, session, logout
  providers/
    auth-provider.tsx      ← Wires 401, subscription 403, 5xx callbacks
    tenant-branding-provider.tsx
    query-provider.tsx
```

---

## Performance Targets

| Operation | Target |
|-----------|--------|
| Menu grid render (100 items) | < 100ms |
| Add to cart | < 50ms (optimistic) |
| Order creation API | < 500ms |
| Cash payment completion | < 2s |
| Card/M-Pesa payment | < 5s |
| KDS polling interval | 5s (TanStack Query `refetchInterval`) |
| Page navigation | < 200ms |

---

## Sprint Status (as of 2026-05-21)

| Sprint | Title | Status |
|--------|-------|--------|
| 1 | Foundation (scaffold, SSO, layout, module access) | ✅ Complete |
| 2 | Order Entry (menu grid, cart, modifiers, payment) | ✅ Implemented (M-Pesa polling, table selector pending) |
| 3 | Tables & Shifts | ✅ Implemented (table-to-order nav pending) |
| 4 | Hotel UI (rooms, facilities, check-in/out) | 🟡 Scaffold done (API hooks not wired) |
| 5 | KDS Terminal View | ✅ Complete |
| 6 | Offline / PWA (IndexedDB, sync) | ✅ Complete (receipt print deferred) |
| 7 | Retail UI (barcode scan, layaway) | ✅ Core delivered (ScaleDisplay, serial capture pending) |
| 8 | Service Business UI (appointments, commissions, schedules) | ✅ Core delivered (detail/new/queue pages pending) |
| 9 | Reports & Analytics UI | ✅ Core delivered (category/staff/top-items charts pending) |
| 10 | Dual Auth (SSO + PIN terminal login) | ✅ Complete (supervisor override PIN pending) |

---

## Incident log

### 2026-09-11: fleet-wide "page keeps breaking after a while" (pos-ui + inventory-ui) — root-caused, fixed

**Symptom:** long-open terminal/browser tabs on both pos-ui and inventory-ui eventually became
unusable ("This page couldn't load", React minified error #185 = "Maximum update depth
exceeded"), preceded by a growing console noise floor of `/pos/auth/me` 404s.

**Two independent, confirmed bugs, both fixed same day:**

1. **`fetchPosServiceProfile` (`src/lib/auth/api.ts`) always hit the wrong host.** It built its
   request URL from `NEXT_PUBLIC_POS_API_URL`, an env var that was never actually set in
   `devops-k8s/apps/pos-ui/values.yaml` (only `NEXT_PUBLIC_API_URL` is, which `apiClient`
   correctly uses). `POS_API_URL` therefore always resolved to `''`, so every call — once at SSO
   login and again every 60s forever via `ServicePermissionsRefresher` (org-shell.tsx) — was a
   same-origin relative fetch against pos-ui's own Next.js host, which has no such route: a
   guaranteed 404 (visible in devtools as a domain-less `/api/v1/{tenant}/pos/auth/me` entry,
   distinct from the full-domain `posapi.codevertexafrica.com/...` entries next to it). Caught
   internally (best-effort), so it never crashed anything by itself, but it meant pos-api's
   service-level role, fine-grained `pos.*.*` permissions, home outlet, and outlet_ids were
   **never actually synced from pos-api in production** for SSO sessions. Fixed: use the same
   `NEXT_PUBLIC_API_URL || 'https://posapi.codevertexafrica.com'` fallback `apiClient` already
   uses.

2. **No recovery from a stale-bundle chunk-load failure (the actual crash).** Both apps ship a
   committed, cache-first-for-`/_next/static/*` service worker with no per-deploy invalidation,
   and pos-ui's update banner (shared-ui-lib's `PwaUpdater`, wired via `OfflineBar`) only ever
   *prompts* — it never forces a reload; inventory-ui's own local update banner
   (`use-pwa-update.ts` / `pwa-update-banner.tsx`) turned out to be fully dead code, since nothing
   in inventory-ui ever called `serviceWorker.register(...)` in the first place, so its
   `navigator.serviceWorker.ready` promise never resolved. A tab left open across a backend
   deploy keeps running the OLD bundle; the first time it needs a chunk it hadn't already
   fetched (a route not yet visited this session), the request hits the new deployment, which no
   longer has that old content-hashed file — an uncaught `ChunkLoadError` that crashes the render
   tree with no way back. Fixed: added `StaleChunkRecovery` (new, in both apps —
   `src/components/stale-chunk-recovery.tsx`) mounted at the top of `OrgShell`, listening for
   `unhandledrejection`/capture-phase `error` events matching the chunk-load-failure shape and
   doing one cooldown-guarded hard reload. inventory-ui was also switched from its dead local PWA
   update code onto the same shared-ui-lib `PwaUpdater` pos-ui already uses (already available at
   the pinned `v0.1.87` tag — no version bump needed), giving it a working update-detection
   banner for the first time.

Both apps rebuilt clean (`next build`, full TS validation) after the fix.

**Addendum (2026-09-12): the crash recurred after the above fix shipped — found the actual
trigger.** The `/pos/auth/me` 404 storm was confirmed gone in the next occurrence (no more
domain-less entries), proving fix #1 landed correctly, but the "This page couldn't load" / React
error #185 crash still hit the same `/order` route. Deploy timing (`kubectl get pods`, ArgoCD
sync revision) confirmed the recurrence happened on the ALREADY-fixed build, ruling out fix #2
simply not having rolled out yet — the stale-chunk theory was real and worth keeping as a
defensive layer, but it was not (or not the only) trigger here. Traced the actual cause by
extracting the exact minified frame from the production stack trace (`039i6qbqn2yi8.js:3:109429`)
against a local build with byte-identical chunk hashes (Turbopack output is deterministic for a
given commit) — landed exactly on the `useEffect` in `OrderPlacedDialog`
(`src/components/pos/order-placed-dialog.tsx`), a SEPARATE "auto-logout after placing a dine-in
order" feature (distinct from the idle-screensaver auto-logout, which was checked and is fine —
it uses a hard `window.location.href` navigation, not the SPA router).

Root cause: that effect's dependency array included `handlePrint`, a `useCallback` that
transitively depends on the `onClose` prop. The only real caller
(`terminal/parts/terminal-modals.tsx`) passes `onClose={() => t.setOrderPlacedOpen(false)}` — a
new inline closure every render of `TerminalModals`, which re-renders on nearly every cart/order
mutation in an active terminal. So `handlePrint`'s identity was never stable, the effect
re-evaluated far more often than intended, and its auto-print branch synchronously calls
`handleLogout()` → `router.replace(...)` (an SPA navigation) from inside an effect whose own
dependencies never settled — under enough re-render pressure this is what produced "Maximum
update depth exceeded." Fixed by holding the latest `handlePrint` in a ref and depending only on
`open`/`posSettings?.auto_print_order` (stable primitives) — the exact same ref-forwarding idiom
`hooks/use-idle-timer.ts` already uses correctly for this class of problem, now applied here too.

Lesson for future review of this incident family: when a fix addresses a confirmed real bug but
the reported symptom recurs, verify the recurrence happened on the NEW build (deploy image tag /
pod age / ArgoCD sync revision) before assuming the fix didn't work or piling on more theories —
and a minified prod stack trace IS traceable to source without a published source map, by
rebuilding the same commit locally (deterministic content hashes) and reading the exact byte
offset out of the matching chunk file.
