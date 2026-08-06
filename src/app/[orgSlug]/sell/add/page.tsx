'use client';

/**
 * Add Sale — back-office full sale entry (distinct from the fast POS terminal at /order).
 * A store manager records a wholesaler/credit/delivery sale here with full line control, customer,
 * order discount, tax and payment, while front-store cashiers keep ringing up at the terminal.
 * Reuses the existing order + catalog + client hooks and SplitPaymentModal — no new sale logic.
 */

import { ApprovalDialog, type ApprovalResult } from '@/components/pos/approval-dialog';
import { CustomerCreditHint } from '@/components/pos/clients/credit-terms';
import { CostHeaderToggle, MaskedCost } from '@/components/pos/cost-price';
import { CreditSaleDetailsModal, type CreditSaleDetails } from '@/components/pos/credit-sale-details-modal';
import { CustomerSearch, WALK_IN_CUSTOMER, type SelectedCustomer } from '@/components/pos/customer-search';
import { ApplyDiscountModal } from '@/components/pos/discounts/apply-discount-modal';
import { InlineDiscountCell, InlineMarginCell, InlinePriceCell, InlineTotalCell } from '@/components/pos/inline-line-cells';
import { ShippingDetailsFields, emptyShippingForm, shippingFormFromMetadata, type ShippingFormValue } from '@/components/pos/shipping/shipping-details-fields';
import { SplitPaymentModal } from '@/components/pos/split-payment-modal';
import { StockCell, isStockTracked } from '@/components/pos/stock-cell';
import { Button } from '@/components/ui/base';
import { useClientCredit } from '@/hooks/useClients';
import { usePermissions } from '@/hooks/usePermissions';
import { useAddOrderLines, useCreateOrder, useCreatePaymentIntent, useEditOrderLine, useEditSale, useFullCatalog, useMenuItems, useOrder, usePricingTiers, useSetOrderDiscount, useVoidOrderLine, type CatalogItem, type EditSaleLine } from '@/hooks/usePOS';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { useStaffAdmin } from '@/hooks/useStaff';
import { apiClient } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { rbacApi } from '@/lib/api/rbac';
import { useActiveHappyHours } from '@/hooks/useDiscounts';
import { computeHappyHour, bogoFreeUnitsForSku, type HHLine } from '@/lib/pos/happy-hour';
import { computePairAutoAdd, describeAutoApplyAnnouncement } from '@/lib/pos/auto-apply-discounts';
import { applyRoundOff, computeCartTax } from '@/lib/pos/cart-tax';
import { isFractionalUnit, parseQuantityInput } from '@/lib/pos/units';
import { isLineActive, remainingLineQty } from '@/lib/pos/order-lines';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { FeatureLock, useFeatureUpgrade } from '@bengo-hub/shared-ui-lib/subscription';
import { Check, Loader2, Minus, Plus, Search, ShoppingCart, Tag, Trash2, Truck, User, Users, X } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

// Premium: staff credit funded from salary (ERP payroll deduction). Shown + upgrade-gated below top tier.
const STAFF_CREDIT_FEATURE = 'staff_fund_from_salary';

interface SaleLine {
  item: CatalogItem;
  quantity: number;
  unitPrice: number;
  /** Catalog/tier price at add time — the FLOOR for non-managers (terminal pricing policy:
   *  cashiers may only sell AT or ABOVE the preset; only pos.orders.manage may mark down). */
  preset: number;
  /** Sticky per-unit line discount (KES) — same value model as the terminal's inline cells:
   *  base = unitPrice + unitDiscount, so margin/price edits never clobber the discount. */
  unitDiscount?: number;
  /** True once the user manually edited this line's price — switching profile won't overwrite it. */
  priceEdited?: boolean;
  /** Persisted order-line id when this sale was resumed from All Sales / Drafts — enables
   *  the per-line ✓ save (PATCH the line directly, no Save & Pay round-trip). */
  lineId?: string;
  /** The line's values as last persisted on the server; a mismatch with unitPrice/quantity
   *  marks the line dirty and surfaces the per-line ✓ save / ✕ revert actions. */
  savedPrice?: number;
  savedQty?: number;
  /** True for a line auto-added by a corresponding-pair BOGO deal (the free "get" item) — same
   *  meaning as the POS terminal's CartItem.promoFree. Its quantity is kept in lockstep with the
   *  triggering buy line and the cashier never adds it manually. */
  promoFree?: boolean;
}

// Resolve an item's price for the selected pricing profile (tier). Falls back to the item's default
// price when the profile has no own price — mirrors the POS terminal's tier resolution.
function tierPrice(item: any, profile: string): number {
  const prices = item?.prices && typeof item.prices === 'object' ? (item.prices as Record<string, number>) : undefined;
  if (profile && prices && (prices[profile] ?? 0) > 0) return prices[profile];
  return item?.price ?? 0;
}

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
  const currency = (posSettings as any)?.currency ?? 'KES';
  const fmt = (n: number) => formatCurrency(n, currency);

  // Live happy-hour/auto promotions — same auto-apply engine the POS terminal uses (shared via
  // lib/pos/auto-apply-discounts + lib/pos/happy-hour), brought here so a back-office sale gets
  // the SAME discounts/toasts as ringing the identical items up at the terminal, instead of only
  // the terminal getting the deal.
  const { data: activeHappyHours = [] } = useActiveHappyHours();

  // ── Customer ── (rich phone search; defaults to the seeded Walk-in Customer)
  const [customer, setCustomer] = useState<SelectedCustomer | null>(WALK_IN_CUSTOMER);
  const realCustomer = !!(customer && !customer.isWalkIn && customer.phone);
  // Shares the same cached query CustomerCreditHint below already primes for this account, so
  // this rarely fires a second request — used for the offset-AR "Apply store credit" checkbox.
  const { data: customerCredit } = useClientCredit(realCustomer ? customer?.accountId : undefined);
  const availableStoreCredit = Math.max(0, parseFloat(customerCredit?.store_credit_balance || '0') || 0);

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
  const [lines, setLines] = useState<SaleLine[]>([]);
  // Lightning search: filter the FULL catalog client-side — IndexedDB answers instantly and
  // the background revalidation keeps it fresh (same cache-first source the terminal uses).
  // The per-keystroke SERVER search only runs as a cold-start fallback until the cached
  // catalog is available. Items already on the sale are dropped from the dropdown.
  const { data: fullCatalog } = useFullCatalog();
  const catalogReady = (fullCatalog?.length ?? 0) > 0;
  const { data: catalog, isFetching: serverSearching } = useMenuItems({
    search: search || undefined,
    limit: 25,
    enabled: !catalogReady && !!search,
  });
  const results: CatalogItem[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const inSale = new Set(lines.map((l) => l.item.id));
    if (catalogReady) {
      const out: CatalogItem[] = [];
      for (const it of fullCatalog ?? []) {
        if (inSale.has(it.id)) continue;
        if (
          (it.name ?? '').toLowerCase().includes(q) ||
          (it.sku ?? '').toLowerCase().includes(q) ||
          ((it as any).barcode ?? '').toLowerCase().includes(q)
        ) {
          out.push(it);
          if (out.length >= 25) break;
        }
      }
      return out;
    }
    return (catalog?.data ?? []).filter((it) => !inSale.has(it.id));
  }, [search, fullCatalog, catalogReady, catalog, lines]);
  const isFetching = !catalogReady && serverSearching;

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
    // The preset (non-manager floor) follows the profile price; manually-edited lines keep
    // their price but still get the new floor reference.
    setLines((prev) => prev.map((l) => {
      const p = tierPrice(l.item, profile);
      return l.priceEdited ? { ...l, preset: p } : { ...l, unitPrice: p, preset: p, unitDiscount: 0 };
    }));
    setLines((prev) => {
      prev.forEach((l) => {
        if (l.priceEdited) return;
        resolvePrice(l.item.id, l.quantity, profile).then((p) => {
          if (p != null) setLines((cur) => cur.map((x) => (x.item.id === l.item.id && !x.priceEdited ? { ...x, unitPrice: p, preset: p } : x)));
        });
      });
      return prev;
    });
  }, [resolvePrice]);

  // ── Order-level ──
  // Discount is set through the shared ApplyDiscountModal (predefined / new standard /
  // quick one-time) — same entry point and server-side over-limit step-up as the terminal.
  const [discount, setDiscount] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  const [discountOpen, setDiscountOpen] = useState(false);
  // The discount as last persisted on the SERVER for a resumed sale (null = not a resume).
  // A mismatch with `discount` marks it dirty and surfaces the ✓ save / ✕ cancel actions —
  // the typed discount must be PATCHed onto the order BEFORE settling, because completing
  // an unmodified resume charges the server's stored total (2026-07-14: an unsaved 1,000
  // discount settled at the stale 10,180 and the retry double-posted the sale).
  const [savedDiscount, setSavedDiscount] = useState<number | null>(null);
  // Credit Sale entry point (sidebar /sell/add?credit=1) pre-selects on-account. When checked, Save
  // posts the total straight to the customer's AR (on_account tender) and completes the order with no
  // payment collected now — treasury enforces the credit limit. No payment modal.
  const [creditSale, setCreditSale] = useState(searchParams.get('credit') === '1');
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [notes, setNotes] = useState('');
  // ── Shipping (optional) ── the shared ShippingDetailsFields form writes the same
  // metadata keys the Edit Shipping action manages, so the All-Sales Shipping column/
  // filter, the Shipments page, and the details modal all read create-time shipping too.
  // The charge itself goes through the real `charges.shipping` order-level cost (manager
  // adjustment — non-managers get the same approval_required the terminal shows), so
  // total_amount = subtotal + tax − discount + charges holds server-side.
  const [shippingOpen, setShippingOpen] = useState(false);
  const [shipping, setShipping] = useState<ShippingFormValue>(emptyShippingForm());
  const shippingAmount = shippingOpen ? Math.max(0, Number(shipping.amount) || 0) : 0;
  // Credit Sale is available to CASHIERS too (product decision 2026-07-07 — terms captured via
  // the shared CreditSaleDetailsModal; treasury enforces the credit limit). Quotations remain a
  // manager/back-office action (same permission that approves sale returns).
  const { can, canAny } = usePermissions();
  const canPrivileged = can('pos.orders.manage');
  // Discounting is permission-gated (2026-07-17): manager/admin + platform owner by default
  // (pos.discounts.add / pos.orders.manage); hidden from cashiers unless the tenant admin
  // grants the code. Mirrors the terminal cart's "Add discount" gate.
  const canApplyDiscount = canAny(['pos.discounts.add', 'pos.orders.manage']);
  // REQ-006: cost price + margin visibility for management roles at the point of sale.
  // Values render MASKED by default (customers can see the screen); the header eye toggle
  // reveals/hides the whole column. Same gate as pos-api's cost serialization
  // (pos.catalog.view_cost OR pos.orders.manage) so the column never renders empty.
  const canViewCost = canAny(['pos.catalog.view_cost', 'pos.orders.manage']);
  const [costRevealed, setCostRevealed] = useState(false);
  const [quotationSaving, setQuotationSaving] = useState(false);

  const createOrder = useCreateOrder();
  const createIntent = useCreatePaymentIntent();
  const [payOrder, setPayOrder] = useState<{ id: string; number: string; total: number } | null>(null);
  // Manager step-up required by the server (422 approval_required): an over-limit discount
  // (order.discount_override) or a non-manager shipping charge (order.adjustment). The
  // ApprovalDialog resolves a token/one-time code and the save is retried with it — the
  // exact flow the POS terminal runs.
  const [pendingApproval, setPendingApproval] = useState<{ action: string; mode: 'pay' | 'draft'; creditDetails?: CreditSaleDetails } | null>(null);
  // Out-of-stock ("oversell") override for a line whose qty exceeds on-hand stock.
  const [pendingOversell, setPendingOversell] = useState<{ index: number; qty: number } | null>(null);

  // ── Resume / edit an existing draft (REQ-003) ── ?order_id= comes from the Drafts page
  // "Resume Sale" action and the All-Sales "Edit" action. The draft's lines, customer and
  // discount are prefilled; completing it settles the SAME order (no duplicate) unless the
  // cart was modified, in which case a replacement order is created and the stale draft is
  // voided as superseded.
  const resumeId = searchParams.get('order_id') || searchParams.get('draft_id') || '';
  const resumeQ = useOrder(resumeId);
  const [resume, setResume] = useState<{ id: string; number: string; total?: number } | null>(null);
  // Structural changes (lines added/removed) route through applyResumedLineEdits below —
  // still an in-place edit of the SAME order, never a replacement; price/qty edits on
  // persisted lines are tracked per line (savedPrice/savedQty) so a per-line ✓ save can
  // clear them without touching the rest of the sale.
  const [structuralDirty, setStructuralDirty] = useState(false);
  // The draft's ORIGINAL persisted line ids (captured at resume time) — diffed against the
  // current lines' ids on save to find which lines were removed (see applyResumedLineEdits).
  const originalLineIdsRef = useRef<Set<string>>(new Set());

  // ── Served by ── who is credited with serving this sale (audit/accountability — distinct from
  // the credit-sale "bill-to" staff party above). Reuses the SAME staff list already loaded for
  // that picker. Defaults to the current session user for a brand-new sale; the resume-hydrate
  // effect below overwrites it with the draft's original served_by_user_id/user_id (the display
  // name arrives as served_by_name) so a resumed AND modified sale still credits the original
  // drafter instead of whoever finishes it.
  const authUser = useAuthStore((s) => s.user);
  const [servedByUserId, setServedByUserId] = useState('');
  const [servedByName, setServedByName] = useState('');
  useEffect(() => {
    if (!resume && !servedByUserId && authUser?.id) {
      setServedByUserId(authUser.id);
      setServedByName(authUser.fullName || '');
    }
  }, [authUser?.id, authUser?.fullName, resume, servedByUserId]);

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
    setServedByUserId(o.served_by_user_id || o.user_id || '');
    setServedByName(o.served_by_name || o.cashier_name || '');
    setLines((o.edges?.lines ?? []).map((l: any) => ({
      item: { id: l.catalog_item_id, sku: l.sku, name: l.name, price: l.unit_price, category: '' } as CatalogItem,
      quantity: l.quantity,
      unitPrice: l.unit_price,
      preset: l.unit_price, // the persisted price is the floor reference for non-managers
      priceEdited: true, // keep the draft's prices — don't let profile switching overwrite them
      lineId: l.id,
      savedPrice: l.unit_price,
      savedQty: l.quantity,
    })));
    originalLineIdsRef.current = new Set((o.edges?.lines ?? []).map((l: any) => l.id));
    setDiscount(Number(o.discount_total) || 0);
    setSavedDiscount(Number(o.discount_total) || 0);
    if (o.customer_name || o.customer_phone) {
      setCustomer({ name: o.customer_name ?? '', phone: o.customer_phone ?? '', isWalkIn: !o.customer_phone } as SelectedCustomer);
    }
    // Prefill shipping from the draft's metadata (same keys the Edit Shipping action writes).
    const md = o.metadata ?? {};
    if (md.shipping_status || md.shipping_address || md.shipping_details) {
      setShippingOpen(true);
      setShipping(shippingFormFromMetadata(md));
    }
    setStructuralDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeQ.data, resumeId]);

  // ── Edit a FINALIZED sale IN PLACE ── ?edit_inplace= comes from the admin "Edit Sale" action.
  // Nothing is reversed just to open this — the original order is prefilled AS-IS, tagged with
  // its lineIds. Save sends the FULL desired line set to the single centralized POST
  // /orders/{id}/edit endpoint; the SERVER diffs against the live order and decides in-place
  // vs return vs addendum internally based on the order's actual fiscalization status — the
  // client no longer computes or ships a reductions/increases split itself.
  //
  // editInplace is keyed by order id specifically (not just "is it set") — the previous guard
  // (`|| editInplace`) blocked this effect from ever re-running once set, even for a DIFFERENT
  // order or a fresh navigation back into edit mode for the SAME order after `reset()` failed
  // to clear it. That stale snapshot is the confirmed root cause of a real production report
  // ("reducing qty of a line item does nothing"): a second Edit-Sale entry in the same browser
  // tab silently re-diffed against pre-edit quantities instead of the just-saved state.
  const editInplaceId = searchParams.get('edit_inplace') || '';
  // Where to land after a successful in-place edit save — the sales list the "Edit Sale" action
  // was launched from (All Sales / POS-only Sales both link here), falling back to a blank Add
  // Sale screen when absent (e.g. this page opened directly, not via the sales list).
  const editInplaceReturnTo = searchParams.get('return_to') || `/${orgSlug}/sell/add`;
  const editInplaceQ = useOrder(editInplaceId);
  const [editInplace, setEditInplace] = useState<{ id: string; number: string } | null>(null);
  const editSale = useEditSale();
  const [editInplaceSaving, setEditInplaceSaving] = useState(false);
  useEffect(() => {
    const o: any = editInplaceQ.data;
    if (!o || !editInplaceId || (editInplace && editInplace.id === editInplaceId)) return;
    // isLineActive/remainingLineQty (not a raw `!voided_qty` check) — a PARTIALLY reduced line
    // still has a real remaining quantity and must stay editable; only a FULLY voided line
    // (remaining <= 0) drops out of the cart. Getting this wrong is what silently deleted a
    // never-touched unit live on order #000141 — see order-lines.ts's doc comment.
    const activeLines = (o.edges?.lines ?? []).filter((l: any) => isLineActive(l));
    setLines(activeLines.map((l: any) => ({
      item: { id: l.catalog_item_id, sku: l.sku, name: l.name, price: l.unit_price, category: '' } as CatalogItem,
      quantity: remainingLineQty(l),
      unitPrice: l.unit_price,
      preset: l.unit_price,
      priceEdited: true,
      lineId: l.id,
      savedPrice: l.unit_price,
      savedQty: remainingLineQty(l),
    })));
    if (o.customer_name || o.customer_phone) {
      setCustomer({ name: o.customer_name ?? '', phone: o.customer_phone ?? '', isWalkIn: !o.customer_phone } as SelectedCustomer);
    }
    setEditInplace({ id: o.id, number: o.order_number });

  }, [editInplaceQ.data, editInplaceId, editInplace]);

  // Sends the live cart as the FULL desired line set for editInplace.id — the backend computes
  // the removed/reduced/increased/added diff itself and routes each part appropriately.
  async function saveEditInplace() {
    if (!editInplace) return;
    if (lines.length === 0) {
      toast.info('Nothing to save.');
      return;
    }
    const editLines: EditSaleLine[] = lines.map((l) => ({
      line_id: l.lineId,
      catalog_item_id: l.item.id,
      sku: l.item.sku,
      name: l.item.name,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      tax_code_id: l.item.tax_code_id,
      price_includes_tax: l.item.tax_inclusive,
      tax_rate: typeof l.item.tax_rate === 'number' ? l.item.tax_rate : undefined,
    }));

    setEditInplaceSaving(true);
    try {
      // customer is already shown/editable on this page via CustomerSearch above — send it so
      // an increase (which always posts as AR) has a real customer to attach to when the order
      // itself has none yet (e.g. adding an item to a walk-in's completed sale). pos-api refuses
      // the increase otherwise; realCustomer excludes the walk-in placeholder so an unresolved
      // walk-in still lets a pure-reduction edit through unaffected.
      const result = await editSale.mutateAsync({
        orderId: editInplace.id, reason: 'Edited from Sales list', lines: editLines,
        customerName: realCustomer ? customer?.name : undefined,
        customerIdentifier: realCustomer ? customer?.phone : undefined,
      });
      if (result.price_only_lines_skipped?.length) {
        toast.warning("A price change on an unchanged quantity isn't saved by Edit Sale — remove the line and re-add it at the new price instead.");
      }
      if (result.linked_addendum_order_id) {
        // Fiscalized increase: a real linked sub-order was created with its own docket —
        // open the payment sheet for it immediately, same as before this rework.
        try {
          const addendum: any = await apiClient.get(`/api/v1/${tenantId}/pos/orders/${result.linked_addendum_order_id}`);
          toast.success(`${editInplace.number} updated — collect payment for the added item(s).`);
          setPayOrder({ id: addendum.id, number: addendum.order_number ?? '', total: addendum.total_amount ?? 0 });
        } catch {
          toast.success(`${editInplace.number} updated — open ${editInplace.number}'s linked sale to collect payment.`);
          setEditInplace(null);
          reset();
          router.replace(editInplaceReturnTo);
        }
      } else {
        toast.success(`${editInplace.number} updated`);
        setEditInplace(null);
        reset();
        router.replace(editInplaceReturnTo);
      }
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to save the edit.'));
    } finally {
      setEditInplaceSaving(false);
    }
  }

  // Backfill catalog fields the resume/edit prefills above don't carry (they only copy what the
  // ORDER LINE stores: id/sku/name/price). Without this, "In Stock"/"Cost price"/"Margin" render
  // blank dashes for a resumed/edited line, and — more seriously — buildPayload's tax_code_id/
  // tax_rate/tax_inclusive/min_selling_price/max_selling_price all silently drop on save (they're
  // only sent `if l.item.xxx` is set), so a resumed or edited sale quietly loses its tax code and
  // price-band guardrails. Runs whenever fullCatalog changes so it also catches the case where the
  // catalog finishes loading AFTER the resume/edit effect already ran.
  useEffect(() => {
    if (!fullCatalog?.length) return;
    setLines((prev) => {
      let changed = false;
      const next = prev.map((l) => {
        if (l.item.stock_quantity !== undefined && l.item.cost_price !== undefined) return l;
        const match = fullCatalog.find((c) => c.id === l.item.id || (l.item.sku && c.sku === l.item.sku));
        if (!match) return l;
        changed = true;
        // Catalog fields fill the gaps; anything already set from the sale (name/sku/price) wins.
        return { ...l, item: { ...match, ...l.item } };
      });
      return changed ? next : prev;
    });
  }, [fullCatalog]);

  const addLine = useCallback((item: CatalogItem) => {
    let newQty = 1;
    setStructuralDirty(true);
    let updatedLines: SaleLine[] = [];
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.item.id === item.id);
      const next = (() => {
        if (idx >= 0) {
          newQty = prev[idx].quantity + 1;
          return prev.map((l, i) => (i === idx ? { ...l, quantity: newQty } : l));
        }
        // Non-billable items (free accompaniments / supplies) are never charged — force 0
        // regardless of tier pricing (the server zeroes the line as a belt anyway).
        const free = item.non_billable === true || item.is_complimentary === true;
        const preset = free ? 0 : tierPrice(item, pricingProfile);
        return [...prev, { item, quantity: 1, unitPrice: preset, preset }];
      })();
      updatedLines = next;
      return next;
    });
    // Confirm the profile price from inventory-api (mirrors the terminal). Skips if the user already
    // hand-edited this line's price.
    if (pricingProfile && !(item.non_billable === true || item.is_complimentary === true)) {
      resolvePrice(item.id, newQty, pricingProfile).then((p) => {
        if (p != null) setLines((cur) => cur.map((l) => (l.item.id === item.id && !l.priceEdited ? { ...l, unitPrice: p, preset: p } : l)));
      });
    }

    // Same happy-hour/BOGO alert the POS terminal shows the cashier on add — shared via
    // lib/pos/auto-apply-discounts so both surfaces announce identically.
    const totalQtyForSku = updatedLines.filter((l) => l.item.sku === item.sku).reduce((s, l) => s + l.quantity, 0);
    const announcement = describeAutoApplyAnnouncement(
      { sku: item.sku, name: item.name },
      updatedLines.map((l) => ({ sku: l.item.sku, quantity: l.quantity })),
      totalQtyForSku,
      activeHappyHours,
      currency,
    );
    if (announcement) {
      const toastFn = announcement.type === 'success' ? toast.success : toast.info;
      toastFn(announcement.message, { id: announcement.toastId });
    }
  }, [pricingProfile, resolvePrice, activeHappyHours, currency]);

  // Corresponding-pair BOGO auto-add + sync — same computation the POS terminal runs
  // (lib/pos/auto-apply-discounts.computePairAutoAdd), adapted to SaleLine's shape (sku/name
  // live under `.item`, not top-level) via a thin adapter that's stripped back off before the
  // result is stored. Kept centrally here so no manual step is needed and a free line can't be
  // stranded, exactly like the terminal.
  useEffect(() => {
    type BogoAdapterLine = SaleLine & { sku: string; name: string };
    const adapted: BogoAdapterLine[] = lines.map((l) => ({ ...l, sku: l.item.sku, name: l.item.name }));
    const { changed, next, announcements } = computePairAutoAdd<BogoAdapterLine>(adapted, activeHappyHours, (sku) => {
      const match = fullCatalog?.find((c) => c.sku.toLowerCase() === sku);
      if (!match) return undefined;
      const p = tierPrice(match, pricingProfile);
      return { item: match, unitPrice: p, preset: p, sku: match.sku, name: match.name };
    });
    if (changed) {
      setLines(next.map(({ sku: _sku, name: _name, ...rest }) => rest));
      for (const a of announcements) {
        toast.success(`🎉 Free ${a.name}${a.qty > 1 ? ` ×${a.qty}` : ''} added`, { id: `hh-free-${a.sku}` });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, activeHappyHours, fullCatalog, pricingProfile]);

  const applyQty = (i: number, q: number) => {
    if (q <= 0) {
      // Removing a line is structural — it can only persist via the replacement-order path.
      setStructuralDirty(true);
      return setLines((p) => p.filter((_, x) => x !== i));
    }
    return setLines((p) => p.map((l, x) => (x === i ? { ...l, quantity: q } : l)));
  };
  // Oversell guard: INCREASING a stock-tracked line beyond on-hand opens the manager out-of-stock
  // override (same catalog.oos_override flow as the terminal). Decreases + untracked items apply
  // directly. On approval the intended qty is applied.
  const setQty = (i: number, q: number) => {
    const line = lines[i];
    const stockQty = line ? (line.item as CatalogItem).stock_quantity : undefined;
    const itemType = line ? (line.item as CatalogItem).item_type : undefined;
    if (line && q > line.quantity && isStockTracked(itemType) && typeof stockQty === 'number' && q > stockQty) {
      setPendingOversell({ index: i, qty: q });
      return;
    }
    applyQty(i, q);
  };
  // Terminal pricing policy (2026-07-18 revision, same as the POS terminal): managers/admins
  // (pos.orders.manage) set any price silently; everyone else sells AT or ABOVE the preset
  // freely, and a BELOW-preset entry is now ACCEPTED locally too — the server's outlet policy
  // decides at save time (require_approval_below_base ON → 422 approval_required →
  // ApprovalDialog collects the manager step-up and the save retries; OFF → free markdown).
  // The stored unitDiscount is deliberately KEPT on a price edit so a margin/total edit
  // never wipes a layered line discount.
  const setPrice = (i: number, v: number) => {
    setLines((p) => p.map((l, x) => {
      if (x !== i) return l;
      const next = Math.max(0, v);
      return { ...l, unitPrice: Math.round(next * 100) / 100, priceEdited: true };
    }));
  };
  // Per-line discount (managers only — the cell is not editable otherwise): keeps the BASE
  // (current price + stored discount) and lowers the effective price by the new discount.
  const setLineDiscount = (i: number, ud: number) => {
    setLines((p) => p.map((l, x) => {
      if (x !== i) return l;
      const base = l.unitPrice + (l.unitDiscount ?? 0);
      const next = Math.max(0, Math.round((base - ud) * 100) / 100);
      return { ...l, unitPrice: next, unitDiscount: ud, priceEdited: true };
    }));
  };

  // A resumed line whose price/qty differs from what the server holds. These can be saved
  // one at a time (✓) via the audited line-edit endpoint — no Save & Pay required.
  const lineDirty = (l: SaleLine) => !!l.lineId && (l.unitPrice !== l.savedPrice || l.quantity !== l.savedQty);
  // Anything the per-line save can't express (adds/removes/non-persisted lines) keeps the
  // legacy behavior: Save & Pay creates a replacement order and voids the stale draft.
  const linesDirty = structuralDirty || lines.some((l) => (resume ? !l.lineId : false) || lineDirty(l));

  const editLine = useEditOrderLine();
  const [savingLineIdx, setSavingLineIdx] = useState<number | null>(null);
  // In-place batch application of a resumed draft's structural changes (added/removed lines)
  // on Save — see applyResumedLineEdits. Reuses the SAME persisted-line primitives the manual
  // per-line ✓ save above already uses, so a modified draft is never voided/recreated.
  const addLines = useAddOrderLines();
  const voidLine = useVoidOrderLine();
  const [applyingEdits, setApplyingEdits] = useState(false);

  // Order-discount ✓ save / ✕ cancel (resumed sales): PATCH the discount onto the SAME
  // order — the server recomputes totals — so settling charges the discounted amount.
  const setOrderDiscount = useSetOrderDiscount();
  const discountDirty = !!resume && savedDiscount != null && discount !== savedDiscount;
  const saveDiscount = () => {
    if (!resume) return;
    setOrderDiscount.mutate(
      { orderId: resume.id, discountAmount: discount, reason: discountReason || 'Order discount edit on resumed sale' },
      {
        onSuccess: (d: any) => {
          const newTotal = Number(d?.order?.total_amount);
          setResume((r) => (r ? { ...r, total: Number.isFinite(newTotal) && newTotal > 0 ? newTotal : r.total } : r));
          setSavedDiscount(discount);
          toast.success(`Discount ${fmt(discount)} saved to ${resume.number}`);
        },
        onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to save the discount.')),
      },
    );
  };
  const cancelDiscount = () => setDiscount(savedDiscount ?? 0);
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

  // Applies EVERY outstanding change to a resumed draft — new lines, removed lines, and any
  // qty/price edit not already saved via the per-line ✓ — directly onto the SAME persisted
  // order, reusing the exact primitives the per-line ✓ save ("editLine") and "Add to Bill"
  // ("addLines") already use, plus VoidOrderLine (the same audited/anti-sweethearting-gated
  // removal path a sent/persisted line already requires elsewhere in this codebase). Nothing
  // here creates a new order or voids the original draft. Returns the order's fresh
  // total_amount once every change has landed, or null if a step failed (the caller must not
  // proceed to settle/save against a half-applied edit).
  const applyResumedLineEdits = async (): Promise<number | null> => {
    if (!resume) return null;
    const currentIds = new Set(lines.filter((l) => l.lineId).map((l) => l.lineId as string));
    const removedIds = [...originalLineIdsRef.current].filter((id) => !currentIds.has(id));
    const changedLines = lines.filter((l) => l.lineId && lineDirty(l));
    const newLines = lines.filter((l) => !l.lineId);

    try {
      for (const lineId of removedIds) {
        await voidLine.mutateAsync({ orderId: resume.id, lineId, reason: 'Removed while editing draft' });
      }
      for (const l of changedLines) {
        await editLine.mutateAsync({
          orderId: resume.id, lineId: l.lineId as string, unitPrice: l.unitPrice, quantity: l.quantity,
          reason: 'Line edited while editing draft',
        });
      }
      if (newLines.length > 0) {
        await addLines.mutateAsync({ orderId: resume.id, lines: newLines.map(lineToPayload) });
      }
      // Re-sync from the server so a second Save (e.g. Save as Draft, then Save & Pay) diffs
      // against what's now actually persisted instead of re-creating/re-removing the same lines.
      const fresh = await apiClient.get<any>(`/api/v1/${tenantId}/pos/orders/${resume.id}`);
      const freshLines: any[] = fresh?.edges?.lines ?? [];
      originalLineIdsRef.current = new Set(freshLines.map((l) => l.id));
      setLines((prev) => prev.map((l) => {
        const match = freshLines.find((fl) => fl.catalog_item_id === l.item.id);
        return match ? { ...l, lineId: match.id, savedPrice: match.unit_price, savedQty: match.quantity } : l;
      }));
      setStructuralDirty(false);
      const freshTotal = Number(fresh?.total_amount);
      return Number.isFinite(freshTotal) && freshTotal > 0 ? freshTotal : null;
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to save changes to the draft.'));
      return null;
    }
  };

  // Effective quantity (paid + same-SKU BOGO free units) — same derivation as the POS terminal's
  // effectiveQtyFor, folded into gross/tax/happy-hour math AND the persisted order line so stock
  // deducts every physical unit and pos-api's calculateBOGODiscount prices the free units.
  const effectiveQty = useCallback(
    (l: SaleLine) => l.quantity + bogoFreeUnitsForSku(l.item.sku, l.quantity, activeHappyHours),
    [activeHappyHours],
  );

  // Per-line inclusive-aware tax + a single order-level ceiling round-off — the SAME model the
  // POS terminal and pos-api use (see src/lib/pos/cart-tax.ts), so this preview equals the
  // server's stored totals instead of stacking a flat VAT over the whole (discounted) cart.
  const { subtotal, tax } = useMemo(() => {
    const r = computeCartTax(
      lines.map((l) => ({
        gross: l.unitPrice * effectiveQty(l),
        taxRate: typeof l.item.tax_rate === 'number' ? l.item.tax_rate : undefined,
        taxInclusive: l.item.tax_inclusive ?? undefined,
      })),
      taxRate * 100,
    );
    return { subtotal: r.subtotal, tax: r.tax };
  }, [lines, taxRate, effectiveQty]);

  // Live happy-hour/auto auto-apply discount — mirrors pos-api's checkout evaluator (and the POS
  // terminal's identical computation) so this preview matches what the server applies at save.
  const happyHour = useMemo(() => {
    const hhLines: HHLine[] = lines.map((l) => {
      const qty = effectiveQty(l);
      return { sku: l.item.sku, category: l.item.category, unitPrice: l.unitPrice, quantity: qty, total: l.unitPrice * qty };
    });
    return computeHappyHour(hhLines, activeHappyHours, currency);
  }, [lines, activeHappyHours, currency, effectiveQty]);
  const happyHourDiscount = happyHour.total;
  // Alert when a discount window opens/closes while a sale is already in progress — same cue the
  // POS terminal gives, since Add Sale carts can sit open just as long.
  const prevHappyHourDiscountRef = useRef(0);
  useEffect(() => {
    const prev = prevHappyHourDiscountRef.current;
    if (lines.length > 0) {
      if (prev <= 0 && happyHourDiscount > 0) {
        toast.success(`🎉 ${happyHour.promoName || 'A discount'} is now active on this sale!`, { id: 'happy-hour-window' });
      } else if (prev > 0 && happyHourDiscount <= 0) {
        toast.info('The active discount window has ended for this sale.', { id: 'happy-hour-window' });
      }
    }
    prevHappyHourDiscountRef.current = happyHourDiscount;
  }, [lines.length, happyHourDiscount, happyHour.promoName]);

  const { roundOff, total } = applyRoundOff(subtotal + tax - discount - happyHourDiscount + shippingAmount);

  // Per-line request shape — shared by buildPayload (the whole cart) and the edit_inplace
  // addendum save (just the added/increased lines), so both send identical tax/price-guardrail
  // metadata.
  function lineToPayload(l: SaleLine) {
    const free = l.item.non_billable === true || l.item.is_complimentary === true;
    const lineMeta: Record<string, any> = {};
    if (notes) lineMeta.notes = notes;
    // Free-of-charge marker — the server zeroes the line on this flag (belt & braces).
    if (free) lineMeta.non_billable = true;
    // Price-override audit trail — the SAME metadata contract the terminal sends:
    // metadata.original_price is what pos-api's markdown gate (price.override step-up +
    // audit) keys off, so back-office markdowns get identical enforcement.
    if ((l.unitDiscount ?? 0) > 0) lineMeta.unit_discount = l.unitDiscount;
    if (!free && l.preset > 0 && Math.abs(l.unitPrice - l.preset) > 0.004) {
      lineMeta.original_price = l.preset;
      lineMeta.price_override = true;
      lineMeta.override_reason = (l.unitDiscount ?? 0) > 0 ? 'line discount' : 'price edit';
    }
    // Selling-price guardrails (mirrors the terminal's cart payload) — without these the
    // server's min/max band gate never sees them, so a below-floor/above-ceiling price
    // typed here skipped manager approval entirely (a real gap vs. the terminal).
    if (!free && typeof l.item.min_selling_price === 'number' && l.item.min_selling_price > 0) {
      lineMeta.min_price = l.item.min_selling_price;
    }
    if (!free && typeof l.item.max_selling_price === 'number' && l.item.max_selling_price > 0) {
      lineMeta.max_price = l.item.max_selling_price;
    }
    // BOGO: send the EFFECTIVE quantity (paid + free) so stock deducts every physical unit and
    // pos-api's calculateBOGODiscount prices the free/discounted "get" units — same contract the
    // POS terminal's orderLines payload uses.
    const qty = effectiveQty(l);
    return {
      catalog_item_id: l.item.id,
      sku: l.item.sku,
      name: l.item.name,
      category: l.item.category,
      quantity: qty,
      unit_price: free ? 0 : l.unitPrice,
      total_price: free ? 0 : l.unitPrice * qty,
      metadata: Object.keys(lineMeta).length > 0 ? lineMeta : undefined,
      // Tax as priced in the catalog — keeps the server payable equal to what is charged here.
      ...(l.item.tax_code_id ? { tax_code_id: l.item.tax_code_id } : {}),
      ...(l.item.tax_inclusive != null ? { price_includes_tax: l.item.tax_inclusive } : {}),
      ...(typeof l.item.tax_rate === 'number' ? { tax_rate: l.item.tax_rate } : {}),
    };
  }

  function buildPayload(approval?: ApprovalResult) {
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
      discountReason: (discount > 0 && discountReason) || undefined,
      // Manager step-up outcome (over-limit discount / order adjustment) — token from a live
      // PIN/card step-up, or the one-time code a manager generated remotely.
      approvalToken: approval?.approvalToken,
      approvalCode: approval?.code,
      customerPhone: custPhone || undefined,
      customerName: custName || undefined,
      // Carries the original drafter's attribution through the resume-and-modify supersede
      // path (a fresh order is created for the edited draft); harmless to send unconditionally
      // for a brand-new sale too, since it then just equals the creating user.
      servedByUserId: servedByUserId || undefined,
      // Shipping charge rides the real order-level charges cost so the server total includes it.
      ...(shippingAmount > 0 ? { charges: { shipping: shippingAmount } } : {}),
      metadata: (() => {
        const md: Record<string, any> = {};
        if (pricingProfile) md.pricing_profile = pricingProfile;
        if (shippingOpen && (shipping.address || shipping.details || shipping.deliveredTo || shipping.deliveryPerson || shippingAmount > 0)) {
          md.shipping_status = shipping.status || 'ordered';
          if (shipping.address) md.shipping_address = shipping.address;
          if (shipping.details) md.shipping_details = shipping.details;
          if (shipping.deliveredTo) md.delivered_to = shipping.deliveredTo;
          if (shipping.deliveryPerson) md.delivery_person = shipping.deliveryPerson;
          if (shipping.trackingNumber) md.tracking_number = shipping.trackingNumber;
          if (shippingAmount > 0) md.shipping_amount = shippingAmount;
        }
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
      lines: lines.map(lineToPayload),
    };
  }

  function save(mode: 'pay' | 'draft', creditDetails?: CreditSaleDetails, approval?: ApprovalResult) {
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
      ? {
          paymentDueDate: creditDetails.dueDate,
          creditNotes: creditDetails.notes || undefined,
          applyStoreCredit: creditDetails.applyStoreCredit,
        }
      : {};
    // An UNSAVED discount change must never reach settlement: completing a resume charges
    // either the server's stored total (unmodified) or the freshly-recomputed one (edited)
    // below, and either way a typed-but-unsaved discount would be silently dropped (the
    // 2026-07-14 over-collection) and a retry would duplicate the sale.
    if (resume && discountDirty) {
      toast.error('The discount change is not saved — press ✓ next to the discount to apply it (or ✕ to discard) before completing the sale.');
      return;
    }
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

    // Resuming a MODIFIED draft (lines added/removed/changed) → apply every change in place
    // onto the SAME order (applyResumedLineEdits), then settle/save that SAME order — never a
    // replacement order, never a void of the original (see feedback_edit_sale_inplace_not_reversal
    // memory: a draft has no financial effect yet, so there is nothing to reverse).
    if (resume) {
      setApplyingEdits(true);
      applyResumedLineEdits().then((freshTotal) => {
        setApplyingEdits(false);
        if (freshTotal == null) return; // error already toasted; leave the cart as-is to retry
        if (mode === 'draft') { toast.success('Draft updated'); reset(); return; }
        if (creditSale) {
          createIntent.mutate(
            { orderId: resume.id, tenderMethod: 'on_account', amount: freshTotal, ...creditExtras },
            {
              onSuccess: () => { setCreditModalOpen(false); toast.success(`Sale posted on account · ${fmt(freshTotal)}`); reset(); },
              onError: async (e) => { setCreditModalOpen(false); toast.error(await apiErrorMessage(e, 'Failed to post credit sale to AR.')); },
            },
          );
        } else {
          setPayOrder({ id: resume.id, number: resume.number, total: freshTotal });
        }
      });
      return;
    }

    createOrder.mutate(buildPayload(approval), {
      onSuccess: (o: any) => {
        const id = o.id || o.order_id || '';
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
      onError: async (e: any) => {
        // Over-limit discount / non-manager order adjustment → manager step-up, then retry
        // this same save with the token/code (mirrors the terminal's 422 handling).
        const status = e?.response?.status;
        const data = e?.response?.data ?? {};
        if (status === 422 && data.approval_required) {
          setPendingApproval({ action: data.action || 'order.discount_override', mode, creditDetails });
          return;
        }
        toast.error(await apiErrorMessage(e, 'Failed to create sale. Please try again.'));
      },
    });
  }
  function reset() {
    setLines([]); setDiscount(0); setDiscountReason(''); setSavedDiscount(null); setNotes(''); setCustomer(WALK_IN_CUSTOMER); setCreditSale(false);
    setPendingApproval(null);
    setPartyType('customer'); setStaffId(''); setFundFromSalary(false); setMonths(1);
    setShippingOpen(false); setShipping(emptyShippingForm());
    setStructuralDirty(false); setSavingLineIdx(null);
    originalLineIdsRef.current = new Set();
    if (resume) {
      setResume(null);
      // Drop ?order_id= so the resume effect can't re-prefill the finished draft.
      router.replace(`/${orgSlug}/sell/add`);
    }
    // Belt-and-braces: saveEditInplace's own success paths already clear this and drop
    // ?edit_inplace=, but reset() is called from other flows too (e.g. saveQuotation) — never
    // leave a stale snapshot behind for a later Edit-Sale entry to silently reuse (the root
    // cause of the "reducing qty does nothing" bug).
    setEditInplace(null);
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
    <div className="p-4 sm:p-6 max-w-400 mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <ShoppingCart className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">
          {editInplace ? `Edit Sale — ${editInplace.number}` : resume ? `Resume Sale — ${resume.number}` : creditSale ? 'Credit Sale' : 'Add Sale'}
        </h1>
        <span className="text-sm text-muted-foreground">
          {editInplace ? 'Add, remove or reduce items — nothing is reversed until you save, and only for what actually changed' : resume ? 'Draft prefilled — collect payment to complete it' : creditSale ? 'Sell on account — posts to customer AR' : 'Back-office sale entry'}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          Sale date: <b className="text-foreground">{new Date().toLocaleString('en-KE')}</b> · Invoice No. auto-generated
        </span>
      </div>

      {/* Sale header — customer/bill-to on the left, pricing profile on the right, so the
          product table below gets the FULL page width. Credit sales can instead be billed to
          a STAFF member, optionally funded from salary (premium — shown + upgrade-gated). */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
        <div className="space-y-4">
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

        {/* Served by — who is credited with serving this sale (audit/accountability). Reuses
            the same staff list loaded for the credit-sale bill-to picker above. Resuming a draft
            prefills the ORIGINAL drafter (see the resume-hydrate effect); changeable by anyone
            with access to this page — a full admin-gated correction after completion goes
            through the Sell Details "Edit Sale Info" action instead. */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground">Served by</label>
          <select
            value={servedByUserId}
            onChange={(e) => { setServedByUserId(e.target.value); setServedByName(staff.find((s: any) => s.id === e.target.value)?.name ?? ''); }}
            className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value={servedByUserId}>{servedByName || '— Select staff —'}</option>
            {staff.filter((s: any) => s.id !== servedByUserId).map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}{s.role ? ` · ${s.role}` : ''}</option>
            ))}
          </select>
        </div>
        </div>

        <div className="space-y-4">
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
        </div>
      </div>

      {/* Item search + lines — FULL page width so the product table has room to breathe. */}
      <div className="space-y-4">
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

          <div className="bg-card border border-border rounded-2xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/30 text-muted-foreground">
                <th className="text-left px-4 py-2.5 font-medium">Product</th>
                <th className="text-center px-2 py-2.5 font-medium">In Stock</th>
                <th className="text-center px-2 py-2.5 font-medium">Qty</th>
                {canViewCost && (
                  <th className="text-right px-3 py-2.5 font-medium">
                    <CostHeaderToggle revealed={costRevealed} onToggle={() => setCostRevealed((v) => !v)} label="Cost price" className="normal-case" />
                  </th>
                )}
                {canViewCost && <th className="text-right px-3 py-2.5 font-medium">Margin</th>}
                <th className="text-right px-3 py-2.5 font-medium">Unit price</th>
                {canApplyDiscount && <th className="text-right px-3 py-2.5 font-medium">Discount</th>}
                <th className="text-right px-4 py-2.5 font-medium">Total</th>
                <th></th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {lines.length === 0 && <tr><td colSpan={6 + (canViewCost ? 2 : 0) + (canApplyDiscount ? 1 : 0)} className="px-4 py-8 text-center text-muted-foreground">Search and add products to the sale</td></tr>}
                {lines.map((l, i) => {
                  // REQ-006: supplier cost + margin — only serialized by pos-api to
                  // pos.catalog.view_cost holders, so it's simply absent for cashiers.
                  const cost = Number((l.item as any).cost_price ?? 0);
                  return (
                    <tr key={l.item.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium">{l.item.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{l.item.sku}</div>
                      </td>
                      {/* In-Stock (expected balance after this sale) — all roles; red as stock runs out */}
                      <td className="px-2 py-3 text-center">
                        <StockCell stockQuantity={l.item.stock_quantity} soldQty={l.quantity} itemType={l.item.item_type} />
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setQty(i, l.quantity - 1)} className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-accent"><Minus className="h-3 w-3" /></button>
                          {/* Type a quantity (e.g. 120) directly. Commits on Enter/blur so
                              typing a large number never fires the oversell prompt mid-digit. */}
                          <input
                            type="number"
                            min={0}
                            step={isFractionalUnit(l.item.unit) ? 1.0 : 1}
                            inputMode={isFractionalUnit(l.item.unit) ? 'decimal' : 'numeric'}
                            key={l.quantity}
                            defaultValue={l.quantity}
                            aria-label="Line quantity"
                            onFocus={(e) => e.currentTarget.select()}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            onBlur={(e) => {
                              const n = parseQuantityInput(e.currentTarget.value, isFractionalUnit(l.item.unit));
                              if (n != null && n !== l.quantity) setQty(i, n);
                              else e.currentTarget.value = String(l.quantity);
                            }}
                            className="w-12 text-center bg-background border border-border rounded py-1 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                          <button onClick={() => setQty(i, l.quantity + 1)} className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-accent"><Plus className="h-3 w-3" /></button>
                        </div>
                      </td>
                      {canViewCost && (
                        <td className="px-3 py-3 text-right text-xs">
                          <MaskedCost cost={cost} sell={l.unitPrice} revealed={costRevealed} showMargin={false} />
                        </td>
                      )}
                      {canViewCost && (
                        <td className="px-3 py-3 text-right text-xs">
                          {/* Margin edit recalculates the price from cost, keeping any line
                              discount — managers only (same gate as the terminal). */}
                          <InlineMarginCell
                            cost={cost}
                            sell={l.unitPrice}
                            unitDiscount={l.unitDiscount ?? 0}
                            revealed={costRevealed}
                            editable={canPrivileged}
                            onCommitPrice={(p) => setPrice(i, p)}
                          />
                        </td>
                      )}
                      <td className="px-3 py-3 text-right">
                        {/* Pricing policy (2026-07-18): cashiers may edit the price too when the
                            outlet allows selling above base (retail/pharmacy up-sell default) —
                            a below-preset entry triggers the manager ApprovalDialog at save via
                            the server's 422 approval_required (price.override). */}
                        <InlinePriceCell
                          price={l.unitPrice}
                          preset={l.preset}
                          canDiscount={canPrivileged}
                          disabled={!canPrivileged && !(posSettings?.allow_price_above_base ?? true)}
                          onCommit={(p) => setPrice(i, p)}
                          currency={currency}
                        />
                      </td>
                      {canApplyDiscount && (
                        <td className="px-3 py-3 text-right">
                          <InlineDiscountCell
                            price={l.unitPrice}
                            unitDiscount={l.unitDiscount ?? 0}
                            quantity={l.quantity}
                            editable={canApplyDiscount}
                            onCommitDiscount={(ud) => setLineDiscount(i, ud)}
                            currency={currency}
                          />
                        </td>
                      )}
                      <td className="px-4 py-3 text-right">
                        {/* Line total edit is manager-only (derived figure — unit price =
                            total ÷ qty); cashiers see it read-only, same as the terminal. */}
                        <InlineTotalCell
                          price={l.unitPrice}
                          quantity={l.quantity}
                          canDiscount={canPrivileged}
                          disabled={!canPrivileged}
                          onCommitPrice={(p) => setPrice(i, p)}
                        />
                      </td>
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

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Shipping + note (left 2/3) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Shipping details — optional; writes the SAME metadata keys the Edit Shipping
              action manages, plus a real charges.shipping cost so the payable includes it. */}
          <div className="bg-card border border-border rounded-2xl">
            <button type="button" onClick={() => setShippingOpen((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold">
              <span className="flex items-center gap-2"><Truck className="h-4 w-4 text-primary" /> Shipping Details <span className="text-xs font-normal text-muted-foreground">(optional)</span></span>
              <span className="text-xs text-muted-foreground">{shippingOpen ? 'Hide' : shippingAmount > 0 ? fmt(shippingAmount) : 'Add'}</span>
            </button>
            {shippingOpen && (
              <div className="px-5 pb-5 space-y-3">
                <ShippingDetailsFields value={shipping} onChange={setShipping} showTracking={false} />
                {shippingAmount > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Shipping charges are a manager order adjustment — non-manager users will be asked for manager approval on save.
                  </p>
                )}
              </div>
            )}
          </div>

          <label className="block text-xs font-semibold text-muted-foreground">Sell note
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sale note (optional)" rows={3}
              className="mt-1 w-full bg-card border border-border rounded-xl py-2 px-3 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </label>
        </div>

        {/* Summary + save */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums font-medium">{fmt(subtotal)}</span></div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Order discount</span>
              <div className="flex items-center gap-1.5">
                {/* Discount is entered through the shared ApplyDiscountModal (predefined /
                    new standard / quick one-time) — never a free-typed field. Editing the
                    discount of a RESUMED sale PATCHes a manager-only route, so that path is
                    manager-gated here too; a fresh sale lets any cashier request one and the
                    server demands the manager step-up when it exceeds the outlet limit. */}
                {/* ✓ save / ✕ cancel — resumed sales only, once the discount diverges from the
                    server. ✓ PATCHes the discount onto the SAME order (audited, recomputes
                    totals) so settling charges the discounted total — no Save & Pay round-trip,
                    no replacement order. */}
                {discountDirty && (
                  <>
                    <button
                      onClick={saveDiscount}
                      disabled={setOrderDiscount.isPending}
                      title="Save this discount to the sale now (no payment needed)"
                      className="h-6 w-6 rounded-md flex items-center justify-center bg-green-600/10 text-green-600 hover:bg-green-600/20 disabled:opacity-50"
                    >
                      {setOrderDiscount.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={cancelDiscount}
                      disabled={setOrderDiscount.isPending}
                      title="Discard the unsaved discount change"
                      className="h-6 w-6 rounded-md flex items-center justify-center bg-accent/40 text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                )}
                {canApplyDiscount ? (
                  <button
                    type="button"
                    onClick={() => setDiscountOpen(true)}
                    disabled={!!resume && !canPrivileged}
                    title={resume && !canPrivileged ? 'Editing a saved sale’s discount needs a manager (pos.orders.manage)' : 'Apply a defined discount or a one-time discount'}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-sm font-semibold hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed',
                      discount > 0 ? 'text-amber-600' : 'text-muted-foreground',
                    )}
                  >
                    <Tag className="h-3.5 w-3.5" />
                    {discount > 0 ? `− ${fmt(discount)}` : 'Add discount'}
                  </button>
                ) : (
                  <span className={cn('text-sm font-semibold tabular-nums', discount > 0 ? 'text-amber-600' : 'text-muted-foreground')}>
                    {discount > 0 ? `− ${fmt(discount)}` : '—'}
                  </span>
                )}
              </div>
            </div>
            {discount > 0 && discountReason && (
              <p className="text-[11px] text-muted-foreground text-right -mt-1.5">{discountReason}</p>
            )}
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">VAT ({Math.round(taxRate * 100)}%)</span><span className="tabular-nums font-medium">{fmt(tax)}</span></div>
            {happyHourDiscount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{happyHour.promoName || 'Auto discount'}</span>
                <span className="tabular-nums font-medium text-emerald-600">− {fmt(happyHourDiscount)}</span>
              </div>
            )}
            {shippingAmount > 0 && (
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Shipping (+)</span><span className="tabular-nums font-medium">{fmt(shippingAmount)}</span></div>
            )}
            {roundOff > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground"><span>Round Off</span><span className="tabular-nums">{fmt(roundOff)}</span></div>
            )}
            <div className="flex justify-between pt-2 border-t border-border"><span className="font-bold">Total</span><span className="font-bold text-primary tabular-nums">{fmt(total)}</span></div>
          </div>

          {!editInplace && (
            <label className="flex items-center gap-2 text-sm px-1">
              <input type="checkbox" checked={creditSale} onChange={(e) => setCreditSale(e.target.checked)} className="rounded" />
              <span>Credit sale (on account → AR)</span>
            </label>
          )}

          <div className="space-y-2">
            {editInplace ? (
              <Button onClick={saveEditInplace} disabled={editInplaceSaving || editSale.isPending} className="w-full min-h-12 font-bold rounded-xl gap-2">
                {(editInplaceSaving || editSale.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save Changes
              </Button>
            ) : (
              <>
                <Button onClick={() => save('pay')} disabled={lines.length === 0 || createOrder.isPending || applyingEdits} className="w-full min-h-12 font-bold rounded-xl gap-2">
                  {(createOrder.isPending || applyingEdits) ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                  {resume && !linesDirty ? 'Complete Sale' : creditSale ? 'Save — On Account' : 'Save & Pay'} · {fmt(total)}
                </Button>
                <Button variant="outline" onClick={() => save('draft')} disabled={lines.length === 0 || createOrder.isPending || applyingEdits} className="w-full rounded-xl">
                  Save as Draft
                </Button>
                {canPrivileged && (
                  <Button variant="outline" onClick={saveQuotation} disabled={lines.length === 0 || quotationSaving} className="w-full rounded-xl">
                    {quotationSaving ? 'Saving…' : 'Save as Quotation'}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Order discount — the ONE shared entry point (predefined by use case / new standard
          discount / quick one-time), same modal the POS terminal cart opens. */}
      <ApplyDiscountModal
        open={discountOpen}
        subtotal={subtotal}
        currentAmount={discount}
        currentReason={discountReason}
        onApply={(amount, reason) => { setDiscount(amount); setDiscountReason(reason); setDiscountOpen(false); }}
        onClose={() => setDiscountOpen(false)}
        lines={lines.map((l) => ({ sku: l.item.sku, category: l.item.category, quantity: l.quantity, unit_price: l.unitPrice }))}
        outletId={outletId}
      />

      {/* Manager step-up for an over-limit discount / non-manager order adjustment — the
          server's 422 approval_required is resolved here and the save retried with the
          token/one-time code (same three-tab dialog Void/Complimentary use). */}
      {pendingApproval && (
        <ApprovalDialog
          open
          action={pendingApproval.action}
          description={
            pendingApproval.action === 'order.discount_override'
              ? `The ${fmt(discount)} discount exceeds your allowed limit — a manager must authorize it.`
              : 'This order change requires manager authorization.'
          }
          onApproved={(approval) => {
            const { mode, creditDetails } = pendingApproval;
            setPendingApproval(null);
            save(mode, creditDetails, approval);
          }}
          onClose={() => setPendingApproval(null)}
        />
      )}

      {/* Out-of-stock override — the line qty exceeds on-hand stock. Same catalog.oos_override
          manager approval the POS terminal uses; on approval the intended qty is applied. */}
      {pendingOversell && (
        <ApprovalDialog
          open
          action="catalog.oos_override"
          description={`Overselling ${lines[pendingOversell.index]?.item.name ?? 'this item'} (exceeds on-hand stock) requires a manager to approve.`}
          confirmLabel="Approve override"
          onApproved={async (approval) => {
            // scan/PIN already stepped up (verified). The one-time CODE path is redeemed here.
            if (approval.code && !approval.approvalToken) {
              try {
                const res = await rbacApi.verifyApprovalCode(tenantId, 'catalog.oos_override', approval.code, outletId);
                if (!res?.approved) { toast.error('Invalid or expired approval code'); return; }
              } catch { toast.error('Invalid or expired approval code'); return; }
            }
            const { index, qty } = pendingOversell;
            setPendingOversell(null);
            applyQty(index, qty);
          }}
          onClose={() => setPendingOversell(null)}
        />
      )}

      {/* Credit-sale terms capture (due date default +30d, notes) — shared component. */}
      <CreditSaleDetailsModal
        open={creditModalOpen}
        customerName={staffParty ? undefined : custName || undefined}
        amountLabel={fmt(total)}
        amount={total}
        availableStoreCredit={staffParty ? 0 : availableStoreCredit}
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
          currency={currency}
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
function SaveLineModal({ line, orderNumber, saving, onConfirm, onClose, currency = 'KES' }: {
  line: SaleLine;
  orderNumber: string;
  saving: boolean;
  onConfirm: (reason: string, updateCatalog: boolean) => void;
  onClose: () => void;
  currency?: string;
}) {
  const fmt = (n: number) => formatCurrency(n, currency);
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
