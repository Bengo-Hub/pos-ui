'use client';

import { useState } from 'react';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Can } from '@/components/auth/can';
import { P } from '@/lib/rbac/permissions';
import { useLabOrders, useSubmitLabResults } from '@/hooks/useClinical';
import { FlaskConical, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { LabOrderLine } from '@/lib/api/clinical';

const FLAGS: { value: 'normal' | 'abnormal' | 'critical'; label: string; cls: string }[] = [
  { value: 'normal', label: 'Normal', cls: 'text-green-600' },
  { value: 'abnormal', label: 'Abnormal', cls: 'text-orange-600' },
  { value: 'critical', label: 'Critical', cls: 'text-red-600' },
];

function ResultsModal({ entry, onClose }: { entry: any; onClose: () => void }) {
  const submit = useSubmitLabResults();
  const [values, setValues] = useState<Record<string, { result: string; unit: string; reference_range: string; flag: 'normal' | 'abnormal' | 'critical' }>>(
    Object.fromEntries(
      (entry.lines as LabOrderLine[]).map((l) => [
        l.id,
        { result: l.result ?? '', unit: l.unit ?? '', reference_range: l.reference_range ?? '', flag: (l.flag === 'pending' ? 'normal' : l.flag) as 'normal' | 'abnormal' | 'critical' },
      ]),
    ),
  );

  const inputCls = 'w-full bg-background border border-border rounded-lg py-1.5 px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40';

  const handleSubmit = async () => {
    const lines = (entry.lines as LabOrderLine[]).map((l) => ({
      line_id: l.id,
      result: values[l.id]?.result ?? '',
      unit: values[l.id]?.unit || undefined,
      reference_range: values[l.id]?.reference_range || undefined,
      flag: values[l.id]?.flag,
    })).filter((l) => l.result.trim());
    if (lines.length === 0) {
      toast.error('Enter at least one result');
      return;
    }
    try {
      await submit.mutateAsync({ labOrderId: entry.lab_order.id, lines });
      toast.success('Results submitted');
      onClose();
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to submit results'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
          <div>
            <h3 className="font-bold text-base">Lab Results</h3>
            <p className="text-xs text-muted-foreground">{entry.patient_name} · {entry.visit_number}</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {(entry.lines as LabOrderLine[]).map((l) => (
            <div key={l.id} className="rounded-xl border border-border bg-background/50 p-3 space-y-2">
              <p className="text-sm font-bold">{l.test_name}</p>
              <div className="grid grid-cols-3 gap-2">
                <input
                  placeholder="Result"
                  value={values[l.id]?.result ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [l.id]: { ...prev[l.id], result: e.target.value } }))}
                  className={inputCls}
                />
                <input
                  placeholder="Unit"
                  value={values[l.id]?.unit ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [l.id]: { ...prev[l.id], unit: e.target.value } }))}
                  className={inputCls}
                />
                <input
                  placeholder="Reference range"
                  value={values[l.id]?.reference_range ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [l.id]: { ...prev[l.id], reference_range: e.target.value } }))}
                  className={inputCls}
                />
              </div>
              <div className="flex gap-3">
                {FLAGS.map((f) => (
                  <label key={f.value} className={`text-xs font-medium flex items-center gap-1 ${f.cls}`}>
                    <input
                      type="radio"
                      name={`flag-${l.id}`}
                      checked={values[l.id]?.flag === f.value}
                      onChange={() => setValues((prev) => ({ ...prev, [l.id]: { ...prev[l.id], flag: f.value } }))}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 min-h-11 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submit.isPending}
            className="flex-1 min-h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit Results
          </button>
        </div>
      </div>
    </div>
  );
}

function LabPage() {
  const { data: entries, isLoading } = useLabOrders();
  const [active, setActive] = useState<any | null>(null);

  const pending = (entries ?? []).filter((e: any) => e.lab_order.status !== 'completed');

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <FlaskConical className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Lab</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Run requested tests and record results</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading orders…</span>
        </div>
      ) : pending.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
          <FlaskConical className="h-10 w-10 opacity-30" />
          <p className="font-medium">No pending lab orders</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Visit #</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Patient</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Tests</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pending.map((e: any) => (
                <tr key={e.lab_order.id} className="hover:bg-accent/20 transition-colors">
                  <td className="px-4 py-3.5 font-mono text-xs">{e.visit_number}</td>
                  <td className="px-4 py-3.5 font-medium">{e.patient_name}</td>
                  <td className="px-4 py-3.5 text-muted-foreground text-xs">
                    {(e.lines as LabOrderLine[]).map((l) => l.test_name).join(', ')}
                  </td>
                  <td className="px-4 py-3.5 capitalize text-muted-foreground">{e.lab_order.status.replace('_', ' ')}</td>
                  <td className="px-4 py-3.5 text-right">
                    <Can permission={P.LAB_ADD}>
                      <button
                        onClick={() => setActive(e)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                      >
                        <FlaskConical className="h-3.5 w-3.5" />
                        Enter Results
                      </button>
                    </Can>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active && <ResultsModal entry={active} onClose={() => setActive(null)} />}
    </div>
  );
}

export default function LabPageGated() {
  return (
    <ModuleGate moduleKey="lab" fallback={<ModuleUnavailablePage moduleKey="lab" />}>
      <LabPage />
    </ModuleGate>
  );
}
