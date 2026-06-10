'use client';

import { Badge, Button } from '@/components/ui/base';
import { ModifierModal, type ModifierGroup } from '@/components/pos/modifier-modal';
import { SplitPaymentModal, type OrderLineItem } from '@/components/pos/split-payment-modal';
import { CourseSelector, CourseBadge, COURSES, type CourseValue } from '@/components/pos/course-selector';
import { VoidOrderModal } from '@/components/pos/void-order-modal';
import { AddExpenseModal } from '@/components/pos/add-expense-modal';
import { ParkedSalesModal } from '@/components/pos/parked-sales-modal';
import { ReceiptPreview, type ReceiptData } from '@/components/pos/receipt-preview';
import { OrderTypeSelector } from '@/components/pos/order-type-selector';
import { LoyaltyPanel, type LoyaltyState } from '@/components/retail/LoyaltyPanel';
import { StockBadge } from '@/components/retail/StockBadge';
import { ScaleDisplay } from '@/components/retail/ScaleDisplay';
import { ManagerPINOverrideModal } from '@/components/retail/ManagerPINOverrideModal';
import { CalculatorOverlay } from '@/components/pos/calculator-overlay';
import { CategoryNav } from '@/components/pos/category-nav';
import { InlinePaymentBar, type CreatedOrder } from '@/components/pos/terminal/inline-payment-bar';
import { PosToolbar } from '@/components/pos/terminal/pos-toolbar';
import { printKitchenBarTickets } from '@/lib/pos/kitchen-bar-print';
import { configFor } from '@/lib/pos/printer-stations';
import { cn } from '@/lib/utils';
import { terminalConfigFor } from '@/lib/use-case-config';
import { useMenuItems, useCategories, useCreateOrder, useAddOrderLines, useVoidOrder, useAssignTable, useReleaseTable, type OrderSubtype } from '@/hooks/usePOS';
import { OrderPlacedDialog } from '@/components/pos/order-placed-dialog';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/auth';
import { apiClient } from '@/lib/api/client';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  Ban,
  Calculator,
  ChefHat,
  Flame,
  Grid3x3,
  Image as ImageIcon,
  LayoutList,
  Loader2,
  Minus,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────────────────────

interface MenuItem {
  id: string;
  name: string;
  sku: string;
  description?: string;
  price: number;
  category: string;
  image?: string;
  item_type?: string;       // GOODS | SERVICE | RECIPE | VOUCHER
  duration_minutes?: number;
  requiresAgeVerification?: boolean;
  trackSerialNumber?: boolean;
  modifierGroups?: ModifierGroup[];
  /** On-hand stock for the StockBadge / out-of-stock override (retail/pharmacy). Only present
   *  when the backend catalog list projects stock_quantity — see integrator note. */
  stockQuantity?: number;
}

interface CartItem extends MenuItem {
  quantity: number;
  selectedModifiers?: Record<string, string[]>;
  modifierTotal?: number;
  serialNumber?: string;
  notes?: string;
  courseNumber?: CourseValue;
}

type DisplayMode = 'card' | 'list' | 'image_grid';

// Display-mode + the rest of the use-case terminal config now live in @/lib/use-case-config
// (terminalConfigFor) so a single /order terminal adapts to every vertical.

// ─── Page ───────────────────────────────────────────────────────────────────

export default function OrderPage() {
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
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  // Pricing profile (Retail/Wholesale) — switching it re-prices the cart via inventory tier prices.
  const [pricingProfile, setPricingProfile] = useState<'RETAIL' | 'WHOLESALE'>('RETAIL');
  const [repricing, setRepricing] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
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

  // Modifier modal
  const [modifierItem, setModifierItem] = useState<MenuItem | null>(null);

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

  // Reset to page 1 when search/category changes
  const handleCategoryChange = (cat: string) => { setActiveCategory(cat); setPage(1); };
  const handleSearchChange = (q: string) => { setSearchQuery(q); setPage(1); };

  const { data: catalogData, isLoading: menuLoading } = useMenuItems({
    category: activeCategory !== 'All' ? activeCategory : undefined,
    search: searchQuery || undefined,
    page,
    limit: PAGE_SIZE,
  });
  const createOrder = useCreateOrder();
  const addOrderLines = useAddOrderLines();

  const menuItems: MenuItem[] = useMemo(() => {
    const items = catalogData?.data ?? [];
    return items.map((item: any) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      description: item.description,
      price: item.price ?? 0,
      category: item.category || 'Uncategorized',
      image: item.image_url,
      item_type: item.item_type,
      duration_minutes: item.duration_minutes,
      requiresAgeVerification: item.requires_age_verification,
      trackSerialNumber: item.track_serial_numbers,
      modifierGroups: item.modifier_groups,
      // stock_quantity is only populated if the backend projects it on the catalog list (see note).
      stockQuantity: item.stock_quantity,
    }));
  }, [catalogData]);

  const totalItems = catalogData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

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

  // Server-side filtering — items returned by the API are already filtered
  const filteredItems = menuItems;

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
    },
    []
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
          proceedWithItem(item);
        },
      });
      return;
    }
    proceedWithItem(item);
  }, [cfg.managerOverride]);

  const proceedWithItem = useCallback(
    (item: MenuItem) => {
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
  }, [searchQuery, menuItems, handleItemTap, handleSearchChange]);

  // ─── Cart Operations ────────────────────────────────────────────────────

  const updateQuantity = (index: number, delta: number) => {
    setCart((prev) =>
      prev.map((c, i) => (i === index ? { ...c, quantity: c.quantity + delta } : c)).filter((c) => c.quantity > 0)
    );
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const clearCart = () => setCart([]);

  // repriceCart switches the pricing profile and re-resolves each cart line's base price against the
  // matching inventory pricing tier (RETAIL/WHOLESALE). On any failure a line keeps its current price.
  const repriceCart = useCallback(
    async (profile: 'RETAIL' | 'WHOLESALE') => {
      setPricingProfile(profile);
      const tenantId = user?.tenant_id ?? '';
      if (cart.length === 0 || !tenantId) return;
      setRepricing(true);
      try {
        const updated = await Promise.all(
          cart.map(async (c) => {
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

  const subtotal = cart.reduce((sum, item) => sum + (item.price + (item.modifierTotal ?? 0)) * item.quantity, 0);
  const tax = Math.round(subtotal * taxRate);
  const loyaltyDiscount = loyaltyState?.redeemDiscount ?? 0;
  const total = Math.max(0, subtotal + tax - loyaltyDiscount);
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
    } catch {
      toast.error('Failed to fire course');
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
      ...(item.selectedModifiers ? { modifiers: item.selectedModifiers } : {}),
      ...(item.notes ? { notes: item.notes } : {}),
      ...(item.serialNumber ? { serial_number: item.serialNumber } : {}),
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
          onError: () => toast.error('Failed to add items to bill. Please try again.'),
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
    createOrder.mutate(
      {
        outletId: outlet?.id ?? '',
        orderSubtype: orderSubtype ?? undefined,
        tableId: tableId || undefined,
        coversCount: coversParam > 1 ? coversParam : undefined,
        discountAmount: loyaltyDiscount || undefined,
        customerPhone: loyaltyState?.customerPhone || undefined,
        customerName: loyaltyState?.customerName || undefined,
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
        onError: () => {
          toast.error('Failed to create order. Please try again.');
        },
      }
    );
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
        lines: orderLines,
      },
      {
        onSuccess: () => {
          clearCart();
          toast.success('Sale parked — resume it from Parked Sales.');
        },
        onError: () => toast.error('Failed to park sale. Please try again.'),
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

  const handlePaymentConfirmed = useCallback(async () => {
    toast.success(`Order ${currentOrderNumber} paid!`);
    clearCart();
    setPaymentOpen(false);
    setCurrentOrderId('');
    setCurrentOrderCourses([]);
    setFiredCourses(0);

    // Release the table back to available after payment
    if (tableId) {
      releaseTable.mutate(tableId);
    }

    // Fetch receipt data and show the receipt preview
    const tenantId = user?.tenant_id ?? '';
    if (tenantId && currentOrderId) {
      try {
        const data = await apiClient.get<ReceiptData>(
          `/api/v1/${tenantId}/pos/orders/${currentOrderId}/receipt`
        );
        // "Served by" — fall back to the logged-in user when the API omits it.
        setReceiptData({ ...data, cashier_name: data.cashier_name || user?.fullName || user?.email });
        setReceiptOpen(true);
      } catch {
        // Receipt fetch failed — not critical, payment already confirmed
      }
    }
  }, [currentOrderNumber, currentOrderId, user, orgSlug, router]);

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
    } catch {
      toast.error('Failed to create order. Please try again.');
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
          stations: (posSettings as any)?.printer_profiles ?? [],
          includeCustomerBill: true,
          currency: (posSettings as any)?.currency ?? 'KES',
        });
      }
      clearCart();
      setCartOpen(false);
      setOrderPlacedId(ord.orderId);
      setOrderPlacedNumber(ord.orderNumber);
      setOrderPlacedOpen(true);
      return;
    }
    handlePaymentConfirmed();
  }, [handlePaymentConfirmed, isHospitality, cart, tableName, posSettings]);

  // Multiple Pay → the order already exists (created by the bar); open the split modal against it.
  const handleInlineSplit = useCallback((_ord: CreatedOrder) => {
    setResumeTotal(null);
    setPaymentOpen(true);
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col lg:flex-row overflow-hidden bg-background" style={{ height: 'calc(100vh - 80px)' }}>
      {/* ── Left Panel: Menu (60%) ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden min-h-0">

        {/* GoDigital-style quick-action toolbar (use-case + role aware) */}
        <PosToolbar
          orgSlug={orgSlug}
          profile={cfg.profile}
          canRegister={can('pos.sessions.view') || can('pos.sessions.add') || can('pos.payments.add')}
          showCalculator={cfg.showCalculator}
          onCalculator={() => setCalcOpen(true)}
          onParkedSales={() => setParkedOpen(true)}
          onAddExpense={() => setExpenseOpen(true)}
        />

        {/* Search bar — full width at very top */}
        <div className="px-4 pt-1 pb-2 shrink-0">
          <div className="relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              ref={scanInputRef}
              placeholder="Search items or scan barcode..."
              className="w-full bg-card border border-border rounded-2xl py-3.5 pl-11 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all min-h-13 font-medium placeholder:text-muted-foreground/60"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            {searchQuery && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Category nav (icon + label) + display mode toggle */}
        <div className="px-4 pb-3 flex items-center gap-3 shrink-0">
          {/* Modern icon + label category navigation (CategoryNav owns the All tab) */}
          <CategoryNav
            categories={categories}
            active={activeCategory}
            onSelect={handleCategoryChange}
            className="flex-1"
          />
          {/* Display mode toggle */}
          <div className="flex gap-0.5 shrink-0 border border-border rounded-xl p-1 bg-card">
            <button
              onClick={() => setDisplayMode('card')}
              className={cn(
                'p-2 rounded-lg transition-colors',
                displayMode === 'card' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              title="Card grid"
            >
              <Grid3x3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDisplayMode('list')}
              className={cn(
                'p-2 rounded-lg transition-colors',
                displayMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              title="List view"
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDisplayMode('image_grid')}
              className={cn(
                'p-2 rounded-lg transition-colors',
                displayMode === 'image_grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              title="Image grid"
            >
              <ImageIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Add-to-bill banner */}
        {isAddToBill && (
          <div className="mx-4 mb-3 px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 shrink-0 flex items-center gap-2">
            <span className="text-blue-600 dark:text-blue-400 font-bold text-sm">Current bill:</span>
            <span className="text-sm text-blue-700 dark:text-blue-300">
              KSh {billOrderTotal.toLocaleString()}
            </span>
          </div>
        )}

        {/* Hardware scale — retail/pharmacy only, when a scale device is configured */}
        {cfg.showScale && scaleDeviceId && (
          <div className="px-4 pb-3 shrink-0">
            <ScaleDisplay
              tenantSlug={user?.tenant_slug ?? orgSlug}
              deviceId={scaleDeviceId}
              onAddToCart={handleScaleAddToCart}
            />
          </div>
        )}

        {/* Items area — scrolls internally (extra bottom padding clears the mobile cart bar) */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-24 lg:pb-4">
          {menuLoading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading menu…</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
              <Search className="h-10 w-10 opacity-20" />
              <p className="text-sm font-medium">No items found</p>
              {searchQuery && (
                <button onClick={() => handleSearchChange('')} className="text-xs text-primary underline">
                  Clear search
                </button>
              )}
            </div>
          ) : displayMode === 'list' ? (
            /* ─── LIST / DATATABLE MODE ─── */
            <div className="rounded-2xl border border-border overflow-hidden bg-card">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 bg-muted/50 border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <span>Item</span>
                <span className="text-right w-24">Price</span>
                <span className="w-6" />
              </div>
              {filteredItems.map((item, idx) => {
                const inCart = cart.find((c) => c.id === item.id && !c.selectedModifiers);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemTap(item)}
                    className={cn(
                      'w-full grid grid-cols-[1fr_auto_auto] gap-3 items-center px-4 py-3 transition-all touch-manipulation active:scale-[0.99]',
                      idx !== 0 && 'border-t border-border',
                      inCart
                        ? 'bg-primary/5 hover:bg-primary/8'
                        : 'hover:bg-accent/40'
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0 text-left">
                      <span className={cn('h-2 w-2 rounded-full shrink-0', inCart ? 'bg-primary' : 'bg-emerald-500')} />
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate leading-tight">{item.name}</p>
                        {item.description ? (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{item.description}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                        )}
                        {item.item_type === 'SERVICE' && (
                          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">
                            {item.duration_minutes ? `Service · ${item.duration_minutes}min` : 'Service'}
                          </span>
                        )}
                        {item.item_type === 'GOODS' && (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">Goods</span>
                        )}
                        {item.item_type === 'RECIPE' && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Menu</span>
                        )}
                        {item.modifierGroups?.length ? (
                          <span className="text-[10px] text-primary">Has options</span>
                        ) : null}
                        {cfg.showStockBadge && item.stockQuantity !== undefined && (
                          <span className="block mt-0.5">
                            <StockBadge quantity={item.stockQuantity} itemType={item.item_type} />
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-bold font-mono text-right w-24">
                      KES {item.price.toLocaleString()}
                    </span>
                    {inCart ? (
                      <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                        {inCart.quantity}
                      </span>
                    ) : (
                      <span className="h-6 w-6 rounded-full border-2 border-border flex items-center justify-center shrink-0">
                        <Plus className="h-3 w-3 text-muted-foreground" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : displayMode === 'image_grid' ? (
            /* ─── IMAGE GRID MODE ─── */
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {filteredItems.map((item) => {
                const inCart = cart.find((c) => c.id === item.id && !c.selectedModifiers);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemTap(item)}
                    className={cn(
                      'relative rounded-2xl border-2 overflow-hidden transition-all active:scale-95 touch-manipulation',
                      inCart ? 'border-primary shadow-md shadow-primary/10' : 'border-border hover:border-primary/40'
                    )}
                  >
                    <div className="aspect-square bg-muted flex items-center justify-center">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="h-10 w-10 text-muted-foreground/20" />
                      )}
                    </div>
                    {/* Availability dot */}
                    <span className="absolute top-2 left-2 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
                    {inCart && (
                      <div className="absolute top-2 right-2 h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shadow-lg">
                        {inCart.quantity}
                      </div>
                    )}
                    <div className="p-3 bg-card">
                      <p className="text-sm font-bold truncate leading-tight">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5 leading-tight">{item.description}</p>
                      )}
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs font-bold font-mono text-primary">KES {item.price.toLocaleString()}</p>
                        {item.modifierGroups?.length ? (
                          <span className="text-[10px] text-primary">Has options</span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            /* ─── CARD MODE (default) — 2-col portrait → 5-col wide desktop ─── */
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {filteredItems.map((item) => {
                const inCart = cart.find((c) => c.id === item.id && !c.selectedModifiers);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemTap(item)}
                    className={cn(
                      'relative flex flex-col items-start justify-between p-4 rounded-2xl border-2 transition-all min-h-30 touch-manipulation',
                      'active:scale-95 hover:shadow-md',
                      inCart
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border bg-card hover:border-primary/30'
                    )}
                  >
                    {/* Top row: availability dot + quantity badge */}
                    <div className="flex items-center justify-between w-full mb-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      {inCart && (
                        <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                          {inCart.quantity}
                        </span>
                      )}
                    </div>
                    {/* Name */}
                    <span className="text-sm font-bold text-left leading-tight line-clamp-2 flex-1">{item.name}</span>
                    {/* Price row */}
                    <div className="flex items-center justify-between w-full mt-2">
                      <span className="text-xs font-bold font-mono text-primary">
                        KES {item.price.toLocaleString()}
                      </span>
                      {item.item_type === 'SERVICE' ? (
                        <span className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded font-semibold">
                          {item.duration_minutes ? `${item.duration_minutes}min` : 'Service'}
                        </span>
                      ) : item.modifierGroups?.length ? (
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Options</span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="shrink-0 px-4 py-2.5 border-t border-border flex items-center justify-between bg-background">
            <span className="text-xs text-muted-foreground">
              {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalItems)} of {totalItems} items
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 px-3 rounded-lg border border-border text-xs font-semibold disabled:opacity-40 hover:bg-accent transition-colors"
              >
                ← Prev
              </button>
              <span className="text-xs font-bold px-2">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="h-8 px-3 rounded-lg border border-border text-xs font-semibold disabled:opacity-40 hover:bg-accent transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Mobile sticky cart bar (hidden on lg+) ── */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-background via-background to-transparent">
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="w-full min-h-14 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 flex items-center justify-between px-5 font-bold active:scale-[0.99] transition-transform"
        >
          <span className="flex items-center gap-2.5">
            <span className="relative">
              <ShoppingCart className="h-5 w-5" />
              {cartItemCount > 0 && (
                <span className="absolute -top-2 -right-2 h-5 min-w-5 px-1 rounded-full bg-background text-primary text-[11px] font-bold flex items-center justify-center">
                  {cartItemCount}
                </span>
              )}
            </span>
            <span>{cart.length === 0 ? 'View cart' : `${cartItemCount} item${cartItemCount !== 1 ? 's' : ''}`}</span>
          </span>
          <span className="tabular-nums">KES {total.toLocaleString()}</span>
        </button>
      </div>

      {/* Mobile cart backdrop */}
      {cartOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setCartOpen(false)}
          aria-hidden
        />
      )}

      {/* ── Right Panel: Cart ──
          Desktop: static side panel. Mobile: slide-up bottom sheet toggled by cartOpen. */}
      <div
        className={cn(
          'bg-card flex flex-col min-h-0 overflow-hidden border-border',
          // Desktop side panel
          'lg:relative lg:w-96 xl:w-104 lg:border-l lg:shrink-0 lg:translate-y-0 lg:rounded-none lg:max-h-none',
          // Mobile bottom sheet
          'fixed inset-x-0 bottom-0 z-50 w-full max-h-[85vh] rounded-t-3xl border-t shadow-2xl transition-transform duration-300 ease-out lg:shadow-none',
          cartOpen ? 'translate-y-0' : 'translate-y-full lg:translate-y-0'
        )}
      >
        {/* Mobile sheet grabber + close */}
        <div className="lg:hidden relative pt-3 pb-1 shrink-0">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-border" />
          <button
            type="button"
            onClick={() => setCartOpen(false)}
            className="absolute right-4 top-2 h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-accent"
            aria-label="Close cart"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* Cart header */}
        <div className="px-5 py-4 border-b border-border shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <ShoppingCart className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <h2 className="font-bold text-sm leading-none">{isAddToBill ? 'Adding to Bill' : cfg.terminalTitle}</h2>
                {cartItemCount > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">{cartItemCount} item{cartItemCount !== 1 ? 's' : ''}</p>
                )}
              </div>
              {cartItemCount > 0 && (
                <Badge variant="default" className="ml-1 h-6 min-w-6 px-2 text-xs font-bold">
                  {cartItemCount}
                </Badge>
              )}
            </div>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs text-destructive hover:text-destructive/80 font-semibold min-h-11 px-2 hover:underline transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
          {/* Order type (Dine-In/Takeaway/Delivery/Bar Tab) is a hospitality/quick_service concept only —
              retail, pharmacy and services have no order types, so it's gated by cfg.showOrderType. */}
          {cfg.showOrderType && (
            <OrderTypeSelector
              value={orderSubtype}
              onChange={setOrderSubtype}
              tableName={tableName || undefined}
              onSelectTable={() => router.push(`/${orgSlug}/tables`)}
              useCase={outlet?.use_case}
            />
          )}
          {cfg.showPricingProfile && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Price</span>
              {(['RETAIL', 'WHOLESALE'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => repriceCart(p)}
                  disabled={repricing}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50',
                    pricingProfile === p
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {p === 'RETAIL' ? 'Retail' : 'Wholesale'}
                </button>
              ))}
              {repricing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
          )}
          {cfg.showPricingProfile && (
            <div className="mt-2">
              <LoyaltyPanel onStateChange={setLoyaltyState} />
            </div>
          )}
        </div>

        {/* Cart items — scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-10 gap-4">
              <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
                <ShoppingCart className="h-9 w-9 text-muted-foreground/30" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Cart is empty</p>
                <p className="text-sm text-muted-foreground mt-1">Add items to start an order</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {cart.map((item, idx) => (
                <div key={`${item.id}-${idx}`} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-bold truncate leading-tight">{item.name}</p>
                        {cfg.showCourses && item.courseNumber ? <CourseBadge course={item.courseNumber} /> : null}
                      </div>
                      {item.selectedModifiers && item.modifierGroups && (
                        <p className="text-xs text-primary mt-0.5 truncate">
                          {item.modifierGroups
                            .flatMap((g) =>
                              (item.selectedModifiers?.[g.id] ?? []).map(
                                (optId) => g.options.find((o) => o.id === optId)?.name
                              )
                            )
                            .filter(Boolean)
                            .join(', ')}
                        </p>
                      )}
                      {item.serialNumber && (
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">S/N: {item.serialNumber}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <p className="text-xs font-bold font-mono text-primary">
                          KES {((item.price + (item.modifierTotal ?? 0)) * item.quantity).toLocaleString()}
                        </p>
                        {cfg.showCourses && (
                          <CourseSelector
                            value={item.courseNumber ?? 0}
                            onChange={(c) => updateCourse(idx, c)}
                            compact
                          />
                        )}
                      </div>
                    </div>
                    {/* Qty controls + delete */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => updateQuantity(idx, -1)}
                        className="h-11 w-11 rounded-xl border border-border bg-background flex items-center justify-center hover:bg-accent transition touch-manipulation active:scale-95"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center text-sm font-bold tabular-nums">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(idx, 1)}
                        className="h-11 w-11 rounded-xl border border-border bg-background flex items-center justify-center hover:bg-accent transition touch-manipulation active:scale-95"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => removeFromCart(idx)}
                        className="h-11 w-11 rounded-xl flex items-center justify-center text-destructive hover:bg-destructive/10 transition touch-manipulation ml-0.5"
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sticky totals + Pay footer */}
        <div className="shrink-0 border-t border-border">
          {cart.length > 0 && (
            <div className="px-5 pt-4 pb-2 space-y-2 bg-muted/30">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium tabular-nums">KES {subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">VAT ({Math.round(taxRate * 100)}%)</span>
                <span className="font-medium tabular-nums">KES {tax.toLocaleString()}</span>
              </div>
              {loyaltyDiscount > 0 && (
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>Loyalty redemption</span>
                  <span className="font-medium tabular-nums">- KES {loyaltyDiscount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-border">
                <span className="font-bold text-base">Total</span>
                <span className="font-bold text-base tabular-nums text-primary">KES {total.toLocaleString()}</span>
              </div>
            </div>
          )}
          {/* Add-to-bill keeps its single append button; everything else uses the GoDigital-style
              inline payment bar (methods rendered directly on the page, no method-picker modal). */}
          {isAddToBill ? (
            <div className="p-5 pt-3">
              <Button
                onClick={handlePlaceOrder}
                disabled={cart.length === 0 || addOrderLines.isPending}
                className={cn(
                  'w-full min-h-14 text-base font-bold rounded-2xl gap-2.5 transition-all',
                  cart.length > 0 ? 'shadow-lg shadow-primary/20 hover:shadow-primary/30' : 'opacity-50 cursor-not-allowed'
                )}
              >
                {addOrderLines.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ChefHat className="h-5 w-5" />}
                {cart.length === 0 ? 'Add items to bill' : 'Add to Bill →'}
              </Button>
            </div>
          ) : (
            <InlinePaymentBar
              total={total}
              tenantSlug={user?.tenant_slug ?? ''}
              profile={cfg.profile}
              isHospitality={isHospitality}
              allowCOD={cfg.profile === 'retail' || cfg.profile === 'quick_service'}
              customerEmail={(loyaltyState as any)?.customerEmail}
              disabled={cart.length === 0}
              mode={isHospitality && orderSubtype === 'dine_in' ? 'send_to_kitchen' : 'pay'}
              createOrderAsync={createOrderAsync}
              onSettled={handleInlineSettled}
              onDraft={handlePark}
              onQuotation={handlePark}
              onCancel={clearCart}
              onSplit={handleInlineSplit}
            />
          )}
          <div className="p-5 pt-3 space-y-2">
            {/* Add Expense, Park (Draft) and Parked/Suspended Sales now live in the top toolbar +
                inline payment bar — no duplicate retail-style buttons cluttering the cart card. */}
            {currentOrderId && can('pos.orders.void') && (
              <button
                type="button"
                onClick={() => setVoidOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-destructive/40 text-destructive text-sm font-semibold hover:bg-destructive/5 transition-colors"
              >
                <Ban className="h-4 w-4" />
                Void Order #{currentOrderNumber}
              </button>
            )}
            {cfg.showCourses && currentOrderId && currentOrderCourses.length > 0 && (
              <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wide">
                  <ChefHat className="h-3.5 w-3.5" /> Fire Courses
                </div>
                <div className="flex flex-wrap gap-2">
                  {currentOrderCourses.map((c) => {
                    const label = COURSES.find((x) => x.value === c)?.label ?? `Course ${c}`;
                    const alreadyFired = c <= firedCourses;
                    return (
                      <button
                        key={c}
                        type="button"
                        disabled={alreadyFired || firingCourse !== null}
                        onClick={() => handleFireCourse(c)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          alreadyFired
                            ? 'bg-muted text-muted-foreground cursor-default'
                            : 'bg-primary/10 text-primary hover:bg-primary/20 active:scale-95'
                        }`}
                      >
                        {firingCourse === c ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : alreadyFired ? (
                          <span className="h-3 w-3 rounded-full bg-green-500 inline-block shrink-0" />
                        ) : (
                          <Flame className="h-3 w-3" />
                        )}
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Modals ────────────────────────────────────────────────────────── */}

      <AddExpenseModal open={expenseOpen} onClose={() => setExpenseOpen(false)} />
      {cfg.showCalculator && (
        <>
          <button
            type="button"
            onClick={() => setCalcOpen((v) => !v)}
            className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full bg-card border border-border shadow-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Calculator"
          >
            <Calculator className="h-5 w-5" />
          </button>
          {calcOpen && <CalculatorOverlay onClose={() => setCalcOpen(false)} />}
        </>
      )}

      {parkedOpen && <ParkedSalesModal onClose={() => setParkedOpen(false)} onResume={handleResumeParked} />}

      {modifierItem && (
        <ModifierModal
          open
          onClose={() => setModifierItem(null)}
          itemName={modifierItem.name}
          basePrice={modifierItem.price}
          modifierGroups={modifierItem.modifierGroups ?? []}
          onConfirm={(selections, qty) => {
            addItemToCart(modifierItem, selections, qty);
            setModifierItem(null);
          }}
        />
      )}

      <SplitPaymentModal
        open={paymentOpen}
        onClose={() => { setPaymentOpen(false); setResumeTotal(null); }}
        orderId={currentOrderId}
        orderNumber={currentOrderNumber}
        total={resumeTotal ?? total}
        tenantSlug={user?.tenant_slug ?? ''}
        orderLines={currentOrderLines}
        isHospitality={isHospitality}
        onPaymentConfirmed={handlePaymentConfirmed}
      />

      <VoidOrderModal
        open={voidOpen}
        orderId={currentOrderId}
        orderNumber={currentOrderNumber}
        onClose={() => setVoidOpen(false)}
        onConfirm={async (reason) => {
          await voidOrder.mutateAsync({ orderId: currentOrderId, reason });
          toast.success(`Order #${currentOrderNumber} voided`);
          setCurrentOrderId('');
          setCurrentOrderNumber('');
          clearCart();
        }}
      />

      <ReceiptPreview
        receipt={receiptData}
        open={receiptOpen}
        onClose={() => {
          setReceiptOpen(false);
          setReceiptData(null);
        }}
        printerName={configFor((posSettings as any)?.printer_profiles, 'bill').printer_name}
      />

      <OrderPlacedDialog
        open={orderPlacedOpen}
        orderNumber={orderPlacedNumber}
        orderId={orderPlacedId}
        tenantId={user?.tenant_id ?? ''}
        orgSlug={orgSlug}
        onClose={() => setOrderPlacedOpen(false)}
      />

      {/* Manager override — out-of-stock add interception (retail/pharmacy) */}
      {pendingOverride && (
        <ManagerPINOverrideModal
          tenantId={user?.tenant_slug ?? orgSlug}
          itemName={pendingOverride.name}
          onApprove={() => {
            const item = pendingOverride;
            setPendingOverride(null);
            // Override approved — continue the normal add flow (serial/modifier/age still apply).
            if (item.requiresAgeVerification || item.trackSerialNumber || item.modifierGroups?.length) {
              proceedWithItem(item);
            } else {
              addItemToCart(item);
            }
          }}
          onCancel={() => setPendingOverride(null)}
        />
      )}

      {/* Age Verification */}
      {agePrompt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm p-6 shadow-2xl text-center">
            <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
            </div>
            <h3 className="text-lg font-bold mb-2">Age Verification Required</h3>
            <p className="text-sm text-muted-foreground mb-6">
              <strong>{agePrompt.item.name}</strong> requires age verification. Confirm customer is 18+?
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 min-h-12" onClick={() => setAgePrompt(null)}>
                Cancel
              </Button>
              <Button className="flex-1 min-h-12" onClick={agePrompt.callback}>
                Confirm 18+
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Serial Number */}
      {serialPrompt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-1">Serial Number Required</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Enter serial number for <strong>{serialPrompt.item.name}</strong>
            </p>
            <input
              value={serialInput}
              onChange={(e) => setSerialInput(e.target.value)}
              placeholder="Enter serial number…"
              className="w-full bg-background border border-border rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 mb-4 font-mono"
              autoFocus
            />
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 min-h-12"
                onClick={() => {
                  setSerialPrompt(null);
                  setSerialInput('');
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 min-h-12"
                disabled={!serialInput.trim()}
                onClick={() => {
                  serialPrompt.callback(serialInput.trim());
                  setSerialInput('');
                }}
              >
                Add Item
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
