'use client';

import { Badge, Button } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import {
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  X
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  image?: string;
}

interface CartItem extends MenuItem {
  quantity: number;
  modifiers?: string[];
}

const categories = ['All', 'Mains', 'Starters', 'Drinks', 'Desserts', 'Sides'];

const menuItems: MenuItem[] = [
  { id: '1', name: 'Nyama Choma', price: 1200, category: 'Mains' },
  { id: '2', name: 'Ugali & Sukuma', price: 350, category: 'Mains' },
  { id: '3', name: 'Pilau Rice', price: 500, category: 'Mains' },
  { id: '4', name: 'Grilled Chicken', price: 850, category: 'Mains' },
  { id: '5', name: 'Fish & Chips', price: 750, category: 'Mains' },
  { id: '6', name: 'Beef Stew', price: 600, category: 'Mains' },
  { id: '7', name: 'Samosas (4pc)', price: 250, category: 'Starters' },
  { id: '8', name: 'Soup of the Day', price: 300, category: 'Starters' },
  { id: '9', name: 'Spring Rolls', price: 350, category: 'Starters' },
  { id: '10', name: 'Chicken Wings', price: 550, category: 'Starters' },
  { id: '11', name: 'Fresh Juice', price: 200, category: 'Drinks' },
  { id: '12', name: 'Soda', price: 100, category: 'Drinks' },
  { id: '13', name: 'Water', price: 80, category: 'Drinks' },
  { id: '14', name: 'Milkshake', price: 350, category: 'Drinks' },
  { id: '15', name: 'Tea / Coffee', price: 150, category: 'Drinks' },
  { id: '16', name: 'Ice Cream', price: 250, category: 'Desserts' },
  { id: '17', name: 'Cake Slice', price: 300, category: 'Desserts' },
  { id: '18', name: 'Fruit Salad', price: 200, category: 'Desserts' },
  { id: '19', name: 'Chips', price: 200, category: 'Sides' },
  { id: '20', name: 'Coleslaw', price: 100, category: 'Sides' },
  { id: '21', name: 'Kachumbari', price: 80, category: 'Sides' },
];

export default function OrderPage() {
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);

  const filteredItems = menuItems.filter((item) => {
    const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id);
      if (existing) {
        return prev.map((c) => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((c) => c.id === id ? { ...c, quantity: c.quantity + delta } : c)
        .filter((c) => c.quantity > 0);
    });
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((c) => c.id !== id));
  };

  const clearCart = () => setCart([]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = Math.round(subtotal * 0.16);
  const total = subtotal + tax;

  const handlePlaceOrder = () => {
    if (cart.length === 0) return;
    toast.success(`Order placed! Total: KES ${total.toLocaleString()}`);
    clearCart();
  };

  return (
    <div className="h-full flex flex-col lg:flex-row overflow-hidden">
      {/* Menu Grid - Left Panel */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Category Tabs */}
        <div className="px-4 pt-4 pb-2 flex gap-2 overflow-x-auto shrink-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "px-5 py-3 rounded-xl text-sm font-bold whitespace-nowrap transition-all min-h-[44px]",
                activeCategory === cat
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-4 py-2 shrink-0">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              placeholder="Search menu items..."
              className="w-full bg-card border border-border rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-1 focus:ring-primary transition-all min-h-[44px]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Items Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredItems.map((item) => {
              const inCart = cart.find((c) => c.id === item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className={cn(
                    "relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all min-h-[120px] touch-manipulation",
                    "active:scale-95 hover:shadow-md",
                    inCart
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-card hover:border-primary/30"
                  )}
                >
                  {inCart && (
                    <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                      {inCart.quantity}
                    </div>
                  )}
                  <span className="text-sm font-bold text-center leading-tight">{item.name}</span>
                  <span className="text-xs text-muted-foreground mt-1.5 font-mono">KES {item.price.toLocaleString()}</span>
                </button>
              );
            })}
          </div>
          {filteredItems.length === 0 && (
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
              {cart.map((item) => (
                <div key={item.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">KES {(item.price * item.quantity).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateQuantity(item.id, -1)}
                      className="h-[44px] w-[44px] rounded-xl border border-border flex items-center justify-center hover:bg-accent transition touch-manipulation"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.id, 1)}
                      className="h-[44px] w-[44px] rounded-xl border border-border flex items-center justify-center hover:bg-accent transition touch-manipulation"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="h-[44px] w-[44px] rounded-xl flex items-center justify-center text-destructive hover:bg-destructive/10 transition touch-manipulation ml-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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
              className="w-full min-h-[52px] text-base font-bold shadow-lg shadow-primary/20 gap-2"
            >
              <ShoppingCart className="h-5 w-5" />
              Place Order
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
