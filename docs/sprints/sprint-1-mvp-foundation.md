# Sprint 1 -- MVP Foundation

**Status:** ✅ Complete — all core scaffold, auth, RBAC, offline layer, and PIN kiosk delivered  
**Timeline**: March 3 - March 17, 2026  
**Last updated:** 2026-05-21  
**Goal**: Scaffold pos-ui and deliver a functional touch-optimized POS terminal for order entry, cash payments, and cash drawer management. Ship as part of BengoBox MVP.

**Progress (March 7, 2026):** Full Next.js scaffold complete. SSO/PKCE, [orgSlug] routes, dashboard, order entry, orders list, tables, cash drawer, settings, platform admin. Tenant branding via TenantBrandingProvider. **Remaining:** Wire to posapi; deploy.

**Update (2026-05-10 — Trinity Authorization / RBAC overhaul):**
- **Trinity Authorization Pattern implemented (Layer 3):** After SSO login, pos-ui calls `GET /{tenant}/pos/auth/me` (pos-api) to fetch service-local role + `pos.*.*` permissions. Merged into auth store user object: `roles: [posRole, ...ssoRoles]`, `permissions: svcPermissions`.
- **`usePermissions` hook** (`src/hooks/usePermissions.ts`): single truth for permission checks. Uses server permissions from JWT/auth/me when available; falls back to client-side `ROLE_PERMISSIONS` map. Returns `can()`, `canAny()`, `canAll()`, `isSuperuser`, and convenience flags (`canCreateOrder`, `canManageDrawer`, etc.).
- **`P.*` constants** (`src/lib/rbac/permissions.ts`): all `pos.{module}.{action}` strings as typed constants. `ROLE_PERMISSIONS` client-side fallback mirrors pos-api seed.
- **Sidebar permission-based filtering**: removed role arrays, all nav items use `P.*` constants with `canAny()`. Platform section uses `isPlatformOwner`.
- **Permission-gated action buttons (2026-05-10):**
  - Orders page: "New Order" button shown only if `can(P.ORDERS_ADD)`
  - Tables page: "Assign Order", "Change Status", "Release Table" disabled/hidden for users without `P.TABLES_CHANGE` or `P.TABLES_MANAGE`
  - Settings page: all form inputs `readOnly` + Save button disabled if no `P.CONFIG_CHANGE`
- **auth-api cleanup:** `pos.*.*` permissions removed from auth-api seed — auth-api now only seeds `auth.*.*` permissions. pos-api owns its own RBAC.
- **PWA install prompt:** tenant-branded (shows tenant logo + `{orgName} POS` app name). Moved to `[orgSlug]/layout.tsx` inside TenantBrandingProvider so it only shows once per org context.

### RBAC & data fetching — in place vs gaps (March 2026)

| Area | In place | Gaps |
|------|----------|------|
| **useMe** | TanStack Query with 5 min TTL and gcTime; fetches auth-api GET /me; returns user, hasRole, hasPermission | — |
| **hasRole / hasPermission** | Implemented in useMe; super_admin/admin bypass | Sidebar/platform uses hasRole only; no hasPermission-based nav item visibility |
| **Permission-based nav** | Platform section (Devices, Licenses) gated by hasRole('super_admin') | Individual routes (Orders, Drawer, Tables, etc.) not gated by permission |
| **Route protection** | AuthProvider: unauthenticated → SSO; 403 from /me → `/[orgSlug]/unauthorized` | No per-route permission checks (e.g. require drawer:read for /drawer) |
| **403 page** | `/[orgSlug]/unauthorized` with "Access denied" and link back | — |
| **404 page** | Root `not-found.tsx` with "Page not found" and link home | — |
| **Data fetches** | useMe is the only TanStack Query consumer (auth-api) | Orders, tables, drawer, catalog still use mock/local state; wire to pos-api with useQuery/useMutation when APIs exist |

---

## Prerequisites

- pos-api Sprint 1 deliverables (catalog, orders, payments, drawers) must be in progress or complete
- Auth-service SSO operational
- Tenant `urban-loft` and Busia outlet configured in pos-api

---

## Deliverables

### D1: Project scaffold and auth (Days 1-2)

- [x] Initialize Next.js 15 project (App Router, TypeScript)
- [x] Install and configure: Tailwind CSS, Shadcn UI, Zustand, TanStack Query, Axios, Dexie.js, React Hook Form, Zod
- [x] PWA configuration (@ducanh2912/next-pwa)
- [x] Environment config (`NEXT_PUBLIC_POS_API_URL`, `NEXT_PUBLIC_TENANT_SLUG`, `NEXT_PUBLIC_OUTLET_ID`, SSO vars)
- [x] Axios client with auth interceptor, tenant/outlet headers, retry logic
- [x] OIDC login flow (redirect to auth-ui, callback, token exchange)
- [x] Token refresh interceptor (refresh 5 min before expiry)
- [x] Auth middleware (redirect unauthenticated users)
- [x] Zustand auth store (persisted to localStorage `pos-ui-auth`)
- [x] POS shell layout (header bar with outlet name, user, clock)

### D2: Menu grid and catalog (Days 2-4)

- [x] `useMenuItems()` hook (TanStack Query, fetches from pos-api catalog endpoint)
- [x] `useCategories()` hook
- [x] Category tabs (horizontal scroll, "All" default)
- [x] Item grid (3-column on landscape tablet, 2-column portrait)
- [x] MenuItemCard component (image, name, price, availability indicator)
- [x] Search bar with debounced filtering
- [x] Loading skeleton (12 placeholder cards)
- [x] Empty state ("No items found")
- [x] IndexedDB cache: Dexie.js database at `src/lib/db/pos-db.ts` with 6 tables including catalogItems and offlineOrders (Sprint 6)

### D3: Cart and order creation (Days 4-6)

- [x] Zustand cart store: items, quantities, modifiers, notes, order type
- [x] Cart panel component (right side on landscape, bottom drawer on portrait)
- [x] Order type selector (Dine-in, Takeaway)
- [x] Tap item to add to cart (increment if already in cart)
- [x] ModifierSheet (bottom sheet): modifier groups, required validation, quantity, special instructions
- [x] CartLineItem component: name, modifiers, quantity (+/-), line total, swipe to remove
- [x] Totals calculation (subtotal, tax at 16%, service charge for dine-in, total)
- [x] "Pay" button (disabled if cart empty)
- [x] "Clear" button with confirmation dialog
- [x] "Hold" button (save order as draft -- open status)
- [x] Order creation: POST to pos-api wired via `useCreateOrder()` hook

### D4: Payment processing (Days 6-8)

- [x] Payment modal (fullscreen overlay)
- [x] Cash payment flow:
  - Quick amount buttons (exact, round up)
  - Custom numpad for manual entry
  - Change due calculation and display
  - "Complete" button finalizes order
- [x] Split payment flow (cash + cash for MVP):
  - First amount input
  - Remaining balance shown
  - Second amount input
  - Complete when balance = 0
- [x] Payment confirmation screen (order number, total, payment method, change)
- [ ] Post-payment: order status updated to `completed`, cart cleared (pos-api hook not yet wired)
- [x] Card/mobile money placeholder buttons (show "Coming soon" or "Not available" for MVP)

### D5: Cash drawer management (Days 8-9)

- [x] Drawer page (`/drawer`)
- [ ] Open drawer: float amount input (numpad), confirm, calls pos-api (UI exists; pos-api hook not wired)
- [x] Active drawer status display (current balance, event count)
- [x] Drawer events log (scrollable list)
- [ ] Close drawer: counted amount input, variance calculation, confirm (UI exists; pos-api hook not wired)
- [x] Variance warning (red highlight if |variance| > KES 500)
- [x] Block order creation if no drawer is open (prompt to open drawer)
- [x] Zustand drawer store (current drawer ID, status)

### D6: Order management (Days 9-10)

- [x] Orders page (`/orders`)
- [x] Tabs: Open Orders, Completed Today
- [x] Order list with status badge, order number, type, total, time
- [x] Tap to view order detail (lines, payments, status timeline)
- [ ] Table selector for dine-in orders (dropdown from pos-api tables endpoint) (hook not yet wired to real API)

### D7: Polish and deploy (Days 10-12)

- [x] Responsive layout testing (10" tablet landscape + portrait)
- [x] Touch interaction testing (tap targets, swipe gestures)
- [x] Error boundaries and error toast messages
- [x] Loading states on all data fetches
- [x] 404 and error pages
- [x] Dockerfile and build.sh
- [x] CI/CD pipeline (GitHub Actions)
- [x] Production environment config
- [x] Deploy to production URL
- [ ] End-to-end smoke test (login -> browse menu -> add to cart -> pay cash -> close drawer) (blocked by pos-api hook wiring)

---

## API dependencies (pos-api)

| Endpoint | Required by | Priority |
|----------|-------------|----------|
| `GET /{t}/pos/catalog/items` | D2 | P0 |
| `GET /{t}/pos/catalog/categories` | D2 | P0 |
| `POST /{t}/pos/orders` | D3 | P0 |
| `GET /{t}/pos/orders` | D6 | P0 |
| `GET /{t}/pos/orders/{id}` | D6 | P0 |
| `PUT /{t}/pos/orders/{id}/status` | D3 | P0 |
| `POST /{t}/pos/orders/{id}/payments` | D4 | P0 |
| `POST /{t}/pos/drawers/open` | D5 | P0 |
| `POST /{t}/pos/drawers/close` | D5 | P0 |
| `GET /{t}/pos/drawers/current` | D5 | P0 |
| `GET /{t}/pos/tables` | D6 | P1 |

---

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| pos-api catalog endpoint not ready | No menu to display | Hard-code seed catalog data as fallback |
| pos-api order endpoint not ready | Cannot create orders | Mock API responses for development |
| Treasury integration not ready | No card/mobile payments | Cash-only for MVP (explicit "Coming soon" on other tenders) |
| Tablet touch testing insufficient | Poor UX on real hardware | Test on Chrome DevTools device emulation + one physical tablet |
| Offline mode complexity | Risk of data loss | Defer full offline to post-MVP; show "offline" banner, block order creation |

---

## Definition of done

- [x] Login flow functional (SSO -> pos-ui -> authenticated)
- [ ] Menu grid displays catalog items from pos-api (TanStack Query hooks need wiring to real endpoints)
- [x] Cart: add, remove, modify items with correct totals
- [ ] Cash payment: amount entry, change calculation, order completion (payment hook not wired to pos-api)
- [ ] Cash drawer: open with float, close with counted amount, variance shown (drawer hooks not wired to pos-api)
- [ ] Order list: view open and completed orders (orders hook not wired to pos-api)
- [x] Tablet layout verified (landscape and portrait)
- [x] Deployed to production URL
- [x] No console errors in production build

## Remaining Work (as of 2026-05-09)

- [ ] Set up IndexedDB Dexie.js database (`src/lib/db/pos-db.ts`) for offline catalog cache
- [ ] Wire `useMenuItems` / `useCategories` hooks to real pos-api endpoints
- [ ] Wire `useCreateOrder` / `useOrders` / `useOrder` hooks to real pos-api endpoints
- [ ] Wire `useRecordPayment` hook to pos-api
- [ ] Wire `useCurrentDrawer` / `useOpenDrawer` / `useCloseDrawer` hooks to pos-api
- [ ] Wire table selector to `GET /{t}/pos/tables` endpoint
- [ ] Complete PWA manifest and confirm service worker active in production
- [ ] End-to-end smoke test once all hooks wired

---

## Auth Notes (Audit Finding — May 2026)

The Sprint 1 auth flow implements SSO-only login (PKCE → auth-api → callback). This is correct for managers and admins.

**Terminal PIN login** (for kitchen staff, waiters, cashiers on dedicated terminals) is **not** implemented in Sprint 1. It requires:
- `POSStaffPin` entity and `POST /{tenant}/pos/auth/pin` endpoint (pos-api side — see [pos-api Sprint 1 pending](../../../pos-api/docs/sprints/sprint-1-foundation.md))
- `PINKeypad`, `StaffSelector`, `QuickSwitchBar` components (pos-ui)
- `loginMode: "sso" | "pin"` in Zustand auth store

**Deferred to:** [pos-ui Sprint 10](sprint-10-pos-auth.md)
