'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

import { cn } from '@/lib/utils';
import { usePrescriptions } from '@/hooks/usePharmacy';
import { useDispensePrescription } from '@/hooks/usePharmacy';
import { useAuthStore } from '@/store/auth';
import { Loader2, Pill, Plus, Eye } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Prescription } from '@/lib/api/pharmacy';

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<Prescription['status'], string> = {
  pending: 'Pending',
  partially_dispensed: 'Partial',
  dispensed: 'Dispensed',
  cancelled: 'Cancelled',
};

function StatusBadge({ status }: { status: Prescription['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border',
        status === 'pending' && 'bg-yellow-500/10 text-yellow-700 border-yellow-400/30 dark:text-yellow-400',
        status === 'partially_dispensed' && 'bg-orange-500/10 text-orange-700 border-orange-400/30 dark:text-orange-400',
        status === 'dispensed' && 'bg-green-500/10 text-green-700 border-green-400/30 dark:text-green-400',
        status === 'cancelled' && 'bg-muted text-muted-foreground border-border',
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function PharmacyPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const tenantSlug = useAuthStore((s) => s.user?.tenant_slug ?? '');

  const [statusFilter, setStatusFilter] = useState('');
  const [patientSearch, setPatientSearch] = useState('');

  const filters = {
    status: statusFilter || undefined,
    patient_name: patientSearch || undefined,
  };

  const { data: prescriptions, isLoading } = usePrescriptions(filters);
  const dispense = useDispensePrescription();

  const handleDispense = async (id: string, rx: string) => {
    try {
      await dispense.mutateAsync(id);
      toast.success(`Prescription ${rx} dispensed`);
    } catch {
      toast.error('Failed to dispense prescription');
    }
  };

  const rows = prescriptions ?? [];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Pill className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Pharmacy</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage prescriptions and dispensing</p>
          </div>
        </div>
        <Link
          href={`/${orgSlug}/pharmacy/new`}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Prescription
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-background border border-border rounded-xl py-2 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 min-w-[170px]"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="partially_dispensed">Partially Dispensed</option>
          <option value="dispensed">Dispensed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input
          type="text"
          placeholder="Search patient name…"
          value={patientSearch}
          onChange={(e) => setPatientSearch(e.target.value)}
          className="bg-background border border-border rounded-xl py-2 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 min-w-[220px]"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading prescriptions…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
          <Pill className="h-10 w-10 opacity-30" />
          <p className="font-medium">No prescriptions found</p>
          <Link href={`/${orgSlug}/pharmacy/new`} className="text-sm text-primary underline">
            Create one
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Rx #</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Patient</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Prescriber</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Items</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Date</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((rx) => (
                <tr key={rx.id} className="hover:bg-accent/20 transition-colors">
                  <td className="px-4 py-3.5 font-mono font-medium text-xs">{rx.prescription_number}</td>
                  <td className="px-4 py-3.5 font-medium">{rx.patient_name}</td>
                  <td className="px-4 py-3.5 text-muted-foreground">{rx.prescriber_name}</td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={rx.status} />
                  </td>
                  <td className="px-4 py-3.5 text-center text-muted-foreground">
                    {rx.lines?.length ?? 0}
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground">
                    {new Date(rx.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/${orgSlug}/pharmacy/${rx.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-accent transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </Link>
                      {rx.status === 'pending' && (
                        <button
                          onClick={() => handleDispense(rx.id, rx.prescription_number)}
                          disabled={dispense.isPending}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {dispense.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Pill className="h-3.5 w-3.5" />
                          )}
                          Dispense
                        </button>
                      )}
                    </div>
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

export default function PharmacyPageGated() {
  return (
    <ModuleGate moduleKey="pharmacy" fallback={<ModuleUnavailablePage moduleKey="pharmacy" />}>
      <PharmacyPage />
    </ModuleGate>
  );
}
