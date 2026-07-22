'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

import { cn } from '@/lib/utils';
import { usePrescriptions, useDispensePrescription, useCreatePrescription } from '@/hooks/usePharmacy';
import { useMenuItems, type CatalogItem } from '@/hooks/usePOS';
import { useAuthStore } from '@/store/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import { WalkInSaleModal } from '@/components/pos/walk-in-sale-modal';
import { ChevronDown, Loader2, Pill, Plus, Eye, ShoppingCart, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { z } from 'zod';
import type { Prescription, PrescriptionStatus } from '@/lib/api/pharmacy';

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

// ─── Drug search combobox ─────────────────────────────────────────────────────

function DrugSearchCombobox({
  selectedName,
  onSelect,
}: {
  selectedName: string;
  onSelect: (item: CatalogItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const { data: catalog, isFetching } = useMenuItems({ category: 'pharmaceutical', search, limit: 30 });
  const items = catalog?.data ?? [];

  const handleSelect = useCallback(
    (item: CatalogItem) => {
      onSelect(item);
      setOpen(false);
      setSearch('');
    },
    [onSelect],
  );

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const inputCls =
    'w-full bg-background border border-border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          inputCls,
          'flex items-center justify-between text-left cursor-pointer',
          !selectedName && 'text-muted-foreground',
        )}
      >
        <span className="truncate">{selectedName || 'Search drugs…'}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground ml-2" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-card shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to search…"
              className="w-full bg-background border border-border rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {isFetching ? (
              <div className="flex items-center justify-center py-6 gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching…
              </div>
            ) : items.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">No drugs found</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.sku}</p>
                  </div>
                  {item.price !== undefined && (
                    <span className="text-xs font-semibold text-muted-foreground ml-3 shrink-0">
                      {item.price.toFixed(2)}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
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
  const createPrescription = useCreatePrescription();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PrescriptionFormValues>({
    resolver: zodResolver(prescriptionSchema),
    defaultValues: {
      lines: [{ drug_name: '', dosage: '', form: '', instructions: '', quantity_prescribed: 1 }],
    },
  });

  const watchedLines = watch('lines');

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
                {errors.prescriber_name && <p className={errorCls}>{errors.prescriber_name.message}</p>}
              </div>
              <div>
                <label className={labelCls}>Prescriber License # <span className="text-destructive">*</span></label>
                <input {...register('prescriber_license')} placeholder="LIC-12345" className={inputCls} />
                {errors.prescriber_license && <p className={errorCls}>{errors.prescriber_license.message}</p>}
              </div>
            </div>

            {/* Patient info */}
            <div className="rounded-xl border border-border bg-background/50 p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Patient Details</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Patient Name <span className="text-destructive">*</span></label>
                  <input {...register('patient_name')} placeholder="Full name" className={inputCls} />
                  {errors.patient_name && <p className={errorCls}>{errors.patient_name.message}</p>}
                </div>
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
                      <DrugSearchCombobox
                        selectedName={watchedLines?.[idx]?.drug_name ?? ''}
                        onSelect={(item) => {
                          setValue(`lines.${idx}.drug_name`, item.name, { shouldValidate: true });
                          setValue(`lines.${idx}.catalog_item_id`, item.id);
                          if (item.price !== undefined) {
                            setValue(`lines.${idx}.unit_price`, item.price);
                          }
                        }}
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
          <button
            type="button"
            onClick={() => setWalkInOpen(true)}
            className="inline-flex items-center gap-2 border border-border bg-background text-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-accent transition-colors"
          >
            <ShoppingCart className="h-4 w-4" />
            Walk-In Sale
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Fill Prescription
          </button>
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
          <button onClick={() => setCreateOpen(true)} className="text-sm text-primary underline">
            Fill a prescription
          </button>
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
