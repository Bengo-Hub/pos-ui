# pos-ui — Integrations

**Last updated:** 2026-08-22  
**Audit note (2026-08-22):** "Payment Flows" below rewritten — the Sprint-6 design (raw `POST /orders/{id}/payments` + client poll, several flows flagged "❌ not yet wired") was superseded long ago by the intent/gateway-handoff architecture actually shipped (`useCreatePaymentIntent` → treasury payment intent → `TreasuryPaymentModal` hosted pay page). Also: centralized the M-Pesa STK/C2B tender logic that had drifted into two separate copies (`payment-modal.tsx` modal-style settle flow and `terminal/inline-payment-bar.tsx` inline action bar) into shared components — `components/pos/c2b-payment-matcher.tsx` (C2B query/timeout/claim) and `lib/pos/offline-payment.ts` (offline payment queueing) — and added the M-Pesa C2B active-query flow documented below.
**Audit note (2026-08-22, cont'd):** Every M-Pesa tender button (POS terminal bar, settle modal, C2B matcher) now renders the official M-Pesa mark — `public/mpesa-logo.svg` (sourced from Wikimedia Commons, public domain per Commons' own assessment; identical file duplicated into `finance-service/treasury-ui/public/`), rendered via `components/pos/mpesa-logo.tsx`. Labels no longer repeat "M-Pesa" next to that icon: the sibling STK/C2B buttons are just "STK Push" / "C2B" (was "M-Pesa STK Push" / "M-Pesa C2B") — applied uniformly in `terminal-actions.ts`, `payment-modal.tsx`, `c2b-payment-matcher.tsx`, and the transaction-history label map in `terminal/toolbar-modals.tsx`. treasury-ui's hosted `/pay` page and `MpesaPaymentModal` got the matching treatment (see that repo's own docs).

**Audit note (2026-05-09):** M-Pesa and card payment flows expanded to show full pos-api→treasury-api→NATS chain. eTIMS QR code origin clarified (treasury-api → pos-api → pos-ui, not direct). Offline payment constraints documented.

---

## Backend API (pos-api)

**Base URL**: `NEXT_PUBLIC_POS_API_URL` (default: `https://posapi.codevertexafrica.com`)

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

The inline terminal action bar (`components/pos/terminal/inline-payment-bar.tsx`, the primary
GoDigital-style settle surface) and the modal-style settle flow (`components/pos/payment-modal.tsx`,
used for dine-in bill settlement, online orders, and split-payment lines) both dispatch tenders
through `terminal-actions.ts`'s `TenderKey`/`tenderMethodFor()`/`paymentActionsFor()` — the single
source of truth for which tenders exist, their labels/icons, and which `tender_method` string
pos-api expects. Every tender ultimately settles via `useCreatePaymentIntent()` (`POST
/{tenant}/pos/orders/{id}/payments/intent`), which pos-api turns into a treasury `PaymentIntent`.

### Cash / Card (PDQ) / On Account / Store Credit / Loyalty Points
Immediate-settle tenders: `createIntent.mutate({ orderId, tenderMethod, amount, tenderId, externalRef? })`
records the payment synchronously (no gateway round-trip) and completes the order. Offline
(`navigator.onLine === false`): queued via the shared `queueOfflinePayment()`
(`lib/pos/offline-payment.ts`) into IndexedDB (`savePendingPayment`), synced later by the offline
sync worker. Only these settle-at-the-till tenders support offline queueing.

### M-Pesa STK Push (`tender_method: "mpesa"`, `TenderKey: "mpesa_stk"`)
1. pos-ui: `useCreatePaymentIntent()` → pos-api → treasury-api creates a `PaymentIntent`, returns
   `{ payment_intent_id, initiate_url }`.
2. pos-ui: renders `<TreasuryPaymentModal>` (`@bengo-hub/shared-ui-lib`) as an iframe pointed at
   treasury-ui's hosted `/pay?intent_id=…&initiate_url=…&gateways=mpesa&embed=true` page.
3. treasury-ui `/pay`: with `allowedMethods` narrowed to exactly one gateway (the normal POS case),
   auto-skips the "choose how you want to pay" list and opens `MpesaPaymentModal` directly — collects
   phone, `POST`s `initiate_url` (Daraja STK Push, `treasury-api/internal/modules/gateways/mpesa.go`).
4. pos-ui: `usePaymentStream(orderId)` (SSE) fires as soon as pos-api records the payment — no client
   polling needed; `treasury-ui`'s own modal also polls the intent status endpoint as a fallback.
5. On confirm: `postMessage({ type: 'treasury:payment_confirmed', … })` → parent modal → order settled.

**Offline behaviour:** requires network — the tender button is hidden/disabled when offline
(`paymentActionsFor()`'s `online: true` filter).

**eTIMS QR code on receipt:** After order completion, poll `GET /orders/{id}` for
`etims_invoice_number` and `etims_qr_code_url`. Populated asynchronously when treasury-api signs the
invoice; if still null after 5s, print without the QR code rather than blocking the flow.

### M-Pesa C2B (`tender_method: "mpesa"`, `TenderKey: "mpesa_c2b"`) — customer paid the till directly
For customers who pay to the tenant's Paybill/Till themselves (no STK prompt). Clicking the tender
mounts the shared `<C2BPaymentMatcher>` (`components/pos/c2b-payment-matcher.tsx`), which:
1. Immediately starts actively querying `GET /{tenant}/pos/c2b/payments?status=unreconciled&amount={total}`
   (`useListC2BPayments`, polls every 4s) — this proxies treasury-api's C2B inbox, itself fed by
   Daraja's Confirmation webhook (`POST /webhooks/mpesa/confirmation`, persisted to
   `mpesa_c2b_inbox`: `trans_id`, `amount`, `msisdn`, `payer_name`, `trans_time`, `bill_ref_number`).
2. Shows a live countdown and auto-cancels (closes back to tender selection, with a toast) if no
   match lands within **20s**. A Cancel button aborts the search at any time.
3. On exactly one match: stops searching and shows the customer's payment details (payer name,
   phone, M-Pesa receipt, amount, time — parsed via `lib/pos/c2b-format.ts`'s `formatTransTime()`)
   with an explicit **Confirm & Complete Sale** button — claiming never happens silently on match.
4. Confirm → `POST /{tenant}/pos/c2b/payments/{transID}/claim` — pos-api atomically claims the row in
   treasury (race-safe: only succeeds while still `unreconciled`) AND calls `RecordPayment` to settle
   the POS order server-side in one request.
5. The rare multi-match case (two customers paying the identical amount) falls back to a pick-one list.

### Card / Wallet / MTN Mobile Money / Airtel Money (Paystack-backed gateways)
Same `TreasuryPaymentModal` handoff as M-Pesa STK Push above, with `allowedMethods` set to the
relevant gateway (`card`, `wallet`, `mtn_momo`, `airtel_money`).

### Room Charge (hospitality)
`POST /hotel/rooms/{roomId}/folio/charges` via `hotelApi.postFolioCharge()` — posts directly to the
guest folio, no treasury intent involved; order is marked settled once the folio post succeeds.

### Split Payment
`split-payment-modal.tsx` wraps multiple `<POSPaymentModal>` instances, one per split line, each
settling independently through the flows above for its own (smaller) amount.
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
| `NEXT_PUBLIC_POS_API_URL` | `https://posapi.codevertexafrica.com` | Backend API base URL |
| `NEXT_PUBLIC_SSO_URL` | `https://sso.codevertexafrica.com` | Auth service |
| `NEXT_PUBLIC_AUTH_UI_URL` | `https://accounts.codevertexafrica.com` | Auth UI |
| `NEXT_PUBLIC_SSO_CLIENT_ID` | `pos-ui` | OIDC client ID |
