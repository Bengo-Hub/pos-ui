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

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CategoryBrandDrawer } from '@/components/pos/terminal/parts/category-brand-drawer';
import { SaleSessionTabs } from '@/components/pos/terminal/parts/sale-session-tabs';
import { PosToolbar } from '@/components/pos/terminal/pos-toolbar';
import { OrderTypeSelector } from '@/components/pos/order-type-selector';
import { LoyaltyPanel } from '@/components/retail/LoyaltyPanel';
import { ScaleDisplay } from '@/components/retail/ScaleDisplay';
import { CategoryNav } from '@/components/pos/category-nav';
import { CourseSelector, COURSES } from '@/components/pos/course-selector';
import { StockCell } from '@/components/pos/stock-cell';
import { TerminalProductGrid } from '@/components/pos/terminal/parts/terminal-product-grid';
import { TerminalModals } from '@/components/pos/terminal/parts/terminal-modals';
import { InlinePaymentBar } from '@/components/pos/terminal/inline-payment-bar';
import { useTerminal } from '@/components/pos/terminal/terminal-context';
import { CostHeaderToggle, MaskedCost } from '@/components/pos/cost-price';
import { InlineDiscountCell, InlineMarginCell, InlinePriceCell, InlineTotalCell } from '@/components/pos/inline-line-cells';
import { searchPlaceholderFor } from '@/lib/use-case-config';
import { cn } from '@/lib/utils';
import {
  Ban, ChefHat, Flame, Grid3x3, Image as ImageIcon, LayoutGrid, LayoutList, Loader2,
  Minus, Plus, Search, ShoppingCart, Trash2, User, X,
} from 'lucide-react';

export function TerminalShell() {
  const t = useTerminal();
  const { cfg, cart } = t;
  const router = useRouter();
  // Full-screen category/brand picker drawer (godigital-style "browse").
  const [browseOpen, setBrowseOpen] = useState(false);
  // REQ-006: management roles see a Cost column on the cart (pos-api only serializes
  // cost_price to pos.catalog.view_cost holders). Values are MASKED by default — the
  // header eye reveals/hides the whole column (customers can see the screen).
  // Cost/margin is a retail/pharmacy insight only (cfg.showCostMargin) — hospitality/QSR/
  // services terminals never show the columns, whatever the role.
  const canViewCost = cfg.showCostMargin && (t.can('pos.catalog.view_cost') || t.can('pos.orders.manage'));
  const [costRevealed, setCostRevealed] = useState(false);
  // Price/margin/discount editing policy: managers/admins (pos.orders.manage) edit any of the
  // three freely (markdown = inline discount, any raise). Non-managers get the pencil at all
  // ONLY when the outlet's Settings → "Cashier price edits" allows it (allow_price_above_base,
  // default true) — this covers BOTH raising and lowering the line: a below-preset entry is
  // accepted here too (InlinePriceCell already supports it), the outlet's
  // require_approval_below_base flag is what the SERVER enforces at order-create (422 →
  // ApprovalDialog), not a client-side block. Flipping allow_price_above_base off hides the
  // pencil for non-managers entirely (matches the setting's stated purpose: "cashiers may
  // adjust price at all", not just the raise direction).
  const canManagePrices = t.can('pos.orders.manage');
  const priceEditAllowed = canManagePrices || (t.posSettings?.allow_price_above_base ?? true);
  // Discounting can additionally be granted to a non-manager role via pos.discounts.add
  // (tenant admin's permission matrix) — the server still demands the manager step-up for
  // over-limit/below-preset amounts, so the grant only surfaces the controls.
  const canApplyDiscount = canManagePrices || t.can('pos.discounts.add');
  const showDiscountCol = canApplyDiscount && cfg.showCostMargin;
  // Explicit column tracks (shared by header + rows) so the cart never cramps: the product
  // name flexes, the numeric columns get fixed, comfortably-spaced widths. Cost + Margin
  // only exist for management roles; Discount only for managers on retail/pharmacy.
  // The In-Stock column (4rem) sits right after Product for EVERY role/use-case — it shows the
  // expected stock balance after the sale and turns red as stock runs out (see StockCell).
  const cartGridCols = canViewCost
    ? (showDiscountCol
        ? 'grid-cols-[minmax(0,1fr)_4rem_6.5rem_4.5rem_3.5rem_4rem_5rem_5.5rem]'
        : 'grid-cols-[minmax(0,1fr)_4rem_6.5rem_4.5rem_3.5rem_5rem_5.5rem]')
    : 'grid-cols-[minmax(0,1fr)_4rem_6.5rem_5rem_5.5rem]';
  // Below lg the columns above don't reflow (every value is fixed-width, only the product name
  // column flexes) — on a ~390px phone the fixed columns alone can exceed the viewport. Rather
  // than cram/overlap, the cart scrolls horizontally like every other data table in this app: a
  // min-width matching each variant's fixed-column sum (+ gaps + a livable product-name floor)
  // forces that scrollbar to appear instead of squeezing cells unreadably. lg+ already fits
  // comfortably in the 58% left column, so the floor is released there.
  const cartMinWidth = canViewCost
    ? (showDiscountCol ? 'min-w-[48rem] lg:min-w-0' : 'min-w-[44rem] lg:min-w-0')
    : 'min-w-[34rem] lg:min-w-0';

  // Total sold quantity per item id across the cart, so a multi-line item's projected stock
  // balance reflects ALL its lines (not just the row's own qty). Recomputed on every cart change.
  const cartQtyById = cart.reduce<Record<string, number>>((acc, c) => {
    acc[c.id] = (acc[c.id] ?? 0) + c.quantity;
    return acc;
  }, {});

  return (
    // Height uses dvh (dynamic viewport) so mobile browser chrome never pushes the bottom action
    // bar (Place Order / tenders) below the fold — the 100vh fallback covers older WebViews.
    <div className="flex flex-col bg-background h-[calc(100vh-80px)] supports-[height:100dvh]:h-[calc(100dvh-80px)]">
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
          onHeldItems={() => t.setHeldItemsOpen(true)}
          onAddExpense={() => t.setExpenseOpen(true)}
          onRecentTransactions={() => t.setRecentOpen(true)}
          onRegisterDetails={() => t.setRegisterOpen(true)}
          onSellReturn={() => t.setSellReturnOpen(true)}
        />
      </div>

      {/* ─────────── 2. BODY: order builder (left) + product picker (right) ───────────
          On lg+ a fixed two-column grid (58% / 42%) keeps the split robust — the wider left
          track gives the cart TABLE room for every column (product/qty/cost/margin/price/
          subtotal) while the product picker stays comfortable. Below lg the sections STACK on
          a bounded row grid (55% / 45%) so both share the viewport and scroll internally — the
          cart/totals actions and the product grid can never push the bottom action bar
          off-screen. Each section scrolls independently (min-h-0). */}
      <div className="flex-1 grid grid-rows-[minmax(0,55%)_minmax(0,45%)] lg:grid-rows-none lg:grid-cols-[58%_42%] min-h-0 overflow-hidden">

        {/* ===== LEFT: ORDER BUILDER ===== */}
        <div className="flex flex-col min-h-0 overflow-hidden lg:border-r border-border">
          {/* Customer + product search.
              The customer/search row stacks on narrow widths (flex-col) and sits side-by-side
              from sm+ so it never cramps or overflows. The "Walk-In Customer" fallback chip is a
              back-office concept: it shows only for profiles WITHOUT the order-type selector
              (hospitality/quick_service use Dine-In/Takeaway/Delivery as the equivalent, so showing
              both would duplicate). */}
          <div className="shrink-0 p-3 space-y-2 border-b border-border bg-card/40">
            {/* Row 1: product search (flexes) + pricing profile (right, same line). */}
            <div className="flex items-center gap-2">
              <div className="relative group flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary" />
                <input
                  ref={t.scanInputRef}
                  placeholder={searchPlaceholderFor(cfg.profile)}
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
              {cfg.showPricingProfile && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Price</span>
                  <select
                    value={t.pricingProfile}
                    onChange={(e) => t.repriceCart(e.target.value)}
                    disabled={t.repricing || t.pricingTiers.length === 0}
                    className="px-2.5 py-2.5 rounded-xl text-xs font-semibold bg-card border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 max-w-36"
                  >
                    {t.pricingTiers.length === 0 && <option value="">Default Selling Price</option>}
                    {t.pricingTiers.map((tier) => (
                      <option key={tier.code} value={tier.code}>{tier.name}</option>
                    ))}
                  </select>
                  {t.repricing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
              )}
            </div>

            {/* Row 2: customer/loyalty card spanning the FULL row (its picker lays out
                horizontally on wider screens to use the width). */}
            {cfg.showPricingProfile ? (
              // key: remounts after each sale so the customer resets to the Walk-in default; on a
              // multi-cart switch the same remount re-seeds the chip with THIS tab's attached customer.
              <LoyaltyPanel key={t.customerResetSeq} onStateChange={t.setLoyaltyState} layout="row" initialSelected={t.initialSelectedCustomer} />
            ) : !cfg.showOrderType ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-card text-sm font-medium text-muted-foreground">
                <User className="h-4 w-4 shrink-0" /> Walk-In Customer
              </div>
            ) : null}

            {/* Order type (hospitality/quick-service) keeps its own row. */}
            {cfg.showOrderType && (
              <OrderTypeSelector
                value={t.orderSubtype}
                onChange={t.setOrderSubtype}
                tableName={t.tableName || undefined}
                onSelectTable={() => router.push(`/${t.orgSlug}/tables`)}
                useCase={t.outlet?.use_case}
              />
            )}

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

          {/* CART TABLE header strip.
              Retail multi-cart: the Sale 1/2/3 · + New Sale tabs live HERE (inline, above the cart
              they control) instead of a separate top bar — parallel carts so a slow M-Pesa payer
              parked on one tab never blocks the next customer. Other use-cases keep the plain title. */}
          <div className="flex items-center justify-between gap-2 px-4 py-2 shrink-0 bg-muted/40 border-b border-border">
            {cfg.multiCart && !t.isAddToBill ? (
              <SaleSessionTabs />
            ) : (
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <ShoppingCart className="h-3.5 w-3.5" />
                {t.isAddToBill ? 'Adding to Bill' : cfg.terminalTitle}
                {t.cartItemCount > 0 && <span className="text-primary">· {t.cartItemCount}</span>}
              </div>
            )}
            {cart.length > 0 && (
              <button onClick={t.clearCart} className="shrink-0 text-[11px] text-destructive font-semibold hover:underline">Clear all</button>
            )}
          </div>
          {/* Shared horizontal+vertical scroll container: the header stays vertically pinned via
              sticky (not a separate sibling), so it scrolls horizontally IN SYNC with the rows
              below it instead of drifting out of column alignment. */}
          <div className="flex-1 overflow-auto min-h-0">
            <div className={cartMinWidth}>
              <div className={cn('sticky top-0 z-10 grid gap-3 px-4 py-2 shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border bg-card', cartGridCols)}>
                <span>Product</span>
                <span className="text-center">In Stock</span>
                <span className="text-center">Quantity</span>
                {canViewCost && (
                  <>
                    <span className="text-right">
                      <CostHeaderToggle revealed={costRevealed} onToggle={() => setCostRevealed((v) => !v)} />
                    </span>
                    <span className="text-right">Margin</span>
                  </>
                )}
                {showDiscountCol && <span className="text-right">Discount</span>}
                <span className="text-right">Price inc. tax</span>
                <span className="text-right">Subtotal</span>
              </div>
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-10">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 mb-1">
                  <ShoppingCart className="h-8 w-8 opacity-30" />
                </div>
                <p className="text-sm font-medium">Cart is empty</p>
                <p className="text-xs">Add items from the right to start an order</p>
              </div>
            ) : (
              cart.map((item, idx) => {
                const lineTotal = (item.price + (item.modifierTotal ?? 0)) * item.quantity;
                return (
                  <div key={`${item.id}-${idx}`} className={cn('grid gap-3 items-center px-4 py-2.5 border-b border-border/60 hover:bg-primary/5 transition-colors', cartGridCols)}>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate leading-tight">
                        {item.name}
                        {item.nonBillable && (
                          <span className="ml-1.5 align-middle text-[9px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-500/10 border border-emerald-200 px-1.5 py-0.5 rounded-full" title="Non-billable — never charged; stock still deducts">
                            Free
                          </span>
                        )}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] text-muted-foreground font-mono">{item.sku}</span>
                        {item.serialNumber && <span className="text-[10px] text-muted-foreground">SN: {item.serialNumber}</span>}
                      </div>
                      {item.selectedModifiers && Object.values(item.selectedModifiers).flat().length > 0 && (
                        <p className="text-[10px] text-primary truncate">{Object.values(item.selectedModifiers).flat().join(', ')}</p>
                      )}
                      {/* Per-line course selector (hospitality) — restored: lets the waiter assign each
                          line to a course (Starter/Main/Dessert/Bar) for kitchen firing. */}
                      {cfg.showCourses && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <CourseSelector value={item.courseNumber ?? 0} onChange={(c) => t.updateCourse(idx, c)} compact />
                          {/* Per-line seat/guest — pre-populates split-by-item so each guest gets
                              their own bill without re-creating the order. */}
                          <select
                            value={item.seat ?? 0}
                            onChange={(e) => t.setItemSeat(idx, parseInt(e.target.value))}
                            title="Assign to a guest"
                            className="h-6 rounded-md border border-border bg-background px-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/30"
                          >
                            <option value={0}>Guest…</option>
                            {Array.from({ length: 8 }, (_, g) => (
                              <option key={g + 1} value={g + 1}>Guest {g + 1}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                    {/* In-Stock (expected balance after this sale) — all roles; red as stock runs out */}
                    <div className="flex items-center justify-center text-sm">
                      <StockCell stockQuantity={item.stockQuantity} soldQty={cartQtyById[item.id] ?? item.quantity} itemType={item.item_type} />
                    </div>
                    {/* Qty stepper — the + routes through incrementCartLine so pushing a line past
                        available stock opens the oversell (out-of-stock) manager-approval flow. */}
                    <div className="flex items-center gap-1 justify-center">
                      <button onClick={() => t.updateQuantity(idx, -1)} className="h-6 w-6 rounded-md border border-border flex items-center justify-center hover:bg-accent"><Minus className="h-3 w-3" /></button>
                      {/* Editable qty — type a quantity (e.g. 120) instead of tapping "+" 120×.
                          Commits on Enter/blur; a value above stock still routes through the
                          oversell approval inside setLineQuantity. */}
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        defaultValue={item.quantity}
                        key={item.quantity}
                        aria-label="Line quantity"
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        onBlur={(e) => {
                          const n = parseInt(e.currentTarget.value, 10);
                          if (!Number.isNaN(n) && n !== item.quantity) t.setLineQuantity(idx, n);
                          else e.currentTarget.value = String(item.quantity);
                        }}
                        className="w-10 text-center text-sm font-bold tabular-nums rounded-md border border-border bg-background focus:ring-1 focus:ring-ring focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button onClick={() => t.incrementCartLine(idx)} className="h-6 w-6 rounded-md border border-border flex items-center justify-center hover:bg-accent"><Plus className="h-3 w-3" /></button>
                    </div>
                    {canViewCost && (
                      <>
                        <span className="text-right text-xs">
                          <MaskedCost cost={item.costPrice} sell={item.price} revealed={costRevealed} showMargin={false} />
                        </span>
                        <span className="text-right text-xs">
                          <InlineMarginCell
                            cost={item.costPrice}
                            sell={item.price}
                            unitDiscount={item.unitDiscount ?? 0}
                            revealed={costRevealed}
                            editable={priceEditAllowed && !item.nonBillable && !item.promoFree}
                            onCommitPrice={(p) => t.setLinePrice(idx, p, 'margin edit')}
                          />
                        </span>
                      </>
                    )}
                    {showDiscountCol && (
                      <span className="text-right text-xs">
                        <InlineDiscountCell
                          price={item.price}
                          unitDiscount={item.unitDiscount ?? 0}
                          quantity={item.quantity}
                          editable={!item.nonBillable && !item.promoFree}
                          onCommitDiscount={(ud) => t.setLineDiscount(idx, ud)}
                        />
                      </span>
                    )}
                    <span className="text-right">
                      {/* Price edits: managers always; non-managers only when the outlet's
                          allow_price_above_base setting permits it (Settings → General →
                          Cashier price edits). A below-preset entry still passes through for
                          everyone — the server's require_approval_below_base policy gates it
                          at order-create (422 → ApprovalDialog), not this cell. */}
                      <InlinePriceCell
                        price={item.price}
                        preset={item.originalPrice ?? item.price}
                        canDiscount={canManagePrices}
                        disabled={!priceEditAllowed || item.nonBillable || item.promoFree}
                        onCommit={(p) => t.setLinePrice(idx, p, 'price edit')}
                      />
                    </span>
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Line subtotal is a DERIVED figure (unit price = total ÷ qty) — same
                          edit policy as the unit-price cell above. */}
                      <InlineTotalCell
                        price={item.price}
                        quantity={item.quantity}
                        canDiscount={canManagePrices}
                        disabled={!priceEditAllowed || item.nonBillable || item.promoFree}
                        onCommitPrice={(p) => t.setLinePrice(idx, p, 'line total edit')}
                      />
                      <button onClick={() => t.removeFromCart(idx)} className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                );
              })
            )}
            </div>
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
        <div className="flex flex-col min-h-0 overflow-hidden bg-card/30">
          <div className="shrink-0 px-3 py-2.5 flex items-center gap-2 border-b border-border">
            {/* Category | Brands switch — Brands apply to retail/pharmacy only (cfg.showBrandGrid). */}
            {cfg.showBrandGrid && (
              <div className="flex gap-0.5 shrink-0 border border-border rounded-lg p-0.5 bg-card">
                {(['category', 'brand'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => t.setPickerMode(m)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-xs font-bold transition-colors capitalize',
                      t.pickerMode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {m === 'category' ? 'Category' : 'Brands'}
                  </button>
                ))}
              </div>
            )}
            <CategoryNav
              categories={t.pickerMode === 'brand' ? t.brands : t.categories}
              active={t.pickerMode === 'brand' ? t.activeBrand : t.activeCategory}
              onSelect={t.pickerMode === 'brand' ? t.handleBrandChange : t.handleCategoryChange}
              className="flex-1"
            />
            {/* Browse — opens the full category/brand picker drawer (godigital reference). */}
            <button
              type="button"
              onClick={() => setBrowseOpen(true)}
              title={t.pickerMode === 'brand' ? 'Browse brands' : 'Browse categories'}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-card text-xs font-bold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Browse</span>
            </button>
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
            layout="bar"
            total={t.total}
            tenantSlug={t.user?.tenant_slug ?? ''}
            profile={cfg.profile}
            isHospitality={t.isHospitality}
            // COD is delivery-only (paid to the rider on delivery) — never for takeaway/counter/dine-in.
            allowCOD={t.orderSubtype === 'delivery'}
            customerEmail={t.loyaltyState?.customerEmail}
            hasCustomer={!!t.loyaltyState?.customerPhone}
            customerCreditAvailable={t.customerCreditAvailable}
            loyaltyAccount={t.loyaltyRedeemInfo}
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

      <CategoryBrandDrawer
        open={browseOpen}
        mode={t.pickerMode === 'brand' ? 'brand' : 'category'}
        entries={t.pickerMode === 'brand' ? t.brands : t.categories}
        active={t.pickerMode === 'brand' ? t.activeBrand : t.activeCategory}
        onSelect={t.pickerMode === 'brand' ? t.handleBrandChange : t.handleCategoryChange}
        onClose={() => setBrowseOpen(false)}
      />
    </div>
  );
}
