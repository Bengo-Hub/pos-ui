# pos-ui — Integrations

**Last updated:** 2026-05-09

---

## Backend API (pos-api)

**Base URL**: `NEXT_PUBLIC_POS_API_URL` (default: `https://posapi.codevertexitsolutions.com`)

### Request Conventions

Every request from pos-ui includes:

```
Authorization: Bearer {accessToken}
X-Tenant-Slug: {orgSlug}
Content-Type: application/json
```

`orgSlug` is the dynamic route param (`/[orgSlug]/...`). Access token from Zustand auth store.

### Endpoint Map (TanStack Query Hooks in `src/hooks/usePOS.ts`)

#### Catalog & Menu

| Hook | Method | Endpoint | Notes |
|------|--------|----------|-------|
| `useMenuItems(params?)` | GET | `/v1/{t}/pos/catalog/items` | `?category=&search=&page=&per_page=` |
| `useCategories()` | GET | `/v1/{t}/pos/catalog/categories` | For category tab strip |
| `useMenuItemById(id)` | GET | `/v1/{t}/pos/catalog/items/{id}` | With modifiers |

#### Orders

| Hook | Method | Endpoint | Notes |
|------|--------|----------|-------|
| `useOrders(params?)` | GET | `/v1/{t}/pos/orders` | `?status=&date=&outlet_id=` |
| `useOrder(id)` | GET | `/v1/{t}/pos/orders/{id}` | Lines, modifiers, payments |
| `useCreateOrder()` | POST | `/v1/{t}/pos/orders` | Lines + modifiers + table_id |
| `useUpdateOrderStatus()` | PUT | `/v1/{t}/pos/orders/{id}/status` | State transitions |
| `useVoidOrder()` | POST | `/v1/{t}/pos/orders/{id}/void` | Requires `pos.orders.delete` |
| `useAddOrderLine()` | POST | `/v1/{t}/pos/orders/{id}/lines` | |
| `useRemoveOrderLine()` | DELETE | `/v1/{t}/pos/orders/{id}/lines/{lineId}` | |

#### Payments

| Hook | Method | Endpoint | Notes |
|------|--------|----------|-------|
| `useRecordPayment()` | POST | `/v1/{t}/pos/orders/{id}/payments` | `{tender_id, amount, currency}` |
| `usePayments(orderId)` | GET | `/v1/{t}/pos/orders/{id}/payments` | Poll for M-Pesa status |
| `useRefundOrder()` | POST | `/v1/{t}/pos/orders/{id}/refund` | Requires supervisor role |

#### Tables & Floor Plan

| Hook | Method | Endpoint | Notes |
|------|--------|----------|-------|
| `useTables(params?)` | GET | `/v1/{t}/pos/tables` | `?status=&section_id=` |
| `useSections()` | GET | `/v1/{t}/pos/tables/sections` | For section grouping |
| `useAssignTable()` | POST | `/v1/{t}/pos/tables/{id}/assign` | `{order_id}` in body |
| `useReleaseTable()` | POST | `/v1/{t}/pos/tables/{id}/release` | |
| `useUpdateTableStatus()` | PATCH | `/v1/{t}/pos/tables/{id}/status` | |

#### Cash Drawer

| Hook | Method | Endpoint | Notes |
|------|--------|----------|-------|
| `useCurrentDrawer()` | GET | `/v1/{t}/pos/drawers/current` | Active drawer for device |
| `useOpenDrawer()` | POST | `/v1/{t}/pos/drawers/open` | `{float_amount}` |
| `useCloseDrawer()` | POST | `/v1/{t}/pos/drawers/close` | `{counted_amount}` |
| `useDrawerEvents()` | GET | `/v1/{t}/pos/drawers/{id}/events` | Skim, drop, audit log |

#### Shifts / Device Sessions

| Hook | Method | Endpoint | Notes |
|------|--------|----------|-------|
| `useCurrentSession()` | GET | `/v1/{t}/pos/devices/current/sessions/current` | Active session |
| `useOpenSession()` | POST | `/v1/{t}/pos/devices/current/sessions/open` | `{float_amount}` |
| `useCloseSession()` | POST | `/v1/{t}/pos/devices/current/sessions/close` | `{counted_amount, notes}` |

#### KDS

| Hook | Method | Endpoint | Notes |
|------|--------|----------|-------|
| `useKDSStations()` | GET | `/v1/{t}/pos/kds/stations` | Returns `{ data: KDSStation[] }` |
| `useKDSTickets(params?)` | GET | `/v1/{t}/pos/kds/tickets` | `?stationId=&status=pending,in_progress` |
| `useStartTicket()` | POST | `/v1/{t}/pos/kds/tickets/{id}/start` | `pending → in_progress` |
| `useReadyTicket()` | POST | `/v1/{t}/pos/kds/tickets/{id}/ready` | `in_progress → ready` |
| `useServeTicket()` | POST | `/v1/{t}/pos/kds/tickets/{id}/serve` | `ready → served` |

#### Hotel Module

| Hook | Method | Endpoint | Notes |
|------|--------|----------|-------|
| `useHotelRooms(params?)` | GET | `/v1/{t}/hotel/rooms` | `?status=available,occupied,cleaning` |
| `useRoom(id)` | GET | `/v1/{t}/hotel/rooms/{id}` | Room + current guest + folio |
| `useCheckIn()` | POST | `/v1/{t}/hotel/rooms/{id}/check-in` | `{guest_name, phone, id_number, nights}` |
| `useCheckOut()` | POST | `/v1/{t}/hotel/rooms/{id}/check-out` | Calculates total, triggers settlement |
| `useRoomFolio(id)` | GET | `/v1/{t}/hotel/rooms/{id}/folio` | All folio charges |
| `useAddFolioCharge()` | POST | `/v1/{t}/hotel/rooms/{id}/folio` | Manual charge posting |
| `useFacilities()` | GET | `/v1/{t}/hotel/facilities` | |
| `useBookFacility()` | POST | `/v1/{t}/hotel/facilities/{id}/book` | `{guest_name, session_date, start_time, ...}` |
| `useUpdateFacilityBooking()` | PATCH | `/v1/{t}/hotel/facilities/bookings/{id}` | Status update |

#### Reports

| Hook | Method | Endpoint | Notes |
|------|--------|----------|-------|
| `useDailySummary(period)` | GET | `/v1/{t}/pos/reports/daily` | `?period=today\|week\|month` |
| `useSalesBreakdown(params)` | GET | `/v1/{t}/pos/reports/sales` | By staff, product, category |
| `useTillReport(date)` | GET | `/v1/{t}/pos/reports/till` | Daily cash reconciliation |

---

## Auth Service (SSO)

**Flow:**
1. No session → redirect to `NEXT_PUBLIC_SSO_URL/oauth2/authorize` with PKCE params
2. User logs in (SSO/email), auth-api issues tokens
3. Callback at `/[orgSlug]/auth/callback` exchanges code for tokens
4. Tokens in Zustand (persisted `localStorage['pos-ui-auth']`)
5. Axios interceptor: `Authorization: Bearer {token}` on all API calls
6. 401 → attempt silent refresh → on failure, redirect to login

**Token claims used:**

| Claim | Usage |
|-------|-------|
| `sub` | User ID (shift, drawer ownership) |
| `tenant_slug` | API path slug (`orgSlug`) |
| `roles` | Gating void/refund/supervisor actions |
| `outlet_use_case` | Module access resolution |
| `name`, `email` | Display in header |

**Supervisor Override:**
For void, refund, and drawer close: if current user lacks the required permission, show "Supervisor Authorization Required" dialog. Supervisor logs in; their token is used for that single request. Audit log captures both user IDs.

---

## Payment Flows

### Cash Payment
1. pos-ui: `POST /orders/{id}/payments` `{ tender_id: 'cash', amount }`
2. pos-api: records immediately, auto-completes order
3. pos-ui: shows change due, clears cart

### M-Pesa STK Push
1. pos-ui: `POST /orders/{id}/payments` `{ tender_id: 'mpesa', amount, phone }`
2. pos-api: calls treasury-api S2S → creates payment intent → Daraja STK Push triggered
3. pos-ui: shows "Waiting for M-Pesa confirmation..." spinner, polls `GET /orders/{id}/payments` every 3s
4. treasury-api: receives M-Pesa callback → publishes `treasury.payment.success`
5. pos-api: marks payment succeeded → order completed
6. pos-ui: poll detects `payment_status = succeeded` → success screen

**Status:** ❌ S2S treasury intent call not yet wired in pos-api (Sprint 6)

### Card (Paystack)
1. pos-ui: `POST /orders/{id}/payments` `{ tender_id: 'card', amount }`
2. pos-api: calls treasury-api → Paystack intent → returns `authorization_url`
3. pos-ui: opens `authorization_url` in a modal/new tab
4. On Paystack callback: `treasury.payment.success` → pos-api marks succeeded

**Status:** ❌ Not yet wired (Sprint 6)

### Room Charge
1. pos-ui: `POST /orders/{id}/payments` `{ tender_id: 'room_charge', room_id, room_guest_id, amount }`
2. pos-api: posts charge to `room_folio_items` (no treasury call)
3. pos-ui: order completed, folio updated

**Status:** ❌ Room charge tender type not yet implemented

### Split Payment
1. pos-ui: multiple `POST /orders/{id}/payments` calls for different tenders
2. pos-api: accumulates `paid_amount`; order completed when `paid_amount >= total_amount`
3. pos-ui: shows remaining balance after each tender; completes on balance = 0

---

## Offline Storage (Dexie.js)

**Status:** ❌ Not yet wired (Sprint 6)

### Planned IndexedDB Tables

| Table | Purpose | Sync Strategy |
|-------|---------|--------------|
| `catalog_items` | Cached menu for offline mode | Full refresh on reconnect |
| `offline_orders` | Orders created while offline | Push to pos-api on reconnect |
| `pending_payments` | Cash-only payments recorded offline | Push with order sync |

### Planned Sync Manager

```typescript
// On navigator.onLine event
const pending = await db.offline_orders.toArray();
for (const order of pending) {
  const res = await api.post(`/${slug}/pos/orders`, order);
  if (res.ok) await db.offline_orders.delete(order.id);
}
```

Conflict resolution: server-assigned `order_number` replaces client-side temp IDs.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_POS_API_URL` | `https://posapi.codevertexitsolutions.com` | Backend API base URL |
| `NEXT_PUBLIC_SSO_URL` | `https://sso.codevertexitsolutions.com` | Auth service |
| `NEXT_PUBLIC_AUTH_UI_URL` | `https://accounts.codevertexitsolutions.com` | Auth UI |
| `NEXT_PUBLIC_SSO_CLIENT_ID` | `pos-ui` | OIDC client ID |
