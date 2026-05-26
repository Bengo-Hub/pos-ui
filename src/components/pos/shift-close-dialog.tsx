'use client';

import { useMemo, useState } from 'react';
import { Loader2, ChevronLeft, ChevronRight, CheckCircle, AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const KE_DENOMINATIONS = [
  { label: '1,000', value: 1000 },
  { label: '500', value: 500 },
  { label: '200', value: 200 },
  { label: '100', value: 100 },
  { label: '50', value: 50 },
  { label: '40', value: 40 },
  { label: '20', value: 20 },
  { label: '10', value: 10 },
  { label: '5', value: 5 },
  { label: '1', value: 1 },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  expectedCash: number;
  onConfirm: (payload: { closing_float: number; notes?: string }) => void;
  isLoading?: boolean;
}

export function ShiftCloseDialog({ open, onOpenChange, expectedCash, onConfirm, isLoading }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState('');

  const closingFloat = useMemo(
    () => KE_DENOMINATIONS.reduce((sum, d) => sum + d.value * (counts[d.value] ?? 0), 0),
    [counts],
  );

  const variance = closingFloat - expectedCash;
  const absVariance = Math.abs(variance);
  const varianceColor =
    absVariance <= 0 ? 'text-green-600' :
    absVariance <= 200 ? 'text-amber-600' :
    'text-red-600';
  const varianceBg =
    absVariance <= 0 ? 'bg-green-50 border-green-200' :
    absVariance <= 200 ? 'bg-amber-50 border-amber-200' :
    'bg-red-50 border-red-200';

  function handleConfirm() {
    onConfirm({ closing_float: closingFloat, notes: notes.trim() || undefined });
  }

  function handleOpenChange(v: boolean) {
    if (!v) { setStep(1); setCounts({}); setNotes(''); }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? 'Count Cash Drawer' : 'Confirm & Close Shift'}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Count the cash in your drawer and enter the quantities below.
            </p>

            <div className="space-y-2">
              {KE_DENOMINATIONS.map((d) => {
                const count = counts[d.value] ?? 0;
                return (
                  <div key={d.value} className="flex items-center gap-3">
                    <span className="w-16 text-sm font-medium text-right">
                      KES {d.label}
                    </span>
                    <div className="flex items-center gap-2 flex-1">
                      <button
                        onClick={() => setCounts((c) => ({ ...c, [d.value]: Math.max(0, (c[d.value] ?? 0) - 1) }))}
                        className="size-8 rounded-lg border border-input flex items-center justify-center hover:bg-muted transition-colors text-lg font-bold"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={count}
                        onChange={(e) => setCounts((c) => ({ ...c, [d.value]: Math.max(0, parseInt(e.target.value) || 0) }))}
                        className="w-16 text-center rounded-lg border border-input bg-background py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <button
                        onClick={() => setCounts((c) => ({ ...c, [d.value]: (c[d.value] ?? 0) + 1 }))}
                        className="size-8 rounded-lg border border-input flex items-center justify-center hover:bg-muted transition-colors text-lg font-bold"
                      >
                        +
                      </button>
                    </div>
                    <span className="w-20 text-sm text-right text-muted-foreground">
                      {count > 0 ? `KES ${(d.value * count).toLocaleString()}` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between rounded-xl bg-muted px-4 py-3 font-bold">
              <span>Total Cash</span>
              <span className="text-primary text-lg">KES {closingFloat.toLocaleString()}</span>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-muted px-4 py-3">
                <p className="text-muted-foreground text-xs mb-1">Cash Counted</p>
                <p className="font-bold">KES {closingFloat.toLocaleString()}</p>
              </div>
              <div className="rounded-xl bg-muted px-4 py-3">
                <p className="text-muted-foreground text-xs mb-1">Expected Cash</p>
                <p className="font-bold">KES {expectedCash.toLocaleString()}</p>
              </div>
            </div>

            <div className={`rounded-xl border px-4 py-3 ${varianceBg}`}>
              <div className="flex items-center gap-2">
                {absVariance <= 50
                  ? <CheckCircle className="h-4 w-4 text-green-600" />
                  : <AlertTriangle className={`h-4 w-4 ${varianceColor}`} />
                }
                <p className="text-xs font-medium text-muted-foreground">Variance</p>
              </div>
              <p className={`text-lg font-bold mt-1 ${varianceColor}`}>
                {variance >= 0 ? '+' : ''}KES {variance.toLocaleString()}
              </p>
              {absVariance > 200 && (
                <p className="text-xs text-red-600 mt-1">
                  High variance — please recount or add a note explaining the discrepancy.
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-1">
                Notes <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any cash differences, handover notes, incidents..."
                rows={3}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 2 && (
            <Button variant="outline" onClick={() => setStep(1)} disabled={isLoading}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          )}
          {step === 1 ? (
            <Button onClick={() => setStep(2)} className="flex-1">
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleConfirm}
              disabled={isLoading}
              className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Close Shift
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
