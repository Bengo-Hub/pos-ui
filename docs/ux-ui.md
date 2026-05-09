# pos-ui — UX/UI Specification

**Last updated:** 2026-05-09  
**Target users**: Cashiers, waiters, bartenders, kitchen staff, receptionists, managers  
**Device targets**: 10" Android tablet (primary), 13" laptop/desktop (secondary), phone (not officially supported)  
**Design system**: Shadcn UI + Tailwind CSS 4  
**Interaction model**: Touch-first (44×44px minimum tap targets, swipe gestures)

---

## Layout Model

### POS Shell (Current Implementation)

```
┌──────────────────────────────────────────────────────────────┐
│  [☰ Menu] Logo    Outlet: Busia     User     Shift ●  [⚙]   │  ← Header (48px)
├────────────┬─────────────────────────────────────────────────┤
│            │                                                  │
│  Sidebar   │  Main Content Area                               │
│ (280px)    │  (dynamic per route)                             │
│            │                                                  │
│ Dashboard  │                                                  │
│ New Order  │                                                  │
│ Orders     │                                                  │
│ Tables     │                                                  │
│ KDS        │                                                  │
│ Bar        │                                                  │
│ Hotel      │                                                  │
│ Shifts     │                                                  │
│ Drawer     │                                                  │
│ Reports    │                                                  │
│ Settings   │                                                  │
│            │                                                  │
└────────────┴─────────────────────────────────────────────────┘
```

- Sidebar collapses to hamburger on `< lg` (1024px)
- Sidebar items filtered by `useModuleAccess()` based on outlet use case
- Dark sidebar (`bg-brand-dark`), tenant brand primary color for active route

### Touch Guidelines

| Element | Minimum Size |
|---------|-------------|
| Any tap target | 44×44px |
| Menu item card (grid) | 120×80px |
| Cart line item height | 56px |
| Action buttons (Pay, Open Shift) | 52px height |
| KDS ticket action buttons | 36px height |
| Font size (body) | 14px |
| Font size (labels) | 12px |

---

## Page Specifications

### Main POS Screen (`/[orgSlug]/order`)

**Layout**: Split view — Menu panel (flex-1) + Cart panel (380px fixed right)  
**On portrait tablet**: Cart panel slides up as bottom drawer

**Menu Panel:**
- Category tabs (horizontal scroll): All, [dynamic from catalog]
- Display mode toggle: Card (default) / List (retail) / Image Grid (bar/restaurant)
- Search bar + barcode icon (triggers `keydown` scanner listener)
- Item grid (3–4 columns; 2 on portrait):
  - **Card mode**: Name, price, "Has options" hint; quantity badge if in cart
  - **List mode**: Name, SKU, price (left-to-right); for high-velocity supermarket checkout
  - **Image grid mode**: Large image with overlay quantity badge; for visual menus

**Item Tap Flow:**
1. Age verification prompt (if `requires_age_verification`) → confirm 18+
2. Serial number prompt (if `track_serial_number`) → scan/type serial
3. Modifier sheet (if `modifier_groups.length > 0`) → select options, set quantity
4. Add to cart immediately (no modifiers/serial/age)

**Cart Panel:**
- Order type selector: Dine-in / Takeaway / Pickup / Room Service
- Table selector (dine-in): dropdown from sections/tables API
- Line items: name, modifiers (indented), qty ±, line total, remove button
- Notes field (per-order)
- Totals: Subtotal, VAT (16%), Service Charge (dine-in: 10%), Total
- Hold order button (saves as draft)
- **Place Order & Pay** button (full-width, 52px, primary color)

**Payment Modal (Fullscreen Overlay):**
- Order number + total amount at top
- Tender buttons (large, touch-friendly, color-coded):
  - Cash (green) → change calculator with quick amounts (500, 1000, 2000, 5000 KES)
  - Card/Paystack (blue) → "Processing..." → redirect to Paystack
  - M-Pesa (orange) → phone number input → STK push waiting screen → poll status
  - Room Charge (purple) → room number lookup → post to folio
  - Split Payment (gray) → sequential tenders with running balance
- Numpad for custom cash amounts
- Discount code field (below tenders)

---

### Order History (`/[orgSlug]/orders`)

- Tabs: **Open** / **Completed Today** / **All**
- List rows: order number, type badge, status badge, total, time elapsed
- Tap row → order detail (lines, payments, actions)
- Order detail actions:
  - Reopen (manager/supervisor)
  - Void (supervisor — triggers PIN override prompt)
  - Print receipt
  - Refund (supervisor)

---

### Floor Plan (`/[orgSlug]/tables`)

**Grid view grouped by section** (Main Hall, Patio, Bar, VIP, etc.):
- Table card: table name, seat count, status badge, VIP/VVIP tags
- Status colors: Available (green), Occupied (amber/red), Reserved (blue), Cleaning (gray)
- Tap **available** table: opens new order pre-assigned to that table
- Tap **occupied** table: navigates to the open order for that table
- Tap **reserved** table: show reservation details (planned)
- Filter tabs: All / Available / Occupied / Reserved
- Release button on occupied cards (quick release without navigating to order)

---

### KDS Terminal (`/[orgSlug]/kds`)

**Full-screen, auto-refreshes every 5s**

- Station selector tabs at top (Kitchen, Bar, Grill — from `useKDSStations()`)
- Ticket grid (responsive columns based on screen width)
- **Ticket card:**
  - Order number (#001), optional label/table name
  - Elapsed time badge (green < 8min, amber 8–15min, red > 15min)
  - Item list with per-item status dots (gray=pending, amber=in_progress, green=ready)
  - Status action button:
    - `pending` → **Start** (amber) → `in_progress`
    - `in_progress` → **Ready** (green) → `ready`
    - `ready` → **Served** (primary) → `served`
- Empty state: "All caught up" with check icon

---

### Bar Display (`/[orgSlug]/bar`)

Same component as KDS but pre-filtered to the "bar" station (station name contains "bar"). Optimized for bartenders — typically shown on a dedicated wall/counter screen.

---

### Hotel Overview (`/[orgSlug]/hotel`)

- Occupancy KPI cards: Total Rooms, Occupied, Available, Checking Out Today
- Quick action links: Rooms → `/hotel/rooms`, Facilities → `/hotel/facilities`
- Recent check-ins list

### Rooms Grid (`/[orgSlug]/hotel/rooms`)

- Status filter tabs: All / Available / Occupied / Cleaning / Maintenance / Reserved
- Room cards grid: room number, name, room type badge, status badge
- Tap room → Room Detail

### Room Detail (`/[orgSlug]/hotel/rooms/[roomId]`)

**Check-In state (room available):**
- Check-in form: Guest Name, Phone, ID Number, Number of Nights
- Auto-calculates check-out date and total room charge
- **Check In** button

**Occupied state:**
- Guest info: name, phone, ID, check-in/check-out dates, night count
- Folio tab: itemized charges (room charge, food, laundry, minibar, room service, other)
- **Post Manual Charge** button (description + amount)
- **Check Out** button → settlement modal (tender selection)

**Settlement Modal:**
- Folio total with breakdown
- Tender: Cash / Card / M-Pesa / Company Account
- Confirm → room status → Cleaning

### Facilities (`/[orgSlug]/hotel/facilities`)

- Facility cards: name, type (pool/gym/spa/conference), capacity, rate/session, status
- **Book** button on each → inline form: guest name, date, start/end time, guest count
- Booking status: Confirmed → Completed / Cancelled

---

### Shift Management (`/[orgSlug]/shifts`)

**No active shift:**
- Open shift form: float amount (KES) + confirm
- Last session summary (readonly)

**Active shift:**
- Duration timer (HH:MM:SS)
- Order count + total sales (live from API)
- Payment breakdown: Cash / Card / M-Pesa totals
- Close shift button → counted amount → variance display → confirm

---

### Cash Drawer (`/[orgSlug]/drawer`)

- Status indicator: Open (green) / Closed (gray)
- **Open**: float amount input → "Open Drawer"
- **Active**: running totals (cash in from sales, cash out from skims/drops, expected balance)
- **Events log**: scrollable list — opened, sale, skim, drop, audit
- **Close**: counted amount → variance display (red if > KES 500) → "Close Drawer"

---

### Reports (`/[orgSlug]/reports`)

- Period toggle: Today / This Week / This Month
- KPI cards: Total Sales (KES), Orders, Avg Ticket, Refunds
- Payment breakdown (bar chart): Cash / Card / M-Pesa with percentages
- **Planned**: by-category chart, by-staff table, hourly trend, CSV/PDF export

---

### Settings (`/[orgSlug]/settings`)

- Outlet info: name, address, timezone
- Receipt config: header, footer, logo
- Tax configuration: VAT rate
- Printer setup: thermal printer IP/Bluetooth
- Device info: device code, last seen

---

## Component Library

| Component | Location | Usage |
|-----------|----------|-------|
| `ModifierModal` | `src/components/pos/modifier-modal.tsx` | Modifier selection for items with options |
| `POSPaymentModal` | `src/components/pos/payment-modal.tsx` | Full-screen payment flow |
| `Sidebar` | `src/components/sidebar.tsx` | Module-aware nav, tenant branding |
| `KDSTicketCard` | Used inline in `/kds` and `/bar` pages | Ticket display with status controls |
| Badge, Button, Card | `src/components/ui/base.tsx` | Shadcn re-exports |
| Toast | Sonner | Success/error feedback |
| Sheet | Shadcn Sheet | Bottom sheet (modifiers, quick actions) |
| Dialog | Shadcn Dialog | Confirmation dialogs |

---

## Status Color System

| Status | Color | Usage |
|--------|-------|-------|
| Available / Active | Green | Table available, shift open, stock OK |
| In Progress / Occupied | Amber | Table occupied, KDS in progress |
| Ready / Completed | Green (brighter) | KDS ready, order completed |
| Pending | Gray | Order pending, item not started |
| Reserved | Blue | Table reserved |
| Cleaning | Light gray | Room/table cleaning |
| Warning | Amber | Timer 8–15 min, low stock |
| Urgent | Red | Timer > 15 min, variance, out-of-stock |
| Voided | Dark red | Voided order/line |

---

## Responsive Breakpoints

| Breakpoint | Layout |
|-----------|--------|
| `≥ 1024px` (landscape tablet / desktop) | Sidebar + split view (menu 60%, cart 40%) |
| `768–1023px` (portrait tablet) | Sidebar collapses to hamburger; cart as bottom drawer |
| `< 768px` | Not officially supported; basic stacked layout |

---

## Loading & Error States

| State | Behavior |
|-------|----------|
| Catalog loading | Skeleton grid (12 placeholder cards) |
| No items in search | "No items found" message |
| Cart empty | "Tap items to start an order" |
| Payment processing | Full-screen spinner "Processing..." |
| M-Pesa pending | "Waiting for M-Pesa confirmation..." + animated spinner |
| API error | Sonner toast with retry; critical errors show inline alert |
| Offline | Yellow banner "Offline mode — cash payments only" |
| No active shift | "Open a shift to start processing orders" gate |
| Unauthorized | 403 page with contact manager CTA |

---

## Kenya-Specific UX Considerations

1. **M-Pesa as default tender**: M-Pesa button should be visually prominent alongside cash — not buried in a submenu
2. **KES as currency**: All amounts displayed as `KES {amount}` with comma separators (no decimal for whole amounts)
3. **Receipt format**: Include VAT registration number, KRA PIN, eTIMS QR code (planned Sprint 12)
4. **Offline mode**: Prominent yellow banner when offline; cash-only enforcement; sync status indicator
5. **Touch + stylus**: Optimized for Android tablets commonly used in Kenya (Lenovo Tab, Samsung Galaxy Tab)
6. **Large font for noisy environments**: Minimum 14px body; critical amounts use 20px+ bold
