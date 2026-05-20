'use client';

import { Badge, Button } from '@/components/ui/base';
import { ModifierModal, type ModifierGroup } from '@/components/pos/modifier-modal';
import { POSPaymentModal } from '@/components/pos/payment-modal';
import { ReceiptPreview, type ReceiptData } from '@/components/pos/receipt-preview';
import { cn } from '@/lib/utils';
import { useMenuItems, useCreateOrder } from '@/hooks/usePOS';
import { useAuthStore } from '@/store/auth';
import { apiClient } from '@/lib/api/client';
import {
  AlertTriangle,
  Barcode,
  Grid3x3,
  Image as ImageIcon,
  LayoutList,
  Loader2,
  Minus,
  Plus,
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
  price: number;
  category: string;
  image?: string;
  requiresAgeVerification?: boolean;
  trackSerialNumber?: boolean;
  modifierGroups?: ModifierGroup[];
}

interface CartItem extends MenuItem {
  quantity: number;
  selectedModifiers?: Record<string, string[]>;
  modifierTotal?: number;
  serialNumber?: string;
  notes?: string;
}

type DisplayMode = 'card' | 'list' | 'image_grid';

// ─── Page ───────────────────────────────────────────────────────────────────

export default function OrderPage() {
  const user = useAuthStore((s) => s.user);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('card');

  // Modifier modal
  const [modifierItem, setModifierItem] = useState<MenuItem | null>(null);

  // Payment modal
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState('');
  const [currentOrderNumber, setCurrentOrderNumber] = useState('');

  // Receipt
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  // Serial number prompt
  const [serialPrompt, setSerialPrompt] = useState<{ item: MenuItem; callback: (sn: string) => void } | null>(null);
  const [serialInput, setSerialInput] = useState('');

  // Age verification prompt
  const [agePrompt, setAgePrompt] = useState<{ item: MenuItem; callback: () => void } | null>(null);

  // Barcode scanner
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [barcodeBuffer, setBarcodeBuffer] = useState('');

  const { data: catalogData, isLoading: menuLoading } = useMenuItems({
    category: activeCategory !== 'All' ? activeCategory : undefined,
    search: searchQuery || undefined,
  });
  const createOrder = useCreateOrder();

  const menuItems: MenuItem[] = useMemo(() => {
    const items = catalogData?.data ?? [];
    return items.map((item: any) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      price: item.sell_price ?? item.price ?? 0,
      category: item.category || 'Uncategorized',
      image: item.image_url,
      requiresAgeVerification: item.requires_age_verification,
      trackSerialNumber: item.track_serial_number,
      modifierGroups: item.modifier_groups,
    }));
  }, [catalogData]);

  const categories = useMemo(() => {
    const cats = new Set(menuItems.map((i) => i.category));
    return ['All', ...Array.from(cats).sort()];
  }, [menuItems]);

  const filteredItems = menuItems.filter((item) => {
    const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

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
  }, []);

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

  // ─── Barcode Scanner ────────────────────────────────────────────────────

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, [barcodeBuffer, menuItems, handleItemTap]);

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

  const subtotal = cart.reduce((sum, item) => sum + (item.price + (item.modifierTotal ?? 0)) * item.quantity, 0);
  const tax = Math.round(subtotal * 0.16);
  const total = subtotal + tax;
  const cartItemCount = cart.reduce((s, c) => s + c.quantity, 0);

  // ─── Place Order ────────────────────────────────────────────────────────

  const handlePlaceOrder = () => {
    if (cart.length === 0) return;
    createOrder.mutate(
      {
        outletId: '',
        lines: cart.map((item) => ({
          catalog_item_id: item.id,
          sku: item.sku || '',
          name: item.name,
          quantity: item.quantity,
          unit_price: item.price + (item.modifierTotal ?? 0),
          total_price: (item.price + (item.modifierTotal ?? 0)) * item.quantity,
        })),
      },
      {
        onSuccess: (data: any) => {
          setCurrentOrderId(data.id || data.order_id || '');
          setCurrentOrderNumber(data.order_number || '');
          setPaymentOpen(true);
        },
        onError: () => {
          toast.error('Failed to create order. Please try again.');
        },
      }
    );
  };

  const handlePaymentConfirmed = useCallback(async () => {
    toast.success(`Order ${currentOrderNumber} paid!`);
    clearCart();
    setPaymentOpen(false);

    // Fetch receipt data and show the receipt preview
    const tenantId = user?.tenant_id ?? '';
    if (tenantId && currentOrderId) {
      try {
        const data = await apiClient.get<ReceiptData>(
          `/api/v1/${tenantId}/pos/orders/${currentOrderId}/receipt`
        );
        setReceiptData(data);
        setReceiptOpen(true);
      } catch {
        // Receipt fetch failed — not critical, payment already confirmed
      }
    }
  }, [currentOrderNumber, currentOrderId, user?.tenant_id]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col lg:flex-row overflow-hidden bg-background">
      {/* ── Left Panel: Menu (60%) ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Search bar — full width at very top */}
        <div className="px-4 pt-4 pb-2 shrink-0">
          <div className="relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              placeholder="Search items or scan barcode..."
              className="w-full bg-card border border-border rounded-2xl py-3.5 pl-11 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all min-h-13 font-medium placeholder:text-muted-foreground/60"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Category tabs + display mode toggle */}
        <div className="px-4 pb-3 flex items-center gap-3 shrink-0">
          {/* Horizontal scrolling pill tabs */}
          <div className="flex gap-2 overflow-x-auto flex-1 pb-0.5 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all min-h-9.5 shrink-0',
                  activeCategory === cat
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/40'
                )}
              >
                {cat}
              </button>
            ))}
          </div>
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
            <button
              onClick={() => barcodeInputRef.current?.focus()}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              title="Barcode scan"
            >
              <Barcode className="h-4 w-4" />
            </button>
          </div>
          <input ref={barcodeInputRef} className="sr-only" aria-label="Barcode input" />
        </div>

        {/* Items area */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
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
                <button onClick={() => setSearchQuery('')} className="text-xs text-primary underline">
                  Clear search
                </button>
              )}
            </div>
          ) : displayMode === 'list' ? (
            /* ─── LIST MODE ─── */
            <div className="space-y-1.5">
              {filteredItems.map((item) => {
                const inCart = cart.find((c) => c.id === item.id && !c.selectedModifiers);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemTap(item)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all min-h-14 touch-manipulation active:scale-[0.98]',
                      inCart
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border bg-card hover:border-primary/30 hover:bg-accent/30'
                    )}
                  >
                    {/* Availability dot */}
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-bold truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                    </div>
                    <span className="text-sm font-bold font-mono shrink-0 text-foreground">
                      KES {item.price.toLocaleString()}
                    </span>
                    {inCart && (
                      <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                        {inCart.quantity}
                      </span>
                    )}
                    {item.modifierGroups?.length ? (
                      <span className="text-[10px] text-primary shrink-0">Options</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : displayMode === 'image_grid' ? (
            /* ─── IMAGE GRID MODE ─── */
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
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
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-muted-foreground font-mono">KES {item.price.toLocaleString()}</p>
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
            /* ─── CARD MODE (default) — 3-col landscape, 2-col portrait ─── */
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
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
                      {item.modifierGroups?.length ? (
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Options</span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right Panel: Cart (40%) ── */}
      <div className="w-full lg:w-100 xl:w-105 border-t lg:border-t-0 lg:border-l border-border bg-card flex flex-col shrink-0">
        {/* Cart header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <ShoppingCart className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-sm leading-none">Current Order</h2>
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

        {/* Cart items — scrollable */}
        <div className="flex-1 overflow-y-auto">
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
                      <p className="text-sm font-bold truncate leading-tight">{item.name}</p>
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
                      <p className="text-xs font-bold font-mono text-primary mt-1">
                        KES {((item.price + (item.modifierTotal ?? 0)) * item.quantity).toLocaleString()}
                      </p>
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
                <span className="text-muted-foreground">VAT (16%)</span>
                <span className="font-medium tabular-nums">KES {tax.toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-border">
                <span className="font-bold text-base">Total</span>
                <span className="font-bold text-base tabular-nums text-primary">KES {total.toLocaleString()}</span>
              </div>
            </div>
          )}
          <div className="p-5 pt-3">
            <Button
              onClick={handlePlaceOrder}
              disabled={cart.length === 0 || createOrder.isPending}
              className={cn(
                'w-full min-h-14 text-base font-bold rounded-2xl gap-2.5 transition-all',
                cart.length > 0
                  ? 'shadow-lg shadow-primary/20 hover:shadow-primary/30'
                  : 'opacity-50 cursor-not-allowed'
              )}
            >
              {createOrder.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ShoppingCart className="h-5 w-5" />
              )}
              {cart.length === 0 ? 'Add items to pay' : `Pay · KES ${total.toLocaleString()}`}
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Modals ────────────────────────────────────────────────────────── */}

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

      <POSPaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        orderId={currentOrderId}
        orderNumber={currentOrderNumber}
        total={total}
        tenantSlug={user?.tenant_slug ?? ''}
        onPaymentConfirmed={handlePaymentConfirmed}
      />

      <ReceiptPreview
        receipt={receiptData}
        open={receiptOpen}
        onClose={() => {
          setReceiptOpen(false);
          setReceiptData(null);
        }}
      />

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
