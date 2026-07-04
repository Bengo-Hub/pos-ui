'use client';

import { useState } from 'react';
import { X, Loader2, Utensils } from 'lucide-react';
import { toast } from 'sonner';
import { useAddOrderLines } from '@/hooks/usePOS';

// Common order accessories for takeaway/delivery. Each can be added free (charge off) or billed.
const DEFAULT_ACCESSORIES: { name: string; price: number }[] = [
  { name: 'Spoon', price: 5 },
  { name: 'Fork', price: 5 },
  { name: 'Knife', price: 5 },
  { name: 'Napkin', price: 5 },
  { name: 'Packaging container', price: 20 },
  { name: 'Carrier bag', price: 10 },
  { name: 'Straw', price: 3 },
  { name: 'Sauce sachet', price: 10 },
];

interface AccessoriesModalProps {
  open: boolean;
  orderId: string;
  orderNumber: string;
  onClose: () => void;
  onAdded?: () => void;
}

interface Row { name: string; price: number; qty: number; charge: boolean }

/**
 * AccessoriesModal lets a waiter add order accessories (spoon, knife, packaging, …) to a
 * takeaway/delivery order. Each accessory can be BILLED (charged) or added FREE of charge. Added as
 * order lines (unit_price 0 when free) tagged metadata.accessory so they read as add-ons on the bill.
 */
export function AccessoriesModal({ open, orderId, orderNumber, onClose, onAdded }: AccessoriesModalProps) {
  const addLines = useAddOrderLines();
  const [rows, setRows] = useState<Record<string, Row>>({});

  if (!open) return null;

  const toggle = (a: { name: string; price: number }) => {
    setRows((prev) => {
      const next = { ...prev };
      if (next[a.name]) delete next[a.name];
      else next[a.name] = { name: a.name, price: a.price, qty: 1, charge: true };
      return next;
    });
  };
  const patch = (name: string, p: Partial<Row>) => setRows((prev) => ({ ...prev, [name]: { ...prev[name], ...p } }));

  const selected = Object.values(rows);
  const total = selected.reduce((s, r) => s + (r.charge ? r.price * r.qty : 0), 0);

  const handleAdd = async () => {
    if (selected.length === 0) return;
    const lines = selected.map((r) => {
      const unit = r.charge ? r.price : 0;
      return {
        // Accessories are free-form add-on lines — the zero UUID means "no catalog item".
        catalog_item_id: '00000000-0000-0000-0000-000000000000',
        sku: `ACC-${r.name.replace(/\s+/g, '-').toUpperCase()}`,
        name: r.charge ? r.name : `${r.name} (free)`,
        quantity: r.qty,
        unit_price: unit,
        total_price: unit * r.qty,
        metadata: { accessory: true, billable: r.charge },
      };
    });
    try {
      await addLines.mutateAsync({ orderId, lines });
      toast.success('Accessories added');
      onAdded?.();
      onClose();
    } catch {
      toast.error('Could not add accessories.');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-[61] w-full max-w-md mx-4 bg-card border border-border rounded-2xl shadow-xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm flex items-center gap-2"><Utensils className="h-4 w-4 text-primary" /> Accessories — {orderNumber}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-1.5">
          {DEFAULT_ACCESSORIES.map((a) => {
            const row = rows[a.name];
            const on = !!row;
            return (
              <div key={a.name} className={`rounded-xl border px-3 py-2 ${on ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
                <div className="flex items-center justify-between gap-2">
                  <button onClick={() => toggle(a)} className="flex items-center gap-2 text-sm font-medium flex-1 text-left">
                    <span className={`h-4 w-4 rounded border flex items-center justify-center ${on ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                      {on && '✓'}
                    </span>
                    {a.name}
                    <span className="text-xs text-muted-foreground">KSh {a.price}</span>
                  </button>
                  {on && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={1} value={row.qty}
                        onChange={(e) => patch(a.name, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-14 rounded-lg border border-border bg-background px-2 py-1 text-sm text-center"
                      />
                      <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
                        <input type="checkbox" checked={row.charge} onChange={(e) => patch(a.name, { charge: e.target.checked })} />
                        Charge
                      </label>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-sm text-muted-foreground">{selected.length} selected · <span className="font-semibold text-foreground">KSh {total.toLocaleString()}</span></span>
          <button
            onClick={handleAdd}
            disabled={selected.length === 0 || addLines.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {addLines.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Add to order
          </button>
        </div>
      </div>
    </div>
  );
}
