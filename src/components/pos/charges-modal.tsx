'use client';

import { useState } from 'react';
import { PackagePlus, X } from 'lucide-react';

interface ChargesModalProps {
  open: boolean;
  current: Record<string, number>;
  onApply: (charges: Record<string, number>) => void;
  onClose: () => void;
}

const CHARGE_FIELDS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'packaging', label: 'Packaging', hint: 'e.g. 50' },
  { key: 'service', label: 'Service', hint: 'e.g. 100' },
  { key: 'shipping', label: 'Shipping / Delivery', hint: 'e.g. 200' },
];

/**
 * ChargesModal — manager/admin quick edit for additional order costs (packaging, service,
 * shipping) that increase the payable (QA req 4). Amounts are KES; zero/empty removes a
 * charge. Non-managers trigger a manager step-up at checkout (order.adjustment, enforced +
 * audited server-side).
 */
export function ChargesModal({ open, current, onApply, onClose }: ChargesModalProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(CHARGE_FIELDS.map((f) => [f.key, current[f.key] ? String(current[f.key]) : '']))
  );

  if (!open) return null;

  const parsed: Record<string, number> = {};
  let sum = 0;
  for (const f of CHARGE_FIELDS) {
    const n = parseFloat(values[f.key]) || 0;
    if (n > 0) {
      parsed[f.key] = n;
      sum += n;
    }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-[56] w-full max-w-sm mx-4 bg-card border border-border rounded-2xl shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm flex items-center gap-2"><PackagePlus className="h-4 w-4 text-primary" /> Additional Charges</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3">
          {CHARGE_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="text-xs font-semibold text-muted-foreground">{f.label} (KES)</span>
              <input
                type="number" min={0} inputMode="decimal"
                value={values[f.key]}
                onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.hint}
                className="mt-1 w-full bg-accent/10 border border-border rounded-lg py-2 px-3 text-sm font-semibold focus:ring-1 focus:ring-primary outline-none"
              />
            </label>
          ))}
        </div>

        <div className="text-xs text-muted-foreground text-center">
          Total charges: <span className="font-bold text-foreground">KES {sum.toLocaleString()}</span>
        </div>

        <div className="flex gap-2">
          <button onClick={() => onApply({})} className="flex-1 px-3 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-accent/10">
            Clear
          </button>
          <button onClick={() => onApply(parsed)}
            className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90">
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
