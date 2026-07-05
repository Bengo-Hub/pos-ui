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
import { computeCartTax } from '@/lib/pos/cart-tax';
import { terminalConfigFor, type TerminalConfig } from '@/lib/use-case-config';
import {
  useFullCatalog, useCategories, useCreateOrder, useAddOrderLines, useVoidOrder,
  useAssignTable, useReleaseTable, usePricingTiers, type OrderSubtype,
} from '@/hooks/usePOS';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { useKDSStations } from '@/hooks/useKDS';
import { useLoyaltyPrograms } from '@/hooks/useLoyalty';
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
  // ── Per-item tax (enriched by inventory-api from treasury, the source of truth) ──
  // The terminal applies THESE at checkout instead of a flat outlet rate. See computeCartTax.
  taxCodeId?: string;
  taxInclusive?: boolean;   // when true, `price` ALREADY includes the tax — never add on top
  taxRate?: number;         // VAT % for this item (e.g. 16). undefined → no treasury info (legacy fallback)
  netPrice?: number;        // unit price excluding tax (informational)
  taxAmount?: number;       // tax portion of the unit price (informational)
}

export interface CartItem extends MenuItem {
  quantity: number;
  selectedModifiers?: Record<string, string[]>;
  modifierTotal?: number;
  serialNumber?: string;
  notes?: string;
  courseNumber?: CourseValue;
  /** Seat/guest this item belongs to (1-based; 0/undefined = shared/unassigned). Pre-populates split-by-item. */
  seat?: number;
  /** Catalog price before a manual price override (markdown). */
  originalPrice?: number;
  overrideReason?: string;
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
  total: number;
  // Manual order-level discount
  manualDiscount: number;
  discountReason: string;
  discountOpen: boolean;
  setDiscountOpen: (v: boolean) => void;
  applyDiscount: (amount: number, reason: string) => void;
  pendingApprovalAction: string | null;
  setPendingApprovalAction: (v: string | null) => void;
  confirmApproval: (approvalToken: string) => void;
  // Per-line price override
  priceEditIndex: number | null;
  setPriceEditIndex: (i: number | null) => void;
  setLinePrice: (index: number, newPrice: number, reason: string) => void;
  addItemToCart: (item: MenuItem, mods?: Record<string, string[]>, qty?: number, serialNumber?: string) => void;
  handleItemTap: (item: MenuItem) => void;
  proceedWithItem: (item: MenuItem) => void;
  handleScaleAddToCart: (weightGrams: number) => void;
  updateQuantity: (index: number, delta: number) => void;
  removeFromCart: (index: number) => void;
  clearCart: () => void;
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
}

const TerminalContext = createContext<TerminalContextValue | null>(null);

export function useTerminal(): TerminalContextValue {
  const ctx = useContext(TerminalContext);
  if (!ctx) throw new Error('useTerminal must be used within a <TerminalProvider>');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const user = useAuthStore((s) => s.user);
  const outlet = useAuthStore((s) => s.outlet);
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
  // Retail/pharmacy hardware scale (gated on cfg.showScale + a configured pos_scale_device_id).
  const [scaleDeviceId, setScaleDeviceId] = useState('');
  // Out-of-stock add interception → manager PIN override (retail/pharmacy, gated on cfg.managerOverride).
  const [pendingOverride, setPendingOverride] = useState<MenuItem | null>(null);
  const { can, isSuperuser } = usePermissions();
  const { data: posSettings } = usePOSSettings();
  const taxRate = (posSettings?.vat_rate ?? 16) / 100;
  // Live KDS stations — drive per-station ticket routing/printing (same category_filter routing the
  // kitchen displays use), so a ticket prints on the printer of the station it was routed to.
  const { data: kdsStationsData } = useKDSStations();
  // Active loyalty program — used to tell the cashier how many points the customer just earned.
  const { data: loyaltyPrograms } = useLoyaltyPrograms();

  // Phase 1b: in hospitality/quick_service/hotel, cashiers settle from the orders list — waiters create
  // orders from tables. A non-superuser cashier landing on /order directly is redirected to /orders.
  // Use the normalized profile so aliases like "hotel"/"bar"/"cafe"/"restaurant" are covered too.
  useEffect(() => {
    const roles = user?.roles ?? [];
    if (!isSuperuser && roles.includes('cashier') && (cfg.profile === 'hospitality' || cfg.profile === 'quick_service')) {
      router.replace(`/${orgSlug}/orders`);
    }
  }, [user, cfg.profile, isSuperuser, orgSlug, router]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [pickerMode, setPickerModeState] = useState<'category' | 'brand'>('category');
  const [activeBrand, setActiveBrand] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
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
  const [resumeTotal, setResumeTotal] = useState<number | null>(null);

  // Void order modal
  const [voidOpen, setVoidOpen] = useState(false);
  const voidOrder = useVoidOrder();
  const assignTable = useAssignTable();
  const releaseTable = useReleaseTable();

  // Receipt
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  // Order placed dialog (dine-in + add-to-bill success)
  const [orderPlacedOpen, setOrderPlacedOpen] = useState(false);
  const [orderPlacedId, setOrderPlacedId] = useState('');
  const [orderPlacedNumber, setOrderPlacedNumber] = useState('');

  // Course management (hospitality only)
  const isHospitality = ['hospitality', 'quick_service', 'hotel'].includes((outlet?.use_case ?? '').toLowerCase());
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
  const [discountReason, setDiscountReason] = useState('');
  const [discountOpen, setDiscountOpen] = useState(false);
  // Action a manager must approve (order.discount_override | price.override), set
  // from the backend's 422; null = no pending approval.
  const [pendingApprovalAction, setPendingApprovalAction] = useState<string | null>(null);
  const [priceEditIndex, setPriceEditIndex] = useState<number | null>(null);
  // Holds the latest retryable place(token) so the approval dialog can resubmit.
  const placeWithDiscountApprovalRef = useRef<((token: string) => void) | null>(null);
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
      return {
      id: item.id,
      name: item.name,
      sku: item.sku,
      description: item.description,
      price: profilePrice,
      prices: tierPrices,
      priceIsFallback,
      minSellingPrice: typeof item.min_selling_price === 'number' ? item.min_selling_price : undefined,
      maxSellingPrice: typeof item.max_selling_price === 'number' ? item.max_selling_price : undefined,
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
      if (mods && item.modifierGroups) {
        for (const group of item.modifierGroups) {
          for (const optId of mods[group.id] ?? []) {
            const opt = group.options.find((o) => o.id === optId);
            if (opt) modTotal += opt.price;
          }
        }
      }

      setCart((prev) => {
        if (mods || serialNumber) {
          return [...prev, { ...item, quantity: qty, selectedModifiers: mods, modifierTotal: modTotal, serialNumber }];
        }
        const existing = prev.find((c) => c.id === item.id && !c.selectedModifiers);
        if (existing) {
          return prev.map((c) =>
            c.id === item.id && !c.selectedModifiers ? { ...c, quantity: c.quantity + qty } : c
          );
        }
        return [...prev, { ...item, quantity: qty }];
      });

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
    [pricingProfile, pricingTiers, user],
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

  const clearCart = () => { setCart([]); ageVerifiedRef.current = false; setManualDiscountState(0); setDiscountReason(''); };

  // Apply or clear a manual order-level discount (KES amount).
  const applyDiscount = (amount: number, reason: string) => {
    setManualDiscountState(Math.max(0, amount));
    setDiscountReason(reason);
    setDiscountOpen(false);
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
  const { subtotal, tax, inclusiveTax } = useMemo(() => {
    const lines = cart.map((item) => ({
      gross: (item.price + (item.modifierTotal ?? 0)) * item.quantity,
      taxRate: item.taxRate,
      taxInclusive: item.taxInclusive,
    }));
    const r = computeCartTax(lines, taxRate * 100);
    return { subtotal: r.subtotal, tax: r.tax, inclusiveTax: r.inclusiveTax };
  }, [cart, taxRate]);
  const loyaltyDiscount = loyaltyState?.redeemDiscount ?? 0;
  const total = Math.max(0, subtotal + tax - loyaltyDiscount - manualDiscount);
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

  const orderLines = cart.map((item) => ({
    catalog_item_id: item.id,
    sku: item.sku || '',
    name: item.name,
    quantity: item.quantity,
    unit_price: item.price + (item.modifierTotal ?? 0),
    total_price: (item.price + (item.modifierTotal ?? 0)) * item.quantity,
    course_number: item.courseNumber ?? 0,
    metadata: {
      ...(item.seat ? { seat: item.seat } : {}),
      ...(item.selectedModifiers ? { modifiers: item.selectedModifiers } : {}),
      ...(item.notes ? { notes: item.notes } : {}),
      ...(item.serialNumber ? { serial_number: item.serialNumber } : {}),
      // Selling-price guardrails so the backend hard-blocks out-of-band prices (manager override).
      ...(item.minSellingPrice != null ? { min_price: item.minSellingPrice } : {}),
      ...(item.maxSellingPrice != null ? { max_price: item.maxSellingPrice } : {}),
      // Price-override markers so the backend can gate large markdowns.
      ...(item.originalPrice != null && item.price < item.originalPrice
        ? { price_override: true, original_price: item.originalPrice, override_reason: item.overrideReason ?? '' }
        : {}),
    },
  }));

  const handlePlaceOrder = () => {
    if (cart.length === 0) return;

    // Add-to-bill mode: append lines to existing order
    if (isAddToBill && billOrderId) {
      addOrderLines.mutate(
        { orderId: billOrderId, lines: orderLines },
        {
          onSuccess: () => {
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
    const place = (approvalToken?: string) => createOrder.mutate(
      {
        outletId: outlet?.id ?? '',
        orderSubtype: orderSubtype ?? undefined,
        tableId: tableId || undefined,
        coversCount: coversParam > 1 ? coversParam : undefined,
        discountAmount: (loyaltyDiscount + manualDiscount) || undefined,
        discountReason: discountReason || undefined,
        approvalToken,
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
          setCurrentOrderLines(cart.map((item) => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.price + (item.modifierTotal ?? 0),
            totalPrice: (item.price + (item.modifierTotal ?? 0)) * item.quantity,
            seat: item.seat,
          })));

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

  // Confirm a manager approval (discount or price override) and retry the order.
  const confirmApproval = (approvalToken: string) => {
    setPendingApprovalAction(null);
    placeWithDiscountApprovalRef.current?.(approvalToken);
  };

  // Override a cart line's unit price (markdown only). Records the catalog price
  // as original so the backend can gate large markdowns.
  const setLinePrice = (index: number, newPrice: number, reason: string) => {
    setCart((prev) => prev.map((it, i) => {
      if (i !== index) return it;
      const original = it.originalPrice ?? it.price;
      const capped = Math.max(0, Math.min(newPrice, original));
      return { ...it, price: capped, originalPrice: original, overrideReason: reason };
    }));
    setPriceEditIndex(null);
  };

  // Park the current cart as a draft order (retail orders persist as "draft") and clear the register.
  const handlePark = () => {
    if (cart.length === 0) return;
    createOrder.mutate(
      {
        outletId: outlet?.id ?? '',
        orderSubtype: orderSubtype ?? undefined,
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
    const lines: any[] = order.edges?.lines ?? order.lines ?? [];
    setCurrentOrderId(order.id);
    setCurrentOrderNumber(order.order_number ?? '');
    setCurrentOrderLines(
      lines.map((l) => ({
        id: l.id,
        name: l.name ?? l.item_name ?? l.sku ?? 'Item',
        quantity: l.quantity ?? 1,
        unitPrice: l.unit_price ?? 0,
        totalPrice: (l.unit_price ?? 0) * (l.quantity ?? 1),
      }))
    );
    setResumeTotal(order.total_amount ?? 0);
    setParkedOpen(false);
    setPaymentOpen(true);
  };

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
        setReceiptData({ ...data, cashier_name: data.cashier_name || user?.fullName || user?.email });
        setReceiptOpen(true);
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
        outletId: outlet?.id ?? '',
        orderSubtype: orderSubtype ?? undefined,
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
      setCurrentOrderLines(cart.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.price + (item.modifierTotal ?? 0),
        totalPrice: (item.price + (item.modifierTotal ?? 0)) * item.quantity,
      })));
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
      // Send-to-Kitchen (dine-in) / COD: print kitchen + bar tickets per the outlet's printer setup
      // (single printer → 3-in-1 bill+kitchen+bar; multiple → split jobs) before clearing the cart.
      if (isHospitality && cart.length > 0) {
        printKitchenBarTickets({
          orderNumber: ord.orderNumber || ord.orderId.slice(0, 8),
          tableRef: tableName ? `Table ${tableName}` : '',
          lines: cart.map((c) => ({
            name: c.name,
            quantity: c.quantity,
            category: c.category,
            notes: c.notes,
            unitPrice: c.price + (c.modifierTotal ?? 0),
            totalPrice: (c.price + (c.modifierTotal ?? 0)) * c.quantity,
          })),
          kdsStations: kdsStationsData?.data ?? [],
          stations: (posSettings as any)?.printer_profiles ?? [],
          includeCustomerBill: true,
          currency: (posSettings as any)?.currency ?? 'KES',
          // Only auto-print when the outlet enabled it — otherwise the kitchen gets the order via
          // the KDS and the cashier prints manually (no surprise browser print dialog).
          autoPrintKitchen: (posSettings as any)?.auto_print_kitchen ?? false,
          autoPrintBill: (posSettings as any)?.auto_print_order ?? false,
        });
      }
      clearCart();
      setCartOpen(false);
      setOrderPlacedId(ord.orderId);
      setOrderPlacedNumber(ord.orderNumber);
      setOrderPlacedOpen(true);
      return;
    }
    // Pass the just-settled order through so the receipt fetch uses its id directly (no state race).
    handlePaymentConfirmed(ord);
  }, [handlePaymentConfirmed, isHospitality, cart, tableName, posSettings]);

  // Multiple Pay → the order already exists (created by the bar); open the split modal against it.
  const handleInlineSplit = useCallback((_ord: CreatedOrder) => {
    setResumeTotal(null);
    setPaymentOpen(true);
  }, []);

  const value: TerminalContextValue = {
    orgSlug, cfg, isHospitality, isAddToBill, user, outlet, can, taxRate,
    scanInputRef,
    activeCategory, searchQuery, displayMode, setDisplayMode, page, setPage, PAGE_SIZE,
    pickerMode, setPickerMode, activeBrand, brands, handleBrandChange,
    totalItems, totalPages, menuLoading, menuItems, filteredItems, categories,
    handleCategoryChange, handleSearchChange, handleSearchKeyDown,
    cart, cartItemCount, subtotal, tax, inclusiveTax, loyaltyDiscount, total,
    manualDiscount, discountReason, discountOpen, setDiscountOpen, applyDiscount,
    pendingApprovalAction, setPendingApprovalAction, confirmApproval,
    priceEditIndex, setPriceEditIndex, setLinePrice,
    addItemToCart, handleItemTap, proceedWithItem, handleScaleAddToCart,
    updateQuantity, removeFromCart, clearCart, updateCourse, setItemSeat,
    pricingProfile, pricingTiers, repricing, repriceCart,
    loyaltyState, setLoyaltyState, scaleDeviceId,
    orderSubtype, setOrderSubtype, deliveryInfo, setDeliveryInfo, tableId, tableName,
    billOrderTotal,
    handlePlaceOrder, handlePark, handleResumeParked, createOrderAsync,
    handleInlineSettled, handleInlineSplit,
    createOrderPending: createOrder.isPending,
    addOrderLinesPending: addOrderLines.isPending,
    currentOrderId, currentOrderNumber, currentOrderCourses, firedCourses, firingCourse, handleFireCourse,
    paymentOpen, setPaymentOpen, currentOrderLines, resumeTotal, setResumeTotal, handlePaymentConfirmed,
    expenseOpen, setExpenseOpen, recentOpen, setRecentOpen, registerOpen, setRegisterOpen,
    sellReturnOpen, setSellReturnOpen, calcOpen, setCalcOpen, cartOpen, setCartOpen,
    parkedOpen, setParkedOpen,
    modifierItem, setModifierItem,
    variantItem, setVariantItem, handleVariantChosen,
    voidOpen, setVoidOpen, voidOrderMutateAsync: voidOrder.mutateAsync, setCurrentOrderId, setCurrentOrderNumber,
    receiptData, receiptOpen, setReceiptOpen, setReceiptData,
    orderPlacedOpen, setOrderPlacedOpen, orderPlacedId, orderPlacedNumber,
    pendingOverride, setPendingOverride,
    serialPrompt, setSerialPrompt, serialInput, setSerialInput,
    agePrompt, setAgePrompt,
    posSettings,
  };

  return <TerminalContext.Provider value={value}>{children}</TerminalContext.Provider>;
}
