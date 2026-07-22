'use client';

import { useEffect, useRef, useState } from 'react';
import { Users, SplitSquareHorizontal, CreditCard, Layers, Minus, Plus, X, ListOrdered, Printer, Loader2, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { POSPaymentModal } from './payment-modal';
import { ReplaceItemDialog, type ReplaceableLine } from './replace-item-dialog';
import { createSplits, settleSplit, splitReceiptDataUrl, type CreateSplitInput } from '@/lib/api/bill-splits';
import { apiClient } from '@/lib/api/client';
import { renderReceiptHtml, buildReceiptDocument, printReceiptDocument } from '@/lib/pos/receipt-html';
import { paperForFormat, resolveReceiptFormat } from '@/lib/pos/receipt-format';
import type { ReceiptData } from '@/components/pos/receipt-preview';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import type { LoyaltyRedeemInfo } from '@/lib/pos/terminal-actions';

// 'split_tender' = one bill paid across several tenders (e.g. part Cash + part M-Pesa).
// 'equal' / 'custom' / 'by_item' = split among several people, each paying their own portion.
type SplitMode = 'full' | 'split_tender' | 'equal' | 'custom' | 'by_item';

interface CustomSplit {
  amount: string;
  paid: boolean;
}

export interface OrderLineItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  /** Seat/guest assigned at order-entry (1-based; 0/undefined = unassigned). Pre-populates split. */
  seat?: number;
}

interface SplitPaymentModalProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  total: number;
  tenantSlug: string;
  /** Tenant UUID — required to persist splits via the bill-splits API (routes parse a UUID). */
  tenantId?: string;
  tenderId?: string;
  orderLines?: OrderLineItem[];
  isHospitality?: boolean;
  customerEmail?: string;
  /** Attached customer's usable stored credit (KES) — threaded to each POSPaymentModal so a split
   *  line can be settled from it, same as any other tender. Undefined/0 hides the tender there. */
  customerCreditAvailable?: number;
  /** Attached customer's live loyalty account + program terms — threaded to each POSPaymentModal so
   *  any split line can be settled with "Redeem Points" when it fully covers that line's amount. */
  loyaltyAccount?: LoyaltyRedeemInfo | null;
  onPaymentConfirmed: () => void;
  /** Called after a line is replaced (set aside + swapped) so the caller refetches orderLines. */
  onLinesChanged?: () => void;
}

export function SplitPaymentModal({
  open,
  onClose,
  orderId,
  orderNumber,
  total,
  tenantSlug,
  tenantId,
  tenderId,
  orderLines = [],
  isHospitality = false,
  customerEmail,
  customerCreditAvailable,
  loyaltyAccount,
  onPaymentConfirmed,
  onLinesChanged,
}: SplitPaymentModalProps) {
  const { tenant } = useTenantBranding();
  const [mode, setMode] = useState<SplitMode>('full');
  const [peopleCount, setPeopleCount] = useState(2);
  const [currentPayer, setCurrentPayer] = useState<number | null>(null);
  const [paidCount, setPaidCount] = useState(0);
  const [customSplits, setCustomSplits] = useState<CustomSplit[]>([{ amount: '', paid: false }]);
  // Split Tender: one bill, several tenders each with its own amount + payment method.
  const [tenderLines, setTenderLines] = useState<CustomSplit[]>([{ amount: '', paid: false }, { amount: '', paid: false }]);
  const [tenderPayer, setTenderPayer] = useState<number | null>(null);
  // By Item: guestCount guests, lineAssignments[lineIndex] = guestIndex (1-based, 0 = unassigned).
  // Pre-populate from seats tagged at order-entry (seat-based ordering) so the waiter doesn't
  // re-assign items — Guest 1's fish/chips and Guest 2's espresso are already grouped.
  const seatMax = Math.max(2, ...orderLines.map((l) => l.seat ?? 0));
  const [guestCount, setGuestCount] = useState(seatMax);
  const [lineAssignments, setLineAssignments] = useState<number[]>(() => orderLines.map((l) => l.seat ?? 0));
  // Re-derive guest assignments whenever the LINE LIST itself changes (an item was replaced /
  // added) — stale indexes would price the wrong lines to guests. Seat tags repopulate defaults.
  const lineIdsKey = orderLines.map((l) => l.id).join('|');
  const prevLineIdsRef = useRef(lineIdsKey);
  useEffect(() => {
    if (prevLineIdsRef.current === lineIdsKey) return;
    prevLineIdsRef.current = lineIdsKey;
    setLineAssignments(orderLines.map((l) => l.seat ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineIdsKey]);
  const [itemSplitPayer, setItemSplitPayer] = useState<number | null>(null); // guest index (1-based)
  const [paidGuests, setPaidGuests] = useState<Set<number>>(new Set());
  const [cashGiven, setCashGiven] = useState('');
  // Replace-item flow (hospitality): set the original aside into Parked Items + swap in a new item.
  const [replacingLine, setReplacingLine] = useState<ReplaceableLine | null>(null);

  // Best-effort server-side persistence of splits (reporting only — never blocks payment).
  // splitIdsRef[i] holds the BillSplit id for portion i of the active layout; createdRef guards
  // a single create per layout. Reset whenever the layout (mode) or the modal's open state changes.
  const splitIdsRef = useRef<string[]>([]);
  const createdRef = useRef(false);
  useEffect(() => {
    createdRef.current = false;
    splitIdsRef.current = [];
  }, [mode, open]);

  async function ensureSplits(lines: CreateSplitInput[]) {
    if (createdRef.current || !tenantId) return;
    createdRef.current = true;
    try {
      const res = await createSplits(tenantId, orderId, lines);
      splitIdsRef.current = (res?.data ?? []).map((s) => s.id);
    } catch {
      // reporting layer only — order settlement is driven by POSPayment rows, so ignore failures
    }
  }

  async function recordSettle(idx: number, method?: string) {
    const id = splitIdsRef.current[idx];
    if (!id || !tenantId || !method) return;
    try {
      await settleSplit(tenantId, orderId, id, method);
    } catch {
      // best-effort
    }
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n);

  const equalShare = Math.ceil((total / peopleCount) * 100) / 100;

  function handleEqualPayerDone() {
    const next = paidCount + 1;
    setCurrentPayer(null);
    if (next >= peopleCount) {
      onPaymentConfirmed();
    } else {
      setPaidCount(next);
    }
  }

  // Sum of all entered split amounts. The splits must cover the full order total before any
  // payer can be charged, otherwise the bill could be settled while underpaid.
  function customEnteredTotal() {
    return customSplits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  }
  function splitsBalanced() {
    return Math.abs(customEnteredTotal() - total) < 0.01;
  }

  function handleCustomPayerDone(idx: number) {
    const updated = [...customSplits];
    updated[idx] = { ...updated[idx], paid: true };
    setCustomSplits(updated);
    setCurrentPayer(null);
    if (updated.every((s) => s.paid)) {
      onPaymentConfirmed();
    }
  }

  // Split Tender helpers (one bill across several tenders/methods).
  function tenderEnteredTotal() {
    return tenderLines.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  }
  function tenderBalanced() {
    return Math.abs(tenderEnteredTotal() - total) < 0.01;
  }
  function handleTenderLinePaid(idx: number) {
    const updated = [...tenderLines];
    updated[idx] = { ...updated[idx], paid: true };
    setTenderLines(updated);
    setTenderPayer(null);
    if (updated.every((s) => s.paid)) {
      onPaymentConfirmed();
    }
  }

  // By Item helpers
  function guestTotal(guest: number) {
    return orderLines.reduce((sum, line, i) => {
      if (lineAssignments[i] === guest) return sum + line.totalPrice;
      return sum;
    }, 0);
  }

  function unassignedLinesTotal() {
    return orderLines.reduce((sum, line, i) => {
      if (lineAssignments[i] === 0) return sum + line.totalPrice;
      return sum;
    }, 0);
  }

  // Reconcile against the AUTHORITATIVE order total (the `total` prop), not just the lines this
  // modal happens to know about — a stale/missing line or any other drift between what's shown
  // here and what the order actually totals would otherwise let every guest "fully" pay a sum
  // that never reaches what completeOrderIfFullyPaid requires, leaving the bill stuck "pending"
  // with no visible explanation (see pos-api fix for the specific cause this caught: a voided
  // line silently un-voided back into the total on a later "Add to Bill").
  function unaccountedForTotal() {
    const knownLinesTotal = orderLines.reduce((sum, line) => sum + line.totalPrice, 0);
    return Math.max(0, total - knownLinesTotal);
  }

  function unassignedTotal() {
    return unassignedLinesTotal() + unaccountedForTotal();
  }

  // ─── By-item split → BillSplit records (with item ids) + per-split receipts ───
  const itemSplitIdsRef = useRef<Record<number, string>>({});
  const [printingGuest, setPrintingGuest] = useState<number | null>(null);

  // Split into a per-guest printable bill: ensure the split exists (with its item ids) then print
  // that guest's own itemised bill. Works before payment, so each guest can get their bill.
  async function handlePrintGuestBill(guest: number) {
    setPrintingGuest(guest);
    try {
      await ensureItemSplits();
      await printGuestReceipt(guest);
    } finally {
      setPrintingGuest(null);
    }
  }

  function guestLineIds(guest: number): string[] {
    return orderLines.filter((_, i) => lineAssignments[i] === guest).map((l) => l.id).filter(Boolean);
  }

  // Create one BillSplit per guest (with their assigned line ids) once — so the backend knows which
  // items each split contains and can print a per-split receipt. Best-effort (splits are a record layer).
  async function ensureItemSplits() {
    if (!tenantId || Object.keys(itemSplitIdsRef.current).length > 0) return;
    const guests = Array.from({ length: guestCount }, (_, i) => i + 1).filter((g) => guestTotal(g) > 0);
    try {
      const res = await createSplits(
        tenantId,
        orderId,
        guests.map((g) => ({ label: `Guest ${g}`, amount: guestTotal(g), order_line_ids: guestLineIds(g) })),
      );
      const ids = (res?.data ?? []).map((s) => s.id);
      guests.forEach((g, idx) => { if (ids[idx]) itemSplitIdsRef.current[g] = ids[idx]; });
    } catch { /* best-effort */ }
  }

  // Print this guest's own itemised bill (server filters lines to the split's items), rendered
  // through the same <ReceiptPrint> component every other receipt in the app uses.
  async function printGuestReceipt(guest: number) {
    const id = itemSplitIdsRef.current[guest];
    if (!id || !tenantId) return;
    try {
      const receipt = await apiClient.get<ReceiptData>(splitReceiptDataUrl(tenantId, orderId, id));
      const html = await renderReceiptHtml(receipt, { tenantName: tenant?.orgName || tenant?.name, logoUrl: tenant?.logoUrl ?? undefined });
      printReceiptDocument(buildReceiptDocument(`Guest ${guest} Receipt`, html, paperForFormat(resolveReceiptFormat(receipt))));
    } catch { /* ignore */ }
  }

  function handleItemGuestPaid(guest: number) {
    const next = new Set(paidGuests).add(guest);
    setPaidGuests(next);
    setItemSplitPayer(null);
    // All assigned guests paid AND no unassigned items remain
    const allGuests = Array.from({ length: guestCount }, (_, i) => i + 1);
    const allPaid = allGuests.every((g) => next.has(g) || guestTotal(g) === 0);
    if (allPaid && unassignedTotal() === 0) {
      onPaymentConfirmed();
    }
  }

  if (!open) return null;

  // Sub-modal for a specific payer (full / equal / custom)
  if (currentPayer !== null) {
    const payAmount = mode === 'full' ? total : mode === 'equal' ? equalShare : parseFloat(customSplits[currentPayer].amount) || 0;
    const label = mode === 'equal' ? `Person ${currentPayer + paidCount + 1} of ${peopleCount}` : `Split ${currentPayer + 1}`;

    return (
      <POSPaymentModal
        open
        onClose={() => setCurrentPayer(null)}
        orderId={orderId}
        orderNumber={`${orderNumber} — ${label}`}
        total={payAmount}
        tenantSlug={tenantSlug}
        tenderId={tenderId}
        isHospitality={isHospitality}
        customerEmail={customerEmail}
        customerCreditAvailable={customerCreditAvailable}
        loyaltyAccount={loyaltyAccount}
        onPaymentConfirmed={(method) => {
          if (mode === 'equal') {
            handleEqualPayerDone();
          } else {
            recordSettle(currentPayer, method);
            handleCustomPayerDone(currentPayer);
          }
        }}
      />
    );
  }

  // Sub-modal for a split-tender line (one bill, this part paid with the chosen method)
  if (tenderPayer !== null) {
    const amt = parseFloat(tenderLines[tenderPayer].amount) || 0;
    return (
      <POSPaymentModal
        open
        onClose={() => setTenderPayer(null)}
        orderId={orderId}
        orderNumber={`${orderNumber} — Tender ${tenderPayer + 1}`}
        total={amt}
        tenantSlug={tenantSlug}
        tenderId={tenderId}
        isHospitality={isHospitality}
        customerEmail={customerEmail}
        customerCreditAvailable={customerCreditAvailable}
        loyaltyAccount={loyaltyAccount}
        onPaymentConfirmed={(method) => {
          recordSettle(tenderPayer, method);
          handleTenderLinePaid(tenderPayer);
        }}
      />
    );
  }

  // Sub-modal for by-item guest payer
  if (itemSplitPayer !== null) {
    const amt = guestTotal(itemSplitPayer);
    return (
      <POSPaymentModal
        open
        onClose={() => setItemSplitPayer(null)}
        orderId={orderId}
        orderNumber={`${orderNumber} — Guest ${itemSplitPayer}`}
        total={amt}
        tenantSlug={tenantSlug}
        tenderId={tenderId}
        isHospitality={isHospitality}
        customerEmail={customerEmail}
        customerCreditAvailable={customerCreditAvailable}
        loyaltyAccount={loyaltyAccount}
        onPaymentConfirmed={async (method) => {
          // Record the split (with its item ids) + mark it paid, so the per-split receipt is itemised.
          await ensureItemSplits();
          const id = itemSplitIdsRef.current[itemSplitPayer];
          if (id && tenantId && method) { try { await settleSplit(tenantId, orderId, id, method); } catch { /* best-effort */ } }
          handleItemGuestPaid(itemSplitPayer);
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <CreditCard className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <h2 className="font-bold text-base">Payment</h2>
            <p className="text-xs text-muted-foreground">Order #{orderNumber} · {fmt(total)}</p>
          </div>
          <button type="button" onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-accent transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex flex-wrap gap-1 px-5 pt-4">
          {([
            { key: 'full', label: 'Full', icon: CreditCard },
            { key: 'split_tender', label: 'Split Bill', icon: Layers },
            { key: 'equal', label: 'Equal', icon: Users },
            { key: 'custom', label: 'Custom', icon: SplitSquareHorizontal },
            ...(orderLines.length > 0 ? [{ key: 'by_item' as const, label: 'By Item', icon: ListOrdered }] : []),
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`flex-1 min-w-16 flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl text-xs font-semibold border transition-colors ${
                mode === key
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* Full payment */}
          {mode === 'full' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Process the full amount in one payment.</p>
              {/* Cash-given helper: compute change due (display only — does not alter the tender). */}
              <div className="rounded-xl border border-border p-3 space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Cash given (optional)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={cashGiven}
                  onChange={(e) => setCashGiven(e.target.value)}
                  placeholder={fmt(total)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                {parseFloat(cashGiven) > total && (
                  <div className="flex justify-between text-sm font-semibold text-emerald-600">
                    <span>Change due</span>
                    <span className="tabular-nums">{fmt(parseFloat(cashGiven) - total)}</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setCurrentPayer(0)}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Pay {fmt(total)}
              </button>
            </div>
          )}

          {/* Split Tender — one bill, several payment methods (e.g. part Cash + part M-Pesa) */}
          {mode === 'split_tender' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Split this one bill across payment methods — enter each amount, then pay it with Cash,
                M-Pesa or card. The bill closes once every part is paid.
              </p>
              {tenderLines.map((line, i) => (
                <div key={i} className={`flex items-center gap-2 p-2 rounded-xl border ${line.paid ? 'border-green-200 bg-green-50 dark:bg-green-900/10 opacity-60' : 'border-border'}`}>
                  <span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}</span>
                  <input
                    type="number"
                    placeholder="Amount"
                    value={line.amount}
                    onChange={(e) => {
                      const updated = [...tenderLines];
                      updated[i] = { ...updated[i], amount: e.target.value };
                      setTenderLines(updated);
                    }}
                    disabled={line.paid}
                    className="flex-1 h-8 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
                  />
                  {line.paid ? (
                    <span className="text-xs text-green-600 font-bold whitespace-nowrap">Paid</span>
                  ) : (
                    <button
                      type="button"
                      disabled={!line.amount || parseFloat(line.amount) <= 0 || !tenderBalanced()}
                      title={!tenderBalanced() ? 'Tender amounts must add up to the order total before charging' : undefined}
                      onClick={() => {
                        ensureSplits(tenderLines.map((l, j) => ({ label: `Tender ${j + 1}`, amount: parseFloat(l.amount) || 0 })));
                        setTenderPayer(i);
                      }}
                      className="px-2 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 hover:bg-primary/90 transition-colors whitespace-nowrap"
                    >
                      Pay
                    </button>
                  )}
                  {tenderLines.length > 1 && !line.paid && (
                    <button
                      type="button"
                      onClick={() => setTenderLines(tenderLines.filter((_, j) => j !== i))}
                      className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setTenderLines([...tenderLines, { amount: '', paid: false }])}
                className="w-full py-2 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:bg-accent transition-colors"
              >
                + Add tender
              </button>
              <div className="flex justify-between text-xs text-muted-foreground px-1">
                <span>Entered: {fmt(tenderEnteredTotal())}</span>
                <span>Total: {fmt(total)}</span>
              </div>
              {!tenderBalanced() && (
                <p className="text-xs text-destructive px-1">
                  {tenderEnteredTotal() < total
                    ? `Short by ${fmt(total - tenderEnteredTotal())} — add or increase a tender before charging.`
                    : `Over by ${fmt(tenderEnteredTotal() - total)} — reduce a tender.`}
                </p>
              )}
            </div>
          )}

          {/* Split equally */}
          {mode === 'equal' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Number of people</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPeopleCount((p) => Math.max(2, p - 1))}
                    className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-accent transition-colors"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-8 text-center text-sm font-bold tabular-nums">{peopleCount}</span>
                  <button
                    type="button"
                    onClick={() => setPeopleCount((p) => Math.min(10, p + 1))}
                    className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-accent transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="rounded-xl bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Each person pays</p>
                <p className="text-xl font-bold text-foreground">{fmt(equalShare)}</p>
              </div>
              <div className="space-y-2">
                {Array.from({ length: peopleCount }, (_, i) => {
                  const isPaid = i < paidCount;
                  const isNext = i === paidCount;
                  return (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-xl border ${isPaid ? 'border-green-200 bg-green-50 dark:bg-green-900/10' : 'border-border'}`}>
                      <span className="text-sm font-medium text-foreground">Person {i + 1}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{fmt(equalShare)}</span>
                        {isPaid ? (
                          <span className="text-xs text-green-600 font-bold">Paid</span>
                        ) : isNext ? (
                          <button
                            type="button"
                            onClick={() => setCurrentPayer(i - paidCount)}
                            className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
                          >
                            Pay
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Waiting</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* By Item split */}
          {mode === 'by_item' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Number of guests</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const n = Math.max(2, guestCount - 1);
                      setGuestCount(n);
                      setLineAssignments((prev) => prev.map((a) => (a > n ? 0 : a)));
                    }}
                    className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-accent transition-colors"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-8 text-center text-sm font-bold tabular-nums">{guestCount}</span>
                  <button
                    type="button"
                    onClick={() => setGuestCount((n) => Math.min(10, n + 1))}
                    className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-accent transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {orderLines.map((line, i) => (
                  <div key={line.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border text-sm">
                    <span className="flex-1 truncate font-medium">{line.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">×{line.quantity}</span>
                    <span className="text-xs font-semibold shrink-0 w-16 text-right">
                      {fmt(line.totalPrice)}
                    </span>
                    {/* Customer changed their mind before serving → park the original (upsell pool)
                        and swap in the new item. Hidden once this line's guest already paid. */}
                    {isHospitality && !paidGuests.has(lineAssignments[i]) && (
                      <button
                        type="button"
                        title="Replace item (original goes to Parked Items)"
                        onClick={() => setReplacingLine({ id: line.id, name: line.name, quantity: line.quantity, unitPrice: line.unitPrice })}
                        className="h-7 w-7 shrink-0 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                      >
                        <Repeat className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <select
                      value={lineAssignments[i]}
                      onChange={(e) => {
                        const updated = [...lineAssignments];
                        updated[i] = Number(e.target.value);
                        setLineAssignments(updated);
                      }}
                      className="h-7 rounded-lg border border-border bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                    >
                      <option value={0}>—</option>
                      {Array.from({ length: guestCount }, (_, g) => (
                        <option key={g + 1} value={g + 1}>Guest {g + 1}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {unassignedLinesTotal() > 0 && (
                <p className="text-xs text-amber-600 font-medium">
                  {fmt(unassignedLinesTotal())} unassigned — assign all items before collecting payment.
                </p>
              )}
              {unassignedLinesTotal() === 0 && unaccountedForTotal() > 0 && (
                <p className="text-xs text-amber-600 font-medium">
                  {fmt(unaccountedForTotal())} of this bill isn&apos;t reflected in the items shown —
                  close and reopen Split Bill to refresh before collecting payment.
                </p>
              )}

              <div className="space-y-2">
                {Array.from({ length: guestCount }, (_, g) => {
                  const guest = g + 1;
                  const amt = guestTotal(guest);
                  const paid = paidGuests.has(guest);
                  if (amt === 0) return null;
                  return (
                    <div
                      key={guest}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl border ${paid ? 'border-green-200 bg-green-50 dark:bg-green-900/10' : 'border-border'}`}
                    >
                      <span className="text-sm font-medium">Guest {guest}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{fmt(amt)}</span>
                        {/* Print this guest's OWN itemised bill — available before payment, so the
                            order can be split into separate printable bills per guest. */}
                        <button
                          type="button"
                          disabled={unassignedTotal() > 0 || printingGuest === guest}
                          onClick={() => handlePrintGuestBill(guest)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-xs font-semibold hover:bg-accent disabled:opacity-40 transition-colors"
                        >
                          {printingGuest === guest ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                          Bill
                        </button>
                        {paid ? (
                          <span className="text-xs text-green-600 font-bold">Paid</span>
                        ) : (
                          <button
                            type="button"
                            disabled={unassignedTotal() > 0}
                            onClick={() => setItemSplitPayer(guest)}
                            className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-40 transition-colors"
                          >
                            Pay
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom split */}
          {mode === 'custom' && (
            <div className="space-y-3">
              {customSplits.map((split, i) => (
                <div key={i} className={`flex items-center gap-2 p-2 rounded-xl border ${split.paid ? 'border-green-200 bg-green-50 dark:bg-green-900/10 opacity-60' : 'border-border'}`}>
                  <span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}</span>
                  <input
                    type="number"
                    placeholder="Amount"
                    value={split.amount}
                    onChange={(e) => {
                      const updated = [...customSplits];
                      updated[i] = { ...updated[i], amount: e.target.value };
                      setCustomSplits(updated);
                    }}
                    disabled={split.paid}
                    className="flex-1 h-8 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
                  />
                  {split.paid ? (
                    <span className="text-xs text-green-600 font-bold whitespace-nowrap">Paid</span>
                  ) : (
                    <button
                      type="button"
                      disabled={!split.amount || parseFloat(split.amount) <= 0 || !splitsBalanced()}
                      title={!splitsBalanced() ? 'Split amounts must add up to the order total before charging' : undefined}
                      onClick={() => {
                        ensureSplits(customSplits.map((s, j) => ({ label: `Split ${j + 1}`, amount: parseFloat(s.amount) || 0 })));
                        setCurrentPayer(i);
                      }}
                      className="px-2 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 hover:bg-primary/90 transition-colors whitespace-nowrap"
                    >
                      Pay
                    </button>
                  )}
                  {customSplits.length > 1 && !split.paid && (
                    <button
                      type="button"
                      onClick={() => setCustomSplits(customSplits.filter((_, j) => j !== i))}
                      className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setCustomSplits([...customSplits, { amount: '', paid: false }])}
                className="w-full py-2 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:bg-accent transition-colors"
              >
                + Add payer
              </button>
              <div className="flex justify-between text-xs text-muted-foreground px-1">
                <span>Entered: {fmt(customEnteredTotal())}</span>
                <span>Total: {fmt(total)}</span>
              </div>
              {!splitsBalanced() && (
                <p className="text-xs text-destructive px-1">
                  {customEnteredTotal() < total
                    ? `Short by ${fmt(total - customEnteredTotal())} — add or increase a payer before charging.`
                    : `Over by ${fmt(customEnteredTotal() - total)} — reduce a payer.`}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Replace-item flow: original line → Parked Items, replacement → kitchen. The caller
          refetches orderLines; the lineIdsKey effect above re-derives guest assignments when the
          fresh list arrives. */}
      <ReplaceItemDialog
        open={replacingLine !== null}
        onClose={() => setReplacingLine(null)}
        orderId={orderId}
        line={replacingLine}
        onDone={() => {
          toast.info('Items updated — check guest assignments before collecting payment.');
          onLinesChanged?.();
        }}
      />
    </div>
  );
}
