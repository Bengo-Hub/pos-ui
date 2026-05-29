'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, Search, Trash2, ShoppingCart, Tag, X, Camera } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { useMenuItems, useCreateOrder, useTenders } from '@/hooks/usePOS';
import { SplitPaymentModal } from '@/components/pos/split-payment-modal';
import { lookupItemByBarcode } from '@/lib/api/retail';
import type { CatalogItem } from '@/lib/api/retail';
import { ScaleDisplay } from '@/components/retail/ScaleDisplay';
import { SerialCaptureModal } from '@/components/retail/SerialCaptureModal';
import { StockBadge } from '@/components/retail/StockBadge';
import { ManagerPINOverrideModal } from '@/components/retail/ManagerPINOverrideModal';
import { LoyaltyPanel, type LoyaltyState } from '@/components/retail/LoyaltyPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CartLine {
  item: CatalogItem;
  quantity: number;
}

interface PendingSerialItem {
  cartIndex: number;
  item: CatalogItem;
  orderId: string;
  lineId: string;
}

interface CompletedOrder {
  id: string;
  order_number: string;
  total: number;
}

interface PendingOverrideItem {
  item: CatalogItem;
  qty: number;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function RetailPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const tenantSlug = useAuthStore((s) => s.user?.tenant_slug ?? orgSlug);
  const outlet = useAuthStore((s) => s.outlet);
  const outletId = outlet?.id ?? '';
  const { data: posSettings } = usePOSSettings();
  const taxRate = (posSettings?.vat_rate ?? 16) / 100;

  const [cart, setCart] = useState<CartLine[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scaleDeviceId, setScaleDeviceId] = useState<string>('');
  const [pendingSerial, setPendingSerial] = useState<PendingSerialItem | null>(null);
  const [pendingOverride, setPendingOverride] = useState<PendingOverrideItem | null>(null);
  const [completedOrder, setCompletedOrder] = useState<CompletedOrder | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [loyaltyState, setLoyaltyState] = useState<LoyaltyState | null>(null);

  const createOrder = useCreateOrder();
  const { data: tendersData } = useTenders();
  const defaultTenderId = tendersData?.data?.find((t: any) => t.is_active)?.id;

  // ── Unified search (barcode + text) ─────────────────────────────────────
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchValue), 300);
    return () => clearTimeout(t);
  }, [searchValue]);

  const { data: catalogData, isLoading: catalogLoading } = useMenuItems({
    search: debouncedSearch || undefined,
    itemType: 'GOODS',
    limit: 20,
  });

  const catalogItems: CatalogItem[] = useMemo(() => {
    return (catalogData?.data ?? []).map((item: any) => ({
      id: item.id,
      name: item.name,
      price: item.price ?? 0,
      sku: item.sku,
      barcode: item.barcode,
      description: item.description,
      category: item.category,
      image_url: item.image_url,
      item_type: item.item_type,
      track_serial_numbers: item.track_serial_numbers ?? false,
      requires_age_verification: item.requires_age_verification,
      requires_prescription: item.requires_prescription,
      is_returnable: item.is_returnable,
      is_available: item.is_available,
    }));
  }, [catalogData]);

  // Read scale device ID from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const id = localStorage.getItem('pos_scale_device_id') ?? '';
      setScaleDeviceId(id);
    }
  }, []);

  // ── Cart helpers ─────────────────────────────────────────────────────────

  const commitAddToCart = useCallback((item: CatalogItem, qty = 1) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.item.id === item.id);
      if (idx >= 0) {
        return prev.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + qty } : l));
      }
      return [...prev, { item, quantity: qty }];
    });
  }, []);

  const addToCart = useCallback((item: CatalogItem, qty = 1) => {
    // Intercept out-of-stock items (non-service, tracked stock) for manager override
    if (
      item.item_type !== 'SERVICE' &&
      item.stock_quantity !== undefined &&
      item.stock_quantity === 0
    ) {
      setPendingOverride({ item, qty });
      return;
    }
    commitAddToCart(item, qty);
  }, [commitAddToCart]);

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const updateQty = (index: number, qty: number) => {
    if (qty <= 0) {
      removeFromCart(index);
      return;
    }
    setCart((prev) => prev.map((l, i) => (i === index ? { ...l, quantity: qty } : l)));
  };

  // ── Barcode scan ─────────────────────────────────────────────────────────

  const handleScan = async (barcode: string) => {
    setScanError(null);
    setScanLoading(true);
    try {
      const item = await lookupItemByBarcode(tenantSlug, barcode);
      addToCart(item);
      setSearchValue('');
    } catch {
      setScanError(`Item not found for barcode: ${barcode}`);
    } finally {
      setScanLoading(false);
    }
  };

  // ── Scale add to cart ────────────────────────────────────────────────────

  const handleScaleAddToCart = (weightGrams: number) => {
    // Add a generic weighted item using scale weight as quantity (grams)
    const weightKg = weightGrams / 1000;
    const genericItem: CatalogItem = {
      id: `scale-${Date.now()}`,
      name: 'Weighed Item',
      price: 0,
      sku: 'SCALE',
      track_serial_numbers: false,
      weight_grams: weightGrams,
    };
    addToCart(genericItem, weightKg);
  };

  // ── Order totals ─────────────────────────────────────────────────────────

  const subtotal = cart.reduce((sum, l) => sum + l.item.price * l.quantity, 0);
  const tax = subtotal * taxRate;
  const loyaltyDiscount = loyaltyState?.redeemDiscount ?? 0;
  const total = Math.max(0, subtotal + tax - loyaltyDiscount);

  // ── Checkout ─────────────────────────────────────────────────────────────

  const handleCheckout = async () => {
    if (cart.length === 0 || checkoutLoading) return;

    // Check if any items require serial numbers — if so open modal for first one
    const firstSerialItem = cart.find((l) => l.item.track_serial_numbers);
    if (firstSerialItem) {
      const idx = cart.indexOf(firstSerialItem);
      setPendingSerial({
        cartIndex: idx,
        item: firstSerialItem.item,
        orderId: 'pending',
        lineId: firstSerialItem.item.id,
      });
      return;
    }

    setCheckoutLoading(true);
    createOrder.mutate(
      {
        outletId,
        orderSubtype: 'retail' as any,
        customerPhone: loyaltyState?.customerPhone,
        customerName: loyaltyState?.customerName,
        lines: cart.map((l) => ({
          catalog_item_id: l.item.id,
          sku: l.item.sku,
          name: l.item.name,
          quantity: l.quantity,
          unit_price: l.item.price,
          total_price: l.item.price * l.quantity,
        })),
      },
      {
        onSuccess: (order: any) => {
          setCompletedOrder({
            id: order.id,
            order_number: order.order_number ?? order.id,
            total,
          });
        },
        onError: () => {
          import('sonner').then(({ toast }) => toast.error('Failed to create order'));
        },
        onSettled: () => setCheckoutLoading(false),
      },
    );
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n);

  // ── Render ───────────────────────────────────────────────────────────────

  if (completedOrder) {
    return (
      <>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
            <ShoppingCart className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold">Order Created</h2>
          <p className="text-muted-foreground text-sm">Complete payment to finish the sale.</p>
          <button
            type="button"
            onClick={() => { setCompletedOrder(null); setCart([]); setLoyaltyState(null); }}
            className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
          >
            New Sale
          </button>
        </div>
        <SplitPaymentModal
          open
          onClose={() => { setCompletedOrder(null); setCart([]); setLoyaltyState(null); }}
          onPaymentConfirmed={() => { setCompletedOrder(null); setCart([]); setLoyaltyState(null); }}
          orderId={completedOrder.id}
          orderNumber={completedOrder.order_number}
          total={completedOrder.total}
          tenantSlug={tenantSlug}
          tenderId={defaultTenderId}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4 h-[calc(100vh-5rem)] min-h-0">
      {/* ── Left panel: scan + search + catalog ── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 overflow-hidden">
        {/* Unified barcode + search input */}
        <div className="relative group flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              ref={searchRef}
              autoFocus
              type="text"
              value={searchValue}
              disabled={scanLoading}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchValue.trim()) {
                  handleScan(searchValue.trim());
                }
              }}
              placeholder="Scan barcode or search by name, SKU…"
              className="w-full bg-card border border-border rounded-2xl py-3.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all disabled:opacity-50"
            />
            {searchValue && !scanLoading && (
              <button
                type="button"
                onClick={() => { setSearchValue(''); setScanError(null); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <button
            type="button"
            disabled={scanLoading || !searchValue.trim()}
            onClick={() => searchValue.trim() && handleScan(searchValue.trim())}
            className="h-12 w-12 flex items-center justify-center rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
            title="Scan / Add"
          >
            {scanLoading
              ? <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              : <Camera className="h-5 w-5" />}
          </button>
        </div>

        {scanError && (
          <p className="text-sm text-destructive px-1">{scanError}</p>
        )}

        {/* Scale display — only if device configured */}
        {scaleDeviceId && (
          <ScaleDisplay
            tenantSlug={tenantSlug}
            deviceId={scaleDeviceId}
            onAddToCart={handleScaleAddToCart}
          />
        )}

        {/* Catalog item list — fixed height tray, scrolls on overflow */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shrink-0" style={{maxHeight: '11rem'}}>
          <div className="overflow-y-auto h-full">
          {catalogLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading items…
            </div>
          ) : catalogItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
              <Search className="h-8 w-8 opacity-20" />
              <p className="text-sm">No items found</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {catalogItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addToCart(item)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.sku}{item.description ? ` · ${item.description}` : ''}</p>
                  </div>
                  <span className="text-sm font-bold shrink-0 text-primary">
                    {new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(item.price)}
                  </span>
                </button>
              ))}
            </div>
          )}
          </div>
        </div>

        {/* Cart items — flex-1 so it fills remaining height; inner list scrolls */}
        <div className="flex-1 bg-card border border-border rounded-2xl overflow-hidden flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
            <ShoppingCart className="h-4.5 w-4.5 text-muted-foreground" />
            <span className="font-semibold text-sm">Cart</span>
            {cart.length > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">
                {cart.reduce((s, l) => s + l.quantity, 0)} item(s)
              </span>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Tag className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Scan a barcode to add items</p>
            </div>
          ) : (
            <div className="overflow-y-auto flex-1 divide-y divide-border">
              {cart.map((line, idx) => (
                <div key={`${line.item.id}-${idx}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{line.item.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{line.item.sku}</span>
                      {line.item.stock_quantity !== undefined && (
                        <StockBadge quantity={line.item.stock_quantity} itemType={line.item.item_type} />
                      )}
                    </div>
                  </div>

                  {/* Qty stepper */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateQty(idx, line.quantity - 1)}
                      className="h-7 w-7 rounded-lg border border-border flex items-center justify-center text-sm font-bold hover:bg-accent transition-colors"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQty(idx, line.quantity + 1)}
                      className="h-7 w-7 rounded-lg border border-border flex items-center justify-center text-sm font-bold hover:bg-accent transition-colors"
                    >
                      +
                    </button>
                  </div>

                  {/* Price */}
                  <div className="w-24 text-right shrink-0">
                    <p className="text-sm font-semibold">{fmt(line.item.price * line.quantity)}</p>
                    <p className="text-xs text-muted-foreground">{fmt(line.item.price)} each</p>
                  </div>

                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => removeFromCart(idx)}
                    className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel: loyalty + order summary ── */}
      <div className="w-full lg:w-80 shrink-0 flex flex-col gap-4">
        {/* Loyalty panel — phone lookup, register, redeem */}
        <LoyaltyPanel onStateChange={setLoyaltyState} />

        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-bold text-base mb-4">Order Summary</h2>

          <div className="space-y-2.5 text-sm mb-5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-semibold">{fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">VAT ({Math.round(taxRate * 100)}%)</span>
              <span className="font-semibold">{fmt(tax)}</span>
            </div>
            {loyaltyDiscount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Loyalty Discount</span>
                <span className="font-semibold">−{fmt(loyaltyDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-2.5">
              <span className="font-bold">Total</span>
              <span className="font-bold text-lg">{fmt(total)}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={cart.length === 0 || checkoutLoading}
            onClick={handleCheckout}
            className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {checkoutLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {checkoutLoading ? 'Creating Order…' : 'Checkout'}
          </button>
        </div>
      </div>

      {/* ── Serial capture modal ── */}
      {pendingSerial && (
        <SerialCaptureModal
          open={!!pendingSerial}
          onClose={() => setPendingSerial(null)}
          tenantSlug={tenantSlug}
          orderId={pendingSerial.orderId}
          lineId={pendingSerial.lineId}
          requiredCount={cart[pendingSerial.cartIndex]?.quantity ?? 1}
          itemName={pendingSerial.item.name}
        />
      )}

      {/* ── Manager override modal (out-of-stock) ── */}
      {pendingOverride && (
        <ManagerPINOverrideModal
          tenantId={tenantSlug}
          itemName={pendingOverride.item.name}
          onApprove={() => {
            commitAddToCart(pendingOverride.item, pendingOverride.qty);
            setPendingOverride(null);
          }}
          onCancel={() => setPendingOverride(null)}
        />
      )}
    </div>
  );
}

export default function RetailPageGated() {
  return (
    <ModuleGate moduleKey="retail" fallback={<ModuleUnavailablePage moduleKey="retail" />}>
      <RetailPage />
    </ModuleGate>
  );
}
