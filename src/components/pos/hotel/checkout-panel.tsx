'use client';

/**
 * Hotel checkout / settlement panel. Shows the full bill for a room's active guest — who booked, the
 * nights, the room rate, every folio charge, payments already taken, and the outstanding balance —
 * and lets the front desk record a payment (cash / card-PDQ / M-Pesa) against the folio, optionally
 * checking the guest out when the balance clears. Payment history is listed so settled payments are
 * tracked. Mirrors the inline POS tenders for consistency.
 */

import { useState, useEffect } from 'react';
import { Loader2, X, Banknote, CreditCard, Smartphone, CheckCircle2, BedDouble } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFolioSummary, useSettleFolio } from '@/hooks/useHotel';
import { apiErrorMessage } from '@/lib/api/error-message';
import { toast } from 'sonner';

interface CheckoutPanelProps {
  roomId: string;
  open: boolean;
  onClose: () => void;
  onCheckedOut?: () => void;
}

const METHODS: { key: string; label: string; icon: React.ElementType }[] = [
  { key: 'cash', label: 'Cash', icon: Banknote },
  { key: 'card_manual', label: 'Card / PDQ', icon: CreditCard },
  { key: 'mpesa', label: 'M-Pesa', icon: Smartphone },
];

export function CheckoutPanel({ roomId, open, onClose, onCheckedOut }: CheckoutPanelProps) {
  const { data: summary, isLoading } = useFolioSummary(roomId, open);
  const settle = useSettleFolio(roomId);
  const [method, setMethod] = useState('cash');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [checkoutOnSettle, setCheckoutOnSettle] = useState(true);

  const balance = summary?.balance ?? 0;
  const currency = summary?.currency ?? 'KES';
  const fmt = (n: number) => `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Default the amount to the outstanding balance whenever the bill (re)loads.
  useEffect(() => {
    if (summary) setAmount(String(Math.max(0, Math.round(balance))));
  }, [summary?.balance]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const handleSettle = () => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) { toast.error('Enter a payment amount.'); return; }
    settle.mutate(
      { amount: amt, method, reference: reference.trim() || undefined, checkout: checkoutOnSettle },
      {
        onSuccess: (res) => {
          setReference('');
          if (res.checked_out) {
            toast.success('Bill settled — guest checked out.');
            onCheckedOut?.();
            onClose();
          } else if (res.status === 'completed') {
            toast.success(`Payment of ${fmt(amt)} recorded.`);
          } else {
            toast.info('Payment started — complete it on the customer prompt.');
          }
        },
        onError: async (e: any) => toast.error(await apiErrorMessage(e, 'Failed to record payment.')),
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <BedDouble className="h-5 w-5 text-indigo-600" />
            <h2 className="font-bold text-base">Checkout · Room {summary?.room_number ?? ''}</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>

        {isLoading || !summary ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Guest + stay */}
            <div className="rounded-xl bg-indigo-500/5 border border-indigo-500/15 p-4 space-y-1">
              <p className="font-bold text-sm">{summary.guest_name}</p>
              {summary.phone && <p className="text-xs text-muted-foreground">{summary.phone}</p>}
              <div className="flex justify-between text-xs pt-1">
                <span className="text-muted-foreground">Nights</span>
                <span className="font-semibold">{summary.nights} @ {fmt(summary.rate_per_night)}/night</span>
              </div>
            </div>

            {/* Charges */}
            <div className="rounded-xl border border-border divide-y divide-border">
              {summary.items.map((it) => (
                <div key={it.id} className="flex justify-between px-4 py-2 text-sm">
                  <span className="text-muted-foreground capitalize">{it.description || it.charge_type.replace(/_/g, ' ')}</span>
                  <span className="font-medium tabular-nums">{fmt(it.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between px-4 py-2 text-sm font-bold">
                <span>Total charges</span>
                <span className="tabular-nums">{fmt(summary.charges_total)}</span>
              </div>
              {summary.paid_total > 0 && (
                <div className="flex justify-between px-4 py-2 text-sm text-emerald-600">
                  <span>Paid</span>
                  <span className="tabular-nums">- {fmt(summary.paid_total)}</span>
                </div>
              )}
              <div className="flex justify-between px-4 py-2.5 text-base font-extrabold bg-muted/30">
                <span>Balance Due</span>
                <span className="tabular-nums text-indigo-600">{fmt(balance)}</span>
              </div>
            </div>

            {/* Payment history */}
            {summary.payments.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Payment history</p>
                <div className="space-y-1">
                  {summary.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-xs rounded-lg bg-accent/30 px-3 py-1.5">
                      <span className="capitalize font-medium">{p.method.replace(/_/g, ' ')}{p.reference ? ` · ${p.reference}` : ''}</span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums font-semibold">{fmt(p.amount)}</span>
                        <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-bold',
                          p.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600')}>
                          {p.status}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Take payment */}
            {balance > 0.009 && (
              <div className="rounded-xl border border-border p-4 space-y-3">
                <p className="text-sm font-bold">Take Payment</p>
                <div className="grid grid-cols-3 gap-2">
                  {METHODS.map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.key} type="button" onClick={() => setMethod(m.key)}
                        className={cn('flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-xs font-semibold transition-colors',
                          method === m.key ? 'border-indigo-500 bg-indigo-500/5 text-indigo-600' : 'border-border text-muted-foreground hover:bg-accent')}
                      >
                        <Icon className="h-4.5 w-4.5" />
                        {m.label}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Amount</span>
                    <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
                      className="mt-0.5 w-full bg-background border border-border rounded-lg py-2 px-3 text-base font-bold tabular-nums focus:ring-2 focus:ring-indigo-500/40 focus:outline-none" />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Ref (optional)</span>
                    <input type="text" value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} placeholder="Code / approval"
                      className="mt-0.5 w-full bg-background border border-border rounded-lg py-2 px-3 text-sm uppercase focus:ring-2 focus:ring-indigo-500/40 focus:outline-none" />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-xs font-medium">
                  <input type="checkbox" checked={checkoutOnSettle} onChange={(e) => setCheckoutOnSettle(e.target.checked)} className="accent-indigo-600" />
                  Check guest out when the balance clears
                </label>
                <button
                  type="button" disabled={settle.isPending} onClick={handleSettle}
                  className="w-full min-h-11 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-indigo-700 transition-colors"
                >
                  {settle.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                  Record Payment {parseFloat(amount) > 0 ? `· ${fmt(parseFloat(amount))}` : ''}
                </button>
              </div>
            )}

            {balance <= 0.009 && (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-center text-sm font-semibold text-emerald-700">
                Bill fully settled. You can check the guest out.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
