/**
 * Single source of truth for the POS sidebar navigation.
 *
 * Both the sidebar (which renders + gates the items) and the Modules settings tab (which lets an
 * outlet admin hide whole modules or individual items) build from `buildNavGroups()`. Keeping one
 * definition means the "hide these screens" toggles always match what actually renders.
 *
 * Each item carries a `moduleKey` (its feature area — used for use-case + hasModule gating and for
 * whole-module hide) and a unique `href` (used as the stable id for hiding a single sub-item).
 */

import {
  BarChart3, BedDouble, Calendar, ChefHat, ClipboardList, Clock, Cpu, FilePlus, FileText,
  Gift, Grid3x3, HandCoins, LayoutDashboard, Package, Percent, Pill, Plus, Presentation,
  RotateCcw, Settings, ShoppingBag, Sofa, TrendingUp, Truck, UserSquare, Users, Wallet, Wine, Wrench,
} from 'lucide-react';
import type { Permission } from '@/lib/rbac/permissions';
import { P } from '@/lib/rbac/permissions';

// Cross-service UIs we LINK to (never duplicate). Code fallback is the real safety net since
// NEXT_PUBLIC URLs are baked at build time.
const INVENTORY_URL = process.env.NEXT_PUBLIC_INVENTORY_UI_URL || 'https://inventory.codevertexitsolutions.com';
const TREASURY_URL = process.env.NEXT_PUBLIC_TREASURY_UI_URL || 'https://books.codevertexitsolutions.com';
const MARKETFLOW_URL = process.env.NEXT_PUBLIC_MARKETFLOW_UI_URL || 'https://marketflow.codevertexitsolutions.com';
const ERP_URL = process.env.NEXT_PUBLIC_ERP_UI_URL || 'https://erp.codevertexitsolutions.com';
const LOGISTICS_URL = process.env.NEXT_PUBLIC_LOGISTICS_UI_URL || 'https://logistics.codevertexitsolutions.com';

export interface NavItem {
  label: string;
  icon: React.ElementType;
  href: string;
  moduleKey: string;
  /** At least one of these permissions must be held. */
  permission?: Permission | Permission[];
  /** Subscription feature code — shows an upgrade lock badge if not in plan. */
  subFeature?: string;
  /** Human-readable plan label shown in the lock badge, e.g. "Pro". */
  subPlan?: string;
  /** Hidden for waiter role — waiter sees Tables + Shifts only. */
  waiterHidden?: boolean;
  /** Hidden for cashier in hospitality/quick_service — they work from the Orders page only. */
  cashierHospHidden?: boolean;
  /** Hidden for these normalized outlet profiles (e.g. retail back-office items hidden on hospitality). */
  hideForProfiles?: string[];
  /** Core item that must never be hidden by the outlet (e.g. Settings) — excluded from the hide UI. */
  coreLocked?: boolean;
}

export interface NavGroup {
  label: string;
  /** If true, this group starts collapsed by default (unless it has the active route). */
  defaultCollapsed?: boolean;
  items: NavItem[];
}

/** Build the full nav definition. `orgSlug` is needed only for the cross-service link hrefs. */
export function buildNavGroups(orgSlug: string): NavGroup[] {
  return [
    {
      label: 'Operations',
      items: [
        { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', moduleKey: 'dashboard', waiterHidden: true },
        { label: 'Cash Drawer', icon: Wallet, href: '/drawer', moduleKey: 'cash_drawer', permission: [P.DRAWERS_ADD, P.DRAWERS_MANAGE, P.DRAWERS_VIEW_OWN] },
        // Clients directory is CENTRALIZED on the treasury Customers page (balances, credit
        // terms, owe-me/I-owe + payment-mode filters) — the duplicate POS /clients pages were
        // removed; the terminal keeps only its inline customer picker + credit hint.
        { label: 'Clients', icon: Users, href: `${TREASURY_URL}/${orgSlug}/customers`, moduleKey: 'clients', permission: [P.CLIENTS_VIEW, P.CLIENTS_MANAGE], waiterHidden: true },
        { label: 'Shifts', icon: Clock, href: '/shifts', moduleKey: 'shifts', permission: [P.SESSIONS_ADD, P.SESSIONS_VIEW, P.SESSIONS_VIEW_OWN], subFeature: 'shift_reports', subPlan: 'Pro', cashierHospHidden: true },
      ],
    },
    {
      label: 'Sell',
      items: [
        { label: 'POS Terminal', icon: Plus, href: '/order', moduleKey: 'new_order', permission: P.ORDERS_ADD, waiterHidden: true, cashierHospHidden: true },
        { label: 'Add Sale', icon: FilePlus, href: '/sell/add', moduleKey: 'new_order', permission: [P.ORDERS_ADD, P.ORDERS_MANAGE], waiterHidden: true, cashierHospHidden: true, hideForProfiles: ['hospitality', 'quick_service', 'pharmacy'] },
        { label: 'All Sales', icon: ClipboardList, href: '/sell/all-sales', moduleKey: 'orders', permission: [P.ORDERS_ADD, P.ORDERS_CHANGE_OWN, P.ORDERS_CHANGE, P.ORDERS_MANAGE, P.ORDERS_VIEW_OWN, P.REPORTS_VIEW], waiterHidden: true },
        // POS Sales/Drafts are a retail-terminal artifact (parked/held sale-in-progress rows) —
        // pharmacy checkout is always a single prescription or walk-in cart, never a running list
        // of in-progress tabs, so both are redundant with All Sales for this profile.
        { label: 'POS Sales', icon: ClipboardList, href: '/sell/pos-sales', moduleKey: 'orders', permission: [P.ORDERS_ADD, P.ORDERS_CHANGE_OWN, P.ORDERS_CHANGE, P.ORDERS_MANAGE, P.ORDERS_VIEW_OWN, P.REPORTS_VIEW], waiterHidden: true, hideForProfiles: ['hospitality', 'quick_service', 'pharmacy'] },
        { label: 'Drafts', icon: FileText, href: '/sell/drafts', moduleKey: 'orders', permission: [P.ORDERS_ADD, P.ORDERS_CHANGE_OWN, P.ORDERS_CHANGE, P.ORDERS_MANAGE], waiterHidden: true, hideForProfiles: ['hospitality', 'quick_service', 'pharmacy'] },
        { label: 'Credit Sale', icon: HandCoins, href: '/sell/add?credit=1', moduleKey: 'new_order', permission: [P.ORDERS_ADD, P.ORDERS_MANAGE], waiterHidden: true, cashierHospHidden: true, hideForProfiles: ['hospitality', 'quick_service'] },
        // Quotations/Shipments/Import Sales are B2B wholesale/distribution concepts, not a
        // pharmacy counter workflow (prescription/OTC dispensing never quotes or ships).
        { label: 'Quotations', icon: FileText, href: `${TREASURY_URL}/${orgSlug}/quotations`, moduleKey: 'orders', permission: [P.ORDERS_ADD, P.ORDERS_MANAGE, P.REPORTS_VIEW], waiterHidden: true, hideForProfiles: ['hospitality', 'quick_service', 'pharmacy'] },
        { label: 'Layaway', icon: Package, href: '/layaway', moduleKey: 'layaway', permission: [P.ORDERS_ADD, P.ORDERS_CHANGE_OWN, P.ORDERS_CHANGE, P.ORDERS_MANAGE], subFeature: 'layaway', subPlan: 'Growth', waiterHidden: true },
        { label: 'Staff Credit', icon: Package, href: '/staff-credit', moduleKey: 'layaway', permission: [P.ORDERS_CHANGE, P.ORDERS_MANAGE], subFeature: 'staff_fund_from_salary', subPlan: 'Professional', waiterHidden: true },
        { label: 'Sell Returns', icon: RotateCcw, href: '/returns', moduleKey: 'returns', permission: [P.ORDERS_CHANGE_OWN, P.ORDERS_CHANGE, P.ORDERS_MANAGE], waiterHidden: true },
        { label: 'Shipments', icon: Truck, href: '/sell/shipments', moduleKey: 'orders', permission: [P.ORDERS_VIEW, P.ORDERS_CHANGE, P.ORDERS_MANAGE, P.ORDERS_VIEW_OWN], waiterHidden: true, cashierHospHidden: true, hideForProfiles: ['pharmacy'] },
        // Management surface for the platform discount source of truth (pos-api promotions) —
        // promo codes, automatic and time-windowed discounts across ALL use cases (the
        // hotel/happy-hour page remains the hospitality-flavored BOGO editor of the same rows).
        { label: 'Discounts', icon: Percent, href: '/sell/discounts', moduleKey: 'orders', permission: [P.PROMOTIONS_VIEW, P.PROMOTIONS_ADD, P.PROMOTIONS_CHANGE, P.PROMOTIONS_MANAGE], waiterHidden: true, cashierHospHidden: true },
        // Historical sales migration (CSV) — manager/admin only, idempotent on invoice no.
        { label: 'Import Sales', icon: FilePlus, href: '/sell/import', moduleKey: 'orders', permission: P.ORDERS_MANAGE, waiterHidden: true, cashierHospHidden: true, hideForProfiles: ['hospitality', 'quick_service', 'pharmacy'] },
      ],
    },
    {
      label: 'Floor & Service',
      items: [
        // No subFeature lock: every hospitality plan tier already includes table_management
        // (backend no longer enforces it either — see pos-api router.go), so a paywall badge
        // here was misleading (and inconsistent — feature-catalog.ts separately claimed "Starter").
        { label: 'Tables', icon: Grid3x3, href: '/tables', moduleKey: 'tables', permission: [P.TABLES_VIEW, P.TABLES_MANAGE], cashierHospHidden: true },
        { label: 'Reservations', icon: Calendar, href: '/reservations', moduleKey: 'reservations', permission: [P.TABLES_VIEW, P.TABLES_MANAGE], waiterHidden: true },
        { label: 'Appointments', icon: Calendar, href: '/appointments', moduleKey: 'appointments', permission: [P.APPOINTMENTS_VIEW, P.APPOINTMENTS_ADD, P.APPOINTMENTS_CHANGE, P.APPOINTMENTS_MANAGE], waiterHidden: true },
        { label: 'Service Packages', icon: Package, href: '/packages', moduleKey: 'packages', permission: [P.PACKAGES_VIEW, P.PACKAGES_MANAGE], waiterHidden: true },
        { label: 'Walk-in Queue', icon: ClipboardList, href: '/queue', moduleKey: 'queue', permission: [P.QUEUE_VIEW, P.QUEUE_CHANGE, P.QUEUE_MANAGE], waiterHidden: true },
        { label: 'Repair', icon: Wrench, href: '/repair', moduleKey: 'repairs', permission: [P.ORDERS_ADD, P.ORDERS_MANAGE], waiterHidden: true },
        { label: 'Staff Schedule', icon: Users, href: '/staff-schedule', moduleKey: 'staff_schedule', permission: [P.STAFF_VIEW, P.STAFF_MANAGE], waiterHidden: true },
        { label: 'Resources', icon: Sofa, href: '/resources', moduleKey: 'resources', permission: [P.CONFIG_VIEW], waiterHidden: true },
      ],
    },
    {
      label: 'Display Board',
      defaultCollapsed: true,
      items: [
        { label: 'KDS', icon: ChefHat, href: '/kds', moduleKey: 'kds', permission: [P.KDS_VIEW, P.KDS_CHANGE, P.KDS_MANAGE] },
      ],
    },
    {
      label: 'Hotel',
      defaultCollapsed: true,
      items: [
        { label: 'Hotel Overview', icon: LayoutDashboard, href: '/hotel', moduleKey: 'hotel', permission: [P.HOTEL_VIEW, P.HOTEL_MANAGE], subFeature: 'hotel_module', subPlan: 'Pro', waiterHidden: true },
        { label: 'Rooms', icon: BedDouble, href: '/hotel/rooms', moduleKey: 'hotel', permission: [P.HOTEL_VIEW, P.HOTEL_MANAGE], subFeature: 'hotel_module', subPlan: 'Pro', waiterHidden: true },
        { label: 'Bookings', icon: Users, href: '/hotel/bookings', moduleKey: 'hotel', permission: [P.HOTEL_VIEW, P.HOTEL_MANAGE], subFeature: 'hotel_module', subPlan: 'Pro', waiterHidden: true },
        // facility_booking (co-working desks, conference/meeting rooms) is a lighter-weight
        // add-on than the full hotel PMS — decoupled from hotel_module so a cafe with spare
        // floor space doesn't need rooms/check-in/folio just to sell co-working. Granted from
        // POS_HOSP_PRO ("Growth") and up; see pos-api internal/platform/subscriptions/features.go.
        { label: 'Facilities', icon: Cpu, href: '/hotel/facilities', moduleKey: 'hotel', permission: [P.HOTEL_VIEW, P.HOTEL_MANAGE], subFeature: 'facility_booking', subPlan: 'Growth', waiterHidden: true },
        { label: 'Conferences', icon: Presentation, href: '/hotel/conference', moduleKey: 'hotel', permission: [P.CONFERENCE_VIEW, P.CONFERENCE_MANAGE, P.HOTEL_MANAGE], subFeature: 'conference_events', subPlan: 'Pro', waiterHidden: true },
        // Happy Hour retired as a separate page — time-window/BOGO deals live in
        // Sell → Discounts (shared DiscountFormModal); the happy_hour subFeature gate
        // moved into the modal's kind selector.
      ],
    },
    {
      label: 'Online Orders',
      defaultCollapsed: true,
      items: [
        { label: 'Pickup Queue', icon: ShoppingBag, href: '/online-orders', moduleKey: 'online_orders', permission: [P.ORDERS_MANAGE, P.ORDERS_CHANGE, P.QUEUE_MANAGE], subFeature: 'online_ordering', subPlan: 'Pro' },
      ],
    },
    {
      label: 'Pharmacy',
      defaultCollapsed: true,
      items: [
        { label: 'Prescriptions', icon: Pill, href: '/pharmacy', moduleKey: 'pharmacy', permission: [P.PHARMACY_VIEW, P.PHARMACY_ADD, P.PHARMACY_CHANGE, P.PHARMACY_MANAGE], waiterHidden: true },
        { label: 'Patient Profiles', icon: UserSquare, href: '/patients', moduleKey: 'patients', permission: [P.PHARMACY_VIEW, P.PHARMACY_MANAGE], waiterHidden: true },
      ],
    },
    {
      label: 'Inventory',
      defaultCollapsed: true,
      items: [
        // Purchase Orders duplicate removed per the use-case PowerSuite specs — the module is
        // owned by inventory-service; POS links to Manage Inventory instead.
        { label: 'Manage Inventory', icon: Truck, href: `${INVENTORY_URL}/${orgSlug}`, moduleKey: 'inventory', permission: [P.CATALOG_MANAGE, P.CATALOG_CHANGE], waiterHidden: true },
      ],
    },
    {
      label: 'Accounting',
      defaultCollapsed: true,
      items: [
        // Single link to treasury-ui (the owner) — the old Invoices/Expenses/Credit Notes/
        // Finance Reports duplicates were removed per the use-case PowerSuite specs.
        { label: 'Treasury', icon: Wallet, href: `${TREASURY_URL}/${orgSlug}`, moduleKey: 'accounting', permission: [P.REPORTS_VIEW, P.REPORTS_MANAGE, P.CONFIG_MANAGE], waiterHidden: true },
      ],
    },
    {
      label: 'CRM & Marketing',
      defaultCollapsed: true,
      items: [
        // Single link to marketflow-ui (the owner) — Campaigns/Contacts/Segments duplicates
        // removed per the use-case PowerSuite specs.
        { label: 'CRM', icon: UserSquare, href: `${MARKETFLOW_URL}/${orgSlug}`, moduleKey: 'crm', permission: [P.CLIENTS_VIEW, P.CLIENTS_MANAGE], waiterHidden: true },
      ],
    },
    {
      label: 'ERP',
      defaultCollapsed: true,
      items: [
        // Cross-service link, shown but locked below tier 2 (no ERP access at Basic per the
        // use-case PowerSuite matrix — hr_management unlocks at Professional).
        { label: 'ERP', icon: Users, href: `${ERP_URL}/${orgSlug}`, moduleKey: 'erp', permission: [P.CONFIG_MANAGE, P.REPORTS_MANAGE], subFeature: 'hr_management', subPlan: 'Pro', waiterHidden: true },
      ],
    },
    {
      label: 'Logistics',
      defaultCollapsed: true,
      items: [
        // Cross-service link to logistics-ui (delivery-execution owner: dispatch board, riders,
        // tracking). Shipments dispatched from Sell → Shipments are assigned/tracked there.
        { label: 'Dispatch & Riders', icon: Truck, href: `${LOGISTICS_URL}/${orgSlug}`, moduleKey: 'logistics', permission: [P.ORDERS_MANAGE, P.CONFIG_MANAGE], waiterHidden: true },
      ],
    },
    {
      label: 'Management',
      defaultCollapsed: true,
      items: [
        { label: 'Reports', icon: BarChart3, href: '/reports', moduleKey: 'reports', permission: [P.REPORTS_VIEW, P.REPORTS_MANAGE], subFeature: 'shift_reports', subPlan: 'Pro', waiterHidden: true },
        { label: 'Most Profitable', icon: TrendingUp, href: '/reports/most-profitable', moduleKey: 'reports', permission: [P.REPORTS_VIEW, P.REPORTS_MANAGE], subFeature: 'shift_reports', subPlan: 'Pro', waiterHidden: true },
        { label: 'Loyalty', icon: Gift, href: '/loyalty', moduleKey: 'loyalty', permission: [P.LOYALTY_VIEW, P.LOYALTY_ADD, P.LOYALTY_MANAGE], subFeature: 'loyalty_program', subPlan: 'Growth', waiterHidden: true, cashierHospHidden: true },
        { label: 'Commissions', icon: TrendingUp, href: '/commissions', moduleKey: 'commissions', permission: [P.COMMISSIONS_VIEW, P.COMMISSIONS_VIEW_OWN, P.COMMISSIONS_MANAGE], subFeature: 'commissions', subPlan: 'Pro', waiterHidden: true },
        // Sync Monitor moved to the platform-owner-only section in sidebar.tsx (per the
        // use-case PowerSuite specs it is a platform diagnostics surface, not tenant nav).
        { label: 'Settings', icon: Settings, href: '/settings', moduleKey: 'settings', permission: [P.CONFIG_VIEW, P.CONFIG_CHANGE, P.CONFIG_MANAGE], waiterHidden: true, coreLocked: true },
      ],
    },
  ];
}

/** Modules that can never be hidden by the outlet (you'd lock yourself out of settings). */
export const CORE_MODULE_KEYS = new Set(['settings']);
