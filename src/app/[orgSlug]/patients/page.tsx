'use client';

import { useState } from 'react';
import { PageGuard } from '@/components/auth/page-guard';
import { Can } from '@/components/auth/can';
import { P } from '@/lib/rbac/permissions';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore } from '@/store/auth';
import { useModuleAccess } from '@/hooks/use-module-access';
import { usePatients, useCreatePatient, useCreateVisit, useVisits } from '@/hooks/useClinical';
import { SplitPaymentModal } from '@/components/pos/split-payment-modal';
import { ClipboardPlus, Loader2, Search, UserPlus, UserSquare, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { Patient } from '@/lib/api/clinical';

function RegisterPatientModal({ onClose, onRegistered }: { onClose: () => void; onRegistered: (p: Patient) => void }) {
  const outlet = useAuthStore((s) => s.outlet);
  const createPatient = useCreatePatient();
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [address, setAddress] = useState('');

  const inputCls = 'w-full bg-background border border-border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';
  const labelCls = 'text-xs font-semibold text-muted-foreground mb-1 block';

  const handleSubmit = async () => {
    if (!outlet?.id || !fullName.trim()) {
      toast.error('Full name is required');
      return;
    }
    try {
      const patient = await createPatient.mutateAsync({
        outlet_id: outlet.id,
        full_name: fullName.trim(),
        dob: dob || undefined,
        gender: gender || undefined,
        phone: phone || undefined,
        id_number: idNumber || undefined,
        address: address || undefined,
      });
      toast.success(`${patient.full_name} registered — ${patient.patient_number}`);
      onRegistered(patient);
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to register patient'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <UserPlus className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-base">Register Patient</h3>
              <p className="text-xs text-muted-foreground">Create a new OPD patient record</p>
            </div>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          <div>
            <label className={labelCls}>Full Name *</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} placeholder="Full name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Date of Birth</label>
              <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Gender</label>
              <select value={gender} onChange={(e) => setGender(e.target.value)} className={inputCls}>
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="0712 345 678" />
            </div>
            <div>
              <label className={labelCls}>ID / Passport #</label>
              <input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 min-h-11 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={createPatient.isPending}
            className="flex-1 min-h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {createPatient.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Register
          </button>
        </div>
      </div>
    </div>
  );
}

function RecordsPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const outlet = useAuthStore((s) => s.outlet);
  const [search, setSearch] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<{ id: string; order_number: string; total: number } | null>(null);
  const tenantSlug = useAuthStore((s) => s.user?.tenant_slug ?? orgSlug);
  const tenantId = useAuthStore((s) => s.user?.tenant_id ?? '');

  // This page merges what used to be two near-identical screens (Records + Patient Profiles).
  // Registration and visit-opening only apply when the OPD Records module is on; a plain pharmacy
  // still gets the directory, populated from whoever appears on its prescriptions.
  const { hasModule } = useModuleAccess();
  const recordsEnabled = hasModule('records');

  const { data: patients, isLoading } = usePatients(search || undefined);
  const { data: activeVisits } = useVisits('registered');
  const createVisit = useCreateVisit();

  const handleOpenVisit = async (patientId: string) => {
    if (!outlet?.id) {
      toast.error('No outlet selected');
      return;
    }
    try {
      const res = await createVisit.mutateAsync({ patient_id: patientId, outlet_id: outlet.id });
      toast.success(`Visit ${res.visit.visit_number} opened`);
      if (res.registration_fee_order) {
        setPaymentOrder({
          id: res.registration_fee_order.id,
          order_number: res.registration_fee_order.order_number,
          total: res.registration_fee_order.total_amount,
        });
      }
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to open visit'));
    }
  };

  return (
    <div className="p-6">
      <PageHeader
        icon={UserSquare}
        title="Patients"
        subtitle={recordsEnabled ? 'Patient directory — register patients and open OPD visits' : 'Patient directory'}
        actions={
          recordsEnabled ? (
            <Can permission={P.RECORDS_ADD}>
              <button
                onClick={() => setRegisterOpen(true)}
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                <UserPlus className="h-4 w-4" />
                Register Patient
              </button>
            </Can>
          ) : undefined
        }
      />

      {recordsEnabled && activeVisits && activeVisits.length > 0 && (
        <div className="mb-5 rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-1">
            {activeVisits.length} visit(s) waiting for triage
          </p>
          <Link href={`/${orgSlug}/triage`} className="text-sm text-primary underline">
            Go to Triage queue
          </Link>
        </div>
      )}

      <div className="relative mb-5 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search patients by name, phone, ID…"
          className="w-full bg-background border border-border rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading patients…</span>
        </div>
      ) : (patients ?? []).length === 0 ? (
        <EmptyState
          icon={UserSquare}
          title="No patients found"
          description={
            recordsEnabled
              ? 'Register a patient to open their first visit.'
              : 'Patients appear here once they are recorded on a prescription.'
          }
        />
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Patient #</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Phone</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">ID Number</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(patients ?? []).map((p) => (
                <tr key={p.id} className="hover:bg-accent/20 transition-colors">
                  <td className="px-4 py-3.5 font-mono text-xs">{p.patient_number}</td>
                  <td className="px-4 py-3.5 font-medium">{p.full_name}</td>
                  <td className="px-4 py-3.5 text-muted-foreground">{p.phone || '—'}</td>
                  <td className="px-4 py-3.5 text-muted-foreground">{p.id_number || '—'}</td>
                  <td className="px-4 py-3.5 text-right">
                    {recordsEnabled && (
                      <Can permission={P.RECORDS_ADD}>
                        <button
                          onClick={() => handleOpenVisit(p.id)}
                          disabled={createVisit.isPending}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          <ClipboardPlus className="h-3.5 w-3.5" />
                          Open Visit
                        </button>
                      </Can>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {registerOpen && (
        <RegisterPatientModal
          onClose={() => setRegisterOpen(false)}
          onRegistered={(p) => {
            setRegisterOpen(false);
            handleOpenVisit(p.id);
          }}
        />
      )}

      {paymentOrder && (
        <SplitPaymentModal
          open
          onClose={() => setPaymentOrder(null)}
          onPaymentConfirmed={() => setPaymentOrder(null)}
          orderId={paymentOrder.id}
          orderNumber={paymentOrder.order_number}
          total={paymentOrder.total}
          tenantSlug={tenantSlug}
          tenantId={tenantId}
        />
      )}
    </div>
  );
}

export default function PatientsPageGated() {
  // Gated on `patients` (always on for pharmacy outlets), NOT `records` — a plain chemist that
  // never turns on the OPD Records module still needs the patient directory; the registration
  // and visit actions inside are what the records toggle controls.
  return (
    <PageGuard moduleKey="patients" permission={[P.PHARMACY_VIEW, P.RECORDS_VIEW]} label="Patients">
      <RecordsPage />
    </PageGuard>
  );
}
