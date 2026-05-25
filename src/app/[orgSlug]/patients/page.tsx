'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle, Loader2, Plus, UserSquare } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface Patient {
  id: string;
  name: string;
  dob?: string;
  phone?: string;
  allergies?: string[];
  active_medication_count?: number;
  prescription_count?: number;
  created_at: string;
}

function usePatients(search: string) {
  const user = useAuthStore((s) => s.user);
  const tenantID = user?.tenant_id ?? '';
  return useQuery({
    queryKey: ['pharmacy-patients', tenantID, search],
    queryFn: () => apiClient.get<{ data: Patient[] }>(`/api/v1/${tenantID}/pos/pharmacy/patients${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    enabled: !!tenantID,
    staleTime: 2 * 60_000,
  });
}

function PatientCard({ patient, orgSlug }: { patient: Patient; orgSlug: string }) {
  const age = patient.dob
    ? Math.floor((Date.now() - new Date(patient.dob).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;
  const hasAllergies = (patient.allergies ?? []).length > 0;

  return (
    <Link
      href={`/${orgSlug}/patients/${patient.id}`}
      className="flex items-center gap-4 px-5 py-4 bg-card border border-border rounded-2xl hover:border-primary/30 hover:shadow-md hover:shadow-primary/8 transition-all duration-200"
    >
      <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <span className="text-sm font-bold text-primary">
          {patient.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm text-foreground">{patient.name}</p>
          {hasAllergies && (
            <span className="flex items-center gap-1 text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 px-1.5 py-0.5 rounded-full">
              <AlertTriangle className="h-2.5 w-2.5" /> Allergy
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {age !== null ? `${age} yrs` : ''}
          {age !== null && patient.phone ? ' · ' : ''}
          {patient.phone ?? ''}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-semibold text-foreground">{patient.prescription_count ?? 0} Rx</p>
        {(patient.active_medication_count ?? 0) > 0 && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{patient.active_medication_count} active meds</p>
        )}
      </div>
    </Link>
  );
}

function PatientsPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const [search, setSearch] = useState('');
  const { data, isLoading } = usePatients(search);
  const patients = data?.data ?? [];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <UserSquare className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Patient Profiles</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage patient records and medication history</p>
          </div>
        </div>
        <Link
          href={`/${orgSlug}/patients/new`}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Patient
        </Link>
      </div>

      {/* Search */}
      <div className="mb-5">
        <input
          type="text"
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm bg-background border border-border rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading patients…</span>
        </div>
      ) : patients.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
          <UserSquare className="h-10 w-10 opacity-30" />
          <p className="font-medium">{search ? 'No patients found for that search' : 'No patient profiles yet'}</p>
          <Link href={`/${orgSlug}/patients/new`} className="text-sm text-primary underline">
            Add first patient
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {patients.map((patient) => (
            <PatientCard key={patient.id} patient={patient} orgSlug={orgSlug} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PatientsPageGated() {
  return (
    <ModuleGate moduleKey="patients" fallback={<ModuleUnavailablePage moduleKey="patients" />}>
      <PatientsPage />
    </ModuleGate>
  );
}
