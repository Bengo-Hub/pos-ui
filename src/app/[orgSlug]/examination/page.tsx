'use client';

import { useEffect, useRef, useState } from 'react';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Can } from '@/components/auth/can';
import { P } from '@/lib/rbac/permissions';
import { VisitStatusBadge } from '@/components/clinical/visit-status-badge';
import {
  useVisits, usePatient, useVisit, useRecordExamination, usePrescribeFromExamination,
} from '@/hooks/useClinical';
import { usePrescribers } from '@/hooks/useClinical';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { SearchableCombobox, type ComboboxOption } from '@bengo-hub/shared-ui-lib/combobox';
import { FlaskConical, Loader2, Pill, Plus, Stethoscope, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { Visit, PrescribeLineInput } from '@/lib/api/clinical';

interface DrugCatalogItem { id: string; name: string; sku: string; price?: number }

async function searchDrugs(tenantID: string, query: string, cache: Map<string, DrugCatalogItem>): Promise<ComboboxOption[]> {
  if (!tenantID || query.trim().length < 1) return [];
  const res = await apiClient.get<{ data: DrugCatalogItem[] }>(`/api/v1/${tenantID}/pos/catalog/items`, {
    category: 'pharmaceutical', search: query, limit: 20,
  });
  const rows = res?.data ?? [];
  return rows.map((item) => {
    cache.set(item.id, item);
    return { value: item.id, label: item.name, hint: item.price !== undefined ? item.price.toFixed(2) : undefined, description: item.sku };
  });
}

function ExaminationModal({ visit, onClose, onLabRequested, onReadyToPrescribe }: {
  visit: Visit; onClose: () => void; onLabRequested: () => void; onReadyToPrescribe: () => void;
}) {
  const { data } = usePatient(visit.patient_id);
  const { data: visitDetail } = useVisit(visit.id);
  const recordExamination = useRecordExamination();
  const [chiefComplaint, setChiefComplaint] = useState(visit.chief_complaint ?? '');
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [labRequested, setLabRequested] = useState(false);
  const [tests, setTests] = useState<string[]>(['']);

  useEffect(() => {
    if (visitDetail?.examination) {
      setChiefComplaint(visitDetail.examination.chief_complaint ?? chiefComplaint);
      setDiagnosis(visitDetail.examination.diagnosis ?? '');
      setNotes(visitDetail.examination.clinical_notes ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitDetail?.examination?.id]);

  const inputCls = 'w-full bg-background border border-border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';
  const labelCls = 'text-xs font-semibold text-muted-foreground mb-1 block';

  const handleSubmit = async () => {
    try {
      const res = await recordExamination.mutateAsync({
        visitId: visit.id,
        data: {
          chief_complaint: chiefComplaint || undefined,
          diagnosis: diagnosis || undefined,
          clinical_notes: notes || undefined,
          lab_requested: labRequested,
          lab_tests: labRequested ? tests.filter((t) => t.trim()) : undefined,
        },
      });
      toast.success(labRequested ? 'Lab tests ordered' : 'Examination saved');
      onClose();
      if (labRequested) onLabRequested();
      else onReadyToPrescribe();
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to save examination'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
          <div>
            <h3 className="font-bold text-base">Examination</h3>
            <p className="text-xs text-muted-foreground">{data?.patient.full_name} · {visit.visit_number}</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          {visitDetail?.triage && (
            <div className="rounded-xl border border-border bg-background/50 p-3 text-xs space-y-1">
              <p className="font-bold uppercase tracking-wide text-muted-foreground mb-1">Vitals</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                {visitDetail.triage.bp_systolic && <span>BP: {visitDetail.triage.bp_systolic}/{visitDetail.triage.bp_diastolic}</span>}
                {visitDetail.triage.temperature_celsius && <span>Temp: {visitDetail.triage.temperature_celsius}°C</span>}
                {visitDetail.triage.pulse_bpm && <span>Pulse: {visitDetail.triage.pulse_bpm} bpm</span>}
                {visitDetail.triage.spo2_percent && <span>SpO2: {visitDetail.triage.spo2_percent}%</span>}
              </div>
            </div>
          )}
          {visitDetail?.visit.status === 'lab_complete' && (
            <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/5 p-3 text-xs text-cyan-700 dark:text-cyan-400">
              Lab results are back — review below before finalizing diagnosis.
            </div>
          )}
          <div>
            <label className={labelCls}>Chief Complaint</label>
            <input value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Diagnosis</label>
            <textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
          </div>
          <div>
            <label className={labelCls}>Clinical Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={labRequested} onChange={(e) => setLabRequested(e.target.checked)} className="h-4 w-4" />
            Order lab tests before prescribing
          </label>
          {labRequested && (
            <div className="space-y-2">
              {tests.map((t, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={t}
                    onChange={(e) => setTests((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder="e.g. Full Blood Count"
                    className={inputCls}
                  />
                  {tests.length > 1 && (
                    <button onClick={() => setTests((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={() => setTests((prev) => [...prev, ''])} className="text-xs text-primary font-semibold flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> Add test
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 min-h-11 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={recordExamination.isPending}
            className="flex-1 min-h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {recordExamination.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {labRequested ? 'Order Tests' : 'Save Examination'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PrescribeModal({ visit, onClose }: { visit: Visit; onClose: () => void }) {
  const { data } = usePatient(visit.patient_id);
  const { data: prescribers } = usePrescribers();
  const prescribe = usePrescribeFromExamination();
  const user = useAuthStore((s) => s.user);
  const tenantID = user?.tenant_id ?? '';
  const drugCache = useRef(new Map<string, DrugCatalogItem>());

  const [prescriberId, setPrescriberId] = useState('');
  const [prescriberName, setPrescriberName] = useState('');
  const [prescriberLicense, setPrescriberLicense] = useState('');
  const [lines, setLines] = useState<(PrescribeLineInput & { _key: number })[]>([
    { _key: 0, drug_name: '', dosage: '', form: '', instructions: '', quantity_prescribed: 1 },
  ]);

  useEffect(() => {
    if (!prescribers || prescribers.length === 0 || prescriberId) return;
    const mine = prescribers.find((p) => p.user_id === user?.id) ?? prescribers[0];
    setPrescriberId(mine.staff_id);
    setPrescriberName(mine.name);
    setPrescriberLicense(mine.license_number ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prescribers]);

  const inputCls = 'w-full bg-background border border-border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';
  const labelCls = 'text-xs font-semibold text-muted-foreground mb-1 block';

  const updateLine = (key: number, patch: Partial<PrescribeLineInput>) => {
    setLines((prev) => prev.map((l) => (l._key === key ? { ...l, ...patch } : l)));
  };

  const handleSubmit = async () => {
    const validLines = lines.filter((l) => l.drug_name && l.dosage && l.form && l.instructions && l.quantity_prescribed > 0);
    if (!prescriberName || validLines.length === 0) {
      toast.error('Prescriber and at least one complete drug line are required');
      return;
    }
    try {
      await prescribe.mutateAsync({
        visitId: visit.id,
        data: {
          prescriber_name: prescriberName,
          prescriber_license: prescriberLicense || undefined,
          lines: validLines.map(({ _key, ...l }) => l),
        },
      });
      toast.success('Prescription created — sent to Pharmacy');
      onClose();
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to create prescription'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
          <div>
            <h3 className="font-bold text-base">Prescribe</h3>
            <p className="text-xs text-muted-foreground">{data?.patient.full_name} · {visit.visit_number}</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Prescriber</label>
              <SearchableCombobox
                options={(prescribers ?? []).map((p) => ({ value: p.staff_id, label: p.name, hint: p.role }))}
                value={prescriberId}
                onChange={(value) => {
                  setPrescriberId(value);
                  const p = (prescribers ?? []).find((x) => x.staff_id === value);
                  if (p) { setPrescriberName(p.name); setPrescriberLicense(p.license_number ?? ''); }
                }}
                placeholder="Select prescriber…"
              />
            </div>
            <div>
              <label className={labelCls}>License #</label>
              <input value={prescriberLicense} onChange={(e) => setPrescriberLicense(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Drug Lines</p>
              <button
                onClick={() => setLines((prev) => [...prev, { _key: Date.now(), drug_name: '', dosage: '', form: '', instructions: '', quantity_prescribed: 1 }])}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/5"
              >
                <Plus className="h-3.5 w-3.5" /> Add Drug
              </button>
            </div>
            {lines.map((l) => (
              <div key={l._key} className="rounded-xl border border-border bg-background/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  {lines.length > 1 && (
                    <button onClick={() => setLines((prev) => prev.filter((x) => x._key !== l._key))} className="ml-auto text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Drug</label>
                    <SearchableCombobox
                      options={[]}
                      value={undefined}
                      onChange={(value) => {
                        const item = drugCache.current.get(value);
                        if (!item) return;
                        updateLine(l._key, { drug_name: item.name, catalog_item_id: item.id, unit_price: item.price });
                      }}
                      onRemoteSearch={(q) => searchDrugs(tenantID, q, drugCache.current)}
                      placeholder="Search drugs…"
                    />
                    {l.drug_name && <p className="text-[11px] text-muted-foreground mt-1">{l.drug_name}</p>}
                  </div>
                  <div>
                    <label className={labelCls}>Dosage</label>
                    <input value={l.dosage} onChange={(e) => updateLine(l._key, { dosage: e.target.value })} placeholder="e.g. 500mg" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Form</label>
                    <input value={l.form} onChange={(e) => updateLine(l._key, { form: e.target.value })} placeholder="e.g. Tablet" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Qty</label>
                    <input type="number" min="1" value={l.quantity_prescribed} onChange={(e) => updateLine(l._key, { quantity_prescribed: Number(e.target.value) })} className={inputCls} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelCls}>Instructions</label>
                    <input value={l.instructions} onChange={(e) => updateLine(l._key, { instructions: e.target.value })} placeholder="e.g. Take 1 tablet twice daily" className={inputCls} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 min-h-11 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={prescribe.isPending}
            className="flex-1 min-h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {prescribe.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pill className="h-4 w-4" />}
            Send to Pharmacy
          </button>
        </div>
      </div>
    </div>
  );
}

function VisitRow({ visit, onExamine, onPrescribe }: { visit: Visit; onExamine: () => void; onPrescribe: () => void }) {
  const { data } = usePatient(visit.patient_id);
  return (
    <tr className="hover:bg-accent/20 transition-colors">
      <td className="px-4 py-3.5 font-mono text-xs">{visit.visit_number}</td>
      <td className="px-4 py-3.5 font-medium">{data?.patient.full_name ?? '…'}</td>
      <td className="px-4 py-3.5 text-muted-foreground">{visit.chief_complaint || '—'}</td>
      <td className="px-4 py-3.5"><VisitStatusBadge status={visit.status} /></td>
      <td className="px-4 py-3.5 text-right">
        <Can permission={P.EXAMINATION_ADD}>
          <div className="flex justify-end gap-2">
            <button
              onClick={onExamine}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-accent transition-colors"
            >
              <Stethoscope className="h-3.5 w-3.5" />
              {visit.status === 'lab_complete' ? 'Review Results' : 'Examine'}
            </button>
            {visit.status === 'in_examination' && (
              <button
                onClick={onPrescribe}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                <Pill className="h-3.5 w-3.5" />
                Prescribe
              </button>
            )}
          </div>
        </Can>
      </td>
    </tr>
  );
}

function ExaminationPage() {
  const { data: triaged, isLoading: l1 } = useVisits('triaged');
  const { data: inExam, isLoading: l2 } = useVisits('in_examination');
  const { data: labComplete, isLoading: l3 } = useVisits('lab_complete');
  const { data: awaitingLab } = useVisits('awaiting_lab');
  const [examining, setExamining] = useState<Visit | null>(null);
  const [prescribing, setPrescribing] = useState<Visit | null>(null);

  const visits = [...(triaged ?? []), ...(inExam ?? []), ...(labComplete ?? [])];
  const isLoading = l1 || l2 || l3;

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Stethoscope className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Examination</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Diagnose, order labs, and prescribe</p>
        </div>
      </div>

      {awaitingLab && awaitingLab.length > 0 && (
        <div className="mb-5 rounded-2xl border border-orange-400/30 bg-orange-500/5 p-4 flex items-center gap-2 text-sm text-orange-700 dark:text-orange-400">
          <FlaskConical className="h-4 w-4" />
          {awaitingLab.length} visit(s) awaiting lab results
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading queue…</span>
        </div>
      ) : visits.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
          <Stethoscope className="h-10 w-10 opacity-30" />
          <p className="font-medium">No patients waiting for examination</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Visit #</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Patient</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Chief Complaint</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visits.map((v) => (
                <VisitRow key={v.id} visit={v} onExamine={() => setExamining(v)} onPrescribe={() => setPrescribing(v)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {examining && (
        <ExaminationModal
          visit={examining}
          onClose={() => setExamining(null)}
          onLabRequested={() => {}}
          onReadyToPrescribe={() => setPrescribing(examining)}
        />
      )}
      {prescribing && <PrescribeModal visit={prescribing} onClose={() => setPrescribing(null)} />}
    </div>
  );
}

export default function ExaminationPageGated() {
  return (
    <ModuleGate moduleKey="examination" fallback={<ModuleUnavailablePage moduleKey="examination" />}>
      <ExaminationPage />
    </ModuleGate>
  );
}
