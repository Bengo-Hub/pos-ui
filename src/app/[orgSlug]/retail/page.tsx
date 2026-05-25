'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Trash2, ShoppingCart, Tag } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { lookupItemByBarcode } from '@/lib/api/retail';
import type { CatalogItem } from '@/lib/api/retail';
import { BarcodeInput } from '@/components/retail/BarcodeInput';
import { ScaleDisplay } from '@/components/retail/ScaleDisplay';
import { SerialCaptureModal } from '@/components/retail/SerialCaptureModal';
import { StockBadge } from '@/components/retail/StockBadge';
import { ManagerPINOverrideModal } from '@/components/retail/ManagerPINOverrideModal';

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

interface PendingOverrideItem {
  item: CatalogItem;
  qty: number;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function RetailPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const tenantSlug = useAuthStore((s) => s.user?.tenant_slug ?? orgSlug);
  const { data: posSettings } = usePOSSettings();
  const taxRate = (posSettings?.vat_rate ?? 16) / 100;

  const [cart, setCart] = useState<CartLine[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scaleDeviceId, setScaleDeviceId] = useState<string>('');
  const [pendingSerial, setPendingSerial] = useState<PendingSerialItem | null>(null);
  const [pendingOverride, setPendingOverride] = useState<PendingOverrideItem | null>(null);
  const [checkoutDone, setCheckoutDone] = useState(false);

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
      requires_serial: false,
      weight_grams: weightGrams,
    };
    addToCart(genericItem, weightKg);
  };

  // ── Order totals ─────────────────────────────────────────────────────────

  const subtotal = cart.reduce((sum, l) => sum + l.item.price * l.quantity, 0);
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  // ── Checkout ─────────────────────────────────────────────────────────────

  const handleCheckout = () => {
    // Check if any items require serial numbers — if so open modal for first one
    const firstSerialItem = cart.find((l) => l.item.requires_serial);
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
    setCheckoutDone(true);
    setCart([]);
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n);

  // ── Render ───────────────────────────────────────────────────────────────

  if (checkoutDone) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
          <ShoppingCart className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold">Order Complete</h2>
        <p className="text-muted-foreground text-sm">The order has been processed.</p>
        <button
          type="button"
          onClick={() => setCheckoutDone(false)}
          className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
        >
          New Sale
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4 min-h-0">
      {/* ── Left panel: scan + cart ── */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Barcode input */}
        <BarcodeInput
          onScan={handleScan}
          placeholder="Scan barcode or enter manually…"
          loading={scanLoading}
        />

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

        {/* Cart items */}
        <div className="flex-1 bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
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
            <div className="divide-y divide-border">
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

      {/* ── Right panel: order summary ── */}
      <div className="w-full lg:w-80 shrink-0 flex flex-col gap-4">
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
            <div className="flex justify-between border-t border-border pt-2.5">
              <span className="font-bold">Total</span>
              <span className="font-bold text-lg">{fmt(total)}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={cart.length === 0}
            onClick={handleCheckout}
            className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Checkout
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
