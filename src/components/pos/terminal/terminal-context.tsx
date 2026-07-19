'use client';

/**
 * TerminalProvider / useTerminal — the single source of truth for the POS order terminal.
 *
 * This is a MECHANICAL extraction of every piece of state + logic that previously lived inline in
 * `src/app/[orgSlug]/order/page.tsx`. Nothing about the behaviour changes: the same useState/useRef/
 * useMemo/useEffect/useCallback, the same TanStack hooks + mutations and the same handlers — just
 * relocated here and exposed via context so every per-use-case view consumes identical logic instead
 * of re-implementing it.
 *
 * Views read this via `useTerminal()`; the order page wraps the chosen view in `<TerminalProvider>`.
 */

import { createContext, useContext, useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import type { ModifierGroup } from '@/components/pos/modifier-modal';
import type { OrderLineItem } from '@/components/pos/split-payment-modal';
import { COURSES, type CourseValue } from '@/components/pos/course-selector';
import type { ReceiptData } from '@/components/pos/receipt-preview';
import type { LoyaltyState } from '@/components/retail/LoyaltyPanel';
import type { CreatedOrder } from '@/components/pos/terminal/inline-payment-bar';
import { printKitchenBarTickets } from '@/lib/pos/kitchen-bar-print';
import { applyRoundOff, computeCartTax } from '@/lib/pos/cart-tax';
import { terminalConfigFor, type TerminalConfig } from '@/lib/use-case-config';
import {
  useFullCatalog, useCategories, useCreateOrder, useAddOrderLines, useVoidOrder,
  useAssignTable, useReleaseTable, usePricingTiers, useEffectiveOutletID, type OrderSubtype,
} from '@/hooks/usePOS';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { useKDSStations } from '@/hooks/useKDS';
import { useLoyaltyPrograms } from '@/hooks/useLoyalty';
import { useActiveHappyHours } from '@/hooks/useDiscounts';
import { computeHappyHour, bogoFreeUnitsForSku, type HHLine, type HappyHourResult } from '@/lib/pos/happy-hour';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/auth';
import { apiClient } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';

// ─── Types ──────────────────────────────────────────────────────────────────

/** A purchasable variant of a catalog item (e.g. "Red / M"). Carried on MenuItem when
 *  the backend catalog list reports has_variants — selecting one shapes the cart line. */
export interface ItemVariant {
  id: string;
  sku: string;
  name: string;
  price: number;
  attributes?: Record<string, string>;
  barcode?: string;
}

export interface MenuItem {
  id: string;
  name: string;
  sku: string;
  barcode?: string;         // set for variant cart lines (the chosen variant's scan code)
  description?: string;
  /** Price for the currently-selected pricing profile (already resolved by the terminal). */
  price: number;
  /** All pricing-profile prices keyed by tier code (RETAIL/WHOLESALE/…) from inventory. */
  prices?: Record<string, number>;
  /** True when `price` came from the default tier because the selected profile has no own price. */
  priceIsFallback?: boolean;
  /** Hard selling-price guardrails from inventory; enforced server-side at sale. */
  minSellingPrice?: number;
  maxSellingPrice?: number;
  /** Supplier/purchase cost — ONLY sent by pos-api to managers (pos.catalog.view_cost /
   *  pos.orders.manage). Undefined for cashier terminals. Drives the manager-only cart cost/margin
   *  columns (cost stays masked behind an eye toggle). */
  costPrice?: number;
  category: string;
  brandName?: string;       // ItemBrand name (retail/pharmacy) — for the Brands tab
  brandCode?: string;
  manufacturer?: string;    // shown as subtext on retail/pharmacy item cards
  model?: string;
  hasVariants?: boolean;    // when true, tapping opens the variant picker before adding
  variants?: ItemVariant[];
  image?: string;
  item_type?: string;       // GOODS | SERVICE | RECIPE | VOUCHER
  duration_minutes?: number;
  requiresAgeVerification?: boolean;
  trackSerialNumber?: boolean;
  modifierGroups?: ModifierGroup[];
  /** On-hand stock for the StockBadge / out-of-stock override (retail/pharmacy). Only present
   *  when the backend catalog list projects stock_quantity — see integrator note. */
  stockQuantity?: number;
  /** Never charged at the till (free accompaniments like ugali, supplies like packaging):
   *  pos-api forces price 0 and the line carries a non_billable metadata flag so the server
   *  zeroes it even if a price sneaks in. Shows the FREE chip. */
  nonBillable?: boolean;
  // ── Per-item tax (enriched by inventory-api from treasury, the source of truth) ──
  // The terminal applies THESE at checkout instead of a flat outlet rate. See computeCartTax.
  taxCodeId?: string;
  taxInclusive?: boolean;   // when true, `price` ALREADY includes the tax — never add on top
  taxRate?: number;         // VAT % for this item (e.g. 16). undefined → no treasury info (legacy fallback)
  netPrice?: number;        // unit price excluding tax (informational)
  taxAmount?: number;       // tax portion of the unit price (informational)
}

/** A single chosen modifier, resolved to the exact catalog data at the moment it was
 *  selected — this is what actually gets sent to pos-api (metadata.modifiers), not the
 *  raw group→option-id map, since the server has no other way to know the option's
 *  name/price/sku without a second round trip. */
export interface SelectedModifierDetail {
  group_id: string;
  group_name: string;
  option_id: string;
  option_name: string;
  price_adjustment: number;
  sku?: string;
}

export interface CartItem extends MenuItem {
  quantity: number;
  selectedModifiers?: Record<string, string[]>;
  selectedModifierDetails?: SelectedModifierDetail[];
  modifierTotal?: number;
  serialNumber?: string;
  notes?: string;
  courseNumber?: CourseValue;
  /** Seat/guest this item belongs to (1-based; 0/undefined = shared/unassigned). Pre-populates split-by-item. */
  seat?: number;
  /** Catalog price before a manual price override (markdown). */
  originalPrice?: number;
  overrideReason?: string;
  /** Sticky per-unit line discount (KES) — base price = price + unitDiscount. Margin edits
   *  recompute the base and re-apply this; price/total edits keep it. Manager-set only. */
  unitDiscount?: number;
  /** True for a line auto-added by a corresponding-pair BOGO deal (the free "get" item, e.g. the
   *  Small pizza paired to a bought Large). Its quantity is kept in lockstep with the triggering
   *  buy line and it's priced to free by the happy-hour discount — the cashier never adds it. */
  promoFree?: boolean;
}

export type DisplayMode = 'card' | 'list' | 'image_grid';

interface CategoryEntry {
  name: string;
  [k: string]: unknown;
}

export interface TerminalContextValue {
  // ── identity / config ──
  orgSlug: string;
  cfg: TerminalConfig;
  isHospitality: boolean;
  isAddToBill: boolean;
  user: ReturnType<typeof useAuthStore.getState>['user'];
  outlet: ReturnType<typeof useAuthStore.getState>['outlet'];
  can: (perm: string) => boolean;
  taxRate: number;

  // ── refs ──
  scanInputRef: React.RefObject<HTMLInputElement | null>;

  // ── catalog / browsing ──
  activeCategory: string;
  searchQuery: string;
  displayMode: DisplayMode;
  setDisplayMode: (m: DisplayMode) => void;
  // Browse by Category or Brand (Brands apply to retail/pharmacy only — gated by cfg.showBrandGrid).
  pickerMode: 'category' | 'brand';
  setPickerMode: (m: 'category' | 'brand') => void;
  activeBrand: string;
  brands: CategoryEntry[];
  handleBrandChange: (b: string) => void;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  PAGE_SIZE: number;
  totalItems: number;
  totalPages: number;
  menuLoading: boolean;
  menuItems: MenuItem[];
  filteredItems: MenuItem[];
  categories: CategoryEntry[];
  handleCategoryChange: (cat: string) => void;
  handleSearchChange: (q: string) => void;
  handleSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;

  // ── cart ──
  cart: CartItem[];
  cartItemCount: number;
  subtotal: number;
  tax: number;
  /** Tax embedded inside tax-inclusive lines (already part of subtotal/total) — for display only. */
  inclusiveTax: number;
  loyaltyDiscount: number;
  /** Auto-applied happy-hour discount total (already subtracted from `total`). */
  happyHourDiscount: number;
  /** Full happy-hour breakdown incl. per-SKU deal labels, for per-line badges. */
  happyHour: HappyHourResult;
  total: number;
  // Manual order-level discount
  manualDiscount: number;
  discountReason: string;
  discountOpen: boolean;
  setDiscountOpen: (v: boolean) => void;
  applyDiscount: (amount: number, reason: string) => void;
  // Manager quick-edit order adjustments (QA req 4): order-level tax + additional charges.
  orderTax: number;
  orderTaxOpen: boolean;
  setOrderTaxOpen: (v: boolean) => void;
  applyOrderTax: (amount: number) => void;
  charges: Record<string, number>;
  chargesTotal: number;
  chargesOpen: boolean;
  setChargesOpen: (v: boolean) => void;
  applyCharges: (charges: Record<string, number>) => void;
  /** Ceiling round-off so the payable is a whole number: total = raw + roundOff. */
  roundOff: number;
  pendingApprovalAction: string | null;
  setPendingApprovalAction: (v: string | null) => void;
  confirmApproval: (approval: { approvalToken?: string; code?: string }) => void;
  // Per-line price override
  priceEditIndex: number | null;
  setPriceEditIndex: (i: number | null) => void;
  setLinePrice: (index: number, newPrice: number, reason: string) => void;
  /** Set/replace the line's sticky per-unit discount (KES); 0 clears it. Keeps the base price. */
  setLineDiscount: (index: number, unitDiscount: number) => void;
  addItemToCart: (item: MenuItem, mods?: Record<string, string[]>, qty?: number, serialNumber?: string) => void;
  handleItemTap: (item: MenuItem) => void;
  proceedWithItem: (item: MenuItem) => void;
  handleScaleAddToCart: (weightGrams: number) => void;
  updateQuantity: (index: number, delta: number) => void;
  removeFromCart: (index: number) => void;
  clearCart: () => void;
  /** Same-SKU BOGO free units earned for a cart line at its current PAID quantity (0 for
   *  non-BOGO items and cross-item deals). The cart shows the effective qty (paid + this) with a
   *  "N free" tag so the free unit is visible, not just implied. */
  bogoFreeFor: (item: CartItem) => number;
  updateCourse: (index: number, course: CourseValue) => void;
  setItemSeat: (index: number, seat: number) => void;

  // ── pricing profile ──
  pricingProfile: string;
  pricingTiers: Array<{ code: string; name: string; is_default?: boolean }>;
  repricing: boolean;
  repriceCart: (profile: string) => Promise<void>;

  // ── loyalty / scale ──
  loyaltyState: LoyaltyState | null;
  setLoyaltyState: (s: LoyaltyState | null) => void;
  /** Remount key for the customer/loyalty panel — bumps on clearCart so the customer resets to Walk-in. */
  customerResetSeq: number;
  scaleDeviceId: string;

  // ── order type / table ──
  orderSubtype: OrderSubtype | null;
  setOrderSubtype: (s: OrderSubtype | null) => void;
  deliveryInfo: { address: string; notes: string };
  setDeliveryInfo: (v: { address: string; notes: string }) => void;
  tableId: string;
  tableName: string;

  // ── add-to-bill ──
  billOrderTotal: number;

  // ── place order / park / resume ──
  handlePlaceOrder: () => void;
  handlePark: () => void;
  handleResumeParked: (order: any) => void;
  createOrderAsync: () => Promise<CreatedOrder | null>;
  handleInlineSettled: (ord: CreatedOrder, opts?: { unpaid?: boolean }) => void;
  handleInlineSplit: (ord: CreatedOrder) => void;
  createOrderPending: boolean;
  addOrderLinesPending: boolean;

  // ── courses (hospitality) ──
  currentOrderId: string;
  currentOrderNumber: string;
  currentOrderCourses: CourseValue[];
  firedCourses: number;
  firingCourse: number | null;
  handleFireCourse: (course: number) => Promise<void>;

  // ── payment / modals ──
  paymentOpen: boolean;
  setPaymentOpen: (v: boolean) => void;
  currentOrderLines: OrderLineItem[];
  /** Refetch the current order's lines (fresh server line ids) after they changed server-side. */
  refreshCurrentOrderLines: () => Promise<void>;
  resumeTotal: number | null;
  setResumeTotal: (v: number | null) => void;
  handlePaymentConfirmed: (settled?: CreatedOrder) => Promise<void>;

  expenseOpen: boolean;
  setExpenseOpen: (v: boolean) => void;
  recentOpen: boolean;
  setRecentOpen: (v: boolean) => void;
  registerOpen: boolean;
  setRegisterOpen: (v: boolean) => void;
  sellReturnOpen: boolean;
  setSellReturnOpen: (v: boolean) => void;
  calcOpen: boolean;
  setCalcOpen: React.Dispatch<React.SetStateAction<boolean>>;
  cartOpen: boolean;
  setCartOpen: (v: boolean) => void;
  parkedOpen: boolean;
  setParkedOpen: (v: boolean) => void;
  /** Hospitality Parked Items (set-aside/upsell) panel. */
  heldItemsOpen: boolean;
  setHeldItemsOpen: (v: boolean) => void;

  modifierItem: MenuItem | null;
  setModifierItem: (i: MenuItem | null) => void;

  variantItem: MenuItem | null;
  setVariantItem: (i: MenuItem | null) => void;
  handleVariantChosen: (item: MenuItem, variant: ItemVariant, qty?: number) => void;

  voidOpen: boolean;
  setVoidOpen: (v: boolean) => void;
  voidOrderMutateAsync: ReturnType<typeof useVoidOrder>['mutateAsync'];
  setCurrentOrderId: (v: string) => void;
  setCurrentOrderNumber: (v: string) => void;

  receiptData: ReceiptData | null;
  receiptOpen: boolean;
  setReceiptOpen: (v: boolean) => void;
  setReceiptData: (v: ReceiptData | null) => void;
  /** Order id the open receipt belongs to (ESC/POS silent print needs it; ReceiptData lacks it). */
  receiptOrderId: string;

  orderPlacedOpen: boolean;
  setOrderPlacedOpen: (v: boolean) => void;
  orderPlacedId: string;
  orderPlacedNumber: string;

  pendingOverride: MenuItem | null;
  setPendingOverride: (i: MenuItem | null) => void;

  serialPrompt: { item: MenuItem; callback: (sn: string) => void } | null;
  setSerialPrompt: (v: { item: MenuItem; callback: (sn: string) => void } | null) => void;
  serialInput: string;
  setSerialInput: (v: string) => void;

  agePrompt: { item: MenuItem; callback: () => void } | null;
  setAgePrompt: (v: { item: MenuItem; callback: () => void } | null) => void;

  posSettings: ReturnType<typeof usePOSSettings>['data'];
  /** Whether a completed sale should log this operator out (shared-terminal policy + role). */
  autoLogoutAfterSale: boolean;
  /** Close the after-payment receipt; also logs out when autoLogoutAfterSale (shared terminal). */
  handleReceiptClose: () => void;
}

const TerminalContext = createContext<TerminalContextValue | null>(null);

export function useTerminal(): TerminalContextValue {
  const ctx = useContext(TerminalContext);
  if (!ctx) throw new Error('useTerminal must be used within a <TerminalProvider>');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

/**
 * Map server order lines (ent JSON, `edges.lines`) → the split modal's OrderLineItem shape.
 * Soft-voided / set-aside lines are dropped (no longer payable). Per-line operations
 * (set-aside / replace) REQUIRE the server's POSOrderLine ids — cart items carry catalog ids,
 * which those endpoints 404 on, so server lines are always preferred when available.
 */
function mapServerLines(lines: any[]): OrderLineItem[] {
  return (lines ?? [])
    .filter((l) => l.voided_qty == null)
    .map((l) => ({
      id: l.id,
      name: l.name ?? l.item_name ?? l.sku ?? 'Item',
      quantity: l.quantity ?? 1,
      unitPrice: l.unit_price ?? 0,
      totalPrice: l.total_price ?? (l.unit_price ?? 0) * (l.quantity ?? 1),
      seat: l.metadata?.seat,
    }));
}

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const user = useAuthStore((s) => s.user);
  const outlet = useAuthStore((s) => s.outlet);
  // The outlet ORDERS post against — follows the HQ drill-down switcher (selectedOutletId),
  // falling back to the session's home outlet. Must match the outlet the catalog is scoped
  // to, or an HQ admin ringing up for another branch would book the sale (and deduct stock)
  // against their own home outlet.
  const effectiveOutletID = useEffectiveOutletID();
  const orderOutletID = effectiveOutletID || outlet?.id || '';
  // Terminal adapts to the outlet use_case (display mode, scan-first, pricing profile, courses…).
  const cfg = terminalConfigFor(outlet?.use_case);
  const scanInputRef = useRef<HTMLInputElement>(null);
  // Retail/pharmacy: focus the scan field on load for fast keyboard-first checkout.
  useEffect(() => {
    if (cfg.barcodeFirst) scanInputRef.current?.focus();
  }, [cfg.barcodeFirst]);
  // Read the configured scale device once (retail/pharmacy weighed-goods checkout).
  useEffect(() => {
    if (cfg.showScale && typeof window !== 'undefined') {
      setScaleDeviceId(localStorage.getItem('pos_scale_device_id') ?? '');
    }
  }, [cfg.showScale]);
  // Retail loyalty panel (customer lookup + points redemption) — absorbed from /retail into the
  // adaptive terminal; its redeemDiscount applies as an order discount and posts the customer.
  const [loyaltyState, setLoyaltyState] = useState<LoyaltyState | null>(null);
  // Bumped by clearCart to remount the LoyaltyPanel (whose picker selection is component-local),
  // resetting the attached customer back to the Walk-in default after every completed sale.
  const [customerResetSeq, setCustomerResetSeq] = useState(0);
  // Retail/pharmacy hardware scale (gated on cfg.showScale + a configured pos_scale_device_id).
  const [scaleDeviceId, setScaleDeviceId] = useState('');
  // Out-of-stock add interception → manager PIN override (retail/pharmacy, gated on cfg.managerOverride).
  const [pendingOverride, setPendingOverride] = useState<MenuItem | null>(null);
  const { can, isSuperuser } = usePermissions();
  const { data: posSettings } = usePOSSettings();
  // Legacy-fallback VAT for lines with NO inventory/treasury tax info. Mirrors pos-api's
  // outletFallbackTaxRate: VAT disabled in POS settings → 0 (server charges nothing, so the till
  // preview must match); otherwise the configured rate. Per-item treasury tax always wins.
  const taxRate = (posSettings?.vat_enabled === false ? 0 : (posSettings?.vat_rate ?? 16)) / 100;
  // Live KDS stations — drive per-station ticket routing/printing (same category_filter routing the
  // kitchen displays use), so a ticket prints on the printer of the station it was routed to.
  const { data: kdsStationsData } = useKDSStations();
  // Active loyalty program — used to tell the cashier how many points the customer just earned.
  const { data: loyaltyPrograms } = useLoyaltyPrograms();

  // Phase 1b: in hospitality/quick_service/hotel, cashiers settle from the orders list — waiters create
  // orders from tables. A non-superuser cashier landing on /order directly is redirected to /orders.
  // Use the normalized profile so aliases like "hotel"/"bar"/"cafe"/"restaurant" are covered too.
  // The hospitality-cashier terminal surface is now configurable (cashier_terminal_surface):
  // 'full_till' (default) lets the cashier ring sales AT the terminal, so only redirect them to
  // the Orders/bills list when the outlet is explicitly set to 'bills_only'. Quick-service always
  // keeps the terminal (no table service) — never redirected regardless of the setting.
  const cashierTerminalSurface = posSettings?.cashier_terminal_surface ?? 'full_till';
  useEffect(() => {
    const roles = user?.roles ?? [];
    if (!isSuperuser && roles.includes('cashier') && cfg.profile === 'hospitality' && cashierTerminalSurface === 'bills_only') {
      router.replace(`/${orgSlug}/orders`);
    }
  }, [user, cfg.profile, isSuperuser, orgSlug, router, cashierTerminalSurface]);

  // Shared-terminal auto-logout after a completed sale (auto_logout_after_sale policy). Applies to
  // operational floor staff (cashier/waiter/floor roles) but NEVER managers/admins/HQ, who stay
  // signed in for oversight. Consumed by OrderPlacedDialog (dine-in) and the post-payment flow.
  const autoLogoutAfterSale = useMemo(() => {
    if (!posSettings?.auto_logout_after_sale) return false;
    const roles = user?.roles ?? [];
    const MANAGER_ROLES = ['manager', 'store_manager', 'outlet_manager', 'admin', 'pos_admin', 'superuser', 'super_admin', 'owner'];
    if (isSuperuser || roles.some((r) => MANAGER_ROLES.includes(r))) return false;
    return true;
  }, [posSettings?.auto_logout_after_sale, user?.roles, isSuperuser]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [pickerMode, setPickerModeState] = useState<'category' | 'brand'>('category');
  const [activeBrand, setActiveBrand] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  // Live happy-hour/BOGO promotions — used to alert the waiter/cashier at the moment a covered
  // item is added, e.g. "Add 1 more Burger to unlock Buy 1 Get 1 Free" (see addItemToCart).
  const { data: activeHappyHours = [] } = useActiveHappyHours();
  const happyHourForSku = useCallback(
    (sku: string) =>
      activeHappyHours.find((p) => {
        const r = p.rule;
        if (!r) return false;
        if (r.scope_type === 'all') return true;
        if (r.scope_type !== 'item') return false;
        // For cross-item BOGO (get_scope_ids set), a SKU on EITHER side of the pairing
        // qualifies — a Small pizza (the "get" item) must also find its promo, not just the
        // Large pizza (the "buy" item), so the terminal can nudge/celebrate on either add.
        return (r.scope_ids ?? []).includes(sku) || (r.get_scope_ids ?? []).includes(sku);
      }),
    [activeHappyHours],
  );
  // Pricing profile (Retail/Wholesale) — switching it re-prices the cart via inventory tier prices.
  const [pricingProfile, setPricingProfile] = useState<string>('');
  const [repricing, setRepricing] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  // GoDigital toolbar modals (open in-place instead of navigating away from the terminal).
  const [recentOpen, setRecentOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [sellReturnOpen, setSellReturnOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  // Mobile-only: the cart renders as a slide-up bottom sheet (toggled by the
  // sticky bar). On lg+ it is always a static side panel and this flag is unused.
  const [cartOpen, setCartOpen] = useState(false);
  // Keeps the latest handlePlaceOrder for the keyboard-checkout listener (avoids stale closure).
  const placeOrderRef = useRef<() => void>(() => {});
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => cfg.defaultDisplayMode);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  // Table context from URL (set by tables page: /order?table_id=...&table_name=...)
  const tableId = searchParams.get('table_id') ?? '';
  const tableName = searchParams.get('table_name') ?? '';

  // Add-to-bill mode params
  const mode = searchParams.get('mode') ?? '';
  const billOrderId = searchParams.get('order_id') ?? '';
  const billOrderTotal = parseFloat(searchParams.get('order_total') ?? '0');
  const coversParam = parseInt(searchParams.get('covers') ?? '1', 10);
  const isAddToBill = mode === 'add_to_bill';

  // Order subtype — pre-select dine_in when arriving from table selection
  const [orderSubtype, setOrderSubtype] = useState<OrderSubtype | null>(
    tableId ? 'dine_in' : null
  );

  // Delivery dropoff details — captured for delivery orders so a logistics rider can be dispatched.
  const [deliveryInfo, setDeliveryInfo] = useState<{ address: string; notes: string }>({ address: '', notes: '' });

  // Modifier modal
  const [modifierItem, setModifierItem] = useState<MenuItem | null>(null);

  // Variant picker modal (opens before modifiers/add when an item has variants)
  const [variantItem, setVariantItem] = useState<MenuItem | null>(null);

  // Payment modal
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState('');
  const [currentOrderNumber, setCurrentOrderNumber] = useState('');
  const [currentOrderLines, setCurrentOrderLines] = useState<OrderLineItem[]>([]);

  // Parked sales (suspend/resume): a parked sale is persisted as a draft order; resuming opens its
  // payment modal, using resumeTotal to override the (now-empty) cart total.
  const [parkedOpen, setParkedOpen] = useState(false);
  const [heldItemsOpen, setHeldItemsOpen] = useState(false);
  const [resumeTotal, setResumeTotal] = useState<number | null>(null);

  // Void order modal
  const [voidOpen, setVoidOpen] = useState(false);
  const voidOrder = useVoidOrder();
  const assignTable = useAssignTable();
  const releaseTable = useReleaseTable();

  // Receipt
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptOrderId, setReceiptOrderId] = useState('');

  // Order placed dialog (dine-in + add-to-bill success)
  const [orderPlacedOpen, setOrderPlacedOpen] = useState(false);
  const [orderPlacedId, setOrderPlacedId] = useState('');
  const [orderPlacedNumber, setOrderPlacedNumber] = useState('');

  // Course management (hospitality only)
  const isHospitality = ['hospitality', 'quick_service', 'hotel'].includes((outlet?.use_case ?? '').toLowerCase());
  // Retail/pharmacy/services tills book plain counter sales as 'retail' (displayed "Walk-in") —
  // never the server's 'dine_in' default, which is a hospitality/quick-service concept.
  const defaultOrderSubtype = isHospitality ? undefined : ('retail' as const);
  const [currentOrderCourses, setCurrentOrderCourses] = useState<CourseValue[]>([]);
  const [firedCourses, setFiredCourses] = useState(0);
  const [firingCourse, setFiringCourse] = useState<number | null>(null);

  // Serial number prompt
  const [serialPrompt, setSerialPrompt] = useState<{ item: MenuItem; callback: (sn: string) => void } | null>(null);
  const [serialInput, setSerialInput] = useState('');

  // Age verification prompt
  const [agePrompt, setAgePrompt] = useState<{ item: MenuItem; callback: () => void } | null>(null);

  // Barcode scanner buffer (global keydown listener — fires when no input focused)
  const [barcodeBuffer, setBarcodeBuffer] = useState('');

  // Reset to page 1 when search/category/brand changes
  const handleCategoryChange = (cat: string) => { setActiveCategory(cat); setPage(1); };
  const handleSearchChange = (q: string) => { setSearchQuery(q); setPage(1); };
  const handleBrandChange = (b: string) => { setActiveBrand(b); setPage(1); };
  // Switching Category↔Brand resets the other axis so the two never compound.
  const setPickerMode = (m: 'category' | 'brand') => {
    setPickerModeState(m); setActiveCategory('All'); setActiveBrand('All'); setPage(1);
  };

  // Cache-first FULL catalog (IndexedDB-seeded, revalidated + written through on every
  // fetch). Category / search / brand / pagination are all resolved CLIENT-SIDE over the
  // complete set below — so filters never operate on a single paginated page.
  const { data: catalogItems, isLoading: menuLoading } = useFullCatalog();
  const createOrder = useCreateOrder();
  // Set true when the cashier confirms the age prompt for an age-restricted item;
  // sent with the order so the backend age gate passes. Reset when the cart clears.
  const ageVerifiedRef = useRef(false);
  // Manual order-level discount (KES amount) + reason; an over-limit discount
  // triggers a manager step-up (handled in handlePlaceOrder on a 422).
  const [manualDiscount, setManualDiscountState] = useState(0);
  const [orderTax, setOrderTax] = useState(0);
  const [orderTaxOpen, setOrderTaxOpen] = useState(false);
  const [charges, setCharges] = useState<Record<string, number>>({});
  const [chargesOpen, setChargesOpen] = useState(false);
  const [discountReason, setDiscountReason] = useState('');
  const [discountOpen, setDiscountOpen] = useState(false);
  // Action a manager must approve (order.discount_override | price.override), set
  // from the backend's 422; null = no pending approval.
  const [pendingApprovalAction, setPendingApprovalAction] = useState<string | null>(null);
  const [priceEditIndex, setPriceEditIndex] = useState<number | null>(null);
  // Holds the latest retryable place(token) so the approval dialog can resubmit.
  const placeWithDiscountApprovalRef = useRef<((approval?: { approvalToken?: string; code?: string }) => void) | null>(null);
  const addOrderLines = useAddOrderLines();

  const menuItems: MenuItem[] = useMemo(() => {
    const items = catalogItems ?? [];
    return items.map((item: any) => {
      const tierPrices: Record<string, number> | undefined =
        item.prices && typeof item.prices === 'object' ? item.prices : undefined;
      // Display/charge price = the selected profile's tier price when available, else the
      // override-merged default price. New taps after a profile switch get the right price because
      // this memo recomputes when pricingProfile changes.
      const hasProfilePrice =
        !!tierPrices && !!pricingProfile && (tierPrices[pricingProfile] ?? 0) > 0;
      const profilePrice = hasProfilePrice ? tierPrices![pricingProfile] : (item.price ?? 0);
      // Fallback = a non-default profile is selected but this item has no price for it, so we
      // show the default-tier price. Surfaced as a badge so "nothing changed on switch" is explainable.
      const priceIsFallback = !!pricingProfile && !hasProfilePrice;
      // Non-billable / complimentary items are always FREE — no tier price may re-introduce
      // a charge (the server zeroes the line as a belt anyway).
      const nonBillable = item.non_billable === true || item.is_complimentary === true;
      return {
      id: item.id,
      name: item.name,
      sku: item.sku,
      description: item.description,
      price: nonBillable ? 0 : profilePrice,
      nonBillable,
      prices: tierPrices,
      priceIsFallback,
      minSellingPrice: typeof item.min_selling_price === 'number' ? item.min_selling_price : undefined,
      maxSellingPrice: typeof item.max_selling_price === 'number' ? item.max_selling_price : undefined,
      // Only present when pos-api served cost to a manager (pos.catalog.view_cost / pos.orders.manage).
      costPrice: typeof item.cost_price === 'number' ? item.cost_price : undefined,
      category: item.category || 'Uncategorized',
      brandName: item.brand_name ?? item.brand ?? undefined,
      brandCode: item.brand_code ?? undefined,
      manufacturer: item.manufacturer ?? undefined,
      model: item.model ?? undefined,
      hasVariants: item.has_variants ?? undefined,
      variants: Array.isArray(item.variants)
        ? item.variants
            .filter((v: any) => v?.is_active !== false)
            .map((v: any) => ({
              id: v.id,
              sku: v.sku,
              name: v.name,
              price: v.price ?? 0,
              attributes: v.attributes ?? undefined,
              barcode: v.barcode ?? undefined,
            }))
        : undefined,
      image: item.image_url,
      item_type: item.item_type,
      duration_minutes: item.duration_minutes,
      requiresAgeVerification: item.requires_age_verification,
      trackSerialNumber: item.track_serial_numbers,
      modifierGroups: item.modifier_groups,
      // stock_quantity is only populated if the backend projects it on the catalog list (see note).
      stockQuantity: item.stock_quantity,
      // Per-item tax from treasury (via inventory-api enrichment → pos-api catalog passthrough).
      taxCodeId: item.tax_code_id ?? undefined,
      taxInclusive: item.tax_inclusive ?? undefined,
      taxRate: typeof item.tax_rate === 'number' ? item.tax_rate : undefined,
      netPrice: typeof item.net_price === 'number' ? item.net_price : undefined,
      taxAmount: typeof item.tax_amount === 'number' ? item.tax_amount : undefined,
      };
    });
  }, [catalogItems, pricingProfile]);

  // Catalog indexed by lowercase SKU — used to build the auto-added free "get" line for a
  // corresponding-pair BOGO deal (the matching item's real price/recipe/tax).
  const menuBySku = useMemo(() => {
    const m = new Map<string, MenuItem>();
    for (const it of menuItems) if (it.sku) m.set(it.sku.toLowerCase(), it);
    return m;
  }, [menuItems]);

  // Self-heal cart lines added from a STALE cached catalog row. The terminal paints
  // cache-first, so an item tapped before the background revalidation lands snapshots
  // whatever the old IndexedDB slice had — historically missing cost_price / per-item tax
  // (pre-2026-07-14 offline rows never carried them → permanent "—" cost/margin on the
  // line). Once fresh catalog data arrives, backfill ONLY the missing insight fields;
  // price, overrides and discounts are never touched.
  useEffect(() => {
    if (menuItems.length === 0) return;
    setCart((prev) => {
      let changed = false;
      const next = prev.map((line) => {
        const fresh = menuItems.find((m) => m.id === line.id);
        if (!fresh) return line;
        const patch: Partial<CartItem> = {};
        if (line.costPrice == null && typeof fresh.costPrice === 'number') patch.costPrice = fresh.costPrice;
        if (line.taxRate == null && typeof fresh.taxRate === 'number') {
          patch.taxRate = fresh.taxRate;
          patch.taxInclusive = fresh.taxInclusive;
          patch.taxCodeId = fresh.taxCodeId;
        }
        if (line.stockQuantity == null && typeof fresh.stockQuantity === 'number') patch.stockQuantity = fresh.stockQuantity;
        if (Object.keys(patch).length === 0) return line;
        changed = true;
        return { ...line, ...patch };
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuItems]);

  // Corresponding-pair BOGO auto-add + sync: when a "buy" item (e.g. a Large pizza) is in the cart
  // during an active pair deal, its mapped free item (the matching Small) is auto-added as its own
  // line and its quantity kept in lockstep with the buy line — add/increase/remove the buy item and
  // the free line follows; remove it and the free line goes too. The free line is a REAL order line
  // (own SKU/recipe), so stock deducts and COGS posts normally; the happy-hour discount (mirrored in
  // `happyHour` below, recomputed authoritatively server-side) prices it to free. A manually-added
  // "get" item counts toward the earned free units so we never double it. Managed centrally here so
  // no manual step is needed and a free line can't be stranded.
  useEffect(() => {
    const pairRules = activeHappyHours
      .map((p) => p.rule)
      .filter((r): r is NonNullable<typeof r> =>
        !!r && r.discount_type === 'bogo' && r.scope_type === 'item'
        && !!r.get_pair_map && Object.keys(r.get_pair_map).length > 0);

    if (pairRules.length === 0) {
      if (cart.some((c) => c.promoFree)) setCart((prev) => prev.filter((c) => !c.promoFree));
      return;
    }

    // lower(buySku) -> { getSku, buy, get }; first active rule wins on a conflicting key.
    const pair = new Map<string, { getSku: string; buy: number; get: number }>();
    for (const r of pairRules) {
      const buy = Math.max(1, r.buy_quantity ?? 1);
      const get = Math.max(1, r.get_quantity ?? 1);
      for (const [bk, gk] of Object.entries(r.get_pair_map ?? {})) {
        const key = bk.toLowerCase();
        if (!pair.has(key)) pair.set(key, { getSku: gk, buy, get });
      }
    }

    // Earned free units per get SKU, from buy-line quantities (real lines only, not free lines).
    const buyQtyBySku = new Map<string, number>();
    for (const c of cart) {
      if (c.promoFree) continue;
      const k = (c.sku ?? '').toLowerCase();
      if (pair.has(k)) buyQtyBySku.set(k, (buyQtyBySku.get(k) ?? 0) + c.quantity);
    }
    const earnedByGetSku = new Map<string, number>();
    for (const [bk, q] of buyQtyBySku) {
      const info = pair.get(bk)!;
      const earned = Math.floor(q / info.buy) * info.get;
      if (earned <= 0) continue;
      const gk = info.getSku.toLowerCase();
      earnedByGetSku.set(gk, (earnedByGetSku.get(gk) ?? 0) + earned);
    }
    // Manually-present (non-free) quantity of each earned get SKU — don't auto-add on top of it.
    const manualByGetSku = new Map<string, number>();
    for (const c of cart) {
      if (c.promoFree) continue;
      const k = (c.sku ?? '').toLowerCase();
      if (earnedByGetSku.has(k)) manualByGetSku.set(k, (manualByGetSku.get(k) ?? 0) + c.quantity);
    }
    const targetAuto = new Map<string, number>();
    for (const [gk, earned] of earnedByGetSku) {
      targetAuto.set(gk, Math.max(0, earned - (manualByGetSku.get(gk) ?? 0)));
    }

    // Rebuild: keep real lines; set each free line to its target (drop at 0); add missing free lines.
    const next: CartItem[] = [];
    const seen = new Set<string>();
    const announce: { sku: string; name: string; qty: number }[] = [];
    let changed = false;
    for (const c of cart) {
      if (!c.promoFree) { next.push(c); continue; }
      const gk = (c.sku ?? '').toLowerCase();
      const want = targetAuto.get(gk) ?? 0;
      seen.add(gk);
      if (want <= 0) { changed = true; continue; }
      if (c.quantity !== want) {
        if (want > c.quantity) announce.push({ sku: gk, name: c.name, qty: want });
        next.push({ ...c, quantity: want });
        changed = true;
      } else {
        next.push(c);
      }
    }
    for (const [gk, want] of targetAuto) {
      if (want <= 0 || seen.has(gk)) continue;
      const mi = menuBySku.get(gk);
      if (!mi) continue; // not in catalog — can't auto-add
      next.push({ ...mi, quantity: want, promoFree: true });
      announce.push({ sku: gk, name: mi.name, qty: want });
      changed = true;
    }

    if (changed) {
      setCart(next);
      for (const a of announce) {
        toast.success(`🎉 Free ${a.name}${a.qty > 1 ? ` ×${a.qty}` : ''} added`, { id: `hh-free-${a.sku}` });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, activeHappyHours, menuBySku]);

  // Pricing tiers (Retail/Wholesale/custom) from inventory via pos-api — drives the price selector.
  const { data: tiersResp } = usePricingTiers();
  const pricingTiers = useMemo(() => tiersResp?.data ?? [], [tiersResp]);
  useEffect(() => {
    if (!pricingProfile && pricingTiers.length > 0) {
      setPricingProfile((pricingTiers.find((t) => t.is_default) ?? pricingTiers[0]).code);
    }
  }, [pricingTiers, pricingProfile]);

  const { data: serverCategories } = useCategories();
  // Typed category list (with icons) consumed by CategoryNav. CategoryNav owns
  // the "All" tab, so it is not included here. Falls back to deriving categories
  // from item names (no icons) when the server returns none.
  const categories = useMemo(() => {
    if (serverCategories && serverCategories.length > 0) {
      return serverCategories;
    }
    const names = Array.from(new Set(menuItems.map((i) => i.category))).sort();
    return names.map((name) => ({ name }));
  }, [serverCategories, menuItems]);

  // Brand list (retail/pharmacy) derived from the items actually present, so only brands with
  // sellable items show. The "All" tab is owned by the nav, like categories.
  const brands = useMemo(() => {
    const names = Array.from(new Set(menuItems.map((i) => i.brandName).filter(Boolean) as string[])).sort();
    return names.map((name) => ({ name }));
  }, [menuItems]);

  // All filtering is CLIENT-SIDE over the complete catalog (cache-first source):
  // category (category mode) or brand (brand mode), then free-text search by
  // name / sku / barcode. Switching Category↔Brand resets the other axis to 'All'.
  const matchedItems = useMemo(() => {
    let items = menuItems;
    if (pickerMode === 'category' && activeCategory !== 'All') {
      items = items.filter((i) => i.category === activeCategory);
    }
    if (pickerMode === 'brand' && activeBrand !== 'All') {
      items = items.filter((i) => i.brandName === activeBrand);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      items = items.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        (i.barcode?.toLowerCase().includes(q) ?? false),
      );
    }
    return items;
  }, [menuItems, pickerMode, activeCategory, activeBrand, searchQuery]);

  const totalItems = matchedItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  // The grid renders one page at a time, sliced from the fully-filtered set.
  const filteredItems = useMemo(
    () => matchedItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [matchedItems, page, PAGE_SIZE],
  );

  // Keep the current page in range if the filtered set shrinks (search/category change,
  // or the catalog updates after a background revalidation).
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // ─── Item Add Flow ──────────────────────────────────────────────────────

  const addItemToCart = useCallback(
    (item: MenuItem, mods?: Record<string, string[]>, qty = 1, serialNumber?: string) => {
      let modTotal = 0;
      const modifierDetails: SelectedModifierDetail[] = [];
      if (mods && item.modifierGroups) {
        for (const group of item.modifierGroups) {
          for (const optId of mods[group.id] ?? []) {
            const opt = group.options.find((o) => o.id === optId);
            if (opt) {
              modTotal += opt.price;
              modifierDetails.push({
                group_id: group.id,
                group_name: group.name,
                option_id: opt.id,
                option_name: opt.name,
                price_adjustment: opt.price,
                sku: opt.sku,
              });
            }
          }
        }
      }

      let totalQtyForSku = 0;
      let updatedCart: CartItem[] = [];
      setCart((prev) => {
        const next = (() => {
          if (mods || serialNumber) {
            return [...prev, { ...item, quantity: qty, selectedModifiers: mods, selectedModifierDetails: modifierDetails, modifierTotal: modTotal, serialNumber }];
          }
          const existing = prev.find((c) => c.id === item.id && !c.selectedModifiers && !c.promoFree);
          if (existing) {
            return prev.map((c) =>
              c.id === item.id && !c.selectedModifiers && !c.promoFree ? { ...c, quantity: c.quantity + qty } : c
            );
          }
          return [...prev, { ...item, quantity: qty }];
        })();
        totalQtyForSku = next.filter((c) => c.sku === item.sku).reduce((s, c) => s + c.quantity, 0);
        updatedCart = next;
        return next;
      });

      // Waiter/cashier alert: this item is covered by a live happy-hour/BOGO deal. For BOGO,
      // give a concrete "add N more" nudge (or celebrate a completed cycle) instead of just
      // naming the deal — e.g. "Add 1 more Burger to unlock Buy 1 Get 1 Free" then, once they
      // do, "Buy 1 Get 1 Free applied on Burger!". Keyed by sku so re-adding the same item
      // replaces the toast instead of stacking duplicates.
      const promo = happyHourForSku(item.sku);
      if (promo?.rule) {
        const r = promo.rule;
        // Corresponding-pair BOGO (get_pair_map set) auto-adds the matching free item and toasts
        // from the reconcile effect, so suppress the manual "add N more / add a qualifying item"
        // nudges here — they'd contradict the auto-add.
        const hasPairMap = r.discount_type === 'bogo' && !!r.get_pair_map && Object.keys(r.get_pair_map).length > 0;
        const crossItem = !hasPairMap && r.discount_type === 'bogo' && (r.get_scope_ids ?? []).length > 0;
        if (hasPairMap) {
          // no-op: the reconcile effect announces the auto-added free item.
        } else if (crossItem) {
          // Cross-item: "buy Large, get Small free" — the buy_quantity/get_quantity pairing
          // spans TWO DIFFERENT scopes, not one SKU's own quantity, so tally each scope
          // separately from the just-updated cart rather than reusing the same-SKU cycle math.
          const buyIds = new Set((r.scope_ids ?? []).map((s) => s.toLowerCase()));
          const getIds = new Set((r.get_scope_ids ?? []).map((s) => s.toLowerCase()));
          const buyQtyInCart = updatedCart.filter((c) => buyIds.has(c.sku.toLowerCase())).reduce((s, c) => s + c.quantity, 0);
          const getQtyInCart = updatedCart.filter((c) => getIds.has(c.sku.toLowerCase())).reduce((s, c) => s + c.quantity, 0);
          const buy = r.buy_quantity || 1;
          const get = r.get_quantity || 1;
          const freeEarned = Math.floor(buyQtyInCart / buy) * get;
          const dealLabel = r.get_discount_percent >= 100 ? 'Free' : `${r.get_discount_percent}% off`;
          if (buyIds.has(item.sku.toLowerCase())) {
            // Just added a "buy" item.
            if (getQtyInCart > 0 && freeEarned > 0) {
              toast.success(`🎉 ${promo.name}: ${dealLabel} item applied!`, { id: `happy-hour-${item.sku}` });
            } else {
              toast.info(`${promo.name}: add a qualifying item to get one ${dealLabel.toLowerCase()}`, { id: `happy-hour-${item.sku}` });
            }
          } else if (getIds.has(item.sku.toLowerCase())) {
            // Just added a "get" item.
            if (freeEarned >= getQtyInCart) {
              toast.success(`🎉 ${promo.name}: ${item.name} is ${dealLabel.toLowerCase()}!`, { id: `happy-hour-${item.sku}` });
            } else {
              toast.info(`${promo.name}: buy a qualifying item to unlock ${dealLabel.toLowerCase()} on ${item.name}`, { id: `happy-hour-${item.sku}` });
            }
          }
        } else if (r.discount_type === 'bogo' && r.scope_type === 'item') {
          const cycle = (r.buy_quantity || 1) + (r.get_quantity || 1);
          const intoCycle = totalQtyForSku % cycle;
          if (intoCycle === 0) {
            toast.success(`🎉 ${promo.name}: Buy ${r.buy_quantity} Get ${r.get_quantity} ${r.get_discount_percent >= 100 ? 'Free' : `${r.get_discount_percent}% off`} applied on ${item.name}!`, { id: `happy-hour-${item.sku}` });
          } else {
            const remaining = cycle - intoCycle;
            toast.info(`${promo.name}: add ${remaining} more ${item.name} to unlock Buy ${r.buy_quantity} Get ${r.get_quantity} ${r.get_discount_percent >= 100 ? 'Free' : `${r.get_discount_percent}% off`}`, { id: `happy-hour-${item.sku}` });
          }
        } else if (r.discount_type !== 'bogo') {
          const deal = r.discount_type === 'percentage' ? `${r.discount_value}% off`
            : r.discount_type === 'fixed_price' ? `fixed price KES ${r.discount_value}`
            : `KES ${r.discount_value} off`;
          toast.info(`${promo.name}: ${item.name} is ${deal}`, { id: `happy-hour-${item.sku}` });
        }
      }

      // The grid price already reflects the selected profile (menuItems carries every tier's price).
      // Only when the profile price isn't in the local map do we resolve it from inventory-api —
      // e.g. a tier with quantity-break pricing not included in the bulk payload.
      const defaultCode = (pricingTiers.find((tt) => tt.is_default) ?? pricingTiers[0])?.code;
      const tenantId = user?.tenant_id ?? '';
      const hasLocalProfilePrice =
        !!item.prices && typeof item.prices[pricingProfile] === 'number' && item.prices[pricingProfile] > 0;
      if (!mods && !serialNumber && tenantId && pricingProfile && pricingProfile !== defaultCode && !hasLocalProfilePrice) {
        apiClient
          .get<{ unit_price?: number }>(
            `/api/v1/${tenantId}/pos/catalog/pricing/resolve?item_id=${encodeURIComponent(item.id)}&quantity=${qty}&profile=${pricingProfile}`,
          )
          .then((res) => {
            if (res && typeof res.unit_price === 'number' && res.unit_price > 0) {
              setCart((prev) =>
                prev.map((c) => (c.id === item.id && !c.selectedModifiers ? { ...c, price: res.unit_price as number } : c)),
              );
            }
          })
          .catch(() => {
            /* keep the default-tier price on failure */
          });
      }
    },
    [pricingProfile, pricingTiers, user, happyHourForSku],
  );

  const proceedWithItem = useCallback(
    (item: MenuItem) => {
      // Variants take precedence: pick the variant first, then fall through to modifiers/add
      // (handled by the variant picker modal which re-enters this flow with the chosen variant).
      if (item.hasVariants || item.variants?.length) {
        setVariantItem(item);
        return;
      }
      if (item.trackSerialNumber) {
        setSerialPrompt({
          item,
          callback: (sn: string) => {
            setSerialPrompt(null);
            if (item.modifierGroups?.length) {
              setModifierItem(item);
            } else {
              addItemToCart(item, undefined, 1, sn);
            }
          },
        });
        return;
      }
      if (item.modifierGroups?.length) {
        setModifierItem(item);
        return;
      }
      addItemToCart(item);
    },
    [addItemToCart]
  );

  // Variant chosen from the picker: build a variant-flavored line (variant price/sku/barcode +
  // "<item> — <variant>" name) and either open modifiers for it or add it straight to the cart.
  const handleVariantChosen = useCallback(
    (item: MenuItem, variant: ItemVariant, qty = 1) => {
      const variantItem: MenuItem = {
        ...item,
        // Use a composite id so distinct variants of the same item are separate cart lines.
        id: `${item.id}::${variant.id}`,
        name: `${item.name} — ${variant.name}`,
        sku: variant.sku || item.sku,
        barcode: variant.barcode,
        price: variant.price,
        hasVariants: false,
        variants: undefined,
      };
      setVariantItem(null);
      if (variantItem.modifierGroups?.length) {
        setModifierItem(variantItem);
        return;
      }
      addItemToCart(variantItem, undefined, qty);
    },
    [addItemToCart]
  );

  const handleItemTap = useCallback((item: MenuItem) => {
    // Retail/pharmacy: intercept out-of-stock adds for a manager PIN override (mirrors legacy /retail).
    if (
      cfg.managerOverride &&
      item.item_type !== 'SERVICE' &&
      item.stockQuantity !== undefined &&
      item.stockQuantity === 0
    ) {
      setPendingOverride(item);
      return;
    }
    if (item.requiresAgeVerification) {
      setAgePrompt({
        item,
        callback: () => {
          setAgePrompt(null);
          // Record that the cashier confirmed the customer's age for this sale —
          // sent as age_verified so the backend age gate passes (defence in depth).
          ageVerifiedRef.current = true;
          proceedWithItem(item);
        },
      });
      return;
    }
    proceedWithItem(item);
  }, [cfg.managerOverride, proceedWithItem]);

  // Weighed-goods add: the scale returns grams; we add a generic line priced by weight (kg as qty),
  // mirroring the legacy /retail scale flow. Operators set the unit price from the cart afterwards.
  const handleScaleAddToCart = useCallback((weightGrams: number) => {
    const weightKg = weightGrams / 1000;
    const weighedItem: MenuItem = {
      id: `scale-${Date.now()}`,
      name: 'Weighed Item',
      sku: 'SCALE',
      price: 0,
      category: 'Weighed',
      item_type: 'GOODS',
    };
    addItemToCart(weighedItem, undefined, weightKg);
  }, [addItemToCart]);

  // ─── Barcode Scanner (global — only fires when no input is focused) ────────

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only active when focus is NOT on any input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Enter' && barcodeBuffer.length >= 4) {
        const match = menuItems.find((m) => m.sku === barcodeBuffer);
        if (match) {
          handleItemTap(match);
          toast.success(`Scanned: ${match.name}`);
        } else {
          toast.error(`No item found for barcode: ${barcodeBuffer}`);
        }
        setBarcodeBuffer('');
        return;
      }
      // Retail/pharmacy keyboard-first checkout: Enter (no pending scan) finalizes → payment.
      if (e.key === 'Enter' && cfg.keyboardCheckout) {
        e.preventDefault();
        placeOrderRef.current();
        return;
      }
      if (/^[a-zA-Z0-9]$/.test(e.key)) {
        setBarcodeBuffer((prev) => prev + e.key);
        clearTimeout(timer);
        timer = setTimeout(() => setBarcodeBuffer(''), 300);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [barcodeBuffer, menuItems, handleItemTap, cfg.keyboardCheckout]);

  // Handle Enter in the search box to attempt barcode lookup
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.length >= 4) {
      // Attempt barcode match by SKU
      const match = menuItems.find((m) => m.sku === searchQuery.trim());
      if (match) {
        handleItemTap(match);
        handleSearchChange('');
        toast.success(`Scanned: ${match.name}`);
        e.preventDefault();
      }
    }
  }, [searchQuery, menuItems, handleItemTap]);

  // ─── Cart Operations ────────────────────────────────────────────────────

  const updateQuantity = (index: number, delta: number) => {
    setCart((prev) =>
      prev.map((c, i) => (i === index ? { ...c, quantity: c.quantity + delta } : c)).filter((c) => c.quantity > 0)
    );
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const clearCart = () => {
    setCart([]);
    ageVerifiedRef.current = false;
    setManualDiscountState(0);
    setDiscountReason('');
    setOrderTax(0);
    setCharges({});
    // Every cart reset (sale placed, parked, voided, or Clear all) detaches the customer and
    // falls back to the Walk-in default — the last customer served must never silently stick
    // to the NEXT sale. customerResetSeq remounts the LoyaltyPanel (its picker state is local).
    setLoyaltyState(null);
    setCustomerResetSeq((s) => s + 1);
  };

  // Apply or clear a manual order-level discount (KES amount).
  const applyDiscount = (amount: number, reason: string) => {
    setManualDiscountState(Math.max(0, amount));
    setDiscountReason(reason);
    setDiscountOpen(false);
  };

  // Manager quick-edit: order-level tax added on top of per-line tax (0 clears it).
  const applyOrderTax = (amount: number) => {
    setOrderTax(Math.max(0, amount));
    setOrderTaxOpen(false);
  };

  // Manager quick-edit: additional costs (packaging/service/shipping); zero entries drop out.
  const applyCharges = (next: Record<string, number>) => {
    const cleaned: Record<string, number> = {};
    for (const [k, v] of Object.entries(next)) {
      if (v > 0) cleaned[k] = v;
    }
    setCharges(cleaned);
    setChargesOpen(false);
  };

  // repriceCart switches the pricing profile and re-resolves each cart line's base price against the
  // matching inventory pricing tier (RETAIL/WHOLESALE). On any failure a line keeps its current price.
  const repriceCart = useCallback(
    async (profile: string) => {
      setPricingProfile(profile);
      const tenantId = user?.tenant_id ?? '';
      if (cart.length === 0 || !tenantId) return;
      setRepricing(true);
      try {
        const updated = await Promise.all(
          cart.map(async (c) => {
            // Non-billable lines stay FREE — no pricing tier may re-introduce a charge.
            if (c.nonBillable) return c;
            // Fast path: the line already carries every tier's price from the catalog payload.
            const local = c.prices?.[profile];
            if (typeof local === 'number' && local > 0) {
              return { ...c, price: local };
            }
            // Fallback: quantity-aware resolve against inventory (handles tiers not in the map).
            try {
              const res = await apiClient.get<{ unit_price?: number }>(
                `/api/v1/${tenantId}/pos/catalog/pricing/resolve?item_id=${encodeURIComponent(c.id)}&quantity=${c.quantity}&profile=${profile}`
              );
              if (res && typeof res.unit_price === 'number' && res.unit_price > 0) {
                return { ...c, price: res.unit_price };
              }
            } catch {
              /* keep current price on failure */
            }
            return c;
          })
        );
        setCart(updated);
      } finally {
        setRepricing(false);
      }
    },
    [cart, user]
  );

  const updateCourse = (index: number, course: CourseValue) => {
    setCart((prev) => prev.map((c, i) => i === index ? { ...c, courseNumber: course } : c));
  };

  // Assign a cart line to a seat/guest (1-based; 0 = shared). Drives split-by-item pre-population.
  const setItemSeat = (index: number, seat: number) => {
    setCart((prev) => prev.map((c, i) => i === index ? { ...c, seat: seat || undefined } : c));
  };

  // Per-item tax: each line carries its own treasury-sourced rate/inclusive flag (enriched by
  // inventory-api, passed through pos-api). We aggregate per line instead of applying one flat
  // outlet rate over the whole cart — this eliminates the double-tax on tax-inclusive items and
  // honours each item's real rate. `taxRate` (posSettings.vat_rate) is now only the LEGACY fallback
  // for items with no treasury tax info. See src/lib/pos/cart-tax.ts.
  // BOGO auto-add: `item.quantity` stays the PAID quantity (so +/- controls are unchanged); the
  // free "get" units are DERIVED and folded into the EFFECTIVE quantity used for totals, stock,
  // and the persisted order line. A 100%-off deal makes them free; a <100% deal charges the
  // reduced rate — both via the standard BOGO discount, which keys off the effective quantity.
  const bogoFreeFor = useCallback(
    (item: CartItem) => bogoFreeUnitsForSku(item.sku, item.quantity, activeHappyHours),
    [activeHappyHours],
  );
  const effectiveQtyFor = useCallback(
    (item: CartItem) => item.quantity + bogoFreeFor(item),
    [bogoFreeFor],
  );

  const { subtotal, tax, inclusiveTax } = useMemo(() => {
    const lines = cart.map((item) => ({
      // Gross over the effective quantity (paid + BOGO free units); the free units' value is
      // then removed by the happy-hour discount below, mirroring pos-api's line/total math.
      gross: (item.price + (item.modifierTotal ?? 0)) * effectiveQtyFor(item),
      taxRate: item.taxRate,
      taxInclusive: item.taxInclusive,
    }));
    const r = computeCartTax(lines, taxRate * 100);
    return { subtotal: r.subtotal, tax: r.tax, inclusiveTax: r.inclusiveTax };
  }, [cart, taxRate, effectiveQtyFor]);
  const loyaltyDiscount = loyaltyState?.redeemDiscount ?? 0;
  const chargesTotal = Object.values(charges).reduce((s, v) => s + (v > 0 ? v : 0), 0);
  // Live happy-hour auto-discount — mirrors pos-api's checkout evaluator so the cashier sees the
  // deal (discount line + per-item badge) BEFORE placing. The server recomputes authoritatively.
  const happyHour = useMemo(() => {
    const lines: HHLine[] = cart.map((item) => {
      const unit = item.price + (item.modifierTotal ?? 0);
      const qty = item.quantity + bogoFreeUnitsForSku(item.sku, item.quantity, activeHappyHours);
      return { sku: item.sku, category: item.category, unitPrice: unit, quantity: qty, total: unit * qty };
    });
    return computeHappyHour(lines, activeHappyHours);
  }, [cart, activeHappyHours]);
  const happyHourDiscount = happyHour.total;
  // Whole-number payable (QA req 5): ceiling round-off applied ONCE at the order level —
  // the same math pos-api's finalizeTotals runs, so till total == stored total.
  const { roundOff, total } = applyRoundOff(
    subtotal + tax + orderTax + chargesTotal - loyaltyDiscount - manualDiscount - happyHourDiscount
  );
  const cartItemCount = cart.reduce((s, c) => s + c.quantity, 0);

  // ─── Place Order ────────────────────────────────────────────────────────

  const handleFireCourse = async (course: number) => {
    if (!currentOrderId || firingCourse !== null) return;
    setFiringCourse(course);
    const tenantId = user?.tenant_id ?? '';
    try {
      await apiClient.post(`/api/v1/${tenantId}/pos/orders/${currentOrderId}/fire-course`, { course });
      setFiredCourses(course);
      const courseName = COURSES.find((c) => c.value === course)?.label ?? `Course ${course}`;
      toast.success(`${courseName} fired to kitchen`);
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to fire course'));
    } finally {
      setFiringCourse(null);
    }
  };

  const orderLines = cart.map((item) => {
    const freeQty = bogoFreeUnitsForSku(item.sku, item.quantity, activeHappyHours);
    const effQty = item.quantity + freeQty;
    return ({
    catalog_item_id: item.id,
    sku: item.sku || '',
    name: item.name,
    // Drives server-side KDS station routing (kitchen vs bar) via category_filter — without
    // it the server falls back to fragile name-substring matching or the first station.
    category: item.category,
    // BOGO: send the EFFECTIVE quantity (paid + free) so stock deducts every physical unit and
    // pos-api's calculateBOGODiscount prices the free/discounted "get" units. total_price is the
    // gross over the effective quantity; the server subtracts the BOGO discount at checkout.
    quantity: effQty,
    unit_price: item.price + (item.modifierTotal ?? 0),
    total_price: (item.price + (item.modifierTotal ?? 0)) * effQty,
    course_number: item.courseNumber ?? 0,
    // Per-line tax exactly as this till charged it (treasury-enriched catalog) — the server
    // uses these to make the recorded payable equal the amount rung up (no phantom flat VAT).
    ...(item.taxCodeId ? { tax_code_id: item.taxCodeId } : {}),
    ...(item.taxInclusive != null ? { price_includes_tax: item.taxInclusive } : {}),
    ...(typeof item.taxRate === 'number' ? { tax_rate: item.taxRate } : {}),
    metadata: {
      ...(item.seat ? { seat: item.seat } : {}),
      // Sent as the resolved {group,option,price} details, not the raw group→option-id map —
      // pos-api persists these straight to POSLineModifier with no second catalog lookup.
      ...(item.selectedModifierDetails?.length ? { modifiers: item.selectedModifierDetails } : {}),
      ...(item.notes ? { notes: item.notes } : {}),
      ...(item.serialNumber ? { serial_number: item.serialNumber } : {}),
      // Selling-price guardrails so the backend hard-blocks out-of-band prices (manager override).
      ...(item.minSellingPrice != null ? { min_price: item.minSellingPrice } : {}),
      ...(item.maxSellingPrice != null ? { max_price: item.maxSellingPrice } : {}),
      // The preset catalog price travels on EVERY edited line (markdown or markup) so the
      // backend audits against it — the price_override flag additionally marks markdowns
      // (the server gates those via price.override regardless of the flag).
      ...(item.originalPrice != null ? { original_price: item.originalPrice } : {}),
      ...(item.originalPrice != null && item.price < item.originalPrice
        ? { price_override: true, override_reason: item.overrideReason ?? '' }
        : {}),
      // Free-of-charge flag (ugali-type accompaniments / supplies) — the server zeroes the
      // line on this marker even if a price sneaks in.
      ...(item.nonBillable ? { non_billable: true } : {}),
      // BOGO free-unit count folded into the quantity above (for the receipt "N + M free" note).
      ...(freeQty > 0 ? { bogo_free_qty: freeQty } : {}),
    },
  }); });

  // Silent kitchen/bar STATION chit print for a set of cart lines, honoring the outlet's
  // printer setup — shared by send-to-kitchen (all lines, no banner) and add-to-bill
  // (delta lines + "ADDITIONAL ITEMS" banner). Only fires when NO Local Print Agent is
  // online (the server queue owns printing then — printing here too would double-print)
  // and the outlet enabled auto_print_kitchen. Never opens a browser dialog.
  const printStationTicketsForLines = useCallback((ticketLines: CartItem[], banner: string | undefined, orderNumber: string) => {
    if (!isHospitality || ticketLines.length === 0) return;
    if ((posSettings as any)?.print_agent_online) return;
    if (!((posSettings as any)?.auto_print_kitchen ?? false)) return;
    void printKitchenBarTickets({
      orderNumber,
      tableRef: tableName ? `Table ${tableName}` : '',
      bannerLabel: banner,
      lines: ticketLines.map((c) => {
        const eff = effectiveQtyFor(c);
        return {
          name: c.name,
          // Kitchen/bar must prepare the free BOGO unit too → effective quantity.
          quantity: eff,
          category: c.category,
          notes: c.notes,
          unitPrice: c.price + (c.modifierTotal ?? 0),
          totalPrice: (c.price + (c.modifierTotal ?? 0)) * eff,
        };
      }),
      kdsStations: kdsStationsData?.data ?? [],
      stations: (posSettings as any)?.printer_profiles ?? [],
      includeCustomerBill: false,
      currency: (posSettings as any)?.currency ?? 'KES',
      autoPrintKitchen: true,
      autoPrintBill: false,
      silent: true,
    }).then((res) => {
      if (res.skipped.length > 0) {
        toast.info(`Ticket print skipped (no printer): ${[...new Set(res.skipped)].join(', ')} — check Settings → Receipt.`);
      }
    });
  }, [isHospitality, posSettings, tableName, kdsStationsData, effectiveQtyFor]);

  const handlePlaceOrder = () => {
    if (cart.length === 0) return;

    // Add-to-bill mode: append lines to existing order
    if (isAddToBill && billOrderId) {
      // Snapshot the just-added lines BEFORE clearCart() — they are the delta chit's content.
      const addedLines = [...cart];
      addOrderLines.mutate(
        { orderId: billOrderId, lines: orderLines },
        {
          onSuccess: () => {
            // Delta kitchen/bar chit for ONLY the added items. When a Local Print Agent is
            // online the SERVER queue prints it (enqueueStationTicketsForLines); this client
            // silent path covers agent-less outlets so stations never miss an add-to-bill —
            // the gap behind the "chef re-fired the whole bill" incident.
            printStationTicketsForLines(addedLines, 'ADDITIONAL ITEMS', billOrderId.slice(0, 8));
            clearCart();
            setCartOpen(false);
            setOrderPlacedId(billOrderId);
            setOrderPlacedNumber('');
            setOrderPlacedOpen(true);
          },
          onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to add items to bill. Please try again.')),
        }
      );
      return;
    }

    // Hospitality: enforce order type selection before placing
    if (isHospitality && !orderSubtype) {
      toast.error('Please select Dine-In or Takeaway before placing the order.');
      return;
    }
    if (isHospitality && orderSubtype === 'dine_in' && !tableId) {
      toast.error('Please select a table first.');
      router.push(`/${orgSlug}/tables`);
      return;
    }

    const courses = [...new Set(cart.map((i) => (i.courseNumber ?? 0) as CourseValue).filter((c) => c > 0))].sort() as CourseValue[];
    // place() is retryable with a manager approval_token when the discount exceeds
    // the outlet's limit (backend returns 422).
    const place = (approval?: { approvalToken?: string; code?: string }) => createOrder.mutate(
      {
        outletId: orderOutletID,
        orderSubtype: orderSubtype ?? defaultOrderSubtype,
        tableId: tableId || undefined,
        coversCount: coversParam > 1 ? coversParam : undefined,
        discountAmount: (loyaltyDiscount + manualDiscount) || undefined,
        discountReason: discountReason || undefined,
        orderTaxAmount: orderTax || undefined,
        charges: chargesTotal > 0 ? charges : undefined,
        approvalToken: approval?.approvalToken,
        approvalCode: approval?.code,
        customerPhone: loyaltyState?.customerPhone || undefined,
        customerName: loyaltyState?.customerName || undefined,
        ageVerified: ageVerifiedRef.current || undefined,
        // Delivery orders carry the dropoff details so pos-api can build a logistics delivery task
        // when a rider is dispatched. Address/notes come from the customer capture step.
        metadata: orderSubtype === 'delivery'
          ? {
              ...(deliveryInfo.address ? { delivery_address: deliveryInfo.address } : {}),
              ...(deliveryInfo.notes ? { delivery_notes: deliveryInfo.notes } : {}),
            }
          : undefined,
        lines: orderLines,
      },
      {
        onSuccess: (data: any) => {
          const orderId = data.id || data.order_id || '';
          setCurrentOrderId(orderId);
          setCurrentOrderNumber(data.order_number || '');
          setFiredCourses(0);
          setCurrentOrderCourses(courses);
          {
            // Prefer the SERVER lines from the create response (real POSOrderLine ids — required
            // by per-line set-aside/replace); the cart mapping is only an offline/legacy fallback.
            const serverLines: any[] = data.edges?.lines ?? data.lines ?? [];
            setCurrentOrderLines(serverLines.length ? mapServerLines(serverLines) : cart.map((item) => {
              const eff = effectiveQtyFor(item);
              return {
                id: item.id,
                name: item.name,
                quantity: eff,
                unitPrice: item.price + (item.modifierTotal ?? 0),
                totalPrice: (item.price + (item.modifierTotal ?? 0)) * eff,
                seat: item.seat,
              };
            }));
          }

          // Mark table occupied when a dine-in order is created with a table
          if (tableId && orderId) {
            assignTable.mutate({ tableId, orderId });
          }

          // Dine-in: show OrderPlacedDialog (handles logout on OK/print)
          if (orderSubtype === 'dine_in') {
            clearCart();
            setCartOpen(false);
            setOrderPlacedId(orderId);
            setOrderPlacedNumber(data.order_number || '');
            setOrderPlacedOpen(true);
            return;
          }

          setCartOpen(false);
          setPaymentOpen(true);
        },
        onError: async (err: any) => {
          const status = err?.response?.status;
          const data = err?.response?.data ?? {};
          // Over-limit discount or price override → require a manager step-up, then retry.
          if (status === 422 && data.approval_required) {
            setPendingApprovalAction(data.action || 'order.discount_override');
            return;
          }
          toast.error(await apiErrorMessage(err, 'Failed to create order. Please try again.'));
        },
      }
    );
    placeWithDiscountApprovalRef.current = place;
    place();
  };

  // Confirm a manager approval (discount / price override / adjustment) and retry the order.
  // Accepts either a live step-up token or a manager-generated one-time code (ApprovalResult).
  const confirmApproval = (approval: { approvalToken?: string; code?: string }) => {
    setPendingApprovalAction(null);
    placeWithDiscountApprovalRef.current?.(approval);
  };

  // Override a cart line's unit price (2026-07-18 policy revision): managers/admins
  // (pos.orders.manage) set any price silently. Everyone else may sell AT or ABOVE the
  // preset freely (allow_price_above_base), and may now ENTER a below-preset price too —
  // the outlet policy decides what happens at placement: require_approval_below_base ON
  // (default) → the server 422s and the manager-approval dialog (price.override) collects
  // a step-up; OFF → free markdowns. So the till no longer clamps below-preset entries;
  // enforcement is fully server-side. The preset is recorded as originalPrice so the
  // backend can audit/gate markdowns (price.override).
  const setLinePrice = (index: number, newPrice: number, reason: string) => {
    setCart((prev) => prev.map((it, i) => {
      if (i !== index) return it;
      const original = it.originalPrice ?? it.price;
      let next = Math.max(0, newPrice);
      // Catalog hard ceiling applies to everyone (server band-gates it anyway).
      if (typeof it.maxSellingPrice === 'number' && it.maxSellingPrice > 0) {
        next = Math.min(next, it.maxSellingPrice);
      }
      next = Math.round(next * 100) / 100;
      // The stored unitDiscount is deliberately KEPT: a direct price/line-total edit re-bases
      // the price around the same discount value instead of clearing it.
      return { ...it, price: next, originalPrice: original, overrideReason: reason };
    }));
    setPriceEditIndex(null);
  };

  // Set/replace a line's sticky per-unit discount. Keeps the BASE price (price + old
  // discount) and lowers the effective price by the new discount; 0 clears it and returns
  // to the base. A discount that lands below the preset follows the same server-side
  // pricing policy as setLinePrice (approval dialog at placement / free when policy off).
  const setLineDiscount = (index: number, unitDiscount: number) => {
    setCart((prev) => prev.map((it, i) => {
      if (i !== index) return it;
      const original = it.originalPrice ?? it.price;
      const base = it.price + (it.unitDiscount ?? 0);
      let next = base - Math.max(0, unitDiscount);
      if (typeof it.maxSellingPrice === 'number' && it.maxSellingPrice > 0) {
        next = Math.min(next, it.maxSellingPrice);
      }
      next = Math.max(0, Math.round(next * 100) / 100);
      const applied = Math.round((base - next) * 100) / 100;
      return {
        ...it,
        price: next,
        unitDiscount: applied > 0.004 ? applied : undefined,
        originalPrice: original,
        overrideReason: applied > 0.004 ? 'line discount' : it.overrideReason,
      };
    }));
  };

  // Park the current cart as a draft order (retail orders persist as "draft") and clear the register.
  const handlePark = () => {
    if (cart.length === 0) return;
    createOrder.mutate(
      {
        outletId: orderOutletID,
        orderSubtype: orderSubtype ?? defaultOrderSubtype,
        tableId: tableId || undefined,
        coversCount: coversParam > 1 ? coversParam : undefined,
        ageVerified: ageVerifiedRef.current || undefined,
        lines: orderLines,
      },
      {
        onSuccess: () => {
          clearCart();
          toast.success('Sale parked — resume it from Parked Sales.');
        },
        onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to park sale. Please try again.')),
      }
    );
  };

  // Resume a parked (draft) sale: load it as the current order and open its payment modal.
  const handleResumeParked = (order: any) => {
    setCurrentOrderId(order.id);
    setCurrentOrderNumber(order.order_number ?? '');
    setCurrentOrderLines(mapServerLines(order.edges?.lines ?? order.lines ?? []));
    setResumeTotal(order.total_amount ?? 0);
    setParkedOpen(false);
    setPaymentOpen(true);
  };

  // Refetch the current order's lines from the server (e.g. after a replace-item changed them
  // under the open split modal) so the modal keeps working against fresh line ids in place.
  const refreshCurrentOrderLines = useCallback(async () => {
    const tenantId = user?.tenant_id ?? '';
    if (!tenantId || !currentOrderId) return;
    try {
      const fresh = await apiClient.get<any>(`/api/v1/${tenantId}/pos/orders/${currentOrderId}`);
      setCurrentOrderLines(mapServerLines(fresh.edges?.lines ?? fresh.lines ?? []));
      if (typeof fresh.total_amount === 'number') setResumeTotal(fresh.total_amount);
    } catch {
      // keep the stale snapshot; list invalidation still refreshes other surfaces
    }
  }, [user, currentOrderId]);

  // Sync the keyboard-checkout ref to the current closure each render.
  placeOrderRef.current = handlePlaceOrder;

  // settled (optional) carries the just-created order so the receipt fetch never races the async
  // setCurrentOrderId state update in the inline-bar flow — the terminal reliably shows the printable
  // receipt right after payment (QA: a print-receipt option on the terminal, not only under All Sales).
  const handlePaymentConfirmed = useCallback(async (settled?: CreatedOrder) => {
    const settledOrderId = settled?.orderId || currentOrderId;
    const settledOrderNumber = settled?.orderNumber || currentOrderNumber;
    toast.success(`Order ${settledOrderNumber} paid!`);
    // Loyalty feedback: when the sale carried a registered customer, tell the cashier the points the
    // customer earned (credited server-side on pos.sale.finalized). Anonymous walk-ins earn nothing,
    // so this only shows when a loyalty phone was attached.
    const earnRate = loyaltyPrograms?.[0]?.earn_rate ?? 0;
    if (loyaltyState?.customerPhone && earnRate > 0) {
      const pts = Math.floor(total * earnRate);
      if (pts > 0) {
        toast.success(`+${pts} loyalty pt${pts === 1 ? '' : 's'} for ${loyaltyState.customerName || loyaltyState.customerPhone}`);
      }
    }
    clearCart();
    setPaymentOpen(false);
    setCurrentOrderId('');
    setCurrentOrderCourses([]);
    setFiredCourses(0);

    // Release the table back to available after payment
    if (tableId) {
      releaseTable.mutate(tableId);
    }

    // Fetch receipt data and show the receipt preview (the terminal's after-payment print surface).
    const tenantId = user?.tenant_id ?? '';
    if (tenantId && settledOrderId) {
      try {
        const data = await apiClient.get<ReceiptData>(
          `/api/v1/${tenantId}/pos/orders/${settledOrderId}/receipt`
        );
        // "Served by" — fall back to the logged-in user when the API omits it.
        setReceiptData({ ...data, served_by: data.served_by || user?.fullName || user?.email });
        setReceiptOrderId(settledOrderId);
        setReceiptOpen(true);
        // eTIMS fiscalisation is ASYNC (treasury worker, ~30s): the receipt is fetched right
        // after payment, before the KRA fiscal identity lands. The pos-api backfills the order's
        // eTIMS fields from treasury on each receipt fetch, so poll a few times until the CU inv
        // no / signature / QR appear, then merge them into the open receipt (no manual reprint).
        if (!data.etims_cu_inv_no && !data.etims_invoice_number) {
          void (async () => {
            for (let attempt = 0; attempt < 10; attempt++) {
              await new Promise((r) => setTimeout(r, 5000));
              try {
                const fresh = await apiClient.get<ReceiptData>(
                  `/api/v1/${tenantId}/pos/orders/${settledOrderId}/receipt`
                );
                if (fresh.etims_cu_inv_no || fresh.etims_invoice_number) {
                  setReceiptData((prev) =>
                    prev && prev.order_number === data.order_number
                      ? {
                          ...prev,
                          etims_invoice_number: fresh.etims_invoice_number,
                          etims_qr_code_url: fresh.etims_qr_code_url,
                          etims_qr_png: fresh.etims_qr_png,
                          etims_scu_id: fresh.etims_scu_id,
                          etims_cu_inv_no: fresh.etims_cu_inv_no,
                          etims_rcpt_sign: fresh.etims_rcpt_sign,
                          etims_kra_pin: fresh.etims_kra_pin,
                          // Fiscalisation just landed — the barcode switches from the plain order
                          // number to the eTIMS CU invoice number (FiscalBarcodeValue on the server).
                          barcode_png: fresh.barcode_png,
                          barcode_value: fresh.barcode_value,
                        }
                      : prev,
                  );
                  break;
                }
              } catch {
                // keep polling — transient
              }
            }
          })();
        }
      } catch {
        // Receipt fetch failed — not critical, payment already confirmed
      }
    }
  }, [currentOrderNumber, currentOrderId, user, tableId, releaseTable, total, loyaltyState, loyaltyPrograms]);

  // ─── Inline GoDigital payment bar orchestration ─────────────────────────
  // createOrderAsync creates (and returns) the order so the inline bar can settle against it,
  // mirroring handlePlaceOrder's validation. The bar owns the tender; the page owns order creation.
  const createOrderAsync = useCallback(async (): Promise<CreatedOrder | null> => {
    if (cart.length === 0) return null;
    if (isHospitality && !orderSubtype) {
      toast.error('Please select Dine-In or Takeaway before placing the order.');
      return null;
    }
    if (isHospitality && orderSubtype === 'dine_in' && !tableId) {
      toast.error('Please select a table first.');
      router.push(`/${orgSlug}/tables`);
      return null;
    }
    const courses = [...new Set(cart.map((i) => (i.courseNumber ?? 0) as CourseValue).filter((c) => c > 0))].sort() as CourseValue[];
    try {
      const data: any = await createOrder.mutateAsync({
        outletId: orderOutletID,
        orderSubtype: orderSubtype ?? defaultOrderSubtype,
        tableId: tableId || undefined,
        coversCount: coversParam > 1 ? coversParam : undefined,
        discountAmount: loyaltyDiscount || undefined,
        customerPhone: loyaltyState?.customerPhone || undefined,
        customerName: loyaltyState?.customerName || undefined,
        ageVerified: ageVerifiedRef.current || undefined,
        metadata: orderSubtype === 'delivery'
          ? {
              ...(deliveryInfo.address ? { delivery_address: deliveryInfo.address } : {}),
              ...(deliveryInfo.notes ? { delivery_notes: deliveryInfo.notes } : {}),
            }
          : undefined,
        lines: orderLines,
      });
      const orderId = data.id || data.order_id || '';
      const orderNumber = data.order_number || '';
      setCurrentOrderId(orderId);
      setCurrentOrderNumber(orderNumber);
      setFiredCourses(0);
      setCurrentOrderCourses(courses);
      {
        // Same as handlePlaceOrder: server line ids when present, cart mapping as fallback.
        const serverLines: any[] = data.edges?.lines ?? data.lines ?? [];
        setCurrentOrderLines(serverLines.length ? mapServerLines(serverLines) : cart.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.price + (item.modifierTotal ?? 0),
          totalPrice: (item.price + (item.modifierTotal ?? 0)) * item.quantity,
        })));
      }
      if (tableId && orderId) assignTable.mutate({ tableId, orderId });
      return { orderId, orderNumber };
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to create order. Please try again.'));
      return null;
    }
  }, [cart, isHospitality, orderSubtype, tableId, coversParam, loyaltyDiscount, loyaltyState, orderLines, outlet, createOrder, assignTable, router, orgSlug]);

  // unpaid=true → dine-in send-to-kitchen or COD: show the order-placed dialog (no receipt yet).
  // unpaid=false → tender settled: reuse handlePaymentConfirmed (receipt + table release + reset).
  const handleInlineSettled = useCallback((ord: CreatedOrder, opts?: { unpaid?: boolean }) => {
    if (opts?.unpaid) {
      // Send-to-Kitchen (dine-in) / COD: print kitchen + bar STATION tickets per the outlet's
      // printer setup. The customer bill is NOT printed here — OrderPlacedDialog owns the bill
      // (server-rendered receipt) so it never prints twice. Shared silent path with add-to-bill's
      // delta chit; skips entirely when a Local Print Agent is online (server queue owns it).
      printStationTicketsForLines(cart, undefined, ord.orderNumber || ord.orderId.slice(0, 8));
      clearCart();
      setCartOpen(false);
      setOrderPlacedId(ord.orderId);
      setOrderPlacedNumber(ord.orderNumber);
      setOrderPlacedOpen(true);
      return;
    }
    // Pass the just-settled order through so the receipt fetch uses its id directly (no state race).
    handlePaymentConfirmed(ord);
  }, [handlePaymentConfirmed, cart, printStationTicketsForLines]);

  // Multiple Pay → the order already exists (created by the bar); open the split modal against it.
  const handleInlineSplit = useCallback((_ord: CreatedOrder) => {
    setResumeTotal(null);
    setPaymentOpen(true);
  }, []);

  // Close the after-payment receipt and, on a shared terminal (auto_logout_after_sale + non-manager
  // operator), log out so the next operator signs in. This is the "made a sale" logout for the
  // immediate-payment (retail/QSR) flow — the dine-in "placed an order" logout is handled earlier
  // by OrderPlacedDialog.
  const handleReceiptClose = useCallback(() => {
    setReceiptOpen(false);
    setReceiptData(null);
    if (autoLogoutAfterSale) {
      router.replace(`/${orgSlug}/pin-login`);
    }
  }, [autoLogoutAfterSale, orgSlug, router]);

  const value: TerminalContextValue = {
    orgSlug, cfg, isHospitality, isAddToBill, user, outlet, can, taxRate,
    scanInputRef,
    activeCategory, searchQuery, displayMode, setDisplayMode, page, setPage, PAGE_SIZE,
    pickerMode, setPickerMode, activeBrand, brands, handleBrandChange,
    totalItems, totalPages, menuLoading, menuItems, filteredItems, categories,
    handleCategoryChange, handleSearchChange, handleSearchKeyDown,
    cart, cartItemCount, subtotal, tax, inclusiveTax, loyaltyDiscount, total,
    happyHourDiscount, happyHour,
    manualDiscount, discountReason, discountOpen, setDiscountOpen, applyDiscount,
    orderTax, orderTaxOpen, setOrderTaxOpen, applyOrderTax,
    charges, chargesTotal, chargesOpen, setChargesOpen, applyCharges, roundOff,
    pendingApprovalAction, setPendingApprovalAction, confirmApproval,
    priceEditIndex, setPriceEditIndex, setLinePrice, setLineDiscount,
    addItemToCart, handleItemTap, proceedWithItem, handleScaleAddToCart,
    updateQuantity, removeFromCart, clearCart, bogoFreeFor, updateCourse, setItemSeat,
    pricingProfile, pricingTiers, repricing, repriceCart,
    loyaltyState, setLoyaltyState, customerResetSeq, scaleDeviceId,
    orderSubtype, setOrderSubtype, deliveryInfo, setDeliveryInfo, tableId, tableName,
    billOrderTotal,
    handlePlaceOrder, handlePark, handleResumeParked, createOrderAsync,
    handleInlineSettled, handleInlineSplit,
    createOrderPending: createOrder.isPending,
    addOrderLinesPending: addOrderLines.isPending,
    currentOrderId, currentOrderNumber, currentOrderCourses, firedCourses, firingCourse, handleFireCourse,
    paymentOpen, setPaymentOpen, currentOrderLines, refreshCurrentOrderLines, resumeTotal, setResumeTotal, handlePaymentConfirmed,
    expenseOpen, setExpenseOpen, recentOpen, setRecentOpen, registerOpen, setRegisterOpen,
    sellReturnOpen, setSellReturnOpen, calcOpen, setCalcOpen, cartOpen, setCartOpen,
    parkedOpen, setParkedOpen,
    heldItemsOpen, setHeldItemsOpen,
    modifierItem, setModifierItem,
    variantItem, setVariantItem, handleVariantChosen,
    voidOpen, setVoidOpen, voidOrderMutateAsync: voidOrder.mutateAsync, setCurrentOrderId, setCurrentOrderNumber,
    receiptData, receiptOpen, setReceiptOpen, setReceiptData, receiptOrderId,
    orderPlacedOpen, setOrderPlacedOpen, orderPlacedId, orderPlacedNumber,
    pendingOverride, setPendingOverride,
    serialPrompt, setSerialPrompt, serialInput, setSerialInput,
    agePrompt, setAgePrompt,
    posSettings,
    autoLogoutAfterSale,
    handleReceiptClose,
  };

  return <TerminalContext.Provider value={value}>{children}</TerminalContext.Provider>;
}
