# POS UI — Implementation Plan

**Last updated:** 2026-05-09

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

### Sprint 1 — Foundation (🟡 In Progress)

**Goal:** Scaffold, auth integration, layout, module-aware navigation

- [x] Next.js 15 App Router with `[orgSlug]` dynamic routing
- [x] SSO PKCE auth flow (`/auth/callback` page, Zustand store)
- [x] `useMe()` hook (TanStack Query, 5 min TTL), 403/404 pages
- [x] Sidebar with module-based navigation (filtered by `useModuleAccess`)
- [x] Tenant branding: dynamic primary color + logo from auth-api v2 response
- [x] `useModuleAccess` hook — use-case to module key mapping
- [ ] IndexedDB setup with Dexie.js for offline catalog and order storage
- [ ] Outlet selector at login (cashier selects terminal/outlet)

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

### Sprint 6 — Offline / PWA (🔴 Not Started)

**Goal:** True offline operation — process cash orders without internet

- [ ] Dexie.js IndexedDB setup (`src/lib/db.ts`)
- [ ] Catalog IndexedDB cache: populate on first load, serve from cache when offline
- [ ] Offline order queue: create orders locally when `navigator.onLine === false`
- [ ] SyncManager: push queued orders to pos-api on reconnect event
- [ ] Offline banner: "Offline mode — cash payments only"
- [ ] Service Worker (via `@ducanh2912/next-pwa`): cache static assets + API responses
- [ ] PWA manifest: `add to homescreen` prompt for tablet installers
- [ ] eTIMS offline queue: queue invoice submissions, sync on reconnect

---

### Sprint 7 — Retail UI (🔴 Not Started)

**Goal:** Supermarket / hardware store / general retail optimized flows

- [ ] Fast barcode-only checkout flow (scan → add → pay, no browsing)
- [ ] Scale integration: weight input dialog for produce/bulk items
- [ ] Layaway plan: create, deposit, instalment payments, completion
- [ ] Customer-facing pole display mirror (optional second screen)
- [ ] Serial number capture at checkout (electronics)
- [ ] Real-time stock level badge on item cards (low/out-of-stock warnings)
- [ ] Out-of-stock override with manager PIN prompt

---

### Sprint 8 — Service Business UI (🔴 Not Started)

**Goal:** Appointment-driven service businesses (salon, spa, clinic, car wash)

- [ ] Appointment calendar (staff columns, time slots, walk-in queue)
- [ ] Client check-in: find by phone → open appointment → start service
- [ ] Service package redemption: look up balance, deduct session
- [ ] Commission preview: show staff commission on order completion
- [ ] Bay assignment display (car wash: bay status, queue position)
- [ ] Estimated wait time display

---

### Sprint 9 — Reports & Analytics UI (🟡 Basic Scaffold)

**Implemented (`/[orgSlug]/reports/page.tsx`):**
- [x] Period selector: Today / This Week / This Month
- [x] KPI cards: Total Sales, Orders, Avg Ticket, Refunds
- [x] Payment breakdown: Cash / Card / M-Pesa (bar charts + percentages)

**Remaining:**
- [ ] Sales by category (pie/bar chart)
- [ ] Sales by staff member
- [ ] Top-selling items (ranked list)
- [ ] Hourly trend chart
- [ ] Export to CSV / PDF (browser download)
- [ ] Till report: opening float vs counted close vs variance
- [ ] Hotel-specific: occupancy rate, RevPAR, folio totals

---

### Sprint 10 — Dual Auth (SSO + PIN Terminal Login) (🔴 Not Started)

**Goal:** Touchscreen PIN login for kitchen/bar/cashier terminals

- [ ] PIN entry screen: 4–6 digit keypad (fullscreen, touch-friendly)
- [ ] `POST /{t}/pos/auth/pin` → validate PIN → receive short-lived terminal JWT
- [ ] PIN set/reset UI for managers (`POST /{t}/pos/auth/pin/set`)
- [ ] Quick user switch: hand off terminal without full logout
- [ ] Terminal session: scoped to device + outlet, 4-hour expiry
- [ ] Supervisor override: secondary PIN entry in-app for void/refund

---

## DevOps

- **Helm/ArgoCD config**: `devops-k8s/apps/pos-ui/` (`values.yaml`, `app.yaml`)
- **Image tags**: managed by `build.sh` — never edit `values.yaml` image tags manually
- **Build**: `pnpm build` → Next.js standalone output
- **Live URL**: `https://posapp.codevertexitsolutions.com`
