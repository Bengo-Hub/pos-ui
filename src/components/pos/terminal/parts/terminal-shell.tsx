'use client';

/**
 * TerminalShell — the GoDigital POS layout every per-use-case view composes.
 *
 * Three zones, matching the GoDigital reference exactly:
 *   1. Top header band  — Location + outlet badge + datetime, and the quick-action toolbar (icons).
 *   2. Two-column body  — LEFT: order builder (customer + search, price-profile + order-type, the
 *                         cart TABLE, totals). RIGHT: Category/Brands tabs + the product grid.
 *   3. Bottom action bar — the inline payment bar (Draft/Quotation/Credit/Card/Multiple Pay/Cash/
 *                         Cancel) + Total Payable, or the Add-to-Bill button.
 *
 * All state/handlers come from useTerminal(); per-use-case differences are driven by cfg
 * (terminalConfigFor) exactly as before, so behaviour is unchanged — only the layout is GoDigital.
 */

import { useRouter } from 'next/navigation';
import { PosToolbar } from '@/components/pos/terminal/pos-toolbar';
import { OrderTypeSelector } from '@/components/pos/order-type-selector';
import { LoyaltyPanel } from '@/components/retail/LoyaltyPanel';
import { ScaleDisplay } from '@/components/retail/ScaleDisplay';
import { CategoryNav } from '@/components/pos/category-nav';
import { CourseBadge, COURSES } from '@/components/pos/course-selector';
import { TerminalProductGrid } from '@/components/pos/terminal/parts/terminal-product-grid';
import { TerminalModals } from '@/components/pos/terminal/parts/terminal-modals';
import { InlinePaymentBar } from '@/components/pos/terminal/inline-payment-bar';
import { useTerminal } from '@/components/pos/terminal/terminal-context';
import { cn } from '@/lib/utils';
import {
  Ban, ChefHat, Flame, Grid3x3, Image as ImageIcon, LayoutList, Loader2,
  Minus, Plus, Search, ShoppingCart, Trash2, User, X,
} from 'lucide-react';

export function TerminalShell() {
  const t = useTerminal();
  const { cfg, cart } = t;
  const router = useRouter();

  return (
    <div className="flex flex-col bg-background" style={{ height: 'calc(100vh - 80px)' }}>
      {/* ─────────── 1. QUICK-ACTION TOOLBAR STRIP ───────────
          (No GoDigital "Location" band — outlet selection already lives in the app header; we use
           outlets, not locations.) */}
      <div className="shrink-0 flex items-center justify-end gap-2 px-4 py-2 bg-card border-b border-border">
        <PosToolbar
          orgSlug={t.orgSlug}
          profile={cfg.profile}
          canRegister={t.can('pos.sessions.view') || t.can('pos.sessions.add') || t.can('pos.payments.add')}
          showCalculator={cfg.showCalculator}
          onCalculator={() => t.setCalcOpen(true)}
          onParkedSales={() => t.setParkedOpen(true)}
          onAddExpense={() => t.setExpenseOpen(true)}
          onRecentTransactions={() => t.setRecentOpen(true)}
          onRegisterDetails={() => t.setRegisterOpen(true)}
          onSellReturn={() => t.setSellReturnOpen(true)}
        />
      </div>

      {/* ─────────── 2. BODY: order builder (left) + product picker (right) ─────────── */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">

        {/* ===== LEFT: ORDER BUILDER ===== */}
        <div className="flex flex-col min-h-0 lg:w-[56%] xl:w-[58%] lg:border-r border-border">
          {/* Customer + product search */}
          <div className="shrink-0 p-3 space-y-2 border-b border-border bg-card/40">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Customer — LoyaltyPanel is the customer/loyalty link where pricing/loyalty applies */}
              {cfg.showPricingProfile ? (
                <LoyaltyPanel onStateChange={t.setLoyaltyState} />
              ) : (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-card text-sm font-medium text-muted-foreground">
                  <User className="h-4 w-4" /> Walk-In Customer
                </div>
              )}
              {/* Product search / scan */}
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary" />
                <input
                  ref={t.scanInputRef}
                  placeholder="Product name / SKU / Scan bar code"
                  className="w-full bg-card border border-border rounded-xl py-2.5 pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium"
                  value={t.searchQuery}
                  onChange={(e) => t.handleSearchChange(e.target.value)}
                  onKeyDown={t.handleSearchKeyDown}
                />
                {t.searchQuery && (
                  <button
                    onClick={() => t.handleSearchChange('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Clear search"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Price profile + order type */}
            <div className="flex flex-wrap items-center gap-2">
              {cfg.showPricingProfile && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Price</span>
                  <select
                    value={t.pricingProfile}
                    onChange={(e) => t.repriceCart(e.target.value)}
                    disabled={t.repricing || t.pricingTiers.length === 0}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-card border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                  >
                    {t.pricingTiers.length === 0 && <option value="">Default Selling Price</option>}
                    {t.pricingTiers.map((tier) => (
                      <option key={tier.code} value={tier.code}>{tier.name}</option>
                    ))}
                  </select>
                  {t.repricing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
              )}
              {cfg.showOrderType && (
                <div className="flex-1 min-w-50">
                  <OrderTypeSelector
                    value={t.orderSubtype}
                    onChange={t.setOrderSubtype}
                    tableName={t.tableName || undefined}
                    onSelectTable={() => router.push(`/${t.orgSlug}/tables`)}
                    useCase={t.outlet?.use_case}
                  />
                </div>
              )}
            </div>

            {/* Hardware scale (retail/pharmacy) */}
            {cfg.showScale && t.scaleDeviceId && (
              <ScaleDisplay
                tenantSlug={t.user?.tenant_slug ?? t.orgSlug}
                deviceId={t.scaleDeviceId}
                onAddToCart={t.handleScaleAddToCart}
              />
            )}

            {/* Add-to-bill banner */}
            {t.isAddToBill && (
              <div className="px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 flex items-center gap-2 text-sm">
                <span className="text-blue-600 dark:text-blue-400 font-bold">Current bill:</span>
                <span className="text-blue-700 dark:text-blue-300">KSh {t.billOrderTotal.toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* CART TABLE header strip */}
          <div className="flex items-center justify-between px-4 py-2 shrink-0 bg-muted/40 border-b border-border">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <ShoppingCart className="h-3.5 w-3.5" />
              {t.isAddToBill ? 'Adding to Bill' : cfg.terminalTitle}
              {t.cartItemCount > 0 && <span className="text-primary">· {t.cartItemCount}</span>}
            </div>
            {cart.length > 0 && (
              <button onClick={t.clearCart} className="text-[11px] text-destructive font-semibold hover:underline">Clear all</button>
            )}
          </div>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2 shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
            <span>Product</span>
            <span className="w-24 text-center">Quantity</span>
            <span className="w-20 text-right">Price inc. tax</span>
            <span className="w-20 text-right">Subtotal</span>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground py-10">
                <ShoppingCart className="h-10 w-10 opacity-20" />
                <p className="text-sm font-medium">Cart is empty</p>
                <p className="text-xs">Add items from the right to start an order</p>
              </div>
            ) : (
              cart.map((item, idx) => {
                const lineTotal = (item.price + (item.modifierTotal ?? 0)) * item.quantity;
                return (
                  <div key={`${item.id}-${idx}`} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-4 py-2.5 border-b border-border/60 hover:bg-accent/30">
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate leading-tight">{item.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] text-muted-foreground font-mono">{item.sku}</span>
                        {item.serialNumber && <span className="text-[10px] text-muted-foreground">SN: {item.serialNumber}</span>}
                        {cfg.showCourses && item.courseNumber ? <CourseBadge course={item.courseNumber} /> : null}
                      </div>
                      {item.selectedModifiers && Object.values(item.selectedModifiers).flat().length > 0 && (
                        <p className="text-[10px] text-primary truncate">{Object.values(item.selectedModifiers).flat().join(', ')}</p>
                      )}
                    </div>
                    {/* Qty stepper */}
                    <div className="flex items-center gap-1 w-24 justify-center">
                      <button onClick={() => t.updateQuantity(idx, -1)} className="h-6 w-6 rounded-md border border-border flex items-center justify-center hover:bg-accent"><Minus className="h-3 w-3" /></button>
                      <span className="w-7 text-center text-sm font-bold tabular-nums">{item.quantity}</span>
                      <button onClick={() => t.updateQuantity(idx, 1)} className="h-6 w-6 rounded-md border border-border flex items-center justify-center hover:bg-accent"><Plus className="h-3 w-3" /></button>
                    </div>
                    <span className="w-20 text-right text-xs font-mono text-muted-foreground">{item.price.toLocaleString()}</span>
                    <div className="w-20 flex items-center justify-end gap-1.5">
                      <span className="text-sm font-bold font-mono tabular-nums">{lineTotal.toLocaleString()}</span>
                      <button onClick={() => t.removeFromCart(idx)} className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* TOTALS FOOTER */}
          <div className="shrink-0 border-t border-border bg-card px-4 py-2.5 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Items: <b className="text-foreground">{t.cartItemCount}</b></span>
              <span className="text-muted-foreground">Subtotal: <b className="text-foreground tabular-nums">KES {t.subtotal.toLocaleString()}</b></span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Order Tax(+): <b className="text-foreground tabular-nums">KES {t.tax.toLocaleString()}</b></span>
              {t.loyaltyDiscount > 0 && <span className="text-emerald-600">Discount: -KES {t.loyaltyDiscount.toLocaleString()}</span>}
            </div>
            {/* Void + fire-courses (hospitality), preserved from the cart panel */}
            {t.currentOrderId && t.can('pos.orders.void') && (
              <button onClick={() => t.setVoidOpen(true)} className="w-full mt-1 flex items-center justify-center gap-2 py-1.5 rounded-lg border border-destructive/40 text-destructive text-xs font-semibold hover:bg-destructive/5">
                <Ban className="h-3.5 w-3.5" /> Void Order #{t.currentOrderNumber}
              </button>
            )}
            {cfg.showCourses && t.currentOrderId && t.currentOrderCourses.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {t.currentOrderCourses.map((c) => {
                  const label = COURSES.find((x) => x.value === c)?.label ?? `Course ${c}`;
                  const fired = c <= t.firedCourses;
                  return (
                    <button key={c} disabled={fired || t.firingCourse !== null} onClick={() => t.handleFireCourse(c)}
                      className={cn('flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold', fired ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary hover:bg-primary/20')}>
                      {t.firingCourse === c ? <Loader2 className="h-3 w-3 animate-spin" /> : fired ? <span className="h-2.5 w-2.5 rounded-full bg-green-500 inline-block" /> : <Flame className="h-3 w-3" />}
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ===== RIGHT: PRODUCT PICKER (Category/Brands tabs + grid) ===== */}
        <div className="flex flex-col min-h-0 flex-1 bg-card/30">
          <div className="shrink-0 px-3 py-2.5 flex items-center gap-2 border-b border-border">
            <CategoryNav
              categories={t.categories}
              active={t.activeCategory}
              onSelect={t.handleCategoryChange}
              className="flex-1"
            />
            <div className="flex gap-0.5 shrink-0 border border-border rounded-lg p-0.5 bg-card">
              {([['card', Grid3x3], ['list', LayoutList], ['image_grid', ImageIcon]] as const).map(([mode, Icon]) => (
                <button key={mode} onClick={() => t.setDisplayMode(mode)}
                  className={cn('p-1.5 rounded-md transition-colors', t.displayMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
          <TerminalProductGrid />
        </div>
      </div>

      {/* ─────────── 3. BOTTOM ACTION BAR ─────────── */}
      <div className="shrink-0 border-t border-border bg-card">
        {t.isAddToBill ? (
          <div className="p-3 flex items-center justify-between gap-3">
            <span className="text-sm font-bold">Total Payable: <span className="text-primary tabular-nums">KES {t.total.toLocaleString()}</span></span>
            <button onClick={t.handlePlaceOrder} disabled={cart.length === 0 || t.addOrderLinesPending}
              className="min-h-12 px-6 rounded-xl bg-primary text-primary-foreground font-bold flex items-center gap-2 disabled:opacity-50">
              {t.addOrderLinesPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ChefHat className="h-5 w-5" />} Add to Bill →
            </button>
          </div>
        ) : (
          <InlinePaymentBar
            total={t.total}
            tenantSlug={t.user?.tenant_slug ?? ''}
            profile={cfg.profile}
            isHospitality={t.isHospitality}
            allowCOD={cfg.profile === 'retail' || cfg.profile === 'quick_service'}
            customerEmail={(t.loyaltyState as any)?.customerEmail}
            disabled={cart.length === 0}
            mode={t.isHospitality && t.orderSubtype === 'dine_in' ? 'send_to_kitchen' : 'pay'}
            createOrderAsync={t.createOrderAsync}
            onSettled={t.handleInlineSettled}
            onDraft={t.handlePark}
            onQuotation={t.handlePark}
            onCancel={t.clearCart}
            onSplit={t.handleInlineSplit}
          />
        )}
      </div>

      <TerminalModals />
    </div>
  );
}
