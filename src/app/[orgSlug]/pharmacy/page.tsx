'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Can } from '@/components/auth/can';
import { P } from '@/lib/rbac/permissions';

import { cn } from '@/lib/utils';
import { usePrescriptions, useDispensePrescription, useCreatePrescription, useLinkCRMContact } from '@/hooks/usePharmacy';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import { WalkInSaleModal } from '@/components/pos/walk-in-sale-modal';
import { CustomerSearch, type SelectedCustomer } from '@/components/pos/customer-search';
import { SearchableCombobox, type ComboboxOption } from '@bengo-hub/shared-ui-lib/combobox';
import { Loader2, Pill, Plus, Eye, ShoppingCart, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { z } from 'zod';
import type { PrescriptionStatus } from '@/lib/api/pharmacy';

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<PrescriptionStatus, string> = {
  pending: 'Pending',
  flagged: 'Flagged',
  pharmacist_review: 'Review',
  approved: 'Approved',
  locked: 'Locked',
  partially_dispensed: 'Partial',
  dispensed: 'Dispensed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

function StatusBadge({ status }: { status: PrescriptionStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border',
        status === 'pending' && 'bg-yellow-500/10 text-yellow-700 border-yellow-400/30 dark:text-yellow-400',
        status === 'flagged' && 'bg-red-500/10 text-red-700 border-red-400/30 dark:text-red-400',
        status === 'pharmacist_review' && 'bg-orange-500/10 text-orange-700 border-orange-400/30 dark:text-orange-400',
        status === 'approved' && 'bg-blue-500/10 text-blue-700 border-blue-400/30 dark:text-blue-400',
        status === 'locked' && 'bg-purple-500/10 text-purple-700 border-purple-400/30 dark:text-purple-400',
        status === 'partially_dispensed' && 'bg-orange-500/10 text-orange-700 border-orange-400/30 dark:text-orange-400',
        status === 'dispensed' && 'bg-green-500/10 text-green-700 border-green-400/30 dark:text-green-400',
        (status === 'cancelled' || status === 'rejected') && 'bg-muted text-muted-foreground border-border',
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── Drug search (shared combobox, remote search over the pharmaceutical catalog) ─────────────

interface DrugCatalogItem {
  id: string;
  name: string;
  sku: string;
  price?: number;
}

/** Fetches pharmaceutical catalog items for the drug-line combobox — same /catalog/items endpoint
 *  useMenuItems() uses, called directly (not via the hook) since SearchableCombobox's
 *  onRemoteSearch wants a plain async fetcher, not a reactive query. */
async function searchDrugs(tenantID: string, query: string, cache: Map<string, DrugCatalogItem>): Promise<ComboboxOption[]> {
  if (!tenantID || query.trim().length < 1) return [];
  const res = await apiClient.get<{ data: DrugCatalogItem[] }>(`/api/v1/${tenantID}/pos/catalog/items`, {
    category: 'pharmaceutical',
    search: query,
    limit: 20,
  });
  const rows = res?.data ?? [];
  return rows.map((item) => {
    cache.set(item.id, item);
    return {
      value: item.id,
      label: item.name,
      hint: item.price !== undefined ? item.price.toFixed(2) : undefined,
      description: item.sku,
    };
  });
}

// ─── New Prescription form schema ────────────────────────────────────────────

const drugLineSchema = z.object({
  drug_name: z.string().min(1, 'Drug name required'),
  dosage: z.string().min(1, 'Dosage required'),
  form: z.string().min(1, 'Form required'),
  instructions: z.string().min(1, 'Instructions required'),
  quantity_prescribed: z.coerce.number().int().positive('Must be > 0'),
  catalog_item_id: z.string().optional(),
  lot_number: z.string().optional(),
  unit_price: z.coerce.number().optional(),
});

const prescriptionSchema = z.object({
  prescription_number: z.string().min(1, 'Prescription number required'),
  prescriber_name: z.string().min(1, 'Prescriber name required'),
  prescriber_license: z.string().min(1, 'Prescriber license required'),
  patient_name: z.string().min(1, 'Patient name required'),
  patient_dob: z.string().optional(),
  patient_id_number: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(drugLineSchema).min(1, 'Add at least one drug'),
});

type PrescriptionFormValues = z.infer<typeof prescriptionSchema>;

function NewPrescriptionModal({ onClose }: { onClose: () => void }) {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const router = useRouter();
  const outlet = useAuthStore((s) => s.outlet);
  const user = useAuthStore((s) => s.user);
  const tenantID = user?.tenant_id ?? '';
  const createPrescription = useCreatePrescription();
  const linkCRMContact = useLinkCRMContact();

  // Per-line catalog-item lookup (id -> full item, incl. price/sku) fed by each SearchableCombobox's
  // remote search — a single shared cache since drug names/ids are unique across lines.
  const drugCache = useRef(new Map<string, DrugCatalogItem>());
  const [patient, setPatient] = useState<SelectedCustomer | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PrescriptionFormValues>({
    resolver: zodResolver(prescriptionSchema),
    defaultValues: {
      prescriber_name: user?.fullName ?? '',
      lines: [{ drug_name: '', dosage: '', form: '', instructions: '', quantity_prescribed: 1 }],
    },
  });

  // Prescriber defaults to the logged-in dispensing user (pharmacist/doctor) — still editable for
  // scripts written by an outside prescriber and entered by a technician.
  useEffect(() => {
    if (user?.fullName) setValue('prescriber_name', user.fullName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.fullName]);

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  const onSubmit = async (values: PrescriptionFormValues) => {
    if (!outlet?.id) {
      toast.error('No outlet selected — please select an outlet first');
      return;
    }
    try {
      const rx = await createPrescription.mutateAsync({
        outlet_id: outlet.id,
        prescription_number: values.prescription_number,
        prescriber_name: values.prescriber_name,
        prescriber_license: values.prescriber_license,
        patient_name: values.patient_name,
        patient_dob: values.patient_dob || undefined,
        patient_id_number: values.patient_id_number || undefined,
        notes: values.notes || undefined,
        lines: values.lines.map((l) => ({
          drug_name: l.drug_name,
          dosage: l.dosage,
          form: l.form,
          instructions: l.instructions,
          quantity_prescribed: l.quantity_prescribed,
          catalog_item_id: l.catalog_item_id || undefined,
          lot_number: l.lot_number || undefined,
          unit_price: l.unit_price || undefined,
        })),
      });
      // Link the selected/created patient's CRM contact so the derived-patients list and the
      // detail-page CRM link both resolve to the same real customer record (no PII duplication —
      // marketflow/CRM stays the source of truth, we only store the pointer).
      if (patient?.crmContactId) {
        try {
          await linkCRMContact.mutateAsync({ id: rx.id, crmContactId: patient.crmContactId });
        } catch {
          // Best-effort — the prescription itself was created successfully either way.
        }
      }
      toast.success('Prescription created');
      onClose();
      router.push(`/${orgSlug}/pharmacy/${rx.id}`);
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to create prescription'));
    }
  };

  const inputCls = 'w-full bg-background border border-border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';
  const labelCls = 'text-xs font-semibold text-muted-foreground mb-1 block';
  const errorCls = 'text-xs text-destructive mt-0.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Pill className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-base">New Prescription</h3>
              <p className="text-xs text-muted-foreground">Enter prescription and drug details</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable form body */}
        <form onSubmit={handleSubmit(onSubmit)} className="overflow-y-auto flex-1">
          <div className="p-6 space-y-5">
            {/* Outlet info */}
            {!outlet && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 text-sm text-destructive">
                No outlet selected — please select an outlet before creating a prescription
              </div>
            )}

            {/* Prescription info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Prescription # <span className="text-destructive">*</span></label>
                <input {...register('prescription_number')} placeholder="RX-00001" className={inputCls} />
                {errors.prescription_number && <p className={errorCls}>{errors.prescription_number.message}</p>}
              </div>
              <div>
                <label className={labelCls}>Prescriber Name <span className="text-destructive">*</span></label>
                <input {...register('prescriber_name')} placeholder="Dr. Jane Doe" className={inputCls} />
                <p className="text-[11px] text-muted-foreground mt-0.5">Defaults to you — edit if this script was written by another prescriber.</p>
                {errors.prescriber_name && <p className={errorCls}>{errors.prescriber_name.message}</p>}
              </div>
              <div>
                <label className={labelCls}>Prescriber License # <span className="text-destructive">*</span></label>
                <input {...register('prescriber_license')} placeholder="LIC-12345" className={inputCls} />
                {errors.prescriber_license && <p className={errorCls}>{errors.prescriber_license.message}</p>}
              </div>
            </div>

            {/* Patient info — search an existing patient (by name/phone/email) or add a new one,
                reusing the exact same customer directory the retail checkout uses. */}
            <div className="rounded-xl border border-border bg-background/50 p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Patient Details</h4>
              <div>
                <label className={labelCls}>Patient <span className="text-destructive">*</span></label>
                <CustomerSearch
                  value={patient}
                  onChange={(c) => {
                    setPatient(c);
                    setValue('patient_name', c.isWalkIn ? '' : c.name, { shouldValidate: true });
                  }}
                  requireRealCustomer
                  requiredForLabel="a prescription"
                />
                <input type="hidden" {...register('patient_name')} />
                {errors.patient_name && <p className={errorCls}>{errors.patient_name.message}</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Date of Birth</label>
                  <input {...register('patient_dob')} type="date" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Patient ID Number</label>
                  <input {...register('patient_id_number')} placeholder="National ID / Passport" className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <textarea {...register('notes')} rows={2} placeholder="Any additional notes…" className={`${inputCls} resize-none`} />
              </div>
            </div>

            {/* Drug lines */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Drug Lines</h4>
                <button
                  type="button"
                  onClick={() => append({ drug_name: '', dosage: '', form: '', instructions: '', quantity_prescribed: 1, catalog_item_id: '', unit_price: undefined })}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/5 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Drug
                </button>
              </div>
              {errors.lines && typeof errors.lines.message === 'string' && (
                <p className={errorCls}>{errors.lines.message}</p>
              )}
              {fields.map((field, idx) => (
                <div key={field.id} className="rounded-xl border border-border bg-background/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground">Drug {idx + 1}</span>
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Drug <span className="text-destructive">*</span></label>
                      <SearchableCombobox
                        options={[]}
                        value={undefined}
                        onChange={(value) => {
                          const item = drugCache.current.get(value);
                          if (!item) return;
                          setValue(`lines.${idx}.drug_name`, item.name, { shouldValidate: true });
                          setValue(`lines.${idx}.catalog_item_id`, item.id);
                          if (item.price !== undefined) setValue(`lines.${idx}.unit_price`, item.price);
                        }}
                        onRemoteSearch={(q) => searchDrugs(tenantID, q, drugCache.current)}
                        placeholder="Search drugs…"
                        searchPlaceholder="Type drug name or SKU…"
                        emptyText="No drugs found"
                        clearable
                      />
                      {/* hidden field keeps RHF validation working */}
                      <input type="hidden" {...register(`lines.${idx}.drug_name`)} />
                      {errors.lines?.[idx]?.drug_name && <p className={errorCls}>{errors.lines[idx]?.drug_name?.message}</p>}
                    </div>
                    <div>
                      <label className={labelCls}>Dosage <span className="text-destructive">*</span></label>
                      <input {...register(`lines.${idx}.dosage`)} placeholder="e.g. 500mg" className={inputCls} />
                      {errors.lines?.[idx]?.dosage && <p className={errorCls}>{errors.lines[idx]?.dosage?.message}</p>}
                    </div>
                    <div>
                      <label className={labelCls}>Form <span className="text-destructive">*</span></label>
                      <input {...register(`lines.${idx}.form`)} placeholder="e.g. Capsule, Tablet" className={inputCls} />
                      {errors.lines?.[idx]?.form && <p className={errorCls}>{errors.lines[idx]?.form?.message}</p>}
                    </div>
                    <div>
                      <label className={labelCls}>Qty <span className="text-destructive">*</span></label>
                      <input {...register(`lines.${idx}.quantity_prescribed`)} type="number" min="1" placeholder="1" className={inputCls} />
                      {errors.lines?.[idx]?.quantity_prescribed && <p className={errorCls}>{errors.lines[idx]?.quantity_prescribed?.message}</p>}
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Instructions <span className="text-destructive">*</span></label>
                      <input {...register(`lines.${idx}.instructions`)} placeholder="e.g. Take 1 capsule twice daily" className={inputCls} />
                      {errors.lines?.[idx]?.instructions && <p className={errorCls}>{errors.lines[idx]?.instructions?.message}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex gap-3 px-6 pb-6 pt-2 border-t border-border shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 min-h-11 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !outlet}
              className="flex-1 min-h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Prescription
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function PharmacyPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const searchParams = useSearchParams();
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const tenantSlug = useAuthStore((s) => s.user?.tenant_slug ?? orgSlug);

  // ?new=1 from redirect (e.g. navigating to /pharmacy/new)
  useEffect(() => {
    if (searchParams?.get('new') === '1') {
      setCreateOpen(true);
      router.replace(`/${orgSlug}/pharmacy`);
    }
  }, [searchParams, orgSlug, router]);

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
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to dispense prescription'));
    }
  };

  const rows = prescriptions ?? [];

  return (
    <div className="p-6">
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
        <div className="flex items-center gap-2">
          <Can permission={P.ORDERS_ADD}>
            <button
              type="button"
              onClick={() => setWalkInOpen(true)}
              className="inline-flex items-center gap-2 border border-border bg-background text-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-accent transition-colors"
            >
              <ShoppingCart className="h-4 w-4" />
              Walk-In Sale
            </button>
          </Can>
          <Can permission={P.PHARMACY_ADD}>
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Fill Prescription
            </button>
          </Can>
        </div>
      </div>

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

      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading prescriptions…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
          <Pill className="h-10 w-10 opacity-30" />
          <p className="font-medium">No prescriptions found</p>
          <Can permission={P.PHARMACY_ADD}>
            <button onClick={() => setCreateOpen(true)} className="text-sm text-primary underline">
              Fill a prescription
            </button>
          </Can>
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
                      {(rx.status === 'approved' || rx.status === 'locked') && (
                        <Can permission={P.PHARMACY_CHANGE}>
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
                        </Can>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && <NewPrescriptionModal onClose={() => setCreateOpen(false)} />}
      <WalkInSaleModal open={walkInOpen} onClose={() => setWalkInOpen(false)} tenantSlug={tenantSlug} />
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
