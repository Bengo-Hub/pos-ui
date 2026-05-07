# Codevertex POS — Hotel & Restaurant Management System

## Product Overview

A multi-vertical, cloud-first Point of Sale and hotel management system built for the Kenyan hospitality market. Designed for touchscreen operation, M-Pesa integration, KRA eTIMS compliance, and offline-capable architecture.

**Company:** Codevertex Africa Limited, Kisumu, Kenya
**Target Market:** Hotels, restaurants, bars, and hospitality businesses in Kenya and East Africa

---

## Table of Contents

1. [System Roles & Permissions](#1-system-roles--permissions)
2. [Core Workflows](#2-core-workflows)
3. [Feature Specifications](#3-feature-specifications)
4. [Screen-by-Screen Design Reference](#4-screen-by-screen-design-reference)
5. [Database Schema](#5-database-schema)
6. [API Endpoints](#6-api-endpoints)
7. [Tech Stack Recommendation](#7-tech-stack-recommendation)
8. [Payment Integrations](#8-payment-integrations)
9. [Security & Compliance](#9-security--compliance)
10. [Development Phases](#10-development-phases)
11. [Design Assets](#11-design-assets)

---

## 1. System Roles & Permissions

The system uses role-based access control (RBAC). Each role sees only the tabs and features relevant to their job. Users authenticate with a numeric PIN on a touchscreen numpad — no usernames required. The admin creates accounts in the backend with a default PIN (0000), and staff change it on first login.

### Role Matrix

| Role | Tabs Visible | Can Take Orders | Can Settle Bills | Can Void Bills | Sees Cash Drawer | Sees Dashboard | Gets Notifications |
|------|-------------|----------------|-----------------|---------------|-----------------|---------------|-------------------|
| **Admin** | All tabs | Yes | Yes | Yes | Yes | Yes (full analytics + download) | Yes |
| **Manager** | Dashboard, Tables, Kitchen, Bar, Cashier, Rooms | Yes | Yes | Yes | No | Yes | Yes |
| **Receptionist** | Rooms, Facilities | No | No | No | No | No | No |
| **Cashier** | Bills only | No | Yes | No | Yes (shift start/end) | No | No |
| **Waiter** | Tables, My Bills | Yes | No | No | No | No | Yes (order ready alerts) |
| **Kitchen Staff** | Kitchen Display only | No | No | No | No | No | No |
| **Bar Staff** | Bar Display only | No | No | No | No | No | No |

### Key Role Rules

- **Waiters auto-logout** after placing an order. Their shift stays active so they log back in with their PIN for the next order. This ensures every order is tied to a specific waiter for accountability.
- **Cashiers and Admins stay logged in** after placing orders (if they have order permission) since they have ongoing duties.
- **All users** can Logout (shift stays active) or End Shift (closes shift with summary) independently.
- **Void bill** is restricted to Admin and Manager roles only. Voiding requires a reason and is logged with who voided it and when.

---

## 2. Core Workflows

### 2.1 Authentication Flow

```
Touchscreen PIN Entry (4-6 digits)
  ├── PIN matches active user → Check for existing shift
  │   ├── Shift exists → Go to main screen (role-appropriate tab)
  │   └── No shift → Start Shift screen
  │       ├── Cashier → Enter opening cash float → Start
  │       └── Others → Confirm → Start
  ├── PIN invalid → Shake animation + error
  └── Forgot PIN → Enter registered phone → Reset PIN
```

**Forgot PIN Flow:** User taps "Forgot?" → enters their registered phone number → system looks up the account → user sets a new 4-6 digit PIN → redirected to login.

### 2.2 Order Flow (Waiter)

```
Waiter logs in (PIN)
  → Sees Floor Plan (Tables tab)
  → Taps available table → Enter guest count → Start Order
  → Menu screen: browse categories / search → tap items to add
  → Review order (items split into Kitchen/Bar sections)
  → Remove item? → Void modal with reason (logged)
  → Place Order
      ├── Food items → Kitchen Display System (KDS)
      ├── Drink items → Bar Display System
      ├── Client receipt generated
      └── Cashier copy generated
  → Auto-logout confirmation → Back to login screen
  → Shift remains active
```

### 2.3 Add to Bill Flow

```
Waiter logs in → Sees occupied table with existing order
  → Taps table → "Add to Bill" mode
  → Sees banner: "Current bill: X items · KSh Y"
  → Adds new items from menu
  → Place Order → New items merge into existing order
  → New items dispatched to Kitchen/Bar (tagged as "+ADD")
  → Auto-logout
```

### 2.4 Kitchen/Bar Display Flow

```
Order arrives (status: NEW, yellow border, pulsing)
  → Kitchen/Bar staff taps "🔥 Start All Items"
  → Items move to COOKING status (orange)
  → Staff marks items done individually OR taps "✅ Mark All Done"
  → All items ready → Big green button appears:
      "🔔 NOTIFY WAITER — ORDER READY"
  → Tapping sends notification to the waiter
  → Order moves to COMPLETED status
```

### 2.5 Bill Settlement Flow (Cashier)

```
Cashier sees open bills with table, order number, items, total
  → Taps "Settle"
  → Payment modal opens with 3 modes:
      ├── Full Payment → Select method (M-Pesa / Cash / Card / Room Charge)
      │   ├── M-Pesa → Enter phone → STK Push
      │   └── Cash/Card → Confirm
      ├── Split Equally → Choose number of people → Each pays via any method
      └── Custom Split → Enter custom amounts per person with different methods
  → Payment complete → eTIMS invoice generated → Receipt options (Print / SMS)
  → Table freed → Status returns to "Available"
```

### 2.6 Void Bill Flow (Manager/Admin Only)

```
Manager/Admin sees "Void" button on open bills
  → Taps Void → Modal requires reason:
      - Customer complaint
      - Duplicate order
      - System error
      - Manager override
      - Other
  → Void confirmed → Bill marked as voided (logged with who + why + when)
  → Table freed
```

### 2.7 Room Management Flow (Receptionist)

```
Check In:
  Available room → Tap "Check In" → Enter guest name, phone, ID/passport, nights
  → System calculates total (rate × nights) → Creates room folio
  → Room status → Occupied

Check Out:
  Occupied room → Tap "Check Out" → Review folio charges → Settle
  → Room status → Cleaning

Status Transitions:
  Available → Occupied (check in)
  Occupied → Checking Out → Cleaning (check out)
  Cleaning → Available (housekeeping marks clean)
  Available → Reserved (booking)
  Reserved → Occupied (check in)
  Any → Maintenance (issue reported)
  Maintenance → Available (fixed)
```

### 2.8 Notification Flow

```
Kitchen/Bar marks order ready → Taps "🔔 Notify Waiter"
  → Notification created with:
      - Type: "ready"
      - Order number and table
      - Waiter name (for filtering)
      - Timestamp
  → Waiter logs in → Sees 🔔 bell icon with red badge count
  → Taps bell → Slide-out panel shows all notifications
  → Picks up order and delivers to table
```

### 2.9 Shift Management

```
Start Shift:
  → All roles: Confirm start time
  → Cashier only: Enter opening cash float amount

End Shift:
  → Shows summary: Duration, total orders, total sales, voided items count
  → Cashier only: Enter closing cash count (system shows variance)
  → Signs out and closes shift

Logout (without ending shift):
  → User signs out but shift remains active
  → Can log back in and resume
```

---

## 3. Feature Specifications

### 3.1 Touchscreen PIN Login
- Large numpad buttons (58px height) optimized for touch
- 4-6 digit PIN support
- Auto-login when PIN matches (no submit button needed)
- Shake animation on wrong PIN
- Shows active shifts at bottom
- "Forgot?" button for PIN reset via registered phone
- No usernames — PIN-only authentication

### 3.2 Floor Plan / Table Management
- Visual grid of all tables with color-coded status: Green (available), Blue (occupied)
- Zone filtering: All, Indoor, Outdoor, Bar
- Each table shows: name, seat count, zone, current order number and total (if occupied)
- Tap available table → seat guests; tap occupied table → add to bill

### 3.3 Menu & Order Entry
- Categories: Starters, Mains, Sides, Drinks, Hot Drinks, Desserts
- Search bar for quick item lookup
- Each item shows: name, price, destination badge (Kitchen/Bar)
- Cart badge on items already added
- Order summary panel: items grouped by Kitchen/Bar destination
- Quantity controls (+/-) and void button (✕) on each item
- Running total with "Place Order" button

### 3.4 Kitchen Display System (KDS)
- Grid of active orders with color-coded borders: Yellow (NEW), Orange (COOKING), Green (READY)
- Elapsed time counter per order with urgent flag (>15 min turns red)
- Per-item status tracking: Pending → Cooking → Ready
- Action buttons: "Start All Items" → "Mark All Done" → "Notify Waiter"
- Order auto-removes from display once completed

### 3.5 Bar Display System
- Same as KDS but shows only drink/beverage orders
- Identical workflow: Start → Done → Notify Waiter

### 3.6 Bill Settlement (Cashier)
- Three payment modes: Full, Split Equally, Custom Split
- Four payment methods: M-Pesa (STK Push), Cash, Card, Room Charge
- Split equally: select number of people, each pays independently via any method
- Custom split: enter any amount per payment with different methods, tracks remaining balance
- eTIMS invoice auto-generated on settlement with KRA reference number
- Receipt options: Print thermal, SMS to customer

### 3.7 Void Bill
- Only visible to Admin and Manager roles
- Requires reason selection: Customer complaint, Duplicate order, System error, Manager override, Other
- Logged with: who voided, reason, timestamp
- Voided bills appear in waiter's "My Bills" with void details

### 3.8 Waiter Notifications
- Bell icon (🔔) in header with red badge showing unread count
- Notifications created when kitchen/bar taps "Notify Waiter"
- Slide-out panel on the right showing all notifications
- Each notification shows: order number, table, ready status, timestamp
- Notifications filtered per waiter (each waiter only sees their own)
- "Clear all" button to dismiss

### 3.9 My Bills (Waiter Bill Recall)
- Tab showing all bills placed by the logged-in waiter during their shift
- Summary cards: Active, Settled, Voided counts
- Each bill shows: order number, table, guest count, time, items, total, status
- Voided bills show void reason and who voided

### 3.10 Room Management (PMS)
- 6 room statuses: Available, Occupied, Reserved, Cleaning, Maintenance, Checking Out
- Room types: Standard, Deluxe, Suite, Presidential (each with nightly rate)
- Check-in form: guest name, phone, ID/passport, number of nights
- Auto-calculates total (rate × nights) and creates folio
- Guest folio tracking: room charges + restaurant/bar/spa charges
- Check-out: settle folio → room moves to cleaning status
- Status filter bar for quick view by room status
- Floor and room type displayed per room

### 3.11 Facilities Management
- Facilities: Swimming Pool, Gym, Conference Rooms, Spa, Kids Play Area
- Each shows: capacity bar, current usage, rate, operating hours, status (Open/Booked)
- Booking capability (ready for development)

### 3.12 Stock & Inventory
- Item list with: name, category, unit, current quantity, reorder level, cost price
- Low stock alerts (items at or below reorder level) highlighted in red
- Alert banner at top listing all low-stock items
- Add item and import/export functionality (ready for development)

### 3.13 Analytics Dashboard (Admin/Manager)
- 8 KPI cards: Total Revenue, Room Revenue, Food Revenue, Bar Revenue, Occupancy Rate, Orders Today, Average Order Value, Low Stock Count
- Revenue chart: hourly bar chart showing revenue accumulation through the day
- Revenue breakdown: visual progress bars showing Rooms vs Food vs Drinks with percentages
- Room status overview: visual count by status with occupancy rate gauge
- Top 5 food items: ranked by order count with bar charts
- Top 5 drinks: ranked by order count with bar charts
- Facilities status overview
- Download Report button: exports daily summary as text file

### 3.14 User Management (Admin)
- Add new users: name, phone, role selection
- Default PIN: 0000 (user changes on first login)
- Role assignment with visual permission preview
- Enable/Disable user accounts
- User list with role badges and status

---

## 4. Screen-by-Screen Design Reference

The interactive prototype is in `hotel-pos-final.jsx`. Below is the screen inventory.

| # | Screen | Access | Purpose |
|---|--------|--------|---------|
| 1 | PIN Login | All | Touchscreen numpad, auto-detect user by PIN |
| 2 | Forgot PIN | All | Phone number lookup → PIN reset |
| 3 | Start Shift | Waiter, Cashier, Receptionist, Manager, Admin | Begin shift, cashier enters float |
| 4 | Floor Plan | Waiter, Admin, Manager | Table grid, seat guests, add to bill |
| 5 | Guest Count | Waiter, Admin, Manager | Select number of guests for table |
| 6 | Order Entry | Waiter, Admin, Manager | Menu categories, search, build order |
| 7 | Void Item Modal | Waiter, Admin, Manager | Remove item with reason |
| 8 | Auto-Logout | Waiter only | Confirmation that order was placed |
| 9 | Kitchen Display | Kitchen, Admin, Manager | Food order queue with status tracking |
| 10 | Bar Display | Bar, Admin, Manager | Drink order queue with status tracking |
| 11 | Bills (Cashier) | Cashier, Admin, Manager | Open bills list, settle or void |
| 12 | Payment Modal | Cashier, Admin, Manager | Full/Split/Custom payment with methods |
| 13 | Void Bill Modal | Admin, Manager only | Void entire bill with reason |
| 14 | My Bills | Waiter | Recall past orders with status |
| 15 | Rooms | Receptionist, Admin, Manager | Room grid, check-in/out, status |
| 16 | Check-In Form | Receptionist, Admin | Guest details, nights, rate calc |
| 17 | Facilities | Receptionist, Admin | Pool, gym, conference, spa management |
| 18 | Stock | Admin | Inventory list with low stock alerts |
| 19 | Dashboard | Admin, Manager | Analytics, charts, KPIs, download |
| 20 | User Management | Admin | Add/edit/disable users, assign roles |
| 21 | Notification Panel | Waiter, Admin, Manager | Slide-out panel with ready order alerts |
| 22 | End Shift | All | Shift summary, cashier closing count |

---

## 5. Database Schema

### Core Tables

```
users
  id              UUID PRIMARY KEY
  name            VARCHAR(100) NOT NULL
  phone           VARCHAR(15) UNIQUE NOT NULL
  pin_hash        VARCHAR(255) NOT NULL    -- bcrypt hashed
  role            ENUM('admin','manager','receptionist','cashier','waiter','kitchen','bar')
  is_active       BOOLEAN DEFAULT true
  must_change_pin BOOLEAN DEFAULT true
  created_at      TIMESTAMP
  updated_at      TIMESTAMP

shifts
  id              UUID PRIMARY KEY
  user_id         UUID REFERENCES users(id)
  start_time      TIMESTAMP NOT NULL
  end_time        TIMESTAMP
  opening_float   DECIMAL(10,2) DEFAULT 0
  closing_cash    DECIMAL(10,2)
  status          ENUM('active','ended')
  notes           TEXT
  created_at      TIMESTAMP

tables
  id              UUID PRIMARY KEY
  name            VARCHAR(50) NOT NULL
  seats           INTEGER NOT NULL
  zone            ENUM('indoor','outdoor','bar','vip')
  status          ENUM('available','occupied','reserved')
  current_order_id UUID REFERENCES orders(id)
  position_x      INTEGER    -- for floor plan layout
  position_y      INTEGER

orders
  id              UUID PRIMARY KEY
  order_no        VARCHAR(20) UNIQUE NOT NULL   -- e.g. ORD-0001
  table_id        UUID REFERENCES tables(id)
  waiter_id       UUID REFERENCES users(id)
  guest_count     INTEGER NOT NULL
  subtotal        DECIMAL(10,2)
  service_charge  DECIMAL(10,2) DEFAULT 0
  total           DECIMAL(10,2)
  status          ENUM('active','settled','voided')
  voided_by       UUID REFERENCES users(id)
  void_reason     TEXT
  voided_at       TIMESTAMP
  settled_at      TIMESTAMP
  shift_id        UUID REFERENCES shifts(id)
  created_at      TIMESTAMP

order_items
  id              UUID PRIMARY KEY
  order_id        UUID REFERENCES orders(id)
  menu_item_id    UUID REFERENCES menu_items(id)
  quantity        INTEGER NOT NULL
  unit_price      DECIMAL(10,2) NOT NULL
  total_price     DECIMAL(10,2) NOT NULL
  destination     ENUM('kitchen','bar')
  status          ENUM('pending','cooking','ready','served')
  added_by        UUID REFERENCES users(id)    -- tracks who added each item
  added_at        TIMESTAMP
  is_voided       BOOLEAN DEFAULT false
  void_reason     TEXT
  voided_by       UUID REFERENCES users(id)
  voided_at       TIMESTAMP

voided_items_log
  id              UUID PRIMARY KEY
  order_id        UUID REFERENCES orders(id)
  menu_item_id    UUID REFERENCES menu_items(id)
  quantity        INTEGER
  unit_price      DECIMAL(10,2)
  reason          VARCHAR(255) NOT NULL
  voided_by       UUID REFERENCES users(id)
  voided_at       TIMESTAMP

kitchen_queue
  id              UUID PRIMARY KEY
  order_id        UUID REFERENCES orders(id)
  order_no        VARCHAR(20)
  table_name      VARCHAR(50)
  waiter_id       UUID REFERENCES users(id)
  status          ENUM('new','cooking','ready','completed')
  is_addition     BOOLEAN DEFAULT false
  placed_at       TIMESTAMP
  completed_at    TIMESTAMP

kitchen_queue_items
  id              UUID PRIMARY KEY
  queue_id        UUID REFERENCES kitchen_queue(id)
  menu_item_id    UUID REFERENCES menu_items(id)
  quantity        INTEGER
  item_status     ENUM('pending','cooking','ready')

-- Same structure for bar_queue and bar_queue_items

payments
  id              UUID PRIMARY KEY
  order_id        UUID REFERENCES orders(id)
  amount          DECIMAL(10,2) NOT NULL
  method          ENUM('mpesa','cash','card','room_charge')
  reference       VARCHAR(100)   -- M-Pesa transaction code, card auth, etc.
  room_id         UUID REFERENCES rooms(id)  -- if room charge
  phone_number    VARCHAR(15)    -- for M-Pesa
  etims_ref       VARCHAR(50)    -- KRA eTIMS invoice reference
  processed_by    UUID REFERENCES users(id)
  created_at      TIMESTAMP

notifications
  id              UUID PRIMARY KEY
  type            ENUM('order_ready','general','alert')
  title           VARCHAR(100)
  message         TEXT
  waiter_id       UUID REFERENCES users(id)   -- target recipient
  source          ENUM('kitchen','bar','system')
  order_id        UUID REFERENCES orders(id)
  is_read         BOOLEAN DEFAULT false
  created_at      TIMESTAMP
```

### Menu & Inventory Tables

```
menu_categories
  id              UUID PRIMARY KEY
  name            VARCHAR(50) NOT NULL    -- Starters, Mains, Sides, etc.
  sort_order      INTEGER
  is_active       BOOLEAN DEFAULT true

menu_items
  id              UUID PRIMARY KEY
  name            VARCHAR(100) NOT NULL
  price           DECIMAL(10,2) NOT NULL
  cost_price      DECIMAL(10,2)
  destination     ENUM('kitchen','bar')
  category_id     UUID REFERENCES menu_categories(id)
  is_active       BOOLEAN DEFAULT true
  image_url       VARCHAR(255)
  prep_time_mins  INTEGER
  created_at      TIMESTAMP

menus
  id              UUID PRIMARY KEY
  name            VARCHAR(50) NOT NULL    -- Breakfast, Lunch, Dinner, Room Service, Bar
  active_hours    VARCHAR(20)             -- e.g. "06:00-10:30"
  is_active       BOOLEAN DEFAULT true

menu_menu_items   -- many-to-many
  menu_id         UUID REFERENCES menus(id)
  menu_item_id    UUID REFERENCES menu_items(id)

stock_items
  id              UUID PRIMARY KEY
  name            VARCHAR(100) NOT NULL
  category        VARCHAR(50)
  unit            VARCHAR(20)    -- Bottle, Kg, Litre, Piece
  quantity         DECIMAL(10,2) NOT NULL
  reorder_level   DECIMAL(10,2) NOT NULL
  cost_price      DECIMAL(10,2)
  supplier        VARCHAR(100)
  last_restocked  TIMESTAMP
  created_at      TIMESTAMP

stock_movements
  id              UUID PRIMARY KEY
  stock_item_id   UUID REFERENCES stock_items(id)
  type            ENUM('purchase','usage','adjustment','waste')
  quantity        DECIMAL(10,2)
  reference       VARCHAR(100)   -- PO number, order number, etc.
  notes           TEXT
  recorded_by     UUID REFERENCES users(id)
  created_at      TIMESTAMP
```

### Hotel / PMS Tables

```
room_types
  id              UUID PRIMARY KEY
  name            VARCHAR(50)    -- Standard, Deluxe, Suite, Presidential
  base_rate       DECIMAL(10,2)
  max_occupancy   INTEGER
  amenities       TEXT

rooms
  id              UUID PRIMARY KEY
  room_number     VARCHAR(10) NOT NULL
  room_type_id    UUID REFERENCES room_types(id)
  floor           INTEGER
  status          ENUM('available','occupied','reserved','cleaning','maintenance','checkout')
  created_at      TIMESTAMP

guests
  id              UUID PRIMARY KEY
  name            VARCHAR(100) NOT NULL
  phone           VARCHAR(15)
  id_document     VARCHAR(50)    -- ID number or passport
  email           VARCHAR(100)
  nationality     VARCHAR(50)
  created_at      TIMESTAMP

reservations
  id              UUID PRIMARY KEY
  room_id         UUID REFERENCES rooms(id)
  guest_id        UUID REFERENCES guests(id)
  check_in_date   DATE NOT NULL
  check_out_date  DATE NOT NULL
  nights          INTEGER
  rate_per_night  DECIMAL(10,2)
  total_amount    DECIMAL(10,2)
  status          ENUM('confirmed','checked_in','checked_out','cancelled','no_show')
  checked_in_by   UUID REFERENCES users(id)
  checked_out_by  UUID REFERENCES users(id)
  created_at      TIMESTAMP

room_folio
  id              UUID PRIMARY KEY
  reservation_id  UUID REFERENCES reservations(id)
  description     VARCHAR(200) NOT NULL
  amount          DECIMAL(10,2) NOT NULL
  category        ENUM('room','restaurant','bar','spa','laundry','minibar','other')
  order_id        UUID REFERENCES orders(id)   -- if linked to a restaurant/bar order
  posted_by       UUID REFERENCES users(id)
  created_at      TIMESTAMP

facilities
  id              UUID PRIMARY KEY
  name            VARCHAR(100) NOT NULL
  icon            VARCHAR(10)
  capacity        INTEGER
  rate_per_session DECIMAL(10,2)
  operating_hours VARCHAR(20)
  status          ENUM('open','closed','booked','maintenance')

facility_bookings
  id              UUID PRIMARY KEY
  facility_id     UUID REFERENCES facilities(id)
  guest_id        UUID REFERENCES guests(id)
  reservation_id  UUID REFERENCES reservations(id)
  booking_date    DATE
  start_time      TIME
  end_time        TIME
  notes           TEXT
  created_at      TIMESTAMP
```

### Audit & Analytics

```
audit_log
  id              UUID PRIMARY KEY
  user_id         UUID REFERENCES users(id)
  action          VARCHAR(50)    -- login, logout, order_placed, item_voided, bill_settled, bill_voided, etc.
  entity_type     VARCHAR(50)    -- order, payment, room, user, etc.
  entity_id       UUID
  details         JSONB          -- flexible payload for action-specific data
  ip_address      VARCHAR(45)
  created_at      TIMESTAMP

daily_summary
  id              UUID PRIMARY KEY
  date            DATE UNIQUE NOT NULL
  total_orders    INTEGER
  total_revenue   DECIMAL(12,2)
  food_revenue    DECIMAL(12,2)
  bar_revenue     DECIMAL(12,2)
  room_revenue    DECIMAL(12,2)
  voided_count    INTEGER
  voided_amount   DECIMAL(12,2)
  occupancy_rate  DECIMAL(5,2)
  avg_order_value DECIMAL(10,2)
  top_food_items  JSONB
  top_drink_items JSONB
  generated_at    TIMESTAMP
```

---

## 6. API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Authenticate with PIN, return JWT token |
| POST | `/api/auth/forgot-pin` | Lookup user by phone number |
| POST | `/api/auth/reset-pin` | Set new PIN (requires phone verification) |
| POST | `/api/auth/change-pin` | Change PIN (requires current PIN) |

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List all users (admin only) |
| POST | `/api/users` | Create user with default PIN (admin) |
| PATCH | `/api/users/:id` | Update user details |
| PATCH | `/api/users/:id/toggle` | Enable/disable user |
| POST | `/api/users/:id/reset-pin` | Reset to default PIN (admin) |

### Shifts

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/shifts/start` | Start shift with optional float |
| PATCH | `/api/shifts/:id/end` | End shift with closing cash |
| GET | `/api/shifts/active` | Get all active shifts |
| GET | `/api/shifts/:id/summary` | Shift summary with stats |

### Tables

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tables` | List all tables with status |
| PATCH | `/api/tables/:id/status` | Update table status |

### Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/orders` | Create new order (auto-dispatches to kitchen/bar queues) |
| GET | `/api/orders` | List orders (filterable by waiter, status, date) |
| GET | `/api/orders/:id` | Get order details |
| POST | `/api/orders/:id/add-items` | Add items to existing order |
| POST | `/api/orders/:id/void-item` | Void a single item (requires reason) |
| POST | `/api/orders/:id/void` | Void entire order (manager/admin, requires reason) |
| POST | `/api/orders/:id/settle` | Settle order with payment(s) |
| GET | `/api/orders/my-bills` | Get orders for current waiter in current shift |

### Kitchen / Bar Queue

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/kitchen/queue` | Active kitchen orders |
| GET | `/api/bar/queue` | Active bar orders |
| PATCH | `/api/kitchen/queue/:id/items/:itemIdx` | Update item status (cooking/ready) |
| PATCH | `/api/bar/queue/:id/items/:itemIdx` | Update item status |
| POST | `/api/kitchen/queue/:id/complete` | Mark order complete + notify waiter |
| POST | `/api/bar/queue/:id/complete` | Mark order complete + notify waiter |
| POST | `/api/kitchen/queue/:id/start-all` | Start all items |
| POST | `/api/kitchen/queue/:id/done-all` | Mark all items done |

### Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | Get notifications for current user |
| PATCH | `/api/notifications/:id/read` | Mark as read |
| DELETE | `/api/notifications` | Clear all notifications for current user |

### Payments

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payments` | Process payment (single or split) |
| POST | `/api/payments/mpesa/stk-push` | Initiate M-Pesa STK Push |
| POST | `/api/payments/mpesa/callback` | M-Pesa payment callback |
| GET | `/api/payments/mpesa/status/:checkoutId` | Check STK Push status |

### Rooms / PMS

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rooms` | List all rooms with status |
| POST | `/api/rooms/:id/check-in` | Check in guest |
| POST | `/api/rooms/:id/check-out` | Check out guest |
| PATCH | `/api/rooms/:id/status` | Update room status |
| GET | `/api/rooms/:id/folio` | Get room folio charges |
| POST | `/api/rooms/:id/folio` | Post charge to room folio |

### Facilities

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/facilities` | List all facilities |
| POST | `/api/facilities/:id/book` | Book a facility |

### Menu

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/menu/items` | List all menu items |
| POST | `/api/menu/items` | Add menu item (admin) |
| PATCH | `/api/menu/items/:id` | Update item (price, availability) |
| GET | `/api/menu/categories` | List categories |
| GET | `/api/menus` | List menus (Breakfast, Lunch, etc.) |

### Stock

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stock` | List all stock items |
| POST | `/api/stock` | Add stock item |
| PATCH | `/api/stock/:id` | Update stock quantity |
| GET | `/api/stock/alerts` | Low stock items |

### Analytics / Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/dashboard` | Dashboard KPIs and summary |
| GET | `/api/analytics/revenue?period=today` | Revenue breakdown |
| GET | `/api/analytics/top-items?type=food&limit=5` | Top selling items |
| GET | `/api/analytics/occupancy` | Room occupancy data |
| GET | `/api/analytics/hourly-revenue` | Hourly revenue chart data |
| GET | `/api/reports/daily?date=YYYY-MM-DD` | Full daily report |
| GET | `/api/reports/download?format=pdf&date=YYYY-MM-DD` | Download report |

---

## 7. Tech Stack Recommendation

### Frontend — POS Terminal (Touchscreen)
- **Framework:** React Native (Android tablets) or Flutter
- **Offline storage:** SQLite / WatermelonDB
- **Sync engine:** Custom sync with conflict resolution
- **State management:** Zustand or Redux Toolkit
- **UI:** Custom component library with large touch targets (min 44px)

### Frontend — Admin Dashboard (Web)
- **Framework:** Next.js 14+ with App Router
- **Styling:** Tailwind CSS
- **Charts:** Recharts or Chart.js
- **Tables:** TanStack Table
- **PDF generation:** jsPDF or Puppeteer (server-side)

### Backend
- **Runtime:** Node.js with Express or Fastify
- **Language:** TypeScript
- **ORM:** Prisma or Drizzle
- **Auth:** JWT with bcrypt PIN hashing
- **Real-time:** Socket.IO or WebSockets (for KDS notifications)
- **Queue:** Bull (for M-Pesa callbacks, email/SMS)

### Database
- **Primary:** PostgreSQL
- **Cache:** Redis (sessions, real-time data)
- **On-device:** SQLite (offline mode)

### Infrastructure
- **Hosting:** DigitalOcean / Hetzner / AWS
- **Containers:** Docker + Docker Compose
- **CI/CD:** GitHub Actions
- **SSL:** Let's Encrypt
- **Monitoring:** Sentry (errors), Grafana (metrics)
- **Backups:** Automated daily PostgreSQL dumps

---

## 8. Payment Integrations

### M-Pesa (Daraja API)
- **STK Push:** Customer enters phone → receives push notification → enters PIN → confirms
- **C2B:** Customer pays to Paybill/Till → callback confirms
- **Required:** Safaricom Daraja developer account, OAuth credentials, shortcode
- **Callback URL:** `/api/payments/mpesa/callback`

### Card Payments
- **Provider:** Pesapal or Flutterwave
- **Integration:** Redirect or embedded terminal
- **Cards:** Visa, Mastercard

### KRA eTIMS
- **Mode:** OSCU (online) with VSCU fallback (offline queue)
- **Flow:** Every settled bill → generate eTIMS invoice → transmit to KRA → store reference
- **Compliance:** "No eTIMS, No Expense" rule (effective Jan 2026)

### Room Charge
- **Flow:** Select "Room" as payment method → enter room number → amount posts to guest folio → settled on check-out

---

## 9. Security & Compliance

### Authentication
- PINs hashed with bcrypt (never stored in plain text)
- JWT tokens with short expiry (15 min) + refresh tokens
- Auto-logout for waiters after order placement
- Rate limiting on PIN attempts (lock after 5 failures for 5 minutes)

### Authorization
- Role-based middleware on all API endpoints
- Void operations restricted to admin/manager roles
- Audit trail for all sensitive operations

### Data Protection
- All communications over HTTPS/TLS
- Database encryption at rest
- PII (guest data) access logged
- Regular automated backups
- GDPR-aligned data retention policies

### Audit Trail
- Every action logged: who, what, when, from where
- Void operations: extra detail with reason and approver
- Financial transactions: immutable log
- Login/logout events tracked

---

## 10. Development Phases

### Phase 1: Core POS (Weeks 1-6)
- PIN authentication system
- Table management
- Order entry with menu
- Kitchen & Bar display systems
- Waiter notifications
- Basic bill settlement (cash only)
- Shift management
- User management (admin)

### Phase 2: Payments & Compliance (Weeks 7-10)
- M-Pesa STK Push integration
- Card payment integration
- Split billing (equal + custom)
- KRA eTIMS integration
- Receipt printing (thermal)
- SMS receipts

### Phase 3: Hotel / PMS (Weeks 11-14)
- Room management with full status lifecycle
- Check-in / check-out flows
- Guest folio management
- Room charge payment method
- Facility management & bookings

### Phase 4: Analytics & Polish (Weeks 15-18)
- Dashboard with KPIs and charts
- Revenue breakdown analytics
- Top items tracking
- Report generation & download (PDF)
- Stock & inventory management
- Low stock alerts

### Phase 5: Offline & Scale (Weeks 19-22)
- Offline mode with local SQLite
- Sync engine with conflict resolution
- Multi-branch support
- Mobile owner app
- Performance optimization
- Load testing

---

## 11. Design Assets

### Brand Colors
- **Primary Purple:** `#6B2D8B`
- **Purple Light:** `#8B4DAB`
- **Purple Pale:** `#F3ECF8`
- **Background:** `#F8F7FA`
- **Text:** `#1A1A1A`
- **Border:** `#E8E5ED`

### Status Colors
- **Green (success/available):** `#10B981`
- **Blue (occupied/info):** `#3B82F6`
- **Orange (cooking/warning):** `#F59E0B`
- **Red (error/urgent):** `#EF4444`
- **Yellow (new):** `#EAB308`
- **Teal (receptionist):** `#14B8A6`
- **Indigo (manager):** `#6366F1`

### Typography
- **Headings:** Outfit (800 weight)
- **Body:** DM Sans (400/500/600/700)
- **Monospace:** JetBrains Mono (for PINs, times, amounts)

### Interactive Prototype
- **File:** `hotel-pos-final.jsx` (React component)
- **Run:** Import into any React environment or render in Claude Artifacts
- **Demo PINs:** 0000 (Admin), 1234/5678/4321 (Waiters), 1111 (Cashier), 2222 (Kitchen), 3333 (Bar), 4444 (Reception), 9999 (Manager)

---

*Document prepared by Codevertex Africa Limited — May 2026*
*Interactive prototype designed with Claude AI*
