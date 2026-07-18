'use client';

import { useMemo, useState } from 'react';
import { BadgePercent, Loader2, Percent, Plus, Tag, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useCreateDiscount, useDiscounts } from '@/hooks/useDiscounts';
import { useCategories } from '@/hooks/usePOS';
import { useSubscription } from '@/hooks/use-subscription';
import { UpgradeDialog } from '@bengo-hub/shared-ui-lib/subscription';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { Discount, DiscountInput } from '@/lib/api/discounts';
import { DiscountFormModal, describeDiscount, type DiscountItemRef } from './discount-form-modal';

interface ApplyDiscountModalProps {
  open: boolean;
  subtotal: number;
  currentAmount: number;
  currentReason: string;
  onApply: (amount: number, reason: string) => void;
  onClose: () => void;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Item-search adapter for DiscountFormModal hosted inside pos-ui — searches this tenant's
 * POS catalog. Exported so every pos-ui host of the form (Sell → Discounts page, this apply
 * modal) shares ONE adapter instead of re-implementing it.
 */
export async function searchCatalogItemsAdapter(query: string): Promise<DiscountItemRef[]> {
  const { apiClient } = await import('@/lib/api/client');
  const tenantID = useAuthStore.getState().user?.tenant_id ?? '';
  const res = await apiClient.get<{ data: Array<{ sku: string; name: string }> }>(
    `/api/v1/${tenantID}/pos/catalog/items?search=${encodeURIComponent(query)}&limit=25`,
  );
  return ((res as any)?.data ?? []).map((i: any) => ({ sku: i.sku, name: i.name }));
}

/**
 * Category-items adapter for DiscountFormModal's category bulk-add — fetches every item
 * in a catalog category (same endpoint family as searchCatalogItemsAdapter).
 */
export async function fetchCategoryItemsAdapter(category: string): Promise<DiscountItemRef[]> {
  const { apiClient } = await import('@/lib/api/client');
  const tenantID = useAuthStore.getState().user?.tenant_id ?? '';
  const res = await apiClient.get<{ data: Array<{ sku: string; name: string }> }>(
    `/api/v1/${tenantID}/pos/catalog/items?category=${encodeURIComponent(category)}&limit=200`,
  );
  return ((res as any)?.data ?? []).map((i: any) => ({ sku: i.sku, name: i.name }));
}

/**
 * Resolve the KES value a DEFINED discount yields on this sale's subtotal, or null when it
 * can't be expressed as an order-amount discount (BOGO / fixed_price reprice rules — those
 * act per-line via the promo engine, not as a manual amount).
 */
function definedDiscountAmount(d: Discount, subtotal: number): number | null {
  const r = d.rule;
  if (!r) return null;
  if (r.discount_type === 'percentage') {
    let amt = (subtotal * (r.discount_value || 0)) / 100;
    const cap = Number((r as any).max_discount ?? 0);
    if (cap > 0) amt = Math.min(amt, cap);
    return round2(Math.min(amt, subtotal));
  }
  if (r.discount_type === 'fixed_amount') {
    return round2(Math.min(r.discount_value || 0, subtotal));
  }
  return null;
}

/**
 * ApplyDiscountModal — the ONE order-discount entry point (POS terminal cart + back-office
 * Add Sale + any future sale surface). Three ways to discount, per the platform decision:
 *  - PREDEFINED: the tenant's active discount catalog (pos-api Promotion SoT), filtered by
 *    the active outlet's use case — hospitality outlets see their Happy Hour discounts;
 *    retail/pharmacy/services see code/auto standard discounts. Selecting one applies its
 *    computed value with the discount's name as the audited reason.
 *  - NEW STANDARD DISCOUNT: opens the shared DiscountFormModal (the same form the
 *    Sell → Discounts page uses) so a permitted user can define a reusable discount on the
 *    spot, then applies it to this sale.
 *  - QUICK (one-time): a manual percentage or fixed amount + reason for THIS sale only —
 *    nothing is saved to the discount catalog.
 * Whatever the path, an over-limit discount still triggers the manager step-up at order
 * create (order.discount_override — enforced + audited server-side), same as the terminal.
 */
export function ApplyDiscountModal({ open, subtotal, currentAmount, currentReason, onApply, onClose }: ApplyDiscountModalProps) {
  const [mode, setMode] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState<string>(currentAmount ? String(currentAmount) : '');
  const [reason, setReason] = useState(currentReason);
  const [createOpen, setCreateOpen] = useState(false);

  // FULL centralization: every use case sees ALL active discount kinds (code, automatic,
  // time-window) with kind badges — the old hospitality→happy_hour-only / retail→code+auto
  // split hid legitimately applicable discounts. BOGO/fixed_price rows still don't surface
  // here (definedDiscountAmount → null: they apply per-line via the promo engine), and
  // happy-hour kinds still auto-apply only within their time windows.

  // Creating a reusable standard discount is a catalog mutation — gate like the Discounts page.
  const { canAny } = usePermissions();
  const canDefine = canAny(['pos.discounts.add', 'pos.discounts.manage', 'pos.orders.manage']);
  const createMut = useCreateDiscount();

  // Inline-create parity with the Discounts page: category bulk-add + happy_hour sub-plan gate.
  const { data: catalogCategories } = useCategories();
  const categoryNames = useMemo(
    () => (catalogCategories ?? []).map((c: { name?: string }) => c.name ?? '').filter(Boolean),
    [catalogCategories],
  );
  const { hasFeature } = useSubscription();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const { data: discountsResp, isLoading } = useDiscounts('active');
  const defined = useMemo(() => {
    const rows: Discount[] = (discountsResp as any)?.data ?? [];
    return rows
      .map((d) => ({ d, amount: definedDiscountAmount(d, subtotal) }))
      .filter((x): x is { d: Discount; amount: number } => x.amount != null && x.amount > 0);
  }, [discountsResp, subtotal]);

  const [tab, setTab] = useState<'defined' | 'quick'>('defined');
  const activeTab = defined.length > 0 || canDefine ? tab : 'quick';

  if (!open) return null;

  const numeric = parseFloat(value) || 0;
  const amount = mode === 'percent' ? Math.round(subtotal * numeric) / 100 : numeric;
  const pct = subtotal > 0 ? (amount / subtotal) * 100 : 0;

  const applyDefined = (d: Discount, amt: number) =>
    onApply(amt, `${d.name}${d.promo_code ? ` (${d.promo_code})` : ''}`);

  // Create the reusable discount through the SoT, then apply it to this sale immediately.
  async function handleCreate(payload: DiscountInput) {
    try {
      const created = await createMut.mutateAsync(payload);
      setCreateOpen(false);
      toast.success('Discount created');
      const amt = definedDiscountAmount(created as Discount, subtotal);
      if (amt && amt > 0) applyDefined(created as Discount, amt);
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to create discount'));
    }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-[56] w-full max-w-sm mx-4 bg-card border border-border rounded-2xl shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm flex items-center gap-2"><Tag className="h-4 w-4 text-primary" /> Discount</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {(defined.length > 0 || canDefine) && (
          <div className="flex gap-1 bg-accent/10 p-1 rounded-lg">
            <button onClick={() => setTab('defined')}
              className={cn('flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md',
                activeTab === 'defined' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground')}>
              <BadgePercent className="h-3.5 w-3.5" /> Defined
            </button>
            <button onClick={() => setTab('quick')}
              className={cn('flex-1 px-3 py-1.5 text-xs font-semibold rounded-md',
                activeTab === 'quick' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground')}>
              One-time
            </button>
          </div>
        )}

        {activeTab === 'defined' ? (
          <div className="space-y-2">
            {isLoading && <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
            {defined.length > 0 ? (
              <div className="max-h-56 overflow-y-auto divide-y divide-border/60 rounded-xl border border-border">
                {defined.map(({ d, amount: amt }) => (
                  <button
                    key={d.id}
                    onClick={() => applyDefined(d, amt)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-accent/50"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        <span className="truncate">{d.name}</span>
                        <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                          d.promo_kind === 'happy_hour' ? 'bg-purple-500/10 text-purple-600'
                            : d.promo_kind === 'auto' ? 'bg-amber-500/10 text-amber-600'
                              : 'bg-blue-500/10 text-blue-600')}>
                          {d.promo_kind === 'happy_hour' ? 'Time' : d.promo_kind === 'auto' ? 'Auto' : 'Code'}
                        </span>
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {describeDiscount(d)}{d.promo_code ? ` · code ${d.promo_code}` : ''}
                      </span>
                    </span>
                    <span className="text-sm font-bold text-amber-600 tabular-nums shrink-0">− {amt.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            ) : (
              !isLoading && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No defined discounts apply to this sale yet.
                </p>
              )
            )}
            {canDefine && (
              <button
                onClick={() => setCreateOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent/40"
              >
                <Plus className="h-3.5 w-3.5" /> New standard discount
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="flex gap-1 bg-accent/10 p-1 rounded-lg">
              <button onClick={() => setMode('percent')}
                className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md ${mode === 'percent' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}>
                <Percent className="h-3.5 w-3.5" /> Percent
              </button>
              <button onClick={() => setMode('amount')}
                className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-md ${mode === 'amount' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}>
                Amount
              </button>
            </div>

            <input
              type="number" min={0} autoFocus inputMode="decimal"
              value={value} onChange={(e) => setValue(e.target.value)}
              placeholder={mode === 'percent' ? 'e.g. 10 (%)' : 'e.g. 200 (KES)'}
              className="w-full bg-accent/10 border border-border rounded-lg py-2.5 px-3 text-lg font-bold text-center focus:ring-1 focus:ring-primary outline-none"
            />

            <input
              type="text" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (e.g. damaged packaging, staff)"
              className="w-full bg-accent/10 border border-border rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-primary outline-none"
            />

            <div className="text-xs text-muted-foreground text-center">
              Discount: <span className="font-bold text-foreground">KES {amount.toLocaleString()}</span> ({pct.toFixed(1)}% of subtotal)
            </div>
          </>
        )}

        <div className="flex gap-2">
          <button onClick={() => onApply(0, '')} className="flex-1 px-3 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-accent/10">
            Clear
          </button>
          {activeTab === 'quick' && (
            <button onClick={() => onApply(amount, reason)} disabled={amount <= 0}
              className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:bg-primary/90">
              Apply
            </button>
          )}
        </div>
      </div>

      {/* Define a reusable standard discount without leaving the sale — same shared form the
          Sell → Discounts page hosts, then the new discount is applied to this sale. */}
      {createOpen && (
        <DiscountFormModal
          open={createOpen}
          initial={null}
          saving={createMut.isPending}
          onClose={() => setCreateOpen(false)}
          onSubmit={handleCreate}
          searchItems={searchCatalogItemsAdapter}
          fetchCategoryItems={fetchCategoryItemsAdapter}
          categories={categoryNames}
          happyHourLocked={!hasFeature('happy_hour')}
          onLockedKindClick={() => setUpgradeOpen(true)}
        />
      )}
      <UpgradeDialog feature="happy_hour" open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}
