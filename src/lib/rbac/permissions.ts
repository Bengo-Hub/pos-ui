/**
 * BengoBox POS permission constants.
 * Format: pos.{module}.{action}
 * Mirrors pos-api seed: cmd/seed/main.go seedRBACPermissions
 */

// ── Modules ───────────────────────────────────────────────────────────────────

export const MODULES = [
  'orders', 'payments', 'catalog', 'outlets', 'devices',
  'sessions', 'cash_drawers', 'tables', 'gift_cards',
  'price_books', 'modifiers', 'channels', 'config', 'users',
  'reports', 'hotel', 'appointments', 'pharmacy',
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

  // Staff
  STAFF_MANAGE:      'pos.staff.manage',

  // Outlets
  OUTLETS_VIEW:      'pos.outlets.view',
  OUTLETS_CHANGE:    'pos.outlets.change',
  OUTLETS_MANAGE:    'pos.outlets.manage',

  // Modifiers / gift cards / price books
  MODIFIERS_VIEW:    'pos.modifiers.view',
  GIFT_CARDS_VIEW:   'pos.gift_cards.view',
  PRICE_BOOKS_VIEW:  'pos.price_books.view',
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
    P.CATALOG_ADD, P.CATALOG_VIEW, P.CATALOG_CHANGE, P.CATALOG_DELETE, P.CATALOG_MANAGE,
    P.TABLES_VIEW, P.TABLES_CHANGE, P.TABLES_MANAGE,
    P.DRAWERS_ADD, P.DRAWERS_VIEW, P.DRAWERS_MANAGE,
    P.SESSIONS_ADD, P.SESSIONS_VIEW, P.SESSIONS_MANAGE,
    P.STAFF_MANAGE,
    P.USERS_VIEW, P.USERS_CHANGE,
    P.DEVICES_VIEW,
    P.CONFIG_VIEW, P.CONFIG_CHANGE,
    P.REPORTS_VIEW,
    P.OUTLETS_VIEW, P.OUTLETS_CHANGE,
    P.MODIFIERS_VIEW, P.GIFT_CARDS_VIEW, P.PRICE_BOOKS_VIEW,
    P.HOTEL_VIEW, P.HOTEL_CHANGE, P.HOTEL_MANAGE,
    P.APPOINTMENTS_ADD, P.APPOINTMENTS_VIEW, P.APPOINTMENTS_CHANGE, P.APPOINTMENTS_MANAGE,
    P.PHARMACY_ADD, P.PHARMACY_VIEW, P.PHARMACY_CHANGE, P.PHARMACY_MANAGE,
  ],
  cashier: [
    P.ORDERS_ADD, P.ORDERS_VIEW, P.ORDERS_VIEW_OWN, P.ORDERS_CHANGE_OWN,
    P.PAYMENTS_ADD, P.PAYMENTS_VIEW, P.PAYMENTS_VIEW_OWN,
    P.CATALOG_VIEW,
    P.DRAWERS_ADD, P.DRAWERS_VIEW_OWN, P.DRAWERS_CHANGE_OWN,
    P.TABLES_VIEW,
    P.SESSIONS_ADD, P.SESSIONS_VIEW_OWN,
    P.MODIFIERS_VIEW, P.GIFT_CARDS_VIEW,
  ],
  waiter: [
    P.ORDERS_ADD, P.ORDERS_VIEW_OWN, P.ORDERS_CHANGE_OWN,
    P.CATALOG_VIEW,
    P.TABLES_VIEW, P.TABLES_CHANGE_OWN,
    P.SESSIONS_ADD, P.SESSIONS_VIEW_OWN,
    P.MODIFIERS_VIEW,
  ],
  kitchen: [
    P.ORDERS_VIEW,
    P.CATALOG_VIEW,
  ],
  bar: [
    P.ORDERS_VIEW,
    P.CATALOG_VIEW,
  ],
  receptionist: [
    P.ORDERS_ADD, P.ORDERS_VIEW, P.ORDERS_CHANGE_OWN,
    P.CATALOG_VIEW,
    P.PAYMENTS_VIEW,
    P.TABLES_VIEW,
    P.SESSIONS_ADD, P.SESSIONS_VIEW_OWN,
    P.HOTEL_VIEW, P.HOTEL_CHANGE, P.HOTEL_MANAGE,
  ],
  pharmacist: [
    P.ORDERS_ADD, P.ORDERS_VIEW, P.ORDERS_CHANGE_OWN,
    P.PAYMENTS_ADD, P.PAYMENTS_VIEW,
    P.CATALOG_VIEW,
    P.SESSIONS_ADD, P.SESSIONS_VIEW_OWN,
    P.PHARMACY_ADD, P.PHARMACY_VIEW, P.PHARMACY_CHANGE, P.PHARMACY_MANAGE,
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
    P.HOTEL_VIEW, P.APPOINTMENTS_VIEW, P.PHARMACY_VIEW,
  ],
};
