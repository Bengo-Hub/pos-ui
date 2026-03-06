# pos-ui -- UX/UI Specification

**Target users**: Cashiers, supervisors, managers
**Device targets**: 10" tablet (primary), desktop (secondary), phone (not supported)
**Design system**: Shadcn UI + Tailwind CSS
**Interaction model**: Touch-first (large tap targets, swipe gestures)

---

## Layout

### POS shell

- **Header bar** (48px): Outlet name, current user, shift status indicator, clock, settings gear
- **Main area**: Split view (menu left 60%, cart right 40%) -- single-panel on portrait tablet
- **No sidebar**: All navigation via header icons and bottom action bar

### Touch guidelines

- Minimum tap target: 44x44px
- Grid item minimum: 80x80px
- Cart line item height: 56px minimum
- Button padding: 12px minimum
- Font size: 16px minimum for body, 14px for labels

---

## Page specifications

### Main POS screen (`/`)

**Split layout**: Menu panel (left) + Cart panel (right)

**Menu panel**:
- Category tabs (horizontal scroll): All, Breakfast, Burgers, Pizzas, Mains, Drinks, Desserts...
- Search bar (top, with barcode icon for scanner)
- Item grid (3-4 columns depending on screen width)
- Each item card: Image thumbnail, name, price, availability dot (green/red)
- Tap item: If no modifiers, add to cart immediately. If modifiers, open modifier sheet.

**Modifier sheet** (bottom sheet):
- Item name + image at top
- Modifier groups listed vertically
- Required groups highlighted
- Quantity selector
- "Add to Cart" button (shows running total)
- Special instructions text field

**Cart panel**:
- Order type selector (Dine-in / Takeaway / Pickup) at top
- Table selector (if dine-in): dropdown or tap-to-select
- Line items list:
  - Item name, modifiers (indented), quantity, line total
  - Swipe left to remove
  - Tap to edit (reopens modifier sheet)
  - +/- buttons for quantity
- Notes field (per-order)
- Totals section: Subtotal, Tax, Service Charge (if dine-in), Total
- Action bar: "Hold" (save as draft), "Pay" (opens payment), "Clear" (with confirm)

### Payment screen (modal/fullscreen overlay)

- **Order summary** at top: Order number, total amount
- **Tender buttons** (large, touch-friendly):
  - Cash (green)
  - Card (blue)
  - Mobile Money (orange)
  - Split Payment (gray)
- **Cash flow**:
  1. Tap "Cash"
  2. Quick amount buttons (exact, round up to 500, 1000, 2000, 5000)
  3. Numpad for custom amount
  4. "Confirm" shows change due
  5. "Complete" closes order
- **Card flow** (post-MVP):
  1. Tap "Card"
  2. "Processing..." spinner
  3. Success/failure feedback
- **Split payment**:
  1. First tender type + amount
  2. Remaining balance shown
  3. Second tender type + amount
  4. Complete when balance = 0

### Order history (`/orders`)

- **Tabs**: Open Orders, Completed Today, All
- **List view**: Order number, type badge, status badge, total, time
- **Tap order**: Opens detail view
- **Actions**: Reopen (supervisor), Void (supervisor), Print receipt

### Floor plan (`/tables`) -- stretch

- **Grid view**: Table cards arranged by area (Main Floor, Patio, Bar)
- **Table card**: Table code, seat count, status color, order total (if occupied)
- **Status colors**: Available (green), Occupied (amber), Reserved (blue), Dirty (red)
- **Tap table**: If available, create new order assigned to table. If occupied, open order.

### Cash drawer (`/drawer`)

- **Current status**: Open/Closed indicator
- **Open drawer**: Float amount input, "Open Drawer" button
- **Active drawer**: Running totals (cash in, cash out, expected balance)
- **Events log**: Scrollable list of drawer events (open, sale, skim, drop)
- **Close drawer**: Counted amount input, variance display, "Close Drawer" button
- **Variance warning**: Red highlight if variance exceeds KES 500

### Shift management (`/shifts`) -- stretch

- **Open shift**: Select drawer, enter float, confirm
- **Active shift**: Duration timer, order count, total sales
- **Close shift**: Summary (orders, sales, payments by type, variance), confirm close

---

## Component library (Shadcn + custom)

| Component | Usage |
|-----------|-------|
| MenuItemCard (custom) | Item grid -- image, name, price, availability |
| CartLineItem (custom) | Cart list -- swipeable, editable |
| ModifierSheet (custom) | Bottom sheet for modifier selection |
| PaymentModal (custom) | Fullscreen payment flow |
| Numpad (custom) | Cash amount entry |
| Badge | Order type, status indicators |
| Button | Large touch targets for actions |
| Dialog | Confirmation (void, clear cart, close drawer) |
| Sheet | Bottom sheet (modifiers, quick actions) |
| Toast | Success/error feedback |
| Tabs | Category tabs, order history tabs |
| Input | Search, notes, amount fields |
| Select | Table selector, tender type |

---

## Status color system

| Status | Color | Usage |
|--------|-------|-------|
| Open | Blue | Order open, drawer open |
| In Progress | Amber | Sent to kitchen |
| Ready | Green | Ready for serve/pickup |
| Completed | Gray | Paid and closed |
| Cancelled | Red | Cancelled order |
| Voided | Dark red | Supervisor voided |

---

## Responsive breakpoints

| Breakpoint | Layout |
|-----------|--------|
| >= 1024px (landscape tablet / desktop) | Split view: menu 60% + cart 40% |
| 768-1023px (portrait tablet) | Stacked: menu full width, cart as bottom drawer |
| < 768px | Not officially supported; basic stacked layout |

---

## Performance requirements

- Menu grid render: < 100ms for 100 items
- Add to cart: < 50ms (optimistic UI)
- Order creation API call: < 500ms
- Payment processing: < 2s (cash), < 5s (card/mobile)
- Page navigation: < 200ms

---

## Loading and error states

- **Catalog load**: Skeleton grid (12 placeholder cards)
- **Cart empty**: "Tap an item to start an order" message
- **Payment processing**: Full-screen spinner with "Processing..." text
- **API error**: Toast with retry option; critical errors show inline alert
- **Offline**: Yellow banner "Offline mode -- cash payments only", catalog served from IndexedDB
- **Drawer not open**: Block order creation with "Open cash drawer to start" prompt
