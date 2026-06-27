'use client';

/**
 * FaceliftOrderBill — the RIGHT "New Order Bill" panel of the hospitality/QSR facelift.
 *
 * Behaviour-preserving: every line, total and tender comes straight from useTerminal() +
 * <InlinePaymentBar> exactly as the shared TerminalShell wires them. Only the presentation matches
 * the reference restaurant-POS bill panel (thumbnail line items, qty steppers, Sub Total / Tax /
 * Total, payment-method cards, prominent Place Order). All colours are semantic/brand tokens.
 */

import { useTerminal } from '@/components/pos/terminal/terminal-context';
import { InlinePaymentBar } from '@/components/pos/terminal/inline-payment-bar';
import { CourseSelector } from '@/components/pos/course-selector';
import { cn } from '@/lib/utils';
import { Ban, ChefHat, Image as ImageIcon, Loader2, Minus, Plus, Receipt, Trash2 } from 'lucide-react';

export function FaceliftOrderBill() {
  const t = useTerminal();
  const { cfg, cart } = t;
  const today = new Date().toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="flex flex-col h-full min-h-0 bg-card">
      {/* Header — "New Order Bill" + date */}
      <div className="shrink-0 px-4 py-3.5 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="h-9 w-9 rounded-xl bg-primary/12 text-primary flex items-center justify-center">
            <Receipt className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold leading-tight">
              {t.isAddToBill ? 'Adding to Bill' : 'New Order Bill'}
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight">{today}</p>
          </div>
          {cart.length > 0 && (
            <button onClick={t.clearCart} className="ml-auto text-[11px] text-destructive font-semibold hover:underline">
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Line items */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-2 space-y-1.5">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground py-12">
            <Receipt className="h-10 w-10 opacity-20" />
            <p className="text-sm font-medium">No items yet</p>
            <p className="text-xs text-center px-6">Pick products from the menu to start the bill.</p>
          </div>
        ) : (
          cart.map((item, idx) => {
            const lineTotal = (item.price + (item.modifierTotal ?? 0)) * item.quantity;
            return (
              <div key={`${item.id}-${idx}`} className="flex gap-2.5 rounded-2xl border border-border bg-background/60 p-2.5">
                {/* Thumbnail */}
                <div className="h-12 w-12 shrink-0 rounded-xl bg-muted overflow-hidden flex items-center justify-center">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-muted-foreground/30" />
                  )}
                </div>
                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold leading-tight truncate">{item.name}</p>
                    <button
                      onClick={() => t.removeFromCart(idx)}
                      className="h-6 w-6 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {item.selectedModifiers && Object.values(item.selectedModifiers).flat().length > 0 && (
                    <p className="text-[10px] text-primary truncate">{Object.values(item.selectedModifiers).flat().join(', ')}</p>
                  )}
                  {cfg.showCourses && (
                    <div className="mt-1">
                      <CourseSelector value={item.courseNumber ?? 0} onChange={(c) => t.updateCourse(idx, c)} compact />
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-1.5">
                    {/* Qty stepper */}
                    <div className="flex items-center gap-1">
                      <button onClick={() => t.updateQuantity(idx, -1)} className="h-6 w-6 rounded-lg border border-border flex items-center justify-center hover:bg-accent"><Minus className="h-3 w-3" /></button>
                      <span className="w-7 text-center text-sm font-bold tabular-nums">{item.quantity}</span>
                      <button onClick={() => t.updateQuantity(idx, 1)} className="h-6 w-6 rounded-lg border border-border flex items-center justify-center hover:bg-accent"><Plus className="h-3 w-3" /></button>
                    </div>
                    <span className="text-sm font-extrabold font-mono tabular-nums">KES {lineTotal.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Totals */}
      <div className="shrink-0 border-t border-border px-4 py-3 space-y-1.5 bg-card">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Sub Total</span>
          <span className="font-semibold tabular-nums">KES {t.subtotal.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Tax {t.inclusiveTax > 0 ? '(VAT inclusive)' : ''}
          </span>
          <span className="font-semibold tabular-nums">KES {(t.inclusiveTax > 0 ? t.inclusiveTax : t.tax).toLocaleString()}</span>
        </div>
        {t.loyaltyDiscount > 0 && (
          <div className="flex items-center justify-between text-sm text-emerald-600">
            <span>Discount</span>
            <span className="font-semibold tabular-nums">- KES {t.loyaltyDiscount.toLocaleString()}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-1.5 border-t border-dashed border-border">
          <span className="text-sm font-bold uppercase tracking-wide">Total</span>
          <span className="text-xl font-extrabold tabular-nums text-primary">KES {t.total.toLocaleString()}</span>
        </div>

        {/* Void + fire-courses (hospitality) — preserved from the shared shell */}
        {t.currentOrderId && t.can('pos.orders.void') && (
          <button onClick={() => t.setVoidOpen(true)} className="w-full mt-1 flex items-center justify-center gap-2 py-1.5 rounded-xl border border-destructive/40 text-destructive text-xs font-semibold hover:bg-destructive/5">
            <Ban className="h-3.5 w-3.5" /> Void Order #{t.currentOrderNumber}
          </button>
        )}
        {cfg.showCourses && t.currentOrderId && t.currentOrderCourses.length > 0 && (
          <FireCourses />
        )}
      </div>

      {/* Payment methods + Place Order (reuses the shared InlinePaymentBar panel layout, so every
          tender flow — Cash / Card / M-Pesa / Wallet / Room / Credit / Split / COD / Send-to-Kitchen
          — is identical to the existing terminal). */}
      <div className="shrink-0">
        {t.isAddToBill ? (
          <div className="p-3 border-t border-border">
            <button
              onClick={t.handlePlaceOrder}
              disabled={cart.length === 0 || t.addOrderLinesPending}
              className="w-full min-h-12 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {t.addOrderLinesPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ChefHat className="h-5 w-5" />}
              Add to Bill
            </button>
          </div>
        ) : (
          <InlinePaymentBar
            layout="panel"
            total={t.total}
            tenantSlug={t.user?.tenant_slug ?? ''}
            profile={cfg.profile}
            isHospitality={t.isHospitality}
            allowCOD={cfg.profile === 'retail' || cfg.profile === 'quick_service'}
            customerEmail={(t.loyaltyState as { customerEmail?: string } | null)?.customerEmail}
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
    </div>
  );
}

/** Fire-courses control (hospitality) — lifted from the shared shell, unchanged behaviour. */
function FireCourses() {
  const t = useTerminal();
  // Lazy import of COURSES label map kept inline to avoid a second import in the bill header.
  const labelFor = (c: number) => ['No course', 'Starter', 'Main', 'Dessert', 'Bar'][c] ?? `Course ${c}`;
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {t.currentOrderCourses.map((c) => {
        const fired = c <= t.firedCourses;
        return (
          <button
            key={c}
            disabled={fired || t.firingCourse !== null}
            onClick={() => t.handleFireCourse(c)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold',
              fired ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary hover:bg-primary/20',
            )}
          >
            {t.firingCourse === c ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : fired ? (
              <span className="h-2.5 w-2.5 rounded-full bg-green-500 inline-block" />
            ) : (
              <ChefHat className="h-3 w-3" />
            )}
            {labelFor(c)}
          </button>
        );
      })}
    </div>
  );
}
