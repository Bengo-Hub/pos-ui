'use client';

import { useState } from 'react';
import { Loader2, Pencil, Check, X as XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/base';
import { useOrder, useEditOrderLine } from '@/hooks/usePOS';
import { ModalFrame, money } from './sales-shared';

const LOCKED_STATUSES = new Set(['completed', 'cancelled', 'voided', 'refunded']);

/**
 * EditOrderLinesModal — the admin corrective tool for a mispriced/miscounted sale: lets a
 * manager fix a line's unit price and/or quantity directly, instead of the raw database fix
 * this used to require. Each save is one line at a time so the backend can recompute order
 * totals and write a complete before/after audit entry per change.
 */
export function EditOrderLinesModal({ order: initialOrder, onClose }: { order: any; onClose: () => void }) {
  const { data: freshOrder } = useOrder(initialOrder.id);
  const order = freshOrder ?? initialOrder;
  const lines: any[] = order.edges?.lines ?? [];
  const locked = LOCKED_STATUSES.has(order.status);

  const [editing, setEditing] = useState<{ lineId: string; unitPrice: string; quantity: string; reason: string; updateCatalog: boolean } | null>(null);
  const editLine = useEditOrderLine();

  const startEdit = (l: any) =>
    setEditing({ lineId: l.id, unitPrice: String(l.unit_price), quantity: String(l.quantity), reason: '', updateCatalog: false });

  const save = () => {
    if (!editing) return;
    const unitPrice = Number(editing.unitPrice);
    const quantity = Number(editing.quantity);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) { toast.error('Unit price must be a non-negative number'); return; }
    if (!Number.isFinite(quantity) || quantity <= 0) { toast.error('Quantity must be a positive number'); return; }
    if (!editing.reason.trim()) { toast.error('A reason is required'); return; }
    const priceChanged = unitPrice !== Number(lines.find((l) => l.id === editing.lineId)?.unit_price);
    editLine.mutate(
      { orderId: order.id, lineId: editing.lineId, unitPrice, quantity, reason: editing.reason.trim(), updateCatalogPrice: editing.updateCatalog && priceChanged },
      {
        onSuccess: (d: any) => { toast.success(d?.catalog_price_updated ? 'Line updated · inventory price updated' : 'Line updated'); setEditing(null); },
        onError: (e: any) => toast.error(e?.response?.data?.error || 'Update failed'),
      },
    );
  };

  return (
    <ModalFrame title={`Edit Line Prices — ${order.order_number}`} onClose={onClose} wide>
      {locked ? (
        <p className="text-center text-sm text-muted-foreground py-6">
          This sale is {order.status} and its lines can no longer be edited.
        </p>
      ) : lines.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">No line items on this sale.</p>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Item</th><th className="py-2 pr-3">SKU</th>
                  <th className="py-2 pr-3 text-right">Qty</th><th className="py-2 pr-3 text-right">Unit Price</th>
                  <th className="py-2 pr-3 text-right">Total</th><th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((l: any) => (
                  <tr key={l.id} className="border border-border/50">
                    <td className="py-2 pr-3">{l.name}</td>
                    <td className="py-2 pr-3 text-xs font-mono">{l.sku || '—'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{l.quantity}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(l.unit_price)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-semibold">{money(l.total_price)}</td>
                    <td className="py-2">
                      {!l.voided_qty && (
                        <button title="Edit price/quantity" className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent"
                          onClick={() => startEdit(l)}>
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editing && (
            <div className="rounded-xl border border-border p-3 space-y-2 bg-accent/10">
              <div className="text-xs font-bold">Edit line — {lines.find((l) => l.id === editing.lineId)?.name}</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] font-semibold text-muted-foreground">Unit Price
                  <input type="number" step="0.01" min="0" className="w-full bg-background border border-border rounded-md py-1.5 px-2 text-xs"
                    value={editing.unitPrice} onChange={(e) => setEditing({ ...editing, unitPrice: e.target.value })} />
                </label>
                <label className="text-[11px] font-semibold text-muted-foreground">Quantity
                  {/* step relaxed to allow a decimal correction (e.g. a fractional-unit line like
                      ml/kg) — no per-line unit signal is available here to gate it, and a manager
                      typing a decimal for a whole-count item is a deliberate override, not a mistake. */}
                  <input type="number" step="0.01" min="0.01" className="w-full bg-background border border-border rounded-md py-1.5 px-2 text-xs"
                    value={editing.quantity} onChange={(e) => setEditing({ ...editing, quantity: e.target.value })} />
                </label>
              </div>
              <label className="text-[11px] font-semibold text-muted-foreground block">Reason (required)
                <input className="w-full bg-background border border-border rounded-md py-1.5 px-2 text-xs"
                  placeholder="e.g. stale cached price at time of sale"
                  value={editing.reason} onChange={(e) => setEditing({ ...editing, reason: e.target.value })} />
              </label>
              <label className="flex items-start gap-2 text-[11px] cursor-pointer">
                <input type="checkbox" checked={editing.updateCatalog}
                  onChange={(e) => setEditing({ ...editing, updateCatalog: e.target.checked })} className="rounded mt-0.5" />
                <span>Also update the item&apos;s price in inventory <span className="text-muted-foreground">(applies to future sales; only when the unit price changed)</span></span>
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setEditing(null)}><XIcon className="h-3.5 w-3.5" /> Cancel</Button>
                <Button size="sm" className="gap-1" disabled={editLine.isPending} onClick={save}>
                  {editLine.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
                </Button>
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground pt-1 border-t border-border">
            Total: <span className="font-semibold text-foreground">{money(order.total_amount)}</span>
            {' · '}Every change is written to the audit log with the before/after values and your reason.
          </div>
        </div>
      )}
    </ModalFrame>
  );
}
