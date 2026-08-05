'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useLabTests, useSaveLabTest, useDeleteLabTest,
  usePharmacyWorkflow, useUpdatePharmacyWorkflow,
} from '@/hooks/useClinical';
import { usePermissions } from '@/hooks/usePermissions';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { P } from '@/lib/rbac/permissions';
import { apiErrorMessage } from '@/lib/api/error-message';
import { formatCurrency, cn } from '@/lib/utils';
import { inputClass, labelClass, Toggle } from './shared';
import type { LabTest } from '@/lib/api/clinical';

/**
 * Pharmacy workflow settings: how a prescription reaches payment, plus the tenant's orderable
 * lab-test catalogue (name + price), which the Examination stage picks from and which drives the
 * pre-payment bill a patient settles before the Lab module activates their tests.
 */
export function PharmacyWorkflowTab() {
  const { data: config, isLoading } = usePharmacyWorkflow();
  const updateWorkflow = useUpdatePharmacyWorkflow();
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';
  const { can } = usePermissions();
  const canEdit = can(P.CONFIG_MANAGE) || can(P.CONFIG_CHANGE);

  const [mode, setMode] = useState<'direct' | 'billing'>('direct');
  const [labPrepay, setLabPrepay] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setMode(config.pharmacy_workflow_mode ?? 'direct');
      setLabPrepay(config.require_lab_prepayment ?? true);
    }
  }, [config]);

  const save = async (patch: { pharmacy_workflow_mode?: 'direct' | 'billing'; require_lab_prepayment?: boolean }) => {
    setSaving(true);
    try {
      await updateWorkflow.mutateAsync(patch);
      toast.success('Pharmacy workflow updated');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to save'));
      // Roll the optimistic toggle back to what the server last confirmed.
      if (config) {
        setMode(config.pharmacy_workflow_mode ?? 'direct');
        setLabPrepay(config.require_lab_prepayment ?? true);
      }
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-40 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dispensing workflow mode */}
      <section className="space-y-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Dispensing Workflow</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            How a prescription gets paid for. Independent of the OPD modules (Triage/Examination/Lab)
            — turn those on separately under Modules.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ModeCard
            active={mode === 'direct'}
            disabled={!canEdit || saving}
            title="Direct"
            description="One person behind the counter writes the prescription, takes payment and hands over the medicine. Best for small chemists."
            onClick={() => { setMode('direct'); save({ pharmacy_workflow_mode: 'direct' }); }}
          />
          <ModeCard
            active={mode === 'billing'}
            disabled={!canEdit || saving}
            title="Posted to Bills"
            description="The pharmacist posts the script to a shared Bills queue; any cashier settles it and issues the medicine. Best for mid-size pharmacies."
            onClick={() => { setMode('billing'); save({ pharmacy_workflow_mode: 'billing' }); }}
          />
        </div>
      </section>

      {/* Lab pre-payment */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-border p-4">
          <div className="min-w-0">
            <p className="text-sm font-bold">Require lab pre-payment</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ordered tests stay hidden from the Lab module until the patient has paid their bill.
            </p>
          </div>
          <Toggle
            checked={labPrepay}
            onChange={(v) => { setLabPrepay(v); save({ require_lab_prepayment: v }); }}
            disabled={!canEdit || saving}
          />
        </div>
      </section>

      <LabTestCatalog canEdit={canEdit} />
    </div>
  );
}

function ModeCard({
  active, title, description, onClick, disabled,
}: { active: boolean; title: string; description: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'text-left rounded-2xl border p-4 transition-colors disabled:opacity-60',
        active ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:bg-accent/40',
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={cn('h-3.5 w-3.5 rounded-full border-2', active ? 'border-primary bg-primary' : 'border-border')} />
        <p className="text-sm font-bold">{title}</p>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  );
}

const BLANK: LabTestForm = { name: '', code: '', category: '', price: '', sample_type: '', unit: '', reference_range: '' };
interface LabTestForm {
  name: string; code: string; category: string; price: string;
  sample_type: string; unit: string; reference_range: string;
}

function LabTestCatalog({ canEdit }: { canEdit: boolean }) {
  const { data, isLoading } = useLabTests({ include_inactive: true });
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';
  const saveTest = useSaveLabTest();
  const deleteTest = useDeleteLabTest();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LabTestForm>(BLANK);
  const [adding, setAdding] = useState(false);

  const tests = data?.data ?? [];

  const startEdit = (t: LabTest) => {
    setEditingId(t.id);
    setAdding(false);
    setForm({
      name: t.name, code: t.code ?? '', category: t.category ?? '', price: String(Number(t.price) || 0),
      sample_type: t.sample_type ?? '', unit: t.unit ?? '', reference_range: t.reference_range ?? '',
    });
  };

  const reset = () => { setEditingId(null); setAdding(false); setForm(BLANK); };

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Test name is required'); return; }
    try {
      await saveTest.mutateAsync({
        id: editingId ?? undefined,
        body: {
          name: form.name.trim(),
          code: form.code || undefined,
          category: form.category || undefined,
          price: Number(form.price) || 0,
          sample_type: form.sample_type || undefined,
          unit: form.unit || undefined,
          reference_range: form.reference_range || undefined,
        },
      });
      toast.success(editingId ? 'Lab test updated' : 'Lab test added');
      reset();
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to save lab test'));
    }
  };

  const remove = async (t: LabTest) => {
    try {
      await deleteTest.mutateAsync(t.id);
      toast.success(`${t.name} deactivated`);
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to remove lab test'));
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Lab Tests &amp; Prices</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            The orderable tests clinicians pick from at Examination. Price drives the patient&apos;s pre-payment bill.
          </p>
        </div>
        {canEdit && !adding && !editingId && (
          <button
            type="button"
            onClick={() => { setAdding(true); setForm(BLANK); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/5 shrink-0"
          >
            <Plus className="h-3.5 w-3.5" /> Add Test
          </button>
        )}
      </div>

      {(adding || editingId) && (
        <div className="rounded-2xl border border-border p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Test name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Full Blood Count" />
            </div>
            <div>
              <label className={labelClass}>Price</label>
              <input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={inputClass} placeholder="0.00" />
            </div>
            <div>
              <label className={labelClass}>Category</label>
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass} placeholder="Haematology" />
            </div>
            <div>
              <label className={labelClass}>Code</label>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputClass} placeholder="FBC" />
            </div>
            <div>
              <label className={labelClass}>Sample type</label>
              <input value={form.sample_type} onChange={(e) => setForm({ ...form, sample_type: e.target.value })} className={inputClass} placeholder="Blood" />
            </div>
            <div>
              <label className={labelClass}>Unit</label>
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={inputClass} placeholder="g/dL" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Default reference range</label>
              <input value={form.reference_range} onChange={(e) => setForm({ ...form, reference_range: e.target.value })} className={inputClass} placeholder="12.0 – 16.0" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={reset} className="px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-accent">
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saveTest.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {saveTest.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? 'Save changes' : 'Add test'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="h-24 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : tests.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-2xl">
          No lab tests configured yet.
        </p>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/30">
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Test</th>
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Category</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Price</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tests.map((t) => (
                <tr key={t.id} className={cn('hover:bg-accent/20', !t.is_active && 'opacity-50')}>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{t.name}</span>
                    {t.code && <span className="ml-2 text-xs text-muted-foreground">{t.code}</span>}
                    {!t.is_active && <span className="ml-2 text-[10px] uppercase text-muted-foreground">inactive</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{t.category || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(Number(t.price), currency)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {canEdit && (
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => startEdit(t)} className="text-xs font-medium text-primary hover:underline">
                          Edit
                        </button>
                        {t.is_active && (
                          <button
                            type="button"
                            onClick={() => remove(t)}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={`Remove ${t.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
