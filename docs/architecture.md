# pos-ui -- Architecture

**Service**: pos-ui (Next.js 15 PWA)
**Purpose**: Touch-optimized point-of-sale terminal interface for over-the-counter orders, payments, cash management, and table service
**Canonical tenant**: `urban-loft` | **Active outlet**: Busia
**Status**: Planning only (no app scaffold yet)

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS + Shadcn UI |
| State | Zustand (global: cart, drawer, session) + TanStack Query (server: catalog, orders) |
| API client | Axios with auth interceptors |
| PWA | @ducanh2912/next-pwa (offline capability) |
| Forms | React Hook Form + Zod |
| Offline DB | Dexie.js / IndexedDB (offline order queue) |
| Auth | SSO via auth-ui (OIDC/OAuth2 PKCE) |

---

## Service boundaries

### Owned by pos-ui

- Order entry (menu browsing, cart, modifiers, notes)
- Payment processing (cash, card, mobile money)
- Cash drawer management (open, close, skim, drop)
- Table management (floor view, assign, release)
- Shift management (open/close shift)
- Kitchen ticket display (order status updates)
- Receipt generation (on-screen, print-ready)

### Redirects elsewhere

| Feature | Target | URL |
|---------|--------|-----|
| Online ordering | ordering-service | ordering.codevertexitsolutions.com |
| Staff portal | cafe-website | theurbanloftcafe.com/staff |
| SSO login | auth-ui | accounts.codevertexitsolutions.com |

---

## Planned route structure

```
src/app/
  (auth)/
    login/page.tsx              -- SSO redirect
    callback/page.tsx           -- OAuth callback
  (pos)/
    layout.tsx                  -- POS shell (header bar, outlet context)
    page.tsx                    -- Main POS screen (menu + cart split)
    orders/
      page.tsx                  -- Order history / open orders
      [orderId]/page.tsx        -- Order detail
    tables/
      page.tsx                  -- Floor plan view
    drawer/
      page.tsx                  -- Cash drawer management
    shifts/
      page.tsx                  -- Shift open/close
    settings/
      page.tsx                  -- Device and outlet settings
```

---

## Multi-tenancy model

| Concept | Implementation |
|---------|---------------|
| Tenant context | `NEXT_PUBLIC_TENANT_SLUG` env var (default `urban-loft`) |
| Outlet context | `NEXT_PUBLIC_OUTLET_ID` env var (Busia outlet UUID) |
| API scoping | All API calls include `{tenantID}` in path + `X-Outlet-ID` header |
| Headers | `X-Tenant-Slug`, `X-Tenant-ID`, `X-Outlet-ID` on every request |
| SSO | Tenant claim in JWT |

### Platform admin vs tenant admin vs cashier

| Role | Access | UI scope |
|------|--------|----------|
| Platform admin | System config, feature overrides | Settings only (POS not primary interface) |
| Tenant admin / Manager | Full POS + reporting + drawer management | All sections |
| Supervisor | Void/refund authority, drawer close | POS + drawer + void actions |
| Cashier | Order entry, cash payment | POS screen + own shift only |

---

## Multi-outlet awareness

Current MVP: single outlet (Busia). Outlet ID passed as header on all requests.

Post-MVP: outlet selector on login (cashier selects which terminal/outlet they are working from). Device-outlet binding via `pos_devices` table.

---

## Offline architecture

```
[Online]                          [Offline]
  pos-api  <---  Axios  <---  pos-ui  --->  Dexie.js (IndexedDB)
                                              |
                                              +-- offline_orders queue
                                              +-- catalog_cache
                                              +-- pending_payments

[Reconnect]
  Dexie.js  --->  SyncManager  --->  pos-api (bulk POST)
```

### Offline capabilities (MVP stretch)

- Catalog cached in IndexedDB on first load
- Orders created offline stored in `offline_orders` table
- On reconnect, SyncManager pushes queued orders to pos-api
- Conflict resolution: server order number takes precedence; offline orders get `offline_` prefix until synced
- Cash-only payments offline (card/mobile require network)

---

## Auth flow

1. Cashier opens pos-ui on tablet/terminal
2. If no session, redirect to auth-ui for login
3. Auth-ui handles OIDC PKCE flow
4. Callback stores tokens in Zustand (persisted to localStorage)
5. Axios interceptor attaches Bearer token + outlet headers
6. Session timeout: 8 hours (shift-length), refresh silently
7. Supervisor override: secondary auth prompt for void/refund actions

---

## MVP scope (March 17, 2026)

### Must-have

- SSO login + outlet-scoped session
- Menu grid with category tabs and search
- Cart with line items, modifiers, quantity adjust, notes
- Order creation (dine-in, takeaway)
- Cash payment with change calculation
- Cash drawer open/close
- Order list (open orders, completed today)
- Responsive layout optimized for 10" tablet

### Nice-to-have (stretch)

- Table floor plan view (assign/release)
- Shift open/close
- Card/mobile money payment (requires treasury integration)
- Receipt preview (on-screen)
- Offline order queue (IndexedDB)

### Post-MVP

- Full offline mode with sync
- Kitchen ticket display (WebSocket)
- Barcode scanner integration
- Receipt printing (ESC/POS)
- Multi-pricebook support
- Promotion/discount engine
- Gift card processing
- Performance analytics dashboard
