'use client';

import { Badge, Button } from '@/components/ui/base';
import { ModifierModal, type ModifierGroup } from '@/components/pos/modifier-modal';
import { POSPaymentModal } from '@/components/pos/payment-modal';
import { cn } from '@/lib/utils';
import { useMenuItems, useCreateOrder } from '@/hooks/usePOS';
import { useAuthStore } from '@/store/auth';
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
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.sku.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // ─── Item Add Flow ──────────────────────────────────────────────────────

  const addItemToCart = useCallback((item: MenuItem, mods?: Record<string, string[]>, qty = 1, serialNumber?: string) => {
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
      // If item has modifiers or serial, always add as new line
      if (mods || serialNumber) {
        return [...prev, { ...item, quantity: qty, selectedModifiers: mods, modifierTotal: modTotal, serialNumber }];
      }
      const existing = prev.find((c) => c.id === item.id && !c.selectedModifiers);
      if (existing) {
        return prev.map((c) => c.id === item.id && !c.selectedModifiers ? { ...c, quantity: c.quantity + qty } : c);
      }
      return [...prev, { ...item, quantity: qty }];
    });
  }, []);

  const handleItemTap = useCallback((item: MenuItem) => {
    // Age verification check
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

  const proceedWithItem = useCallback((item: MenuItem) => {
    // Serial number check
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

    // Modifier check
    if (item.modifierGroups?.length) {
      setModifierItem(item);
      return;
    }

    addItemToCart(item);
  }, [addItemToCart]);

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
    setCart((prev) => prev.map((c, i) => i === index ? { ...c, quantity: c.quantity + delta } : c).filter((c) => c.quantity > 0));
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const clearCart = () => setCart([]);

  const subtotal = cart.reduce((sum, item) => sum + (item.price + (item.modifierTotal ?? 0)) * item.quantity, 0);
  const tax = Math.round(subtotal * 0.16);
  const total = subtotal + tax;

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

  const handlePaymentConfirmed = useCallback(() => {
    toast.success(`Order ${currentOrderNumber} paid!`);
    clearCart();
    setPaymentOpen(false);
  }, [currentOrderNumber]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col lg:flex-row overflow-hidden">
      {/* Menu Grid - Left Panel */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar: Category tabs + display mode toggle */}
        <div className="px-4 pt-4 pb-2 flex items-center gap-2 shrink-0">
          <div className="flex gap-2 overflow-x-auto flex-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  'px-5 py-3 rounded-xl text-sm font-bold whitespace-nowrap transition-all min-h-[44px]',
                  activeCategory === cat
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
                )}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="flex gap-1 shrink-0 border border-border rounded-xl p-1">
            <button onClick={() => setDisplayMode('card')} className={cn('p-2 rounded-lg', displayMode === 'card' && 'bg-primary text-primary-foreground')}>
              <Grid3x3 className="h-4 w-4" />
            </button>
            <button onClick={() => setDisplayMode('list')} className={cn('p-2 rounded-lg', displayMode === 'list' && 'bg-primary text-primary-foreground')}>
              <LayoutList className="h-4 w-4" />
            </button>
            <button onClick={() => setDisplayMode('image_grid')} className={cn('p-2 rounded-lg', displayMode === 'image_grid' && 'bg-primary text-primary-foreground')}>
              <ImageIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search + Barcode */}
        <div className="px-4 py-2 flex gap-2 shrink-0">
          <div className="relative group flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              placeholder="Search items or scan barcode..."
              className="w-full bg-card border border-border rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-1 focus:ring-primary transition-all min-h-[44px]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            onClick={() => barcodeInputRef.current?.focus()}
            className="h-[44px] px-4 rounded-xl border border-border bg-card flex items-center gap-2 hover:border-primary/30 text-sm font-medium"
          >
            <Barcode className="h-4 w-4" />
            <span className="hidden sm:inline">Scan</span>
          </button>
          <input ref={barcodeInputRef} className="sr-only" aria-label="Barcode input" />
        </div>

        {/* Items Display */}
        <div className="flex-1 overflow-y-auto p-4">
          {menuLoading ? (
            <div className="flex items-center justify-center h-40"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : displayMode === 'list' ? (
            /* ─── LIST MODE (supermarket/hardware) ─── */
            <div className="space-y-1">
              {filteredItems.map((item) => {
                const inCart = cart.find((c) => c.id === item.id && !c.selectedModifiers);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemTap(item)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all min-h-[52px]',
                      inCart ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/30'
                    )}
                  >
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-bold truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                    </div>
                    <span className="text-sm font-bold font-mono shrink-0">KES {item.price.toLocaleString()}</span>
                    {inCart && (
                      <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                        {inCart.quantity}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : displayMode === 'image_grid' ? (
            /* ─── IMAGE GRID MODE (bar/lounge/restaurant) ─── */
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredItems.map((item) => {
                const inCart = cart.find((c) => c.id === item.id && !c.selectedModifiers);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemTap(item)}
                    className={cn(
                      'relative rounded-2xl border-2 overflow-hidden transition-all active:scale-95',
                      inCart ? 'border-primary shadow-sm' : 'border-border hover:border-primary/30'
                    )}
                  >
                    <div className="aspect-square bg-accent/20 flex items-center justify-center">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
                      )}
                    </div>
                    {inCart && (
                      <div className="absolute top-2 right-2 h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shadow">
                        {inCart.quantity}
                      </div>
                    )}
                    <div className="p-3">
                      <p className="text-sm font-bold truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">KES {item.price.toLocaleString()}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            /* ─── CARD MODE (default/restaurant) ─── */
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredItems.map((item) => {
                const inCart = cart.find((c) => c.id === item.id && !c.selectedModifiers);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemTap(item)}
                    className={cn(
                      'relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all min-h-[120px] touch-manipulation',
                      'active:scale-95 hover:shadow-md',
                      inCart ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-card hover:border-primary/30'
                    )}
                  >
                    {inCart && (
                      <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                        {inCart.quantity}
                      </div>
                    )}
                    <span className="text-sm font-bold text-center leading-tight">{item.name}</span>
                    <span className="text-xs text-muted-foreground mt-1.5 font-mono">KES {item.price.toLocaleString()}</span>
                    {item.modifierGroups?.length ? (
                      <span className="text-[10px] text-primary mt-1">Has options</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
          {filteredItems.length === 0 && !menuLoading && (
            <div className="flex items-center justify-center h-40 text-muted-foreground">No items found.</div>
          )}
        </div>
      </div>

      {/* Cart Panel - Right Panel */}
      <div className="w-full lg:w-[380px] border-t lg:border-t-0 lg:border-l border-border bg-card flex flex-col shrink-0">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <h2 className="font-bold">Current Order</h2>
            {cart.length > 0 && (
              <Badge variant="default">{cart.reduce((s, c) => s + c.quantity, 0)} items</Badge>
            )}
          </div>
          {cart.length > 0 && (
            <button onClick={clearCart} className="text-xs text-destructive hover:underline font-medium min-h-[44px] px-2">
              Clear All
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <ShoppingCart className="h-12 w-12 text-muted-foreground/20 mb-4" />
              <p className="text-sm text-muted-foreground">Tap items to add to order</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {cart.map((item, idx) => (
                <div key={`${item.id}-${idx}`} className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{item.name}</p>
                      {item.selectedModifiers && item.modifierGroups && (
                        <p className="text-xs text-primary truncate">
                          {item.modifierGroups
                            .flatMap((g) => (item.selectedModifiers?.[g.id] ?? []).map((optId) => g.options.find((o) => o.id === optId)?.name))
                            .filter(Boolean)
                            .join(', ')}
                        </p>
                      )}
                      {item.serialNumber && (
                        <p className="text-xs text-muted-foreground font-mono">S/N: {item.serialNumber}</p>
                      )}
                      <p className="text-xs text-muted-foreground font-mono">
                        KES {((item.price + (item.modifierTotal ?? 0)) * item.quantity).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQuantity(idx, -1)} className="h-[44px] w-[44px] rounded-xl border border-border flex items-center justify-center hover:bg-accent transition touch-manipulation">
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                      <button onClick={() => updateQuantity(idx, 1)} className="h-[44px] w-[44px] rounded-xl border border-border flex items-center justify-center hover:bg-accent transition touch-manipulation">
                        <Plus className="h-4 w-4" />
                      </button>
                      <button onClick={() => removeFromCart(idx)} className="h-[44px] w-[44px] rounded-xl flex items-center justify-center text-destructive hover:bg-destructive/10 transition touch-manipulation ml-1">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="border-t border-border p-5 space-y-4 bg-accent/5">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">KES {subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">VAT (16%)</span>
                <span className="font-medium">KES {tax.toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-border">
                <span className="font-bold text-lg">Total</span>
                <span className="font-bold text-lg">KES {total.toLocaleString()}</span>
              </div>
            </div>
            <Button
              onClick={handlePlaceOrder}
              disabled={createOrder.isPending}
              className="w-full min-h-[52px] text-base font-bold shadow-lg shadow-primary/20 gap-2"
            >
              {createOrder.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShoppingCart className="h-5 w-5" />}
              Place Order & Pay
            </Button>
          </div>
        )}
      </div>

      {/* ─── Modals ────────────────────────────────────────────────────────── */}

      {/* Modifier Selection */}
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

      {/* Payment */}
      <POSPaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        orderId={currentOrderId}
        orderNumber={currentOrderNumber}
        total={total}
        tenantSlug={user?.tenant_slug ?? ''}
        onPaymentConfirmed={handlePaymentConfirmed}
      />

      {/* Age Verification */}
      {agePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm p-6 shadow-xl text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">Age Verification Required</h3>
            <p className="text-sm text-muted-foreground mb-6">
              <strong>{agePrompt.item.name}</strong> requires age verification. Confirm customer is 18+?
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setAgePrompt(null)}>Cancel</Button>
              <Button className="flex-1" onClick={agePrompt.callback}>Confirm 18+</Button>
            </div>
          </div>
        </div>
      )}

      {/* Serial Number */}
      {serialPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-2">Serial Number Required</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Enter serial number for <strong>{serialPrompt.item.name}</strong>
            </p>
            <input
              value={serialInput}
              onChange={(e) => setSerialInput(e.target.value)}
              placeholder="Enter serial number..."
              className="w-full bg-background border border-border rounded-xl py-3 px-4 text-sm focus:ring-1 focus:ring-primary mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => { setSerialPrompt(null); setSerialInput(''); }}>Cancel</Button>
              <Button
                className="flex-1"
                disabled={!serialInput.trim()}
                onClick={() => { serialPrompt.callback(serialInput.trim()); setSerialInput(''); }}
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
