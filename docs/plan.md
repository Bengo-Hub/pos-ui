# POS UI — Implementation Plan

**Last updated:** 2026-05-21  
**Audit note (2026-05-09):** Sprint 6 eTIMS offline task corrected — treasury-api owns VSCU offline queue; pos-ui role is receipt indicator + reprint only.

---

## Executive Summary

pos-ui is a touch-optimized, offline-capable Progressive Web App (PWA) built on Next.js 15. It is the primary interface for all POS terminal operations: order entry, payment processing, KDS, hotel management, cash drawer, and shift management.

**Key capabilities (current and planned):**
- Fast checkout on 10" tablets (touch-first, < 50ms cart interactions)
- Menu grid with barcode scanner, modifiers, age verification, serial number capture
- KDS terminal and bar display with 5-second polling
- Hotel check-in/check-out, folio management, facility bookings
- Multi-vertical module access (hospitality, retail, pharmacy, services) via `useModuleAccess`
- Offline order queue via IndexedDB (planned Sprint 6)
- M-Pesa STK push flow, card (Paystack), room charge, split payments
- KRA eTIMS receipt signing (planned via pos-api Sprint 12)

---

## Technology Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4 + Shadcn UI |
| State | Zustand (global) + TanStack Query (server) |
| API | Axios with auth + tenant headers |
| PWA | `@ducanh2912/next-pwa` |
| Offline DB | Dexie.js / IndexedDB |
| Auth | SSO PKCE (auth-api); PIN terminal login (Sprint 10) |
| Toasts | Sonner |

---

## Sprint Roadmap

### Sprint 1 — Foundation (✅ Complete)

**Goal:** Scaffold, auth integration, layout, module-aware navigation

- [x] Next.js 15 App Router with `[orgSlug]` dynamic routing
- [x] SSO PKCE auth flow (`/auth/callback` page, Zustand store)
- [x] `useMe()` hook (TanStack Query, 5 min TTL), 403/404 pages
- [x] Sidebar with module-based navigation (filtered by `useModuleAccess`)
- [x] Tenant branding: dynamic primary color + logo from auth-api v2 response
- [x] `useModuleAccess` hook — use-case to module key mapping
- [x] IndexedDB setup with Dexie.js — `src/lib/db/pos-db.ts` (6 tables: catalogItems, offlineOrders, offlinePayments, drawerSessions, drawerCloses, staffProfiles)
- [x] Outlet selector at login — outlet use_case embedded in terminal JWT and PIN auth response

---

### Sprint 2 — Order Entry & Payment (✅ Implemented)

**Goal:** Full POS terminal: menu browse, cart, modifiers, payment

**Implemented (`/[orgSlug]/order/page.tsx`):**
- [x] Category tabs (horizontal scroll) + item grid (card / list / image modes)
- [x] Search bar with barcode scanner (keyboard buffer detection, `keydown` listener)
- [x] Item tap flow: age verification prompt → serial number prompt → modifier modal → add to cart
- [x] Modifier modal (required/optional groups, quantity selector, running total)
- [x] Cart panel: line items, quantity +/-, remove, clear all, per-line modifier display
- [x] Totals: subtotal, VAT (16%), total
- [x] Order creation via `useCreateOrder()` → `POST /{t}/pos/orders`
- [x] Cash payment via `POSPaymentModal` → `useRecordPayment()`
- [ ] Table selector in cart (dine-in: assign table to order) — needs UI wiring
- [ ] M-Pesa STK push waiting screen (polling loop)
- [ ] Card (Paystack) redirect flow
- [ ] Room charge tender type
- [ ] Discount code input
- [ ] Hold order (save as draft)
- [ ] Order notes per line
- [ ] Course-based ordering (starter/main/dessert fire control)

---

### Sprint 3 — Tables & Shifts (✅ Implemented)

**Goal:** Floor plan management, shift lifecycle, cash drawer

**Implemented — Tables (`/[orgSlug]/tables/page.tsx`):**
- [x] Section grouping (grouped by `section_id` from sections API)
- [x] Status filter tabs: all / available / occupied / reserved
- [x] Table cards with capacity, status badge, VIP/VVIP tags
- [x] Release table action (`useReleaseTable`)
- [ ] Tap available table → open new order (link to `/order?table_id=`)
- [ ] Tap occupied table → navigate to open order
- [ ] Section filter sidebar
- [ ] Table status update (set to cleaning, maintenance)

**Implemented — Shifts (`/[orgSlug]/shifts/page.tsx`):**
- [x] Load current session via `GET /pos/devices/current/sessions/current`
- [x] Open shift form: float amount input, confirm
- [x] Close shift: summary display, confirm
- [ ] Session summary: order count, total sales, payment breakdown per tender
- [ ] Cash variance warning (variance > KES 500)
- [ ] Drawer events log on shift page

**Implemented — Cash Drawer (`/[orgSlug]/drawer/page.tsx`):**
- [x] Current drawer status (open/closed)
- [x] Open/close drawer with float and counted amounts
- [ ] Live running total (sales vs expected)
- [ ] Drawer events timeline (skim, drop, audit)
- [ ] Variance display at close

---

### Sprint 4 — Hotel UI (🟡 Scaffold Done)

**Goal:** Room management, guest folio, facility bookings

**Scaffolded but needs completion:**
- [x] Hotel overview (`/hotel/page.tsx`): occupancy KPIs + links
- [x] Rooms grid (`/hotel/rooms/page.tsx`): status filter tabs, room cards
- [x] Room detail (`/hotel/rooms/[roomId]/page.tsx`): guest info, folio list, check-in form, check-out button
- [x] Facilities (`/hotel/facilities/page.tsx`): facility cards + inline booking form

**Remaining (needs real API hooks):**
- [ ] Wire `useHotelRooms()`, `useRoom()`, `useCheckIn()`, `useCheckOut()` hooks to actual API
- [ ] Wire `useFacilities()`, `useBookFacility()` hooks
- [ ] Room folio: itemized charges (room, food, laundry, minibar, room service)
- [ ] Multi-night stay: show per-night breakdown
- [ ] Check-out settlement modal: select tender (cash/card/M-Pesa/company account)
- [ ] Room charge tender in order payment modal (link to room guest)
- [ ] Housekeeping notification on check-out

---

### Sprint 5 — KDS Terminal (✅ Complete)

**KDS (`/[orgSlug]/kds/page.tsx`):**
- [x] Station list via `useKDSStations()`
- [x] Station selector tabs
- [x] Ticket cards with urgency colors (green/amber/red based on elapsed time)
- [x] Per-item status dots (pending/in_progress/ready)
- [x] Start / Ready / Serve actions (useStartTicket, useReadyTicket, useServeTicket)
- [x] 5-second polling via TanStack Query `refetchInterval`

**Bar Display (`/[orgSlug]/bar/page.tsx`):**
- [x] Filters to bar station (name.toLowerCase().includes('bar') heuristic)
- [x] Same ticket card layout as KDS
- [x] Active tickets: status `!= served && != voided`

---

### Sprint 6 — Offline / PWA (✅ Complete)

**Delivered:**

- [x] Dexie.js IndexedDB setup (`src/lib/db/pos-db.ts`) — 6 tables
- [x] Offline-aware POS mutations (`use-offline-pos.ts`) — save to IndexedDB when offline
- [x] Full sync worker (`use-sync-offline-orders.ts`) — drains on reconnect
- [x] `OfflineBanner.tsx` — fixed banner when offline
- [x] Background Sync: `register-sync.ts` SyncManager tag
- [x] `InstallPrompt.tsx` — PWA install with permissions
- [x] Payment modal: offline cash path queues to IndexedDB; M-Pesa/card disabled
- [ ] Receipt print CSS + `ReceiptPreview.tsx` print button — deferred

---

### Sprint 7 — Retail UI (✅ Core Delivered)

**Delivered:**
- [x] Barcode scanner UI in main POS page (keyboard buffer detection)
- [x] `/layaway/page.tsx`, `/layaway/new/page.tsx`, `/layaway/[id]/page.tsx`
- [x] `src/lib/api/layaway.ts` — layaway API client

**Remaining:**
- [ ] Separate retail terminal page (`/retail/page.tsx`)
- [ ] `ScaleDisplay` component and `useScaleReading` hook
- [ ] `SerialCaptureModal` wired to serial capture API
- [ ] Real-time stock badges on item cards
- [ ] Out-of-stock override with manager PIN

---

### Sprint 8 — Service Business UI (✅ Core Delivered)

**Delivered:**
- [x] `/appointments/page.tsx` — appointments list
- [x] `/commissions/page.tsx` — commissions table
- [x] `/staff/[staffId]/schedule/page.tsx` — 7-day schedule grid
- [x] `src/hooks/useAppointments.ts`, `useCommissions.ts`, `useStaffSchedule.ts`
- [x] `src/lib/api/appointments.ts`, `commissions.ts`, `staff-schedule.ts`

**Remaining:**
- [ ] `/appointments/[id]/page.tsx` — appointment detail + action buttons
- [ ] `/appointments/new/page.tsx` — booking form
- [ ] `/queue/page.tsx` — walk-in queue board
- [ ] `/clients/` pages — client lookup and profiles
- [ ] `/packages/` pages — service package management

---

### Sprint 9 — Reports & Analytics UI (✅ Core Delivered)

**Implemented (`/[orgSlug]/reports/page.tsx`):**
- [x] Period selector: Today / This Week / This Month
- [x] KPI cards: Total Sales, Orders, Avg Ticket, Refunds — wired to `GET /pos/reports/sales-summary`
- [x] Payment breakdown: Cash / Card / M-Pesa bar chart
- [x] Daily breakdown bar chart — wired to `GET /pos/reports/daily-breakdown`
- [x] Refund summary KPI card — wired to `GET /pos/reports/refund-summary`

**Remaining:**
- [ ] Sales by category (pie/bar chart) — requires pos-api endpoint
- [ ] Sales by staff member — requires pos-api endpoint
- [ ] Top-selling items — requires pos-api endpoint
- [ ] Hourly trend chart — requires pos-api endpoint
- [ ] Export to CSV / PDF
- [ ] Till report / EOD reconciliation view

---

### Sprint 10 — Dual Auth (SSO + PIN Terminal Login) (✅ Complete)

**Delivered:**
- [x] `PINKeypad` component — 3×4 touch keypad, dot indicators, auto-submit
- [x] `/[orgSlug]/pin-login` — kiosk landing: staff avatar grid → PIN entry
- [x] Online path: POST `/pos/auth/pin` → terminal JWT → `setTerminalSession`
- [x] Offline path: bcrypt comparison against IndexedDB `staffProfiles`
- [x] `setTerminalSession` in auth store — `isTerminalSession = true`
- [x] `AuthProvider` — skips SSO redirect for `pin-login`; terminal 401 → redirect to pin-login
- [x] Screensaver with `useIdleTimer`, animated gradient blobs, tenant logo
- [x] "Admin Login" button → existing SSO PKCE flow
- [x] Trinity Authorization Layer 3 — `GET /pos/auth/me` merged into auth store after SSO
- [ ] Supervisor override secondary PIN — not yet implemented

---

## DevOps

- **Helm/ArgoCD config**: `devops-k8s/apps/pos-ui/` (`values.yaml`, `app.yaml`)
- **Image tags**: managed by `build.sh` — never edit `values.yaml` image tags manually
- **Build**: `pnpm build` → Next.js standalone output
- **Live URL**: `https://posapp.codevertexitsolutions.com`
