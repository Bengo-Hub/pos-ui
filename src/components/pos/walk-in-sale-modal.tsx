'use client';

import { useState, useCallback } from 'react';
import { Loader2, Minus, Plus, Search, ShoppingCart, Trash2, X } from 'lucide-react';
import { useMenuItems, useCreateOrder } from '@/hooks/usePOS';
import { SplitPaymentModal } from './split-payment-modal';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useAuthStore } from '@/store/auth';
import { toast } from 'sonner';
import type { CatalogItem } from '@/hooks/usePOS';

interface CartLine {
  item: CatalogItem;
  quantity: number;
}

interface CompletedOrder {
  id: string;
  order_number: string;
  total: number;
}

interface WalkInSaleModalProps {
  open: boolean;
  onClose: () => void;
  tenantSlug: string;
}

export function WalkInSaleModal({ open, onClose, tenantSlug }: WalkInSaleModalProps) {
  const outlet = useAuthStore((s) => s.outlet);
  const outletId = outlet?.id ?? '';

  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [completedOrder, setCompletedOrder] = useState<CompletedOrder | null>(null);

  const { data: drugData, isFetching } = useMenuItems({
    itemType: 'GOODS',
    category: 'medication',
    search: search || undefined,
    limit: 30,
  });

  const drugList = (drugData?.data ?? []).filter((d) => !d.requires_prescription);

  const createOrder = useCreateOrder();

  const addToCart = useCallback((item: CatalogItem) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.item.id === item.id);
      if (idx >= 0) return prev.map((l, i) => i === idx ? { ...l, quantity: l.quantity + 1 } : l);
      return [...prev, { item, quantity: 1 }];
    });
  }, []);

  const updateQty = (idx: number, qty: number) => {
    if (qty <= 0) setCart((prev) => prev.filter((_, i) => i !== idx));
    else setCart((prev) => prev.map((l, i) => i === idx ? { ...l, quantity: qty } : l));
  };

  const subtotal = cart.reduce((sum, l) => sum + (l.item.price ?? 0) * l.quantity, 0);
  const fmt = (n: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n);

  const handleCheckout = () => {
    if (cart.length === 0) return;
    createOrder.mutate(
      {
        outletId,
        orderSubtype: 'pharmacy_walk_in' as any,
        lines: cart.map((l) => ({
          catalog_item_id: l.item.id,
          sku: l.item.sku,
          name: l.item.name,
          quantity: l.quantity,
          unit_price: l.item.price ?? 0,
          total_price: (l.item.price ?? 0) * l.quantity,
          // Tax as priced in the catalog — server payable must equal the charged amount.
          ...(l.item.tax_code_id ? { tax_code_id: l.item.tax_code_id } : {}),
          ...(l.item.tax_inclusive != null ? { price_includes_tax: l.item.tax_inclusive } : {}),
          ...(typeof l.item.tax_rate === 'number' ? { tax_rate: l.item.tax_rate } : {}),
        })),
      },
      {
        onSuccess: (order: any) => {
          setCompletedOrder({
            id: order.id,
            order_number: order.order_number ?? order.id,
            total: subtotal,
          });
        },
        onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to create order')),
      },
    );
  };

  const handlePaymentClose = () => {
    setCompletedOrder(null);
    setCart([]);
    onClose();
  };

  if (!open) return null;

  if (completedOrder) {
    return (
      <SplitPaymentModal
        open
        onClose={handlePaymentClose}
        onPaymentConfirmed={handlePaymentClose}
        orderId={completedOrder.id}
        orderNumber={completedOrder.order_number}
        total={completedOrder.total}
        tenantSlug={tenantSlug}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <h2 className="font-bold text-lg">Walk-in Drug Sale</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
          {/* Left: Drug search */}
          <div className="flex-1 flex flex-col gap-3 p-4 border-r border-border min-h-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search OTC medications…"
                className="w-full bg-accent/30 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {isFetching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border bg-card border border-border rounded-xl">
              {drugList.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No OTC drugs found</div>
              ) : (
                drugList.map((drug) => (
                  <button
                    key={drug.id}
                    type="button"
                    onClick={() => addToCart(drug)}
                    className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-accent transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{drug.name}</p>
                      <p className="text-xs text-muted-foreground">{drug.sku}</p>
                    </div>
                    <span className="text-sm font-bold text-primary shrink-0">{fmt(drug.price ?? 0)}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right: Cart + total */}
          <div className="w-full md:w-72 flex flex-col p-4 gap-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Cart</p>
            <div className="flex-1 overflow-y-auto space-y-2">
              {cart.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Add items from the list</div>
              ) : (
                cart.map((line, idx) => (
                  <div key={line.item.id} className="flex items-center gap-2 bg-accent/20 rounded-xl px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{line.item.name}</p>
                      <p className="text-xs text-muted-foreground">{fmt((line.item.price ?? 0) * line.quantity)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={() => updateQty(idx, line.quantity - 1)} className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-accent transition-colors">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center text-xs font-semibold">{line.quantity}</span>
                      <button type="button" onClick={() => updateQty(idx, line.quantity + 1)} className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-accent transition-colors">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <button type="button" onClick={() => updateQty(idx, 0)} className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-border pt-3 space-y-3">
              <div className="flex items-center justify-between text-sm font-bold">
                <span>Total</span>
                <span className="text-primary">{fmt(subtotal)}</span>
              </div>
              <button
                type="button"
                disabled={cart.length === 0 || createOrder.isPending}
                onClick={handleCheckout}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {createOrder.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {createOrder.isPending ? 'Creating…' : 'Proceed to Payment'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
