'use client';

/**
 * GoDigital-style POS toolbar modals — Register Details (Z-report-style shift summary), Recent
 * Transactions, and Sell Return. These open as modals/popovers from the terminal toolbar instead of
 * navigating away from the POS, so the cashier never loses the in-progress sale.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, X, RotateCcw, ClipboardList, Wallet } from 'lucide-react';
import { useOrders } from '@/hooks/usePOS';
import { useSessionSummary, useCurrentShift } from '@/hooks/useShifts';

function fmt(n: number | undefined) {
  return `KES ${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ModalShell({ title, icon: Icon, onClose, children, wide }: {
  title: string; icon: React.ElementType; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className={`bg-card rounded-2xl border border-border shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[88vh] flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            <h2 className="font-bold text-base">{title}</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

// prettyTender turns a tender type/name into a readable label, covering every payment method/option.
function prettyTender(t: { name?: string; type?: string }): string {
  const raw = (t.name || t.type || 'Other').toString();
  const map: Record<string, string> = {
    cash: 'Cash',
    card: 'Card (Online)',
    card_manual: 'Card / PDQ',
    pdq: 'Card / PDQ',
    card_terminal: 'Card Terminal',
    mpesa: 'M-Pesa Express',
    mpesa_stk: 'M-Pesa Express',
    mpesa_c2b: 'M-Pesa Paybill/Till',
    manual: 'M-Pesa (Code)',
    wallet: 'Wallet',
    on_account: 'On Account (Credit)',
    cod: 'Cash on Delivery',
    bank_transfer: 'Bank Transfer',
    room_charge: 'Room Charge',
  };
  const key = raw.toLowerCase().replace(/[\s-]+/g, '_');
  return map[key] ?? raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Register Details (current shift Z-report) — live tender breakdown, grouped by payment method ──
export function RegisterDetailsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: shift } = useCurrentShift();
  const isOpen = shift?.session_status === 'open';
  const { data: summary, isLoading } = useSessionSummary(open && isOpen);
  if (!open) return null;

  // Group the live tender breakdown by readable payment method (merges aliases e.g. pdq+card_manual).
  const grouped = new Map<string, { amount: number; count: number }>();
  for (const t of summary?.tender_breakdown ?? []) {
    const label = prettyTender(t);
    const cur = grouped.get(label) ?? { amount: 0, count: 0 };
    grouped.set(label, { amount: cur.amount + (t.amount ?? 0), count: cur.count + (t.count ?? 0) });
  }
  const tenders = Array.from(grouped.entries()).sort((a, b) => b[1].amount - a[1].amount);

  return (
    <ModalShell title="Register Details" icon={Wallet} onClose={onClose}>
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !isOpen ? (
        <p className="text-center text-sm text-muted-foreground py-8">No open shift. Start a shift to see register details.</p>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Shift opened {shift?.opened_at ? new Date(shift.opened_at).toLocaleString('en-KE') : '—'}
          </p>
          <div className="rounded-xl border border-border divide-y divide-border">
            <div className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-muted-foreground">Opening Float</span>
              <span className="font-semibold tabular-nums">{fmt(summary?.opening_float)}</span>
            </div>
            {/* Live breakdown — one row per payment method actually used this shift. */}
            {tenders.length === 0 ? (
              <div className="px-4 py-3 text-center text-xs text-muted-foreground">No payments taken yet this shift.</div>
            ) : (
              tenders.map(([label, v]) => (
                <div key={label} className="flex justify-between px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground">{label} <span className="text-[10px]">×{v.count}</span></span>
                  <span className="font-semibold tabular-nums">{fmt(v.amount)}</span>
                </div>
              ))
            )}
            {(summary?.total_refunds ?? 0) > 0 && (
              <div className="flex justify-between px-4 py-2.5 text-sm text-red-600">
                <span>Refunds <span className="text-[10px]">×{summary?.refund_count ?? 0}</span></span>
                <span className="font-semibold tabular-nums">- {fmt(summary?.total_refunds)}</span>
              </div>
            )}
            <div className="flex justify-between px-4 py-2.5 text-sm font-bold bg-muted/30">
              <span>Total Revenue</span>
              <span className="tabular-nums text-emerald-600">{fmt(summary?.total_revenue)}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5 text-base font-extrabold">
              <span>Expected Cash in Drawer</span>
              <span className="tabular-nums text-primary">{fmt(summary?.expected_cash)}</span>
            </div>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground px-1">
            <span>Orders: <b className="text-foreground">{summary?.order_count ?? 0}</b></span>
            <span>Voids: <b className="text-foreground">{summary?.void_count ?? 0}</b></span>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ── Recent Transactions ─────────────────────────────────────────────────────────
const STATUS_TONE: Record<string, string> = {
  completed: 'bg-emerald-500/10 text-emerald-600',
  open: 'bg-blue-500/10 text-blue-600',
  pending_payment: 'bg-amber-500/10 text-amber-600',
  draft: 'bg-gray-500/10 text-gray-500',
  cancelled: 'bg-red-500/10 text-red-600',
  voided: 'bg-red-500/10 text-red-600',
  refunded: 'bg-purple-500/10 text-purple-600',
};

export function RecentTransactionsModal({ open, onClose, orgSlug }: { open: boolean; onClose: () => void; orgSlug: string }) {
  const router = useRouter();
  const { data, isLoading } = useOrders({ limit: 25, page: 1 });
  if (!open) return null;
  const orders = data?.data ?? [];
  return (
    <ModalShell title="Recent Transactions" icon={ClipboardList} onClose={onClose} wide>
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : orders.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">No recent transactions.</p>
      ) : (
        <div className="space-y-1.5">
          {orders.map((o) => (
            <button
              key={o.id}
              onClick={() => { router.push(`/${orgSlug}/orders/${o.id}`); onClose(); }}
              className="w-full flex items-center justify-between gap-3 rounded-lg border border-border hover:border-primary/50 hover:bg-accent px-3 py-2.5 text-left transition-colors"
            >
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{o.order_number}</p>
                <p className="text-[11px] text-muted-foreground">{new Date(o.created_at).toLocaleString('en-KE')}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold capitalize ${STATUS_TONE[o.status] ?? 'bg-muted text-muted-foreground'}`}>
                  {o.status.replace(/_/g, ' ')}
                </span>
                <span className="font-bold text-sm tabular-nums">{fmt(o.total_amount)}</span>
              </div>
            </button>
          ))}
          <button
            onClick={() => { router.push(`/${orgSlug}/orders`); onClose(); }}
            className="w-full mt-2 py-2 rounded-lg border border-dashed border-border text-xs font-semibold text-muted-foreground hover:bg-accent"
          >
            View all sales →
          </button>
        </div>
      )}
    </ModalShell>
  );
}

// ── Sell Return (invoice lookup) ────────────────────────────────────────────────
export function SellReturnModal({ open, onClose, orgSlug }: { open: boolean; onClose: () => void; orgSlug: string }) {
  const router = useRouter();
  const [invoice, setInvoice] = useState('');
  if (!open) return null;
  const submit = () => {
    const inv = invoice.trim();
    router.push(inv ? `/${orgSlug}/returns?invoice=${encodeURIComponent(inv)}` : `/${orgSlug}/returns`);
    onClose();
  };
  return (
    <ModalShell title="Sell Return" icon={RotateCcw} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Enter the invoice / receipt number to start a return.</p>
        <input
          autoFocus
          value={invoice}
          onChange={(e) => setInvoice(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="Invoice No."
          className="w-full bg-background border border-border rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          onClick={submit}
          className="w-full min-h-11 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors"
        >
          Find Sale →
        </button>
      </div>
    </ModalShell>
  );
}
