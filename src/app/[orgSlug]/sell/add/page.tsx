'use client';

/**
 * Add Sale — back-office full sale entry (distinct from the fast POS terminal at /order).
 * A store manager records a wholesaler/credit/delivery sale here with full line control, customer,
 * order discount, tax and payment, while front-store cashiers keep ringing up at the terminal.
 * Reuses the existing order + catalog + client hooks and SplitPaymentModal — no new sale logic.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Check, Loader2, Minus, Plus, Search, ShoppingCart, Trash2, User, Users, X } from 'lucide-react';
import { useMenuItems, useCreateOrder, useCreatePaymentIntent, usePricingTiers, useOrder, useVoidOrder, useEditOrderLine, type CatalogItem } from '@/hooks/usePOS';
import { Tag } from 'lucide-react';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { SplitPaymentModal } from '@/components/pos/split-payment-modal';
import { CostHeaderToggle, MaskedCost } from '@/components/pos/cost-price';
import { CustomerSearch, WALK_IN_CUSTOMER, type SelectedCustomer } from '@/components/pos/customer-search';
import { useAuthStore } from '@/store/auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useStaffAdmin } from '@/hooks/useStaff';
import { FeatureLock, useFeatureUpgrade } from '@bengo-hub/shared-ui-lib/subscription';
import { apiClient } from '@/lib/api/client';
import { applyRoundOff, computeCartTax } from '@/lib/pos/cart-tax';
import { CustomerCreditHint } from '@/components/pos/clients/credit-terms';
import { CreditSaleDetailsModal, type CreditSaleDetails } from '@/components/pos/credit-sale-details-modal';
import { Button } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';

// Premium: staff credit funded from salary (ERP payroll deduction). Shown + upgrade-gated below top tier.
const STAFF_CREDIT_FEATURE = 'staff_fund_from_salary';

interface SaleLine {
  item: CatalogItem;
  quantity: number;
  unitPrice: number;
  /** True once the user manually edited this line's price — switching profile won't overwrite it. */
  priceEdited?: boolean;
  /** Persisted order-line id when this sale was resumed from All Sales / Drafts — enables
   *  the per-line ✓ save (PATCH the line directly, no Save & Pay round-trip). */
  lineId?: string;
  /** The line's values as last persisted on the server; a mismatch with unitPrice/quantity
   *  marks the line dirty and surfaces the per-line ✓ save / ✕ revert actions. */
  savedPrice?: number;
  savedQty?: number;
}

// Resolve an item's price for the selected pricing profile (tier). Falls back to the item's default
// price when the profile has no own price — mirrors the POS terminal's tier resolution.
function tierPrice(item: any, profile: string): number {
  const prices = item?.prices && typeof item.prices === 'object' ? (item.prices as Record<string, number>) : undefined;
  if (profile && prices && (prices[profile] ?? 0) > 0) return prices[profile];
  return item?.price ?? 0;
}

const fmt = (n: number) => `KES ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function AddSalePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const outlet = useAuthStore((s) => s.outlet);
  const outletId = outlet?.id ?? '';
  const tenantId = useAuthStore((s) => s.user?.tenant_id ?? '');
  const { data: posSettings } = usePOSSettings();
  // Legacy-fallback VAT for lines with NO inventory/treasury tax info. Mirrors pos-api's
  // outletFallbackTaxRate exactly: VAT disabled in POS settings → 0 (the server charges nothing,
  // so the preview must not show VAT either); otherwise the configured rate. Items that DO carry
  // treasury tax info (tax_rate/tax_inclusive) always use their own per-line values instead.
  const taxRate = (posSettings?.vat_enabled === false ? 0 : (posSettings?.vat_rate ?? 16)) / 100;

  // ── Customer ── (rich phone search; defaults to the seeded Walk-in Customer)
  const [customer, setCustomer] = useState<SelectedCustomer | null>(WALK_IN_CUSTOMER);
  const realCustomer = !!(customer && !customer.isWalkIn && customer.phone);

  // ── Bill-to party (credit sales): existing customer OR a staff member. Staff credit can be
  // funded from salary (premium) — pos-api routes it to an ERP payroll deduction instead of AR.
  const [partyType, setPartyType] = useState<'customer' | 'staff'>('customer');
  const [staffId, setStaffId] = useState('');
  const [fundFromSalary, setFundFromSalary] = useState(false);
  const [months, setMonths] = useState(1);
  const { data: staffResp } = useStaffAdmin(tenantId);
  const staff: any[] = Array.isArray(staffResp) ? staffResp : ((staffResp as any)?.data ?? []);
  const selectedStaff = staff.find((s: any) => s.id === staffId);
  const staffCredit = useFeatureUpgrade(STAFF_CREDIT_FEATURE);

  const staffParty = partyType === 'staff';
  const custPhone = !staffParty && customer && !customer.isWalkIn ? customer.phone : '';
  const custName = staffParty ? (selectedStaff?.name ?? '') : (customer?.name ?? '');

  // ── Pricing profile (tier) — Retail / Wholesale / custom. Switching re-prices the sale so a
  // back-office user can bill at the right profile (e.g. a wholesale order). Same tiers as the terminal.
  const { data: tiersResp } = usePricingTiers();
  const pricingTiers = tiersResp?.data ?? [];
  const [pricingProfile, setPricingProfile] = useState<string>('');

  // ── Line items ──
  const [search, setSearch] = useState('');
  const { data: catalog, isFetching } = useMenuItems({ search: search || undefined, limit: 25 });
  const results: CatalogItem[] = catalog?.data ?? [];
  const [lines, setLines] = useState<SaleLine[]>([]);

  // Authoritative tier price from inventory-api (same endpoint the POS terminal uses). Returns the
  // resolved unit price for a profile, or null to fall back to the local/default price.
  const resolvePrice = useCallback(async (itemId: string, quantity: number, profile: string): Promise<number | null> => {
    if (!profile || !tenantId) return null; // '' = Default Price → use the item's default price
    try {
      const res = await apiClient.get<{ unit_price?: number }>(
        `/api/v1/${tenantId}/pos/catalog/pricing/resolve?item_id=${encodeURIComponent(itemId)}&quantity=${quantity}&profile=${encodeURIComponent(profile)}`,
      );
      return res && typeof res.unit_price === 'number' && res.unit_price > 0 ? res.unit_price : null;
    } catch {
      return null;
    }
  }, [tenantId]);

  // Switch profile → re-price every line that wasn't manually overridden. Optimistically use any
  // local tier price, then confirm each from inventory-api's resolve endpoint (quantity-break aware).
  const changeProfile = useCallback((profile: string) => {
    setPricingProfile(profile);
    setLines((prev) => prev.map((l) => (l.priceEdited ? l : { ...l, unitPrice: tierPrice(l.item, profile) })));
    setLines((prev) => {
      prev.forEach((l) => {
        if (l.priceEdited) return;
        resolvePrice(l.item.id, l.quantity, profile).then((p) => {
          if (p != null) setLines((cur) => cur.map((x) => (x.item.id === l.item.id && !x.priceEdited ? { ...x, unitPrice: p } : x)));
        });
      });
      return prev;
    });
  }, [resolvePrice]);

  // ── Order-level ──
  const [discount, setDiscount] = useState(0);
  // Credit Sale entry point (sidebar /sell/add?credit=1) pre-selects on-account. When checked, Save
  // posts the total straight to the customer's AR (on_account tender) and completes the order with no
  // payment collected now — treasury enforces the credit limit. No payment modal.
  const [creditSale, setCreditSale] = useState(searchParams.get('credit') === '1');
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [notes, setNotes] = useState('');
  // Credit Sale is available to CASHIERS too (product decision 2026-07-07 — terms captured via
  // the shared CreditSaleDetailsModal; treasury enforces the credit limit). Quotations remain a
  // manager/back-office action (same permission that approves sale returns).
  const { can, canAny } = usePermissions();
  const canPrivileged = can('pos.orders.manage');
  // REQ-006: cost price + margin visibility for management roles at the point of sale.
  // Values render MASKED by default (customers can see the screen); the header eye toggle
  // reveals/hides the whole column. Same gate as pos-api's cost serialization
  // (pos.catalog.view_cost OR pos.orders.manage) so the column never renders empty.
  const canViewCost = canAny(['pos.catalog.view_cost', 'pos.orders.manage']);
  const [costRevealed, setCostRevealed] = useState(false);
  const [quotationSaving, setQuotationSaving] = useState(false);

  const createOrder = useCreateOrder();
  const createIntent = useCreatePaymentIntent();
  const voidOrder = useVoidOrder();
  const [payOrder, setPayOrder] = useState<{ id: string; number: string; total: number } | null>(null);

  // ── Resume / edit an existing draft (REQ-003) ── ?order_id= comes from the Drafts page
  // "Resume Sale" action and the All-Sales "Edit" action. The draft's lines, customer and
  // discount are prefilled; completing it settles the SAME order (no duplicate) unless the
  // cart was modified, in which case a replacement order is created and the stale draft is
  // voided as superseded.
  const resumeId = searchParams.get('order_id') || searchParams.get('draft_id') || '';
  const resumeQ = useOrder(resumeId);
  const [resume, setResume] = useState<{ id: string; number: string; total?: number } | null>(null);
  // Structural changes (lines added/removed) force the replacement-order path on save;
  // price/qty edits on persisted lines are tracked per line (savedPrice/savedQty) so a
  // per-line ✓ save can clear them without touching the rest of the sale.
  const [structuralDirty, setStructuralDirty] = useState(false);
  useEffect(() => {
    const o: any = resumeQ.data;
    if (!o || !resumeId || resume?.id === o.id) return;
    if (o.status !== 'draft' && o.status !== 'open' && o.status !== 'pending_payment') {
      toast.error(`${o.order_number} is ${o.status} — it can no longer be resumed.`);
      return;
    }
    // Carry the SERVER total: the client preview re-derives tax from the fallback VAT rate
    // (resumed lines carry no tax info), which can differ from what the order actually
    // stores — settling an unmodified resume must charge the stored total, not the preview.
    setResume({ id: o.id, number: o.order_number, total: Number(o.total_amount) || undefined });
    setLines((o.edges?.lines ?? []).map((l: any) => ({
      item: { id: l.catalog_item_id, sku: l.sku, name: l.name, price: l.unit_price, category: '' } as CatalogItem,
      quantity: l.quantity,
      unitPrice: l.unit_price,
      priceEdited: true, // keep the draft's prices — don't let profile switching overwrite them
      lineId: l.id,
      savedPrice: l.unit_price,
      savedQty: l.quantity,
    })));
    setDiscount(Number(o.discount_total) || 0);
    if (o.customer_name || o.customer_phone) {
      setCustomer({ name: o.customer_name ?? '', phone: o.customer_phone ?? '', isWalkIn: !o.customer_phone } as SelectedCustomer);
    }
    setStructuralDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeQ.data, resumeId]);

  const addLine = useCallback((item: CatalogItem) => {
    let newQty = 1;
    setStructuralDirty(true);
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.item.id === item.id);
      if (idx >= 0) {
        newQty = prev[idx].quantity + 1;
        return prev.map((l, i) => (i === idx ? { ...l, quantity: newQty } : l));
      }
      // Non-billable items (free accompaniments / supplies) are never charged — force 0
      // regardless of tier pricing (the server zeroes the line as a belt anyway).
      const free = item.non_billable === true || item.is_complimentary === true;
      return [...prev, { item, quantity: 1, unitPrice: free ? 0 : tierPrice(item, pricingProfile) }];
    });
    // Confirm the profile price from inventory-api (mirrors the terminal). Skips if the user already
    // hand-edited this line's price.
    if (pricingProfile && !(item.non_billable === true || item.is_complimentary === true)) {
      resolvePrice(item.id, newQty, pricingProfile).then((p) => {
        if (p != null) setLines((cur) => cur.map((l) => (l.item.id === item.id && !l.priceEdited ? { ...l, unitPrice: p } : l)));
      });
    }
  }, [pricingProfile, resolvePrice]);
  const setQty = (i: number, q: number) => {
    if (q <= 0) {
      // Removing a line is structural — it can only persist via the replacement-order path.
      setStructuralDirty(true);
      return setLines((p) => p.filter((_, x) => x !== i));
    }
    return setLines((p) => p.map((l, x) => (x === i ? { ...l, quantity: q } : l)));
  };
  const setPrice = (i: number, v: number) => {
    setLines((p) => p.map((l, x) => (x === i ? { ...l, unitPrice: Math.max(0, v), priceEdited: true } : l)));
  };

  // A resumed line whose price/qty differs from what the server holds. These can be saved
  // one at a time (✓) via the audited line-edit endpoint — no Save & Pay required.
  const lineDirty = (l: SaleLine) => !!l.lineId && (l.unitPrice !== l.savedPrice || l.quantity !== l.savedQty);
  // Anything the per-line save can't express (adds/removes/non-persisted lines) keeps the
  // legacy behavior: Save & Pay creates a replacement order and voids the stale draft.
  const linesDirty = structuralDirty || lines.some((l) => (resume ? !l.lineId : false) || lineDirty(l));

  const editLine = useEditOrderLine();
  const [savingLineIdx, setSavingLineIdx] = useState<number | null>(null);
  const revertLine = (i: number) =>
    setLines((p) => p.map((l, x) => (x === i && l.lineId ? { ...l, unitPrice: l.savedPrice ?? l.unitPrice, quantity: l.savedQty ?? l.quantity } : l)));
  const confirmSaveLine = (i: number, reason: string, updateCatalog: boolean) => {
    const l = lines[i];
    if (!resume || !l?.lineId) return;
    editLine.mutate(
      {
        orderId: resume.id,
        lineId: l.lineId,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
        reason,
        updateCatalogPrice: updateCatalog && l.unitPrice !== l.savedPrice,
      },
      {
        onSuccess: (d: any) => {
          const newTotal = Number(d?.order?.total_amount);
          setResume((r) => (r ? { ...r, total: Number.isFinite(newTotal) && newTotal > 0 ? newTotal : r.total } : r));
          setLines((p) => p.map((x, j) => (j === i ? { ...x, savedPrice: x.unitPrice, savedQty: x.quantity } : x)));
          setSavingLineIdx(null);
          toast.success(d?.catalog_price_updated ? `${l.item.name} saved · inventory price updated` : `${l.item.name} saved to ${resume.number}`);
        },
        onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to save the line change.')),
      },
    );
  };

  // Per-line inclusive-aware tax + a single order-level ceiling round-off — the SAME model the
  // POS terminal and pos-api use (see src/lib/pos/cart-tax.ts), so this preview equals the
  // server's stored totals instead of stacking a flat VAT over the whole (discounted) cart.
  const { subtotal, tax } = useMemo(() => {
    const r = computeCartTax(
      lines.map((l) => ({
        gross: l.unitPrice * l.quantity,
        taxRate: typeof l.item.tax_rate === 'number' ? l.item.tax_rate : undefined,
        taxInclusive: l.item.tax_inclusive ?? undefined,
      })),
      taxRate * 100,
    );
    return { subtotal: r.subtotal, tax: r.tax };
  }, [lines, taxRate]);
  const { roundOff, total } = applyRoundOff(subtotal + tax - discount);

  function buildPayload() {
    return {
      outletId,
      // Tag sales entered here as back-office so the All-Sales "Sources" filter and the
      // separate POS-only list can distinguish them from POS-terminal sales.
      source: 'back_office' as const,
      // Always 'retail' — "draft" is an order STATUS, not a subtype (retail orders start in
      // draft status until paid). Sending order_subtype:'draft' used to 500 (DEF-001); the
      // backend now normalizes it, but send the correct value in the first place.
      orderSubtype: 'retail' as const,
      discountAmount: discount || undefined,
      customerPhone: custPhone || undefined,
      customerName: custName || undefined,
      metadata: (() => {
        const md: Record<string, any> = {};
        if (pricingProfile) md.pricing_profile = pricingProfile;
        if (creditSale && staffParty && staffId) {
          md.party_type = 'staff';
          md.staff_member_id = staffId;
          // Fund-from-salary only when entitled (the toggle is upgrade-locked otherwise);
          // pos-api reads these keys in recordCreditSale to route the debt to ERP payroll.
          if (fundFromSalary && !staffCredit.locked) {
            md.fund_from_salary = true;
            md.installment_months = Math.max(1, months);
          }
        }
        return Object.keys(md).length > 0 ? md : undefined;
      })(),
      lines: lines.map((l) => {
        const free = l.item.non_billable === true || l.item.is_complimentary === true;
        const lineMeta: Record<string, any> = {};
        if (notes) lineMeta.notes = notes;
        // Free-of-charge marker — the server zeroes the line on this flag (belt & braces).
        if (free) lineMeta.non_billable = true;
        return {
          catalog_item_id: l.item.id,
          sku: l.item.sku,
          name: l.item.name,
          category: l.item.category,
          quantity: l.quantity,
          unit_price: free ? 0 : l.unitPrice,
          total_price: free ? 0 : l.unitPrice * l.quantity,
          metadata: Object.keys(lineMeta).length > 0 ? lineMeta : undefined,
          // Tax as priced in the catalog — keeps the server payable equal to what is charged here.
          ...(l.item.tax_code_id ? { tax_code_id: l.item.tax_code_id } : {}),
          ...(l.item.tax_inclusive != null ? { price_includes_tax: l.item.tax_inclusive } : {}),
          ...(typeof l.item.tax_rate === 'number' ? { tax_rate: l.item.tax_rate } : {}),
        };
      }),
    };
  }

  function save(mode: 'pay' | 'draft', creditDetails?: CreditSaleDetails) {
    if (lines.length === 0) return;
    if (creditSale && staffParty && !staffId) {
      toast.error('Please select a staff member.');
      return;
    }
    if (creditSale && !staffParty && !realCustomer) {
      toast.error('A customer is required for a credit sale.');
      return;
    }
    // Credit sales (available to cashiers too — treasury enforces the credit limit) capture
    // their terms first: due date (default +30 days) + notes via the shared modal, then this
    // function is re-entered with the details.
    if (creditSale && mode === 'pay' && !creditDetails) {
      setCreditModalOpen(true);
      return;
    }
    const creditExtras = creditDetails
      ? { paymentDueDate: creditDetails.dueDate, creditNotes: creditDetails.notes || undefined }
      : {};
    // Resuming an UNMODIFIED draft → settle the SAME order (REQ-003: the draft is
    // reclassified to completed by the payment, never duplicated). Charge the SERVER's
    // stored total — the client preview re-derives tax from the fallback VAT rate and can
    // overshoot an order that stored no/inclusive tax (a real over-collection source).
    if (resume && !linesDirty) {
      const settleTotal = resume.total ?? total;
      if (mode === 'draft') { toast.info('Draft unchanged.'); return; }
      if (creditSale) {
        createIntent.mutate(
          { orderId: resume.id, tenderMethod: 'on_account', amount: settleTotal, ...creditExtras },
          {
            onSuccess: () => { setCreditModalOpen(false); toast.success(`Sale posted on account · ${fmt(settleTotal)}`); reset(); },
            onError: async (e) => { setCreditModalOpen(false); toast.error(await apiErrorMessage(e, 'Failed to post credit sale to AR.')); },
          },
        );
      } else {
        setPayOrder({ id: resume.id, number: resume.number, total: settleTotal });
      }
      return;
    }

    createOrder.mutate(buildPayload(), {
      onSuccess: (o: any) => {
        const id = o.id || o.order_id || '';
        // A MODIFIED resumed draft becomes a fresh order; the stale draft is voided as
        // superseded (best-effort — if the void needs manager approval it stays visible).
        if (resume && id && id !== resume.id) {
          voidOrder.mutate(
            { orderId: resume.id, reason: `Superseded by resumed sale ${o.order_number || id}` },
            { onError: () => toast.warning(`Could not void the original draft ${resume.number} — remove it manually.`) },
          );
        }
        if (mode === 'draft') {
          toast.success('Saved as draft');
          reset();
        } else if (creditSale) {
          // A credit sale is settled "on account": post the full total to the customer's AR and
          // complete the order WITHOUT collecting payment now (treasury enforces the credit limit).
          // No payment modal — that's the whole point of a credit sale.
          const arAmount = Number(o.total_amount) || total;
          createIntent.mutate(
            { orderId: id, tenderMethod: 'on_account', amount: arAmount, ...creditExtras },
            {
              onSuccess: () => { setCreditModalOpen(false); toast.success(`Sale posted on account · ${fmt(arAmount)}`); reset(); },
              onError: async (e) => { setCreditModalOpen(false); toast.error(await apiErrorMessage(e, 'Failed to post credit sale to AR.')); },
            },
          );
        } else {
          setPayOrder({ id, number: o.order_number || id, total });
        }
      },
      onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to create sale. Please try again.')),
    });
  }
  function reset() {
    setLines([]); setDiscount(0); setNotes(''); setCustomer(WALK_IN_CUSTOMER); setCreditSale(false);
    setPartyType('customer'); setStaffId(''); setFundFromSalary(false); setMonths(1);
    setStructuralDirty(false); setSavingLineIdx(null);
    if (resume) {
      setResume(null);
      // Drop ?order_id= so the resume effect can't re-prefill the finished draft.
      router.replace(`/${orgSlug}/sell/add`);
    }
  }

  // Save as Quotation: forward the cart to treasury via the pos-api proxy (treasury owns quotations;
  // pos persists nothing). pos-ui → pos-api → treasury S2S.
  async function saveQuotation() {
    if (lines.length === 0) return;
    // Quotations need a REAL customer (QA req 3) — phone is the CRM key that attributes the
    // quotation to the right customer in treasury. Server rejects walk-in too.
    if (!realCustomer) {
      toast.error('Select or add a customer (with phone) to save a quotation — walk-in is not allowed.');
      return;
    }
    setQuotationSaving(true);
    try {
      await apiClient.post(`/api/v1/${tenantId}/pos/quotations`, {
        customer_name: custName || undefined,
        customer_phone: custPhone || undefined,
        customer_email: customer?.email || undefined,
        notes: notes || undefined,
        lines: lines.map((l) => ({ name: l.item.name, sku: l.item.sku, quantity: l.quantity, unit_price: l.unitPrice })),
      });
      toast.success('Quotation saved to Treasury');
      reset();
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to save quotation'));
    } finally {
      setQuotationSaving(false);
    }
  }

  if (payOrder) {
    return (
      <SplitPaymentModal
        open
        onClose={() => { setPayOrder(null); reset(); }}
        onPaymentConfirmed={() => { setPayOrder(null); reset(); toast.success('Sale completed'); }}
        orderId={payOrder.id}
        orderNumber={payOrder.number}
        total={payOrder.total}
        tenantSlug={orgSlug}
      />
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <ShoppingCart className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">
          {resume ? `Resume Sale — ${resume.number}` : creditSale ? 'Credit Sale' : 'Add Sale'}
        </h1>
        <span className="text-sm text-muted-foreground">
          {resume ? 'Draft prefilled — collect payment to complete it' : creditSale ? 'Sell on account — posts to customer AR' : 'Back-office sale entry'}
        </span>
      </div>

      {/* Customer — rich phone search; defaults to Walk-in (credit sales require a real customer).
          Credit sales can instead be billed to a STAFF member, optionally funded from salary
          (premium — shown + upgrade-gated, never hidden). */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        {creditSale && (
          <div className="grid grid-cols-2 gap-2">
            {([['customer', 'Customer', User], ['staff', 'Staff', Users]] as const).map(([val, label, Icon]) => (
              <button
                key={val}
                type="button"
                onClick={() => { setPartyType(val); if (val === 'customer') { setStaffId(''); setFundFromSalary(false); } }}
                className={cn(
                  'flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold border transition-colors',
                  partyType === val ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        )}

        {creditSale && staffParty ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Staff Member <span className="text-destructive">*</span>
              </label>
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">— Select staff —</option>
                {staff.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}{s.role ? ` · ${s.role}` : ''}</option>
                ))}
              </select>
            </div>
            {/* Fund from salary (premium — visible + upgrade-gated, never hidden) */}
            <FeatureLock feature={STAFF_CREDIT_FEATURE} mode="overlay">
              <div className="rounded-xl border border-border bg-accent/20 p-3 space-y-3">
                <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fundFromSalary}
                    onChange={(e) => setFundFromSalary(e.target.checked)}
                    className="rounded"
                  />
                  Fund from salary (recover via payroll deductions)
                </label>
                {fundFromSalary && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Spread over (payroll periods)</label>
                    <input
                      type="number"
                      min={1}
                      max={36}
                      value={months}
                      onChange={(e) => setMonths(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-28 bg-background border border-border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                )}
              </div>
            </FeatureLock>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Customer</label>
            <CustomerSearch value={customer} onChange={setCustomer} requireRealCustomer={creditSale} />
            {creditSale && realCustomer && <CustomerCreditHint accountId={customer?.accountId} saleTotal={total} />}
          </div>
        )}

        {/* Pricing profile (tier) — switch to bill this sale at Retail / Wholesale / a custom profile. */}
        {pricingTiers.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" /> Pricing profile
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => changeProfile('')}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${pricingProfile === '' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:bg-accent'}`}
              >
                Default Price
              </button>
              {pricingTiers.map((tier) => (
                <button
                  key={tier.code}
                  type="button"
                  onClick={() => changeProfile(tier.code)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${pricingProfile === tier.code ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:bg-accent'}`}
                >
                  {tier.name}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Switching re-prices lines you haven&apos;t manually edited.</p>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Item search + lines */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product name / SKU to add…"
              className="w-full bg-card border border-border rounded-xl py-3 pl-11 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            {isFetching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          {search && (
            <div className="bg-card border border-border rounded-xl divide-y divide-border max-h-56 overflow-y-auto">
              {results.length === 0 ? <div className="p-4 text-center text-sm text-muted-foreground">No products</div> :
                results.map((it) => (
                  <button key={it.id} type="button" onClick={() => { addLine(it); }}
                    className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-accent transition-colors">
                    <Plus className="h-4 w-4 text-primary" />
                    <span className="flex-1 text-sm font-medium truncate">{it.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{it.sku}</span>
                    <span className="text-sm font-bold text-primary">{fmt(tierPrice(it, pricingProfile))}</span>
                  </button>
                ))}
            </div>
          )}

          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/30 text-muted-foreground">
                <th className="text-left px-4 py-2.5 font-medium">Product</th>
                <th className="text-center px-2 py-2.5 font-medium">Qty</th>
                {canViewCost && (
                  <th className="text-right px-3 py-2.5 font-medium">
                    <CostHeaderToggle revealed={costRevealed} onToggle={() => setCostRevealed((v) => !v)} label="Cost price" className="normal-case" />
                  </th>
                )}
                <th className="text-right px-3 py-2.5 font-medium">Unit price</th>
                <th className="text-right px-4 py-2.5 font-medium">Total</th>
                <th></th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {lines.length === 0 && <tr><td colSpan={canViewCost ? 6 : 5} className="px-4 py-8 text-center text-muted-foreground">Search and add products to the sale</td></tr>}
                {lines.map((l, i) => {
                  // REQ-001: projected on-hand stock if this sale/quotation is completed —
                  // client-side preview only; nothing is deducted until the sale finalizes.
                  const stockQty = (l.item as any).stock_quantity;
                  const projected = typeof stockQty === 'number' ? stockQty - l.quantity : null;
                  // REQ-006: supplier cost + margin — only serialized by pos-api to
                  // pos.catalog.view_cost holders, so it's simply absent for cashiers.
                  const cost = Number((l.item as any).cost_price ?? 0);
                  return (
                    <tr key={l.item.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium">{l.item.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{l.item.sku}</div>
                        {projected != null && (
                          <div className={`text-[11px] mt-0.5 ${projected < 0 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                            Stock after sale: {projected}{projected < 0 ? ' — exceeds on-hand stock' : ''}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setQty(i, l.quantity - 1)} className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-accent"><Minus className="h-3 w-3" /></button>
                          <input value={l.quantity} onChange={(e) => setQty(i, parseInt(e.target.value) || 0)} className="w-10 text-center bg-background border border-border rounded py-1 text-sm" />
                          <button onClick={() => setQty(i, l.quantity + 1)} className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-accent"><Plus className="h-3 w-3" /></button>
                        </div>
                      </td>
                      {canViewCost && (
                        <td className="px-3 py-3 text-right text-xs">
                          <MaskedCost cost={cost} sell={l.unitPrice} revealed={costRevealed} />
                        </td>
                      )}
                      <td className="px-3 py-3 text-right">
                        <input value={l.unitPrice} onChange={(e) => setPrice(i, parseFloat(e.target.value) || 0)} className="w-24 text-right bg-background border border-border rounded py-1 px-2 text-sm tabular-nums" />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmt(l.unitPrice * l.quantity)}</td>
                      <td className="px-2 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {/* Per-line ✓ save / ✕ revert — resumed lines only, once price/qty diverge
                              from the server. ✓ PATCHes just this line (audited, recomputes order
                              totals) so the correction lands without Save & Pay. */}
                          {resume && canPrivileged && lineDirty(l) && (
                            <>
                              <button
                                onClick={() => setSavingLineIdx(i)}
                                title="Save this line's change to the order now (no payment needed)"
                                className="h-6 w-6 rounded-md flex items-center justify-center bg-green-600/10 text-green-600 hover:bg-green-600/20"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => revertLine(i)}
                                title="Discard this line's unsaved change"
                                className="h-6 w-6 rounded-md flex items-center justify-center bg-accent/40 text-muted-foreground hover:text-foreground"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          <button onClick={() => setQty(i, 0)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary + save */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums font-medium">{fmt(subtotal)}</span></div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Order discount</span>
              <input value={discount} onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))} className="w-24 text-right bg-background border border-border rounded py-1 px-2 text-sm tabular-nums" />
            </div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">VAT ({Math.round(taxRate * 100)}%)</span><span className="tabular-nums font-medium">{fmt(tax)}</span></div>
            {roundOff > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground"><span>Round Off</span><span className="tabular-nums">{fmt(roundOff)}</span></div>
            )}
            <div className="flex justify-between pt-2 border-t border-border"><span className="font-bold">Total</span><span className="font-bold text-primary tabular-nums">{fmt(total)}</span></div>
          </div>

          <label className="flex items-center gap-2 text-sm px-1">
            <input type="checkbox" checked={creditSale} onChange={(e) => setCreditSale(e.target.checked)} className="rounded" />
            <span>Credit sale (on account → AR)</span>
          </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sale note (optional)" rows={2}
            className="w-full bg-card border border-border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />

          <div className="space-y-2">
            <Button onClick={() => save('pay')} disabled={lines.length === 0 || createOrder.isPending} className="w-full min-h-12 font-bold rounded-xl gap-2">
              {createOrder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
              {resume && !linesDirty ? 'Complete Sale' : creditSale ? 'Save — On Account' : 'Save & Pay'} · {fmt(total)}
            </Button>
            <Button variant="outline" onClick={() => save('draft')} disabled={lines.length === 0 || createOrder.isPending} className="w-full rounded-xl">
              Save as Draft
            </Button>
            {canPrivileged && (
              <Button variant="outline" onClick={saveQuotation} disabled={lines.length === 0 || quotationSaving} className="w-full rounded-xl">
                {quotationSaving ? 'Saving…' : 'Save as Quotation'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Credit-sale terms capture (due date default +30d, notes) — shared component. */}
      <CreditSaleDetailsModal
        open={creditModalOpen}
        customerName={staffParty ? undefined : custName || undefined}
        amountLabel={fmt(total)}
        loading={createOrder.isPending || createIntent.isPending}
        onCancel={() => setCreditModalOpen(false)}
        onConfirm={(details) => save('pay', details)}
      />

      {/* Per-line save confirm — captures the audit reason and the optional inventory
          catalog price propagation before PATCHing the single line. */}
      {savingLineIdx != null && lines[savingLineIdx] && resume && (
        <SaveLineModal
          line={lines[savingLineIdx]}
          orderNumber={resume.number}
          saving={editLine.isPending}
          onClose={() => setSavingLineIdx(null)}
          onConfirm={(reason, updateCatalog) => confirmSaveLine(savingLineIdx, reason, updateCatalog)}
        />
      )}
    </div>
  );
}

/**
 * SaveLineModal — confirm a single resumed-order line edit: shows the before → after
 * change, captures the (required) audit reason, and offers to propagate a price change
 * to the inventory catalog so future sales pick it up too.
 */
function SaveLineModal({ line, orderNumber, saving, onConfirm, onClose }: {
  line: SaleLine;
  orderNumber: string;
  saving: boolean;
  onConfirm: (reason: string, updateCatalog: boolean) => void;
  onClose: () => void;
}) {
  const priceChanged = line.unitPrice !== line.savedPrice;
  const qtyChanged = line.quantity !== line.savedQty;
  const [reason, setReason] = useState('Price correction at order edit');
  const [updateCatalog, setUpdateCatalog] = useState(priceChanged);

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-[56] w-full max-w-sm mx-4 bg-card border border-border rounded-2xl shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm flex items-center gap-2"><Check className="h-4 w-4 text-green-600" /> Save line to {orderNumber}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="text-sm space-y-1">
          <div className="font-semibold">{line.item.name}</div>
          {priceChanged && (
            <div className="text-xs text-muted-foreground">
              Unit price: <span className="line-through">{fmt(line.savedPrice ?? 0)}</span>{' '}
              → <span className="font-bold text-foreground">{fmt(line.unitPrice)}</span>
            </div>
          )}
          {qtyChanged && (
            <div className="text-xs text-muted-foreground">
              Quantity: <span className="line-through">{line.savedQty}</span>{' '}
              → <span className="font-bold text-foreground">{line.quantity}</span>
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            The order's totals are recomputed immediately — no payment or re-save needed.
          </div>
        </div>

        <label className="block text-xs font-semibold text-muted-foreground">
          Reason (audited)
          <input
            type="text" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. stale cached price, price match"
            className="mt-1 w-full bg-accent/10 border border-border rounded-lg py-2 px-3 text-sm font-normal text-foreground focus:ring-1 focus:ring-primary outline-none"
          />
        </label>

        {priceChanged && (
          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={updateCatalog} onChange={(e) => setUpdateCatalog(e.target.checked)} className="rounded mt-0.5" />
            <span>
              Also update the item&apos;s price in inventory to <strong>{fmt(line.unitPrice)}</strong>{' '}
              <span className="text-muted-foreground">(applies to future sales; updates the catalog/recipe price)</span>
            </span>
          </label>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-3 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-accent/10">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason.trim(), updateCatalog)}
            disabled={saving || !reason.trim()}
            className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 flex items-center justify-center gap-1.5"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save Line
          </button>
        </div>
      </div>
    </div>
  );
}
