'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

import { useCreatePrescription } from '@/hooks/usePharmacy';
import { useAuthStore } from '@/store/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Pill, Plus, Trash2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

// ─── Schema ───────────────────────────────────────────────────────────────────

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

const schema = z.object({
  prescription_number: z.string().min(1, 'Prescription number required'),
  prescriber_name: z.string().min(1, 'Prescriber name required'),
  prescriber_license: z.string().min(1, 'Prescriber license required'),
  patient_name: z.string().min(1, 'Patient name required'),
  patient_dob: z.string().optional(),
  patient_id_number: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(drugLineSchema).min(1, 'Add at least one drug'),
});

type FormValues = z.infer<typeof schema>;

// ─── Page ─────────────────────────────────────────────────────────────────────

function NewPrescriptionPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const router = useRouter();
  const outlet = useAuthStore((s) => s.outlet);

  const createPrescription = useCreatePrescription();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      lines: [
        {
          drug_name: '',
          dosage: '',
          form: '',
          instructions: '',
          quantity_prescribed: 1,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  const onSubmit = async (values: FormValues) => {
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
      router.push(`/${orgSlug}/pharmacy/${rx.id}`);
    } catch {
      toast.error('Failed to create prescription');
    }
  };

  const inputCls =
    'w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';
  const labelCls = 'text-xs font-semibold text-muted-foreground mb-1.5 block';
  const errorCls = 'text-xs text-destructive mt-1';

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Pill className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">New Prescription</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Enter prescription and drug details</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Outlet info (read-only) */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <h2 className="text-sm font-bold mb-4">Outlet</h2>
          <div>
            <label className={labelCls}>Outlet</label>
            <div className={`${inputCls} bg-muted/40 text-muted-foreground cursor-default`}>
              {outlet ? `${outlet.name} (${outlet.code})` : 'No outlet selected'}
            </div>
            {!outlet && (
              <p className={errorCls}>Please select an outlet before creating a prescription</p>
            )}
          </div>
        </div>

        {/* Prescription info */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <h2 className="text-sm font-bold">Prescription Details</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>
                Prescription # <span className="text-destructive">*</span>
              </label>
              <input {...register('prescription_number')} placeholder="RX-00001" className={inputCls} />
              {errors.prescription_number && <p className={errorCls}>{errors.prescription_number.message}</p>}
            </div>
            <div>
              <label className={labelCls}>
                Prescriber Name <span className="text-destructive">*</span>
              </label>
              <input {...register('prescriber_name')} placeholder="Dr. Jane Doe" className={inputCls} />
              {errors.prescriber_name && <p className={errorCls}>{errors.prescriber_name.message}</p>}
            </div>
            <div>
              <label className={labelCls}>
                Prescriber License # <span className="text-destructive">*</span>
              </label>
              <input {...register('prescriber_license')} placeholder="LIC-12345" className={inputCls} />
              {errors.prescriber_license && <p className={errorCls}>{errors.prescriber_license.message}</p>}
            </div>
          </div>
        </div>

        {/* Patient info */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <h2 className="text-sm font-bold">Patient Details</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>
                Patient Name <span className="text-destructive">*</span>
              </label>
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
            <textarea
              {...register('notes')}
              rows={3}
              placeholder="Any additional notes…"
              className={`${inputCls} resize-none`}
            />
          </div>
        </div>

        {/* Drug lines */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">Drug Lines</h2>
            <button
              type="button"
              onClick={() =>
                append({ drug_name: '', dosage: '', form: '', instructions: '', quantity_prescribed: 1 })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/5 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Drug
            </button>
          </div>

          {errors.lines && typeof errors.lines.message === 'string' && (
            <p className={errorCls}>{errors.lines.message}</p>
          )}

          <div className="space-y-4">
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
                    <label className={labelCls}>
                      Drug Name <span className="text-destructive">*</span>
                    </label>
                    <input
                      {...register(`lines.${idx}.drug_name`)}
                      placeholder="e.g. Amoxicillin"
                      className={inputCls}
                    />
                    {errors.lines?.[idx]?.drug_name && (
                      <p className={errorCls}>{errors.lines[idx]?.drug_name?.message}</p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>
                      Dosage <span className="text-destructive">*</span>
                    </label>
                    <input
                      {...register(`lines.${idx}.dosage`)}
                      placeholder="e.g. 500mg"
                      className={inputCls}
                    />
                    {errors.lines?.[idx]?.dosage && (
                      <p className={errorCls}>{errors.lines[idx]?.dosage?.message}</p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>
                      Form <span className="text-destructive">*</span>
                    </label>
                    <input
                      {...register(`lines.${idx}.form`)}
                      placeholder="e.g. Capsule, Tablet, Syrup"
                      className={inputCls}
                    />
                    {errors.lines?.[idx]?.form && (
                      <p className={errorCls}>{errors.lines[idx]?.form?.message}</p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>
                      Qty Prescribed <span className="text-destructive">*</span>
                    </label>
                    <input
                      {...register(`lines.${idx}.quantity_prescribed`)}
                      type="number"
                      min="1"
                      placeholder="1"
                      className={inputCls}
                    />
                    {errors.lines?.[idx]?.quantity_prescribed && (
                      <p className={errorCls}>{errors.lines[idx]?.quantity_prescribed?.message}</p>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>
                      Instructions <span className="text-destructive">*</span>
                    </label>
                    <input
                      {...register(`lines.${idx}.instructions`)}
                      placeholder="e.g. Take 1 capsule twice daily with food"
                      className={inputCls}
                    />
                    {errors.lines?.[idx]?.instructions && (
                      <p className={errorCls}>{errors.lines[idx]?.instructions?.message}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.back()}
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
  );
}

export default function NewPrescriptionPageGated() {
  return (
    <ModuleGate moduleKey="pharmacy" fallback={<ModuleUnavailablePage moduleKey="pharmacy" />}>
      <NewPrescriptionPage />
    </ModuleGate>
  );
}
