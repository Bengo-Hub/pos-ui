'use client';

import { useState } from 'react';
import { Loader2, Pencil, Trash2, Printer, Mail, Check, X as XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button } from '@/components/ui/base';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { usePermissions, P } from '@/hooks/usePermissions';
import {
  useOrderPayments, useUpdateOrderPayment, useVoidOrderPayment, useNotifyOrderPayment,
} from '@/hooks/usePOS';
import { ModalFrame, money, prettyMethod } from './sales-shared';

/**
 * ViewPaymentsModal — the detailed payments view for a sale: Date / Reference / Method /
 * Note / Amount / Status, with per-row Edit (reference/note/date — never the amount) and
 * Void actions (manager-only, manual tenders only — the backend enforces both), plus
 * Print and Send Payment Received Notification.
 */
export function ViewPaymentsModal({ order, onClose }: { order: any; onClose: () => void }) {
  const { can } = usePermissions();
  const canManage = can(P.PAYMENTS_MANAGE);
  const { data, isLoading } = useOrderPayments(order.id);
  const payments: any[] = (data as any)?.data ?? data ?? [];

  const [editing, setEditing] = useState<any | null>(null);
  const [voiding, setVoiding] = useState<any | null>(null);
  const updatePayment = useUpdateOrderPayment();
  const voidPayment = useVoidOrderPayment();
  const notifyPayment = useNotifyOrderPayment();

  const handleVoid = () => {
    if (!voiding) return;
    voidPayment.mutate(
      { orderId: order.id, paymentId: voiding.id, reason: 'Voided from View Payments' },
      {
        onSuccess: () => { toast.success('Payment voided'); setVoiding(null); },
        onError: (e: any) => toast.error(e?.response?.data?.error || 'Void failed'),
      },
    );
  };

  const sendNotification = (p: any) => {
    notifyPayment.mutate(
      { orderId: order.id, paymentId: p.id },
      {
        onSuccess: () => toast.success('Payment notification queued'),
        onError: (e: any) => toast.error(e?.response?.data?.error || 'Could not send notification'),
      },
    );
  };

  const printPayments = () => {
    const rows = payments.map((p) =>
      `<tr><td>${p.occurred_at ? new Date(p.occurred_at).toLocaleDateString('en-KE') : '—'}</td>` +
      `<td>${p.external_reference || String(p.id ?? '').slice(0, 10)}</td>` +
      `<td>${prettyMethod(p.tender_type || '')}</td><td>${p.note || ''}</td>` +
      `<td style="text-align:right">${money(p.amount)}</td><td>${p.status}</td></tr>`).join('');
    const w = window.open('', '_blank', 'width=720,height=560');
    if (!w) { toast.error('Pop-up blocked — allow pop-ups to print'); return; }
    w.document.write(
      `<html><head><title>Payments — ${order.order_number}</title>` +
      `<style>body{font-family:sans-serif;padding:24px}table{width:100%;border-collapse:collapse;font-size:13px}` +
      `th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}</style></head><body>` +
      `<h3>Payments — ${order.order_number}</h3>` +
      `<table><thead><tr><th>Date</th><th>Reference</th><th>Method</th><th>Note</th><th>Amount</th><th>Status</th></tr></thead>` +
      `<tbody>${rows}</tbody></table></body></html>`,
    );
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <ModalFrame title={`Payments — ${order.order_number}`} onClose={onClose} wide>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : payments.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">No payments recorded.</p>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Reference No</th>
                  <th className="py-2 pr-3">Method</th><th className="py-2 pr-3">Note</th>
                  <th className="py-2 pr-3 text-right">Amount</th><th className="py-2 pr-3">Status</th>
                  {canManage && <th className="py-2">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((p: any, i: number) => (
                  <tr key={p.id ?? i} className="border border-border/50">
                    <td className="py-2 pr-3">{p.occurred_at ? new Date(p.occurred_at).toLocaleDateString('en-KE') : '—'}</td>
                    <td className="py-2 pr-3 text-xs font-mono">{p.external_reference || String(p.id ?? '').slice(0, 10)}</td>
                    <td className="py-2 pr-3 text-xs">{p.tender_name || prettyMethod(p.tender_type || '')}</td>
                    <td className="py-2 pr-3 text-xs max-w-[160px] truncate" title={p.note}>{p.note || '—'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(p.amount)}</td>
                    <td className="py-2 pr-3">
                      {p.status === 'completed' ? <Badge variant="success">Completed</Badge>
                        : p.status === 'voided' ? <Badge variant="error">Voided</Badge>
                        : <Badge variant="warning" className="capitalize">{p.status}</Badge>}
                    </td>
                    {canManage && (
                      <td className="py-2">
                        <div className="flex items-center gap-1">
                          {p.voidable && (
                            <>
                              <button title="Edit payment" className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent"
                                onClick={() => setEditing({ id: p.id, reference: p.external_reference || '', note: p.note || '' })}>
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                              <button title="Void payment" className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-destructive/10"
                                onClick={() => setVoiding(p)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </button>
                            </>
                          )}
                          {p.status === 'completed' && (
                            <button title="Send payment received notification" className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent"
                              onClick={() => sendNotification(p)} disabled={notifyPayment.isPending}>
                              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editing && (
            <div className="rounded-xl border border-border p-3 space-y-2 bg-accent/10">
              <div className="text-xs font-bold">Edit payment (amount is not editable — void &amp; re-record to change money)</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] font-semibold text-muted-foreground">Reference No
                  <input className="w-full bg-background border border-border rounded-md py-1.5 px-2 text-xs"
                    value={editing.reference} onChange={(e) => setEditing({ ...editing, reference: e.target.value })} />
                </label>
                <label className="text-[11px] font-semibold text-muted-foreground">Note
                  <input className="w-full bg-background border border-border rounded-md py-1.5 px-2 text-xs"
                    value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setEditing(null)}><XIcon className="h-3.5 w-3.5" /> Cancel</Button>
                <Button size="sm" className="gap-1" disabled={updatePayment.isPending}
                  onClick={() => updatePayment.mutate(
                    { orderId: order.id, paymentId: editing.id, reference: editing.reference, note: editing.note },
                    {
                      onSuccess: () => { toast.success('Payment updated'); setEditing(null); },
                      onError: (e: any) => toast.error(e?.response?.data?.error || 'Update failed'),
                    },
                  )}>
                  {updatePayment.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-border">
            <div className="text-xs text-muted-foreground">
              Total: <span className="font-semibold text-foreground">{money(order.total_amount)}</span>
              {' · '}Paid: <span className="font-semibold text-foreground">{money(order.total_paid ?? order.paid_total ?? 0)}</span>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={printPayments}>
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)} title="Void payment?"
        description={`This voids ${money(voiding?.amount ?? 0)} on ${order.order_number}: the paid total is recomputed, a fully-paid sale reopens, and the reversal is posted to treasury.`}
        confirmLabel="Void payment" variant="danger" onConfirm={handleVoid} />
    </ModalFrame>
  );
}
