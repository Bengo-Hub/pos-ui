/**
 * Codevertex POS permission constants.
 * Format: pos.{module}.{action}
 * Mirrors pos-api seed: cmd/seed/main.go seedRBACPermissions
 */

// ── Modules ───────────────────────────────────────────────────────────────────

export const MODULES = [
  'orders', 'payments', 'catalog', 'outlets', 'devices',
  'sessions', 'cash_drawers', 'tables', 'gift_cards',
  'price_books', 'modifiers', 'channels', 'config', 'users',
  'reports', 'hotel', 'appointments', 'pharmacy',
  'kds', 'commissions', 'queue', 'loyalty', 'staff',
] as const;

export const ACTIONS = [
  'add', 'view', 'view_own', 'change', 'change_own',
  'delete', 'delete_own', 'manage', 'manage_own', 'void',
] as const;

// ── Permission constants ───────────────────────────────────────────────────────

export const P = {
  // Orders
  ORDERS_ADD:        'pos.orders.add',
  ORDERS_VIEW:       'pos.orders.view',
  ORDERS_VIEW_OWN:   'pos.orders.view_own',
  ORDERS_CHANGE:     'pos.orders.change',
  ORDERS_CHANGE_OWN: 'pos.orders.change_own',
  ORDERS_DELETE:     'pos.orders.delete',
  ORDERS_MANAGE:     'pos.orders.manage',
  ORDERS_VOID:       'pos.orders.void',

  // Payments
  PAYMENTS_ADD:      'pos.payments.add',
  PAYMENTS_VIEW:     'pos.payments.view',
  PAYMENTS_VIEW_OWN: 'pos.payments.view_own',
  PAYMENTS_MANAGE:   'pos.payments.manage',

  // Catalog
  CATALOG_ADD:       'pos.catalog.add',
  CATALOG_VIEW:      'pos.catalog.view',
  CATALOG_CHANGE:    'pos.catalog.change',
  CATALOG_DELETE:    'pos.catalog.delete',
  CATALOG_MANAGE:    'pos.catalog.manage',
  // Reveal supplier COST price + margin on the POS cart (manager/admin). Separate from view/manage so
  // it can be granted to e.g. an accountant without full catalog edit rights.
  CATALOG_VIEW_COST: 'pos.catalog.view_cost',

  // Tables
  TABLES_VIEW:       'pos.tables.view',
  TABLES_CHANGE:     'pos.tables.change',
  TABLES_CHANGE_OWN: 'pos.tables.change_own',
  TABLES_MANAGE:     'pos.tables.manage',

  // Cash drawers
  DRAWERS_ADD:       'pos.cash_drawers.add',
  DRAWERS_VIEW:      'pos.cash_drawers.view',
  DRAWERS_VIEW_OWN:  'pos.cash_drawers.view_own',
  DRAWERS_CHANGE_OWN:'pos.cash_drawers.change_own',
  DRAWERS_MANAGE:    'pos.cash_drawers.manage',

  // Sessions / shifts
  SESSIONS_ADD:      'pos.sessions.add',
  SESSIONS_VIEW:     'pos.sessions.view',
  SESSIONS_VIEW_OWN: 'pos.sessions.view_own',
  SESSIONS_MANAGE:   'pos.sessions.manage',

  // Users
  USERS_VIEW:        'pos.users.view',
  USERS_CHANGE:      'pos.users.change',
  USERS_MANAGE:      'pos.users.manage',

  // Devices
  DEVICES_VIEW:      'pos.devices.view',
  DEVICES_MANAGE:    'pos.devices.manage',

  // Config / settings
  CONFIG_VIEW:       'pos.config.view',
  CONFIG_CHANGE:     'pos.config.change',
  CONFIG_MANAGE:     'pos.config.manage',

  // Reports
  REPORTS_VIEW:      'pos.reports.view',
  REPORTS_MANAGE:    'pos.reports.manage',

  // Hotel
  HOTEL_VIEW:        'pos.hotel.view',
  HOTEL_CHANGE:      'pos.hotel.change',
  HOTEL_MANAGE:      'pos.hotel.manage',

  // Conference / events (BEO) + delegate meal cards
  CONFERENCE_VIEW:   'pos.conference.view',
  CONFERENCE_ADD:    'pos.conference.add',
  CONFERENCE_CHANGE: 'pos.conference.change',
  CONFERENCE_MANAGE: 'pos.conference.manage',

  // Promotions / happy hour
  PROMOTIONS_VIEW:   'pos.promotions.view',
  PROMOTIONS_ADD:    'pos.promotions.add',
  PROMOTIONS_CHANGE: 'pos.promotions.change',
  PROMOTIONS_MANAGE: 'pos.promotions.manage',

  // Appointments
  APPOINTMENTS_ADD:    'pos.appointments.add',
  APPOINTMENTS_VIEW:   'pos.appointments.view',
  APPOINTMENTS_CHANGE: 'pos.appointments.change',
  APPOINTMENTS_MANAGE: 'pos.appointments.manage',

  // Pharmacy
  PHARMACY_VIEW:     'pos.pharmacy.view',
  PHARMACY_CHANGE:   'pos.pharmacy.change',
  PHARMACY_ADD:      'pos.pharmacy.add',
  PHARMACY_MANAGE:   'pos.pharmacy.manage',

  // KDS (Kitchen Display System) — kitchen/bar staff only
  KDS_VIEW:          'pos.kds.view',
  KDS_CHANGE:        'pos.kds.change',
  KDS_MANAGE:        'pos.kds.manage',

  // Commissions — manager+ only
  COMMISSIONS_VIEW:      'pos.commissions.view',
  COMMISSIONS_VIEW_OWN:  'pos.commissions.view_own',
  COMMISSIONS_MANAGE:    'pos.commissions.manage',

  // Walk-in / service queue — front-desk and manager
  QUEUE_VIEW:        'pos.queue.view',
  QUEUE_CHANGE:      'pos.queue.change',
  QUEUE_MANAGE:      'pos.queue.manage',

  // Loyalty — manager+ only
  LOYALTY_VIEW:      'pos.loyalty.view',
  LOYALTY_ADD:       'pos.loyalty.add',
  LOYALTY_MANAGE:    'pos.loyalty.manage',

  // Staff
  STAFF_VIEW:        'pos.staff.view',
  STAFF_MANAGE:      'pos.staff.manage',

  // Outlets
  OUTLETS_VIEW:      'pos.outlets.view',
  OUTLETS_CHANGE:    'pos.outlets.change',
  OUTLETS_MANAGE:    'pos.outlets.manage',

  // Modifiers / gift cards / price books
  MODIFIERS_VIEW:    'pos.modifiers.view',
  GIFT_CARDS_VIEW:   'pos.gift_cards.view',
  PRICE_BOOKS_VIEW:  'pos.price_books.view',

  // Clients (CRM profiles, loyalty lookup)
  CLIENTS_VIEW:      'pos.clients.view',
  CLIENTS_MANAGE:    'pos.clients.manage',

  // Packages (pre-paid service bundles)
  PACKAGES_VIEW:     'pos.packages.view',
  PACKAGES_MANAGE:   'pos.packages.manage',

  // Catalog management (purchase orders, stock)
  CATALOG_MANAGE_OWN: 'pos.catalog.manage_own',
} as const;

export type Permission = typeof P[keyof typeof P];

// ── Role → permissions map (mirrors pos-api seed) ─────────────────────────────
// Used for client-side permission inference when the JWT doesn't carry permissions.

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  superuser: Object.values(P) as Permission[],
  admin:     Object.values(P) as Permission[],
  manager: [
    P.ORDERS_ADD, P.ORDERS_VIEW, P.ORDERS_CHANGE, P.ORDERS_DELETE, P.ORDERS_MANAGE, P.ORDERS_VOID,
    P.PAYMENTS_ADD, P.PAYMENTS_VIEW, P.PAYMENTS_MANAGE,
    P.CATALOG_ADD, P.CATALOG_VIEW, P.CATALOG_CHANGE, P.CATALOG_DELETE, P.CATALOG_MANAGE, P.CATALOG_VIEW_COST,
    P.TABLES_VIEW, P.TABLES_CHANGE, P.TABLES_MANAGE,
    P.DRAWERS_ADD, P.DRAWERS_VIEW, P.DRAWERS_MANAGE,
    P.SESSIONS_ADD, P.SESSIONS_VIEW, P.SESSIONS_MANAGE,
    P.STAFF_VIEW, P.STAFF_MANAGE,
    P.USERS_VIEW, P.USERS_CHANGE,
    P.DEVICES_VIEW,
    P.CONFIG_VIEW, P.CONFIG_CHANGE,
    P.REPORTS_VIEW,
    P.OUTLETS_VIEW, P.OUTLETS_CHANGE,
    P.MODIFIERS_VIEW, P.GIFT_CARDS_VIEW, P.PRICE_BOOKS_VIEW,
    P.KDS_VIEW, P.KDS_CHANGE, P.KDS_MANAGE,
    P.COMMISSIONS_VIEW, P.COMMISSIONS_MANAGE,
    P.QUEUE_VIEW, P.QUEUE_CHANGE, P.QUEUE_MANAGE,
    P.LOYALTY_VIEW, P.LOYALTY_ADD, P.LOYALTY_MANAGE,
    P.HOTEL_VIEW, P.HOTEL_CHANGE, P.HOTEL_MANAGE,
    P.CONFERENCE_VIEW, P.CONFERENCE_ADD, P.CONFERENCE_CHANGE, P.CONFERENCE_MANAGE,
    P.PROMOTIONS_VIEW, P.PROMOTIONS_ADD, P.PROMOTIONS_CHANGE, P.PROMOTIONS_MANAGE,
    P.APPOINTMENTS_ADD, P.APPOINTMENTS_VIEW, P.APPOINTMENTS_CHANGE, P.APPOINTMENTS_MANAGE,
    P.PHARMACY_ADD, P.PHARMACY_VIEW, P.PHARMACY_CHANGE, P.PHARMACY_MANAGE,
  ],
  cashier: [
    // view_own (NOT view): cashiers see only their OWN sales/drafts ("My Sales", REQ-007).
    // Server-side enforcement lives in pos-api ListOrders/GetOrder; mirrors the backend seed.
    P.ORDERS_ADD, P.ORDERS_VIEW_OWN, P.ORDERS_CHANGE_OWN,
    // Void: cashier may INITIATE a void; not a manager override role, so it still requires
    // manager approval (card / PIN / one-time code). Mirrors the backend seed.
    P.ORDERS_VOID,
    P.PAYMENTS_ADD, P.PAYMENTS_VIEW, P.PAYMENTS_VIEW_OWN,
    P.CATALOG_VIEW,
    P.DRAWERS_ADD, P.DRAWERS_VIEW_OWN, P.DRAWERS_CHANGE_OWN,
    P.TABLES_VIEW,
    P.SESSIONS_ADD, P.SESSIONS_VIEW_OWN,
    P.MODIFIERS_VIEW, P.GIFT_CARDS_VIEW,
    P.LOYALTY_VIEW, P.LOYALTY_ADD,
    P.CLIENTS_VIEW,
    // Hotel F&B: view rooms/events + redeem conference delegate meal cards at the till (mirror backend seed)
    P.HOTEL_VIEW, P.CONFERENCE_VIEW, P.CONFERENCE_CHANGE,
    P.PROMOTIONS_VIEW,
    // No KDS, queue, commissions — cashier is till-side only
  ],
  waiter: [
    // ORDERS_CHANGE (not just _own) lets waiters act on unassigned online
    // pickup/delivery orders (mark ready, collected, assign rider).
    P.ORDERS_ADD, P.ORDERS_VIEW_OWN, P.ORDERS_CHANGE, P.ORDERS_CHANGE_OWN,
    // Void: waiter may INITIATE a void; not a manager override role, so it still requires
    // manager approval (card / PIN / one-time code). Mirrors the backend seed.
    P.ORDERS_VOID,
    // Settle bills at the table — cash or mobile-money ref (e.g. M-Pesa).
    P.PAYMENTS_ADD, P.PAYMENTS_VIEW_OWN,
    P.CATALOG_VIEW,
    P.TABLES_VIEW, P.TABLES_CHANGE_OWN, P.TABLES_MANAGE,
    P.SESSIONS_ADD, P.SESSIONS_VIEW_OWN,
    // Own cash float so recorded cash reconciles at shift close.
    P.DRAWERS_ADD, P.DRAWERS_VIEW_OWN, P.DRAWERS_CHANGE_OWN,
    P.MODIFIERS_VIEW,
    P.QUEUE_VIEW, P.QUEUE_CHANGE,
    // Read-only KDS so waiters can see which tickets are ready to serve/hand off.
    P.KDS_VIEW,
    P.CLIENTS_VIEW,
    // TABLES_MANAGE enables merge, unmerge, transfer
  ],
  kitchen: [
    P.KDS_VIEW, P.KDS_CHANGE,
    P.ORDERS_VIEW,
    P.CATALOG_VIEW,
    // No orders list access — KDS is the only interface for kitchen staff
  ],
  bar: [
    P.KDS_VIEW, P.KDS_CHANGE,
    P.ORDERS_VIEW,
    P.CATALOG_VIEW,
    // No orders list access — KDS is the only interface for bar staff
  ],
  receptionist: [
    P.ORDERS_ADD, P.ORDERS_VIEW, P.ORDERS_CHANGE_OWN,
    P.CATALOG_VIEW,
    P.PAYMENTS_VIEW,
    P.TABLES_VIEW,
    P.SESSIONS_ADD, P.SESSIONS_VIEW_OWN,
    P.QUEUE_VIEW, P.QUEUE_CHANGE,
    P.CLIENTS_VIEW,
    P.HOTEL_VIEW, P.HOTEL_CHANGE, P.HOTEL_MANAGE,
    // Front-desk conference handling + active promotions + appointments (mirror backend seed)
    P.CONFERENCE_VIEW, P.CONFERENCE_ADD, P.CONFERENCE_CHANGE,
    P.PROMOTIONS_VIEW,
    P.APPOINTMENTS_VIEW, P.APPOINTMENTS_CHANGE,
  ],
  stylist: [
    P.ORDERS_ADD, P.ORDERS_VIEW_OWN,
    P.CATALOG_VIEW,
    P.SESSIONS_ADD, P.SESSIONS_VIEW_OWN,
    P.APPOINTMENTS_VIEW, P.APPOINTMENTS_CHANGE,
    P.QUEUE_VIEW, P.QUEUE_CHANGE,
    P.COMMISSIONS_VIEW_OWN,
    P.CLIENTS_VIEW,
  ],
  therapist: [
    P.ORDERS_ADD, P.ORDERS_VIEW_OWN,
    P.CATALOG_VIEW,
    P.SESSIONS_ADD, P.SESSIONS_VIEW_OWN,
    P.APPOINTMENTS_VIEW, P.APPOINTMENTS_CHANGE,
    P.QUEUE_VIEW, P.QUEUE_CHANGE,
    P.COMMISSIONS_VIEW_OWN,
    P.CLIENTS_VIEW,
  ],
  technician: [
    P.ORDERS_ADD, P.ORDERS_VIEW_OWN,
    P.CATALOG_VIEW,
    P.SESSIONS_ADD, P.SESSIONS_VIEW_OWN,
    P.APPOINTMENTS_VIEW, P.APPOINTMENTS_CHANGE,
    P.QUEUE_VIEW, P.QUEUE_CHANGE,
    P.COMMISSIONS_VIEW_OWN,
    P.CLIENTS_VIEW,
  ],
  pharmacist: [
    P.ORDERS_ADD, P.ORDERS_VIEW, P.ORDERS_CHANGE_OWN,
    P.PAYMENTS_ADD, P.PAYMENTS_VIEW,
    P.CATALOG_VIEW,
    P.SESSIONS_ADD, P.SESSIONS_VIEW_OWN,
    P.PHARMACY_ADD, P.PHARMACY_VIEW, P.PHARMACY_CHANGE, P.PHARMACY_MANAGE,
    P.CLIENTS_VIEW,
  ],
  pharmacy_technician: [
    P.ORDERS_ADD, P.ORDERS_VIEW_OWN, P.ORDERS_CHANGE_OWN,
    P.PAYMENTS_ADD, P.PAYMENTS_VIEW_OWN,
    P.CATALOG_VIEW,
    P.SESSIONS_ADD, P.SESSIONS_VIEW_OWN,
    P.PHARMACY_VIEW, P.PHARMACY_CHANGE,
  ],
  viewer: [
    P.ORDERS_VIEW, P.PAYMENTS_VIEW, P.CATALOG_VIEW,
    P.OUTLETS_VIEW, P.DEVICES_VIEW, P.SESSIONS_VIEW,
    P.DRAWERS_VIEW, P.TABLES_VIEW, P.GIFT_CARDS_VIEW,
    P.PRICE_BOOKS_VIEW, P.MODIFIERS_VIEW, P.CONFIG_VIEW,
    P.USERS_VIEW, P.REPORTS_VIEW,
    P.KDS_VIEW,
    P.QUEUE_VIEW,
    P.LOYALTY_VIEW,
    P.COMMISSIONS_VIEW,
    P.CLIENTS_VIEW, P.PACKAGES_VIEW,
    P.HOTEL_VIEW, P.APPOINTMENTS_VIEW, P.PHARMACY_VIEW,
  ],
};
