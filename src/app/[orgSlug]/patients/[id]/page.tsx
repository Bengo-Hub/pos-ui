'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { usePrescriptions } from '@/hooks/usePharmacy';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Pill, UserSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize',
        status === 'dispensed' && 'bg-green-100 text-green-700',
        status === 'pending' && 'bg-amber-100 text-amber-700',
        status === 'partially_dispensed' && 'bg-blue-100 text-blue-700',
        status === 'cancelled' && 'bg-red-100 text-red-700',
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function PatientDetailPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const patientName = decodeURIComponent((params?.id as string) ?? '');

  // No standalone Patient entity — a patient profile is the set of their prescriptions.
  const { data: prescriptions = [], isLoading } = usePrescriptions({ patient_name: patientName });

  const latest = prescriptions[0];
  const age = latest?.patient_dob
    ? Math.floor((Date.now() - new Date(latest.patient_dob).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link
        href={`/${orgSlug}/patients`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5"
      >
        <ArrowLeft className="h-4 w-4" /> Patients
      </Link>

      {/* Profile header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
          <UserSquare className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{patientName}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {age !== null ? `${age} yrs · ` : ''}
            {latest?.patient_id_number ? `ID ${latest.patient_id_number} · ` : ''}
            {prescriptions.length} prescription{prescriptions.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading history…</span>
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
          <Pill className="h-10 w-10 opacity-30" />
          <p className="font-medium">No prescription history for this patient</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Rx #</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Prescriber</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Date</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {prescriptions.map((rx) => (
                <tr key={rx.id} className="hover:bg-accent/20 transition-colors">
                  <td className="px-4 py-3.5 font-mono font-medium text-xs">{rx.prescription_number}</td>
                  <td className="px-4 py-3.5 text-muted-foreground">{rx.prescriber_name}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={rx.status} /></td>
                  <td className="px-4 py-3.5 text-muted-foreground">
                    {new Date(rx.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <Link href={`/${orgSlug}/pharmacy/${rx.id}`} className="text-sm text-primary hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PatientDetailPageGated() {
  return (
    <ModuleGate moduleKey="patients" fallback={<ModuleUnavailablePage moduleKey="patients" />}>
      <PatientDetailPage />
    </ModuleGate>
  );
}
