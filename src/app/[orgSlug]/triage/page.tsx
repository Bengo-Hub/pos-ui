'use client';

import { useState } from 'react';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Can } from '@/components/auth/can';
import { P } from '@/lib/rbac/permissions';
import { VisitStatusBadge } from '@/components/clinical/visit-status-badge';
import { useVisits, useRecordTriage } from '@/hooks/useClinical';
import { usePatient } from '@/hooks/useClinical';
import { HeartPulse, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { Visit } from '@/lib/api/clinical';

function TriageModal({ visit, onClose }: { visit: Visit; onClose: () => void }) {
  const { data } = usePatient(visit.patient_id);
  const recordTriage = useRecordTriage();
  const [bpSystolic, setBpSystolic] = useState('');
  const [bpDiastolic, setBpDiastolic] = useState('');
  const [temp, setTemp] = useState('');
  const [pulse, setPulse] = useState('');
  const [resp, setResp] = useState('');
  const [spo2, setSpo2] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [notes, setNotes] = useState('');

  const inputCls = 'w-full bg-background border border-border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';
  const labelCls = 'text-xs font-semibold text-muted-foreground mb-1 block';

  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

  const handleSubmit = async () => {
    try {
      await recordTriage.mutateAsync({
        visitId: visit.id,
        data: {
          bp_systolic: num(bpSystolic),
          bp_diastolic: num(bpDiastolic),
          temperature_celsius: num(temp),
          pulse_bpm: num(pulse),
          respiration_rate: num(resp),
          spo2_percent: num(spo2),
          weight_kg: num(weight),
          height_cm: num(height),
          notes: notes || undefined,
        },
      });
      toast.success('Vitals recorded');
      onClose();
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to record vitals'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
          <div>
            <h3 className="font-bold text-base">Record Vitals</h3>
            <p className="text-xs text-muted-foreground">{data?.patient.full_name} · {visit.visit_number}</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>BP Systolic (mmHg)</label>
              <input type="number" value={bpSystolic} onChange={(e) => setBpSystolic(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>BP Diastolic (mmHg)</label>
              <input type="number" value={bpDiastolic} onChange={(e) => setBpDiastolic(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Temperature (°C)</label>
              <input type="number" step="0.1" value={temp} onChange={(e) => setTemp(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Pulse (bpm)</label>
              <input type="number" value={pulse} onChange={(e) => setPulse(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Respiration Rate</label>
              <input type="number" value={resp} onChange={(e) => setResp(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>SpO2 (%)</label>
              <input type="number" step="0.1" value={spo2} onChange={(e) => setSpo2(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Weight (kg)</label>
              <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Height (cm)</label>
              <input type="number" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 min-h-11 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={recordTriage.isPending}
            className="flex-1 min-h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {recordTriage.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save & Send to Examination
          </button>
        </div>
      </div>
    </div>
  );
}

function VisitRow({ visit, onTriage }: { visit: Visit; onTriage: () => void }) {
  const { data } = usePatient(visit.patient_id);
  return (
    <tr className="hover:bg-accent/20 transition-colors">
      <td className="px-4 py-3.5 font-mono text-xs">{visit.visit_number}</td>
      <td className="px-4 py-3.5 font-medium">{data?.patient.full_name ?? '…'}</td>
      <td className="px-4 py-3.5 text-muted-foreground">{visit.chief_complaint || '—'}</td>
      <td className="px-4 py-3.5"><VisitStatusBadge status={visit.status} /></td>
      <td className="px-4 py-3.5 text-right">
        <Can permission={P.TRIAGE_ADD}>
          <button
            onClick={onTriage}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <HeartPulse className="h-3.5 w-3.5" />
            Take Vitals
          </button>
        </Can>
      </td>
    </tr>
  );
}

function TriagePage() {
  const { data: visits, isLoading } = useVisits('registered');
  const [active, setActive] = useState<Visit | null>(null);

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <HeartPulse className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Triage</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Record vitals for patients waiting to be seen</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading queue…</span>
        </div>
      ) : (visits ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
          <HeartPulse className="h-10 w-10 opacity-30" />
          <p className="font-medium">No patients waiting for triage</p>
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
              {(visits ?? []).map((v) => (
                <VisitRow key={v.id} visit={v} onTriage={() => setActive(v)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active && <TriageModal visit={active} onClose={() => setActive(null)} />}
    </div>
  );
}

export default function TriagePageGated() {
  return (
    <ModuleGate moduleKey="triage" fallback={<ModuleUnavailablePage moduleKey="triage" />}>
      <TriagePage />
    </ModuleGate>
  );
}
