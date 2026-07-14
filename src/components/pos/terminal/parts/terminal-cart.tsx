'use client';

/**
 * Terminal cart panel — the right-hand side panel (desktop) / slide-up bottom sheet (mobile):
 * mobile sticky cart bar, cart header (order-type, pricing profile, loyalty), line items
 * (qty/remove/modifiers/serial/course), the totals footer and the bottom action bar
 * (inline payment bar or add-to-bill button, void, fire-courses).
 *
 * Extracted verbatim from the monolith order page; all gating reads from useTerminal()/cfg.
 */

import { Badge, Button } from '@/components/ui/base';
import { CourseSelector, CourseBadge, COURSES, type CourseValue } from '@/components/pos/course-selector';
import { OrderTypeSelector } from '@/components/pos/order-type-selector';
import { LoyaltyPanel } from '@/components/retail/LoyaltyPanel';
import { InlinePaymentBar } from '@/components/pos/terminal/inline-payment-bar';
import { useTerminal } from '@/components/pos/terminal/terminal-context';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Ban, ChefHat, Eye, EyeOff, Flame, Loader2, Minus, Pencil, Plus, ShoppingCart, Tag, Trash2, X,
} from 'lucide-react';

export function TerminalCart() {
  const t = useTerminal();
  const router = useRouter();
  const { tenant } = useTenantBranding();
  const { cfg, cart } = t;
  // Manager-only cost/margin insight on cart lines. Cost price is SENSITIVE — kept masked by default
  // (so a customer glancing at the screen can't read it) and revealed only when the eye is clicked.
  // pos-api only sends costPrice to managers (pos.catalog.view_cost / pos.orders.manage), so the row
  // never renders for a cashier even if this gate were bypassed. Retail/pharmacy only
  // (cfg.showCostMargin) — hospitality/QSR/services never show cost/margin, whatever the role.
  const canViewCost = cfg.showCostMargin && (t.can('pos.catalog.view_cost') || t.can('pos.orders.manage'));
  const [costRevealed, setCostRevealed] = useState(false);
  // Manager/admin quick-edit for order-level tax + additional charges (QA req 4). The pencil
  // triggers only render for managers; the server re-gates via order.adjustment regardless.
  const canAdjustOrder = t.can('pos.orders.manage');

  return (
    <>
      {/* ── Mobile sticky cart bar (hidden on lg+) ── */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-background via-background to-transparent">
        <button
          type="button"
          onClick={() => t.setCartOpen(true)}
          className="w-full min-h-14 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 flex items-center justify-between px-5 font-bold active:scale-[0.99] transition-transform"
        >
          <span className="flex items-center gap-2.5">
            <span className="relative">
              <ShoppingCart className="h-5 w-5" />
              {t.cartItemCount > 0 && (
                <span className="absolute -top-2 -right-2 h-5 min-w-5 px-1 rounded-full bg-background text-primary text-[11px] font-bold flex items-center justify-center">
                  {t.cartItemCount}
                </span>
              )}
            </span>
            <span>{cart.length === 0 ? 'View cart' : `${t.cartItemCount} item${t.cartItemCount !== 1 ? 's' : ''}`}</span>
          </span>
          <span className="tabular-nums">KES {t.total.toLocaleString()}</span>
        </button>
      </div>

      {/* Mobile cart backdrop */}
      {t.cartOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => t.setCartOpen(false)}
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
          t.cartOpen ? 'translate-y-0' : 'translate-y-full lg:translate-y-0'
        )}
      >
        {/* Mobile sheet grabber + close */}
        <div className="lg:hidden relative pt-3 pb-1 shrink-0">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-border" />
          <button
            type="button"
            onClick={() => t.setCartOpen(false)}
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
                <h2 className="font-bold text-sm leading-none">{t.isAddToBill ? 'Adding to Bill' : cfg.terminalTitle}</h2>
                {t.cartItemCount > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">{t.cartItemCount} item{t.cartItemCount !== 1 ? 's' : ''}</p>
                )}
              </div>
              {t.cartItemCount > 0 && (
                <Badge variant="default" className="ml-1 h-6 min-w-6 px-2 text-xs font-bold">
                  {t.cartItemCount}
                </Badge>
              )}
            </div>
            {cart.length > 0 && (
              <button
                onClick={t.clearCart}
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
              value={t.orderSubtype}
              onChange={t.setOrderSubtype}
              tableName={t.tableName || undefined}
              onSelectTable={() => router.push(`/${t.orgSlug}/tables`)}
              useCase={t.outlet?.use_case}
            />
          )}
          {/* Delivery orders capture a dropoff address + notes so a rider can be dispatched
              (pos-api → logistics). Shown only for the delivery subtype. */}
          {cfg.showOrderType && t.orderSubtype === 'delivery' && (
            <div className="mt-2 space-y-2 rounded-xl border border-border bg-muted/20 p-3">
              <input
                type="text"
                value={t.deliveryInfo.address}
                onChange={(e) => t.setDeliveryInfo({ ...t.deliveryInfo, address: e.target.value })}
                placeholder="Delivery address"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <input
                type="text"
                value={t.deliveryInfo.notes}
                onChange={(e) => t.setDeliveryInfo({ ...t.deliveryInfo, notes: e.target.value })}
                placeholder="Delivery notes (landmark, gate, etc.) — optional"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          )}
          {cfg.showPricingProfile && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Price</span>
              {/* Real pricing tiers from inventory (Retail, Wholesale, custom e.g. Loyal Clients). */}
              <select
                value={t.pricingProfile}
                onChange={(e) => t.repriceCart(e.target.value)}
                disabled={t.repricing || t.pricingTiers.length === 0}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-card border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
              >
                {t.pricingTiers.length === 0 && <option value="">Default Price</option>}
                {t.pricingTiers.map((tier) => (
                  <option key={tier.code} value={tier.code}>{tier.name}</option>
                ))}
              </select>
              {t.repricing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
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
                        {/* Happy-hour tag. Same-SKU BOGO folds free units into this line, so the
                            displayed qty (below) already includes them — the tag says how many of
                            them are free. A cross-item auto-added line (promoFree) is wholly free.
                            A non-BOGO discount (percentage/fixed) just shows its label. */}
                        {(() => {
                          const lineFree = t.bogoFreeFor(item);
                          if (item.promoFree) {
                            return <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 rounded px-1.5 py-0.5 whitespace-nowrap">Free</span>;
                          }
                          if (lineFree > 0) {
                            return <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 rounded px-1.5 py-0.5 whitespace-nowrap">{lineFree} free</span>;
                          }
                          const hh = t.happyHour.bySku[item.sku];
                          if (hh) {
                            return <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 rounded px-1.5 py-0.5 whitespace-nowrap">{hh.freeQty > 0 ? `+${hh.freeQty} free` : hh.label}</span>;
                          }
                          return null;
                        })()}
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
                        <button
                          type="button"
                          onClick={() => t.setPriceEditIndex(idx)}
                          title="Override unit price"
                          className="text-xs font-bold font-mono text-primary hover:underline underline-offset-2"
                        >
                          KES {((item.price + (item.modifierTotal ?? 0)) * (item.quantity + t.bogoFreeFor(item))).toLocaleString()}
                        </button>
                        {item.originalPrice != null && item.price < item.originalPrice && (
                          <span className="text-[10px] text-muted-foreground line-through font-mono">
                            KES {(item.originalPrice * (item.quantity + t.bogoFreeFor(item))).toLocaleString()}
                          </span>
                        )}
                        {cfg.showCourses && (
                          <CourseSelector
                            value={item.courseNumber ?? 0}
                            onChange={(c) => t.updateCourse(idx, c)}
                            compact
                          />
                        )}
                      </div>
                      {/* REQ-001: projected on-hand stock if this cart is completed — preview
                          only, nothing deducts until the sale finalizes. */}
                      {typeof item.stockQuantity === 'number' && (() => {
                        // Free BOGO units deduct stock too, so project against the effective qty.
                        const projected = item.stockQuantity - (item.quantity + t.bogoFreeFor(item));
                        return (
                          <div className={cn('text-[10px] font-mono mt-0.5', projected < 0 ? 'text-destructive font-semibold' : 'text-muted-foreground')}>
                            Stock after sale: {projected}{projected < 0 ? ' — exceeds on-hand' : ''}
                          </div>
                        );
                      })()}
                      {/* Manager-only cost / selling / margin row (cost masked until the eye is clicked). */}
                      {canViewCost && typeof item.costPrice === 'number' && item.costPrice > 0 && (() => {
                        const sell = item.price;
                        const cost = item.costPrice;
                        const margin = sell > 0 ? ((sell - cost) / sell) * 100 : 0;
                        return (
                          <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-muted-foreground">
                            <span title="Selling price">Sell {sell.toLocaleString()}</span>
                            <button
                              type="button"
                              onClick={() => setCostRevealed((v) => !v)}
                              title={costRevealed ? 'Hide cost price' : 'Show cost price'}
                              className="inline-flex items-center gap-1 hover:text-foreground"
                            >
                              {costRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              <span>Cost {costRevealed ? cost.toLocaleString() : '••••'}</span>
                            </button>
                            <span
                              title="Margin %"
                              className={cn('font-semibold', margin < 0 ? 'text-destructive' : margin < 15 ? 'text-amber-600' : 'text-emerald-600')}
                            >
                              {margin.toFixed(0)}%
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                    {/* Qty controls + delete */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => t.updateQuantity(idx, -1)}
                        className="h-11 w-11 rounded-xl border border-border bg-background flex items-center justify-center hover:bg-accent transition touch-manipulation active:scale-95"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      {/* Effective qty (paid + same-SKU BOGO free units) so the free drink shows on
                          the line; the ± buttons still adjust the PAID quantity. */}
                      <span className="w-8 text-center text-sm font-bold tabular-nums">{item.quantity + t.bogoFreeFor(item)}</span>
                      <button
                        onClick={() => t.updateQuantity(idx, 1)}
                        className="h-11 w-11 rounded-xl border border-border bg-background flex items-center justify-center hover:bg-accent transition touch-manipulation active:scale-95"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => t.removeFromCart(idx)}
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
                <span className="font-medium tabular-nums">KES {t.subtotal.toLocaleString()}</span>
              </div>
              {/* Tax is per-item (from treasury via inventory): `tax` is the tax ADDED to the order
                  (tax-exclusive lines); `inclusiveTax` is already baked into the prices/total and is
                  shown only as an informational note so the cashier sees the embedded VAT. */}
              {t.tax > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">VAT</span>
                  <span className="font-medium tabular-nums">KES {t.tax.toLocaleString()}</span>
                </div>
              )}
              {t.inclusiveTax > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>incl. VAT</span>
                  <span className="tabular-nums">KES {t.inclusiveTax.toLocaleString()}</span>
                </div>
              )}
              {t.loyaltyDiscount > 0 && (
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>Loyalty redemption</span>
                  <span className="font-medium tabular-nums">- KES {t.loyaltyDiscount.toLocaleString()}</span>
                </div>
              )}
              {t.happyHourDiscount > 0 && (
                <div className="flex justify-between text-sm text-emerald-600">
                  <span className="flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5" /> Happy Hour{t.happyHour.promoName ? ` (${t.happyHour.promoName})` : ''}
                  </span>
                  <span className="font-medium tabular-nums">- KES {t.happyHourDiscount.toLocaleString()}</span>
                </div>
              )}
              {t.manualDiscount > 0 ? (
                <div className="flex justify-between items-center text-sm text-amber-600">
                  <button onClick={() => t.setDiscountOpen(true)} className="underline underline-offset-2">
                    Discount{t.discountReason ? ` (${t.discountReason})` : ''}
                  </button>
                  <span className="font-medium tabular-nums">- KES {t.manualDiscount.toLocaleString()}</span>
                </div>
              ) : (
                <button onClick={() => t.setDiscountOpen(true)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                  <Tag className="h-3.5 w-3.5" /> Add discount
                </button>
              )}
              {/* Manager quick-edit adjustments (QA req 4): Order Tax(+) and Charges(+) rows with
                  pencil edits for managers/admins; non-managers see values but the server gates
                  edits behind a manager step-up (order.adjustment) anyway. */}
              {(t.orderTax > 0 || canAdjustOrder) && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    Order Tax(+)
                    {canAdjustOrder && (
                      <button onClick={() => t.setOrderTaxOpen(true)} aria-label="Edit order tax"
                        className="text-muted-foreground hover:text-primary">
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                  <span className="font-medium tabular-nums">KES {t.orderTax.toLocaleString()}</span>
                </div>
              )}
              {(t.chargesTotal > 0 || canAdjustOrder) && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    Charges(+)
                    {canAdjustOrder && (
                      <button onClick={() => t.setChargesOpen(true)} aria-label="Edit additional charges"
                        className="text-muted-foreground hover:text-primary">
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                  <span className="font-medium tabular-nums">KES {t.chargesTotal.toLocaleString()}</span>
                </div>
              )}
              {t.roundOff > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Round Off</span>
                  <span className="tabular-nums">KES {t.roundOff.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-border">
                <span className="font-bold text-base">Total</span>
                <span className="font-bold text-base tabular-nums text-primary">KES {t.total.toLocaleString()}</span>
              </div>
            </div>
          )}
          {/* Loyalty capture as a checkout step — shown right above the tender buttons so the cashier
              can ask "do you have a loyalty number?" before taking payment, the way a supermarket till
              does. Available for every use case (the panel self-gates on the loyalty permission); a
              sale with no number entered is an anonymous walk-in and earns nothing. */}
          {cart.length > 0 && !t.isAddToBill && (
            <div className="px-5 pt-2">
              {/* key: remounts after each sale so the customer resets to the Walk-in default */}
              <LoyaltyPanel key={t.customerResetSeq} onStateChange={t.setLoyaltyState} />
            </div>
          )}
          {/* Add-to-bill keeps its single append button; everything else uses the GoDigital-style
              inline payment bar (methods rendered directly on the page, no method-picker modal). */}
          {t.isAddToBill ? (
            <div className="p-5 pt-3">
              <Button
                onClick={t.handlePlaceOrder}
                disabled={cart.length === 0 || t.addOrderLinesPending}
                className={cn(
                  'w-full min-h-14 text-base font-bold rounded-2xl gap-2.5 transition-all',
                  cart.length > 0 ? 'shadow-lg shadow-primary/20 hover:shadow-primary/30' : 'opacity-50 cursor-not-allowed'
                )}
              >
                {t.addOrderLinesPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ChefHat className="h-5 w-5" />}
                {cart.length === 0 ? 'Add items to bill' : 'Add to Bill →'}
              </Button>
            </div>
          ) : (
            <InlinePaymentBar
              total={t.total}
              tenantSlug={t.user?.tenant_slug ?? ''}
              profile={cfg.profile}
              isHospitality={t.isHospitality}
              // COD (Cash on Delivery) is a DELIVERY-only tender — the customer pays the rider on
              // delivery. It must NOT appear for takeaway/dine-in/counter sales (that money is just
              // "Cash" at the till). Gate strictly on the delivery subtype, not the outlet profile.
              allowCOD={t.orderSubtype === 'delivery'}
              customerEmail={t.loyaltyState?.customerEmail || tenant?.contactEmail || undefined}
              hasCustomer={!!t.loyaltyState?.customerPhone}
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
          <div className="p-5 pt-3 space-y-2">
            {/* Add Expense, Park (Draft) and Parked/Suspended Sales now live in the top toolbar +
                inline payment bar — no duplicate retail-style buttons cluttering the cart card. */}
            {t.currentOrderId && t.can('pos.orders.void') && (
              <button
                type="button"
                onClick={() => t.setVoidOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-destructive/40 text-destructive text-sm font-semibold hover:bg-destructive/5 transition-colors"
              >
                <Ban className="h-4 w-4" />
                Void Order #{t.currentOrderNumber}
              </button>
            )}
            {cfg.showCourses && t.currentOrderId && t.currentOrderCourses.length > 0 && (
              <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wide">
                  <ChefHat className="h-3.5 w-3.5" /> Fire Courses
                </div>
                <div className="flex flex-wrap gap-2">
                  {t.currentOrderCourses.map((c) => {
                    const label = COURSES.find((x) => x.value === c)?.label ?? `Course ${c}`;
                    const alreadyFired = c <= t.firedCourses;
                    return (
                      <button
                        key={c}
                        type="button"
                        disabled={alreadyFired || t.firingCourse !== null}
                        onClick={() => t.handleFireCourse(c)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          alreadyFired
                            ? 'bg-muted text-muted-foreground cursor-default'
                            : 'bg-primary/10 text-primary hover:bg-primary/20 active:scale-95'
                        }`}
                      >
                        {t.firingCourse === c ? (
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
    </>
  );
}
