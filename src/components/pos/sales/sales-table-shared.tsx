'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { money, prettyMethod, ModalFrame } from './sales-shared';
import type { BulkOrderSkip, OrdersSummary } from '@/hooks/usePOS';

/**
 * sales-table-shared — the POS-specific bits the Sales (all-sales / pos-sales) and Drafts
 * DataTable surfaces both need, extracted from the two hand-rolled table shells they replaced:
 * the expanded line-items panel, the cashier-name resolution rule, the bulk-result toast
 * summary, the bulk-void reason dialog and the sales aggregate footer.
 */

/** Resolve the display cashier: pos-api's server-resolved `cashier_name` first, the legacy
 *  client-side staff lookup only as a fallback for rows where it came back empty. */
export function cashierNameOf(order: any, staffNameByUserId: Record<string, string>): string {
  return order.cashier_name || staffNameByUserId[order.user_id] || '';
}

/** Expanded row panel: a sale/draft's line items (treasury SharedDocumentList pattern). */
export function OrderLinesPanel({ order, noun }: { order: any; noun: 'sale' | 'draft' }) {
  const lines: any[] = order.edges?.lines ?? order.lines ?? [];
  if (lines.length === 0) {
    return <div className="text-xs text-muted-foreground py-1">No line items on this {noun}.</div>;
  }
  const h = 'py-1.5 px-2 border border-border/40 font-semibold';
  const c = 'py-1.5 px-2 border border-border/40';
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="text-muted-foreground uppercase tracking-wider">
          <th className={`${h} text-left`}>Item</th>
          <th className={`${h} text-left`}>SKU</th>
          <th className={`${h} text-right`}>Qty</th>
          <th className={`${h} text-right`}>Unit Price</th>
          <th className={`${h} text-right`}>Total</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l: any) => (
          <tr key={l.id}>
            <td className={c}>{l.name}</td>
            <td className={`${c} font-mono`}>{l.sku || '—'}</td>
            <td className={`${c} text-right tabular-nums`}>{l.quantity}</td>
            <td className={`${c} text-right tabular-nums`}>{money(l.unit_price, order.currency)}</td>
            <td className={`${c} text-right tabular-nums font-semibold`}>{money(l.total_price, order.currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Human labels for pos-api's machine-readable bulk skip reasons.
const SKIP_REASON_LABELS: Record<string, string> = {
  invalid_id: 'invalid id',
  not_found: 'not found',
  not_draft: 'not a draft',
  not_owner: 'not your draft',
  already_voided: 'already voided',
  finalized: 'finalized — reverse via a return/refund',
  internal_error: 'server error',
};

/** "3 skipped (2 finalized — …, 1 already voided)" — for the bulk-result toast description. */
export function skippedSummary(skipped: BulkOrderSkip[] | undefined): string {
  if (!skipped?.length) return '';
  const counts = new Map<string, number>();
  for (const s of skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  const parts = [...counts.entries()].map(
    ([reason, n]) => `${n} ${SKIP_REASON_LABELS[reason] ?? reason.replace(/_/g, ' ')}`,
  );
  return `${skipped.length} skipped (${parts.join(', ')})`;
}

/**
 * BulkVoidReasonDialog — the shared-reason prompt for the sales bulk "Void" action (the same
 * ModalFrame pattern the other sales modals use). The reason is required — pos-api rejects a
 * bulk void without one — and lands on every voided order's audit entry.
 */
export function BulkVoidReasonDialog({ count, onClose, onConfirm, loading }: {
  count: number;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading?: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <ModalFrame title={`Void ${count} sale${count === 1 ? '' : 's'}?`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Voiding reverses these sales in reporting and stops any open kitchen tickets. Finalized
          (completed/paid) and already-voided sales are skipped by the server. A reason is required
          and is recorded on each sale's audit trail.
        </p>
        <label className="block text-xs font-semibold text-muted-foreground">
          Void reason
          <textarea
            className="mt-1 w-full bg-accent/30 border border-border rounded-lg py-2 px-3 text-sm min-h-20"
            placeholder="e.g. Duplicate test orders from training session"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={loading || !reason.trim()}
            onClick={() => onConfirm(reason.trim())}
          >
            {loading ? 'Voiding…' : `Void ${count} sale${count === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>
    </ModalFrame>
  );
}

// Human labels + display order for the summary's payment-status breakdown (matches the
// per-row status badge vocabulary in sales-shared).
const STATUS_LABELS: Record<string, string> = {
  paid: 'Paid', partial: 'Partial', due: 'Due', overdue: 'Overdue',
  refunded: 'Refunded', voided: 'Voided', cancelled: 'Cancelled', draft: 'Draft',
};
const STATUS_ORDER = ['paid', 'partial', 'due', 'overdue', 'refunded', 'voided', 'cancelled', 'draft'];
// Statuses excluded from Total/Paid/Sell Due/Items above (see nonCommittedOrderStatus in
// orders.go) — flagged here so the breakdown chip can visually distinguish "doesn't count
// toward the headline totals" without hiding the row entirely.
const NON_COMMITTED_STATUSES = new Set(['voided', 'cancelled', 'draft']);

/**
 * SalesSummaryFooter — grand totals across the WHOLE filtered set (every page), rendered as a
 * strip under the DataTable. Replaces the old hand-rolled <tfoot> row; fed by useOrdersSummary
 * so the figures stay put while the user pages through rows.
 */
export function SalesSummaryFooter({ summary }: { summary: OrdersSummary }) {
  // Aggregate across the whole filtered set (potentially multiple orders/outlets) — no single
  // order to read .currency off, so this is the one spot that needs the tenant-wide setting.
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';
  const stat = (label: string, value: React.ReactNode) => (
    <div className="min-w-24">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
  return (
    <div className="rounded-lg border border-border bg-accent/20 px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
        {stat('Total Sales', summary.total_matching.toLocaleString())}
        {stat('Items', summary.item_count.toLocaleString())}
        {stat('Total', money(summary.sum_total, currency))}
        {stat('Paid', money(summary.sum_paid, currency))}
        {stat('Sell Due', money(summary.sum_due, currency))}
        {stat('Sell Return', summary.sum_return > 0.01
          ? <span className="text-red-600">{money(summary.sum_return, currency)}</span>
          : money(0, currency))}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
        {STATUS_ORDER.some((s) => summary.status_counts?.[s]) && (
          <span className="flex flex-wrap gap-x-3">
            {STATUS_ORDER.filter((s) => summary.status_counts?.[s]).map((s) => (
              <span
                key={s}
                className={cn('whitespace-nowrap', NON_COMMITTED_STATUSES.has(s) && 'text-amber-600')}
                title={NON_COMMITTED_STATUSES.has(s) ? 'Not counted in Total/Paid/Sell Due above' : undefined}
              >
                {STATUS_LABELS[s]} - {summary.status_counts[s]} ({money(summary.status_amounts?.[s] ?? 0, currency)})
              </span>
            ))}
          </span>
        )}
        {Object.keys(summary.method_counts ?? {}).length > 0 && (
          <span className="flex flex-wrap gap-x-3">
            {Object.entries(summary.method_counts ?? {})
              .sort((a, b) => b[1] - a[1])
              .map(([m, n]) => (
                <span key={m} className="whitespace-nowrap">
                  {prettyMethod(m)} - {n} ({money(summary.method_amounts?.[m] ?? 0, currency)})
                </span>
              ))}
          </span>
        )}
        {summary.truncated && (
          <span
            className="text-amber-600"
            title={`Amounts cover the ${summary.count.toLocaleString()} most recent of ${summary.total_matching.toLocaleString()} matching sales. Narrow the date range for an exact figure.`}
          >
            (amounts: top {summary.count.toLocaleString()})
          </span>
        )}
      </div>
    </div>
  );
}
