# pos-ui — Architecture

**Service**: pos-ui (Next.js 15 PWA)  
**Last updated**: 2026-05-09  
**Purpose**: Touch-optimized, offline-capable Point of Sale terminal — multi-vertical (hospitality, retail, pharmacy, services)  
**Status**: Core pages live; hotel/reports/shifts scaffolded; offline mode and payment flow partially implemented

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4 + Shadcn UI + custom `@theme` tokens |
| State | Zustand (global: cart, drawer, session) + TanStack Query (server state) |
| API client | Axios with auth interceptors + tenant/outlet headers |
| PWA | `@ducanh2912/next-pwa` (offline capability) |
| Forms | React Hook Form + Zod |
| Offline DB | Dexie.js / IndexedDB (offline order queue) — not yet wired |
| Auth | SSO via auth-api OIDC/OAuth2 PKCE; PIN terminal login planned (Sprint 10) |
| Toast | Sonner |

---

## Current Route Structure

```
src/app/
  page.tsx                          ← Root redirect to /[orgSlug]
  [orgSlug]/
    page.tsx                        ← Dashboard / analytics overview
    auth/callback/page.tsx          ← SSO OAuth2 callback
    unauthorized/page.tsx           ← 403 access denied
    order/page.tsx                  ← ✅ Main POS terminal (menu grid + cart + payment)
    orders/page.tsx                 ← Orders list (open, completed)
    tables/page.tsx                 ← ✅ Floor plan (sections, table status, release)
    kds/page.tsx                    ← ✅ Kitchen Display System (polling, ticket management)
    bar/page.tsx                    ← ✅ Bar Display (KDS filtered to bar station)
    drawer/page.tsx                 ← Cash drawer management
    shifts/page.tsx                 ← Shift open/close + float entry
    hotel/
      page.tsx                      ← Hotel overview (occupancy KPIs + quick links)
      rooms/page.tsx                ← Rooms grid with status filter
      rooms/[roomId]/page.tsx       ← Room detail (folio, check-in/out)
      facilities/page.tsx           ← Facilities + inline booking
    appointments/page.tsx           ← Appointments (service businesses)
    reports/page.tsx                ← Sales reports (KPI cards, payment breakdown)
    settings/page.tsx               ← Outlet and device settings
    platform/page.tsx               ← Platform admin (superuser only)
```

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
  pharmacy:    ['dashboard','orders','new_order','shifts','reports','cash_drawer','settings','platform'],
}
```

`useCase` resolved from JWT claims: `outlet_use_case` → `tenant_use_case` → `'hospitality'` fallback.

---

## Offline Architecture

```
[Online]
  pos-api  ←── TanStack Query ←── pos-ui  ──→  Dexie.js (IndexedDB)
                                                  ├── catalog_items (offline menu)
                                                  ├── offline_orders (queued orders)
                                                  └── pending_payments (cash only)

[Reconnect]
  Dexie.js  ──→  SyncManager  ──→  pos-api (bulk POST)
```

**Status:** ❌ IndexedDB not yet wired (Sprint 6).  
Catalog is served from TanStack Query cache (in-memory, not persisted).  
**Offline banner**: Yellow "Offline mode — cash payments only" should appear when `navigator.onLine` is false.

---

## Auth Flow

1. User opens pos-ui on tablet/terminal
2. If no valid session: redirect to auth-api OAuth2 PKCE endpoint
3. Auth-api handles login (SSO/email) and issues access token (15 min) + refresh (30 days)
4. Callback stores tokens in Zustand, persisted to `localStorage['pos-ui-auth']`
5. Axios interceptor attaches `Authorization: Bearer {token}` + tenant/outlet headers
6. Session auto-refresh on 401; terminal session = 8 hours (shift-aligned)

**Planned (Sprint 10):** PIN terminal login — touchscreen 4–6 digit PIN for kitchen, bar, and cashier terminals. Issues short-lived `pos_terminal` JWT scoped to device + outlet. Enables quick staff hand-off without full OAuth redirect.

---

## Branding & Theming

- Tenant brand colors fetched from auth-api v2 `TenantResponse` (`logo_url`, `brand_colors: {primary, secondary, accent}`)
- Provider: `src/providers/tenant-branding-provider.tsx`
- CSS: `--primary` (HSL triplet), `--ring`, `--brand-primary` / `--brand-emphasis` (RGB triplets) set dynamically
- Fallback primary: `#ea8022` (BengoBox orange)

---

## Component Architecture

```
src/
  app/[orgSlug]/           ← Page components (one per route)
  components/
    ui/base.tsx            ← Re-exported Shadcn primitives
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
  store/
    auth.ts                ← Zustand: user, session, logout
  providers/
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

## Sprint Status

| Sprint | Title | Status |
|--------|-------|--------|
| 1 | Foundation (scaffold, SSO, layout, module access) | 🟡 In progress |
| 2 | Order Entry (menu grid, cart, modifiers, payment) | ✅ Implemented |
| 3 | Tables & Shifts | ✅ Implemented |
| 4 | Hotel UI (rooms, facilities, check-in/out) | 🟡 Scaffold done |
| 5 | KDS Terminal View | ✅ Complete |
| 6 | Offline / PWA (IndexedDB, sync) | 🔴 Not started |
| 7 | Retail UI (barcode scan, list view, weight) | 🔴 Not started |
| 8 | Service Business UI (appointments, packages) | 🔴 Not started |
| 9 | Reports & Analytics UI | 🟡 Basic scaffold |
| 10 | Dual Auth (SSO + PIN terminal login) | 🔴 Not started |
