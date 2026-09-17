'use client';

import { useState } from 'react';
import { X, Wrench, User, Phone, Smartphone, ClipboardList, Banknote, Loader2 } from 'lucide-react';
import { useCreateRepair } from '@/hooks/useRepairs';
import { apiErrorMessage } from '@/lib/api/error-message';

interface RepairIntakeFormProps {
  open: boolean;
  onClose: () => void;
  onCreated: (jobID: string) => void;
}

/** Modal intake form to open a new repair job (customer, device, reported issue). */
export function RepairIntakeForm({ open, onClose, onCreated }: RepairIntakeFormProps) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deviceDescription, setDeviceDescription] = useState('');
  const [reportedIssue, setReportedIssue] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const createRepair = useCreateRepair();

  function reset() {
    setCustomerName('');
    setCustomerPhone('');
    setDeviceDescription('');
    setReportedIssue('');
    setEstimatedCost('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createRepair.mutate(
      {
        customer_name: customerName || undefined,
        customer_phone: customerPhone || undefined,
        device_description: deviceDescription || undefined,
        reported_issue: reportedIssue || undefined,
        estimated_cost: estimatedCost || undefined,
        // outlet_id is filled server-side from the X-Outlet-ID context when omitted.
      },
      {
        onSuccess: (job) => {
          import('sonner').then(({ toast }) => toast.success(`Job ${job.job_number} created`));
          reset();
          onCreated(job.id);
        },
        onError: async (e) => {
          const { toast } = await import('sonner');
          toast.error(await apiErrorMessage(e, 'Failed to create repair job'));
        },
      },
    );
  }

  if (!open) return null;

  const field =
    'w-full bg-background border border-border rounded-xl pl-10 pr-3.5 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-shadow';
  const fieldWrap = 'relative';
  const fieldIcon = 'absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none';
  const label = 'text-xs font-bold uppercase tracking-wide text-muted-foreground';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-xl my-8 max-h-[calc(100vh-4rem)] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4 px-6 sm:px-8 py-6 border-b border-border shrink-0">
          <div className="h-12 w-12 shrink-0 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Wrench className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-lg text-foreground">New Repair</h2>
            <p className="text-sm text-muted-foreground">Open a job card at intake</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl hover:bg-accent transition-colors"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 sm:p-8 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={label}>Customer name</label>
              <div className={fieldWrap}>
                <User className={fieldIcon} />
                <input className={field} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Jane Doe" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className={label}>Phone</label>
              <div className={fieldWrap}>
                <Phone className={fieldIcon} />
                <input className={field} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="07…" />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className={label}>Device</label>
            <div className={fieldWrap}>
              <Smartphone className={fieldIcon} />
              <input className={field} value={deviceDescription} onChange={(e) => setDeviceDescription(e.target.value)} placeholder="iPhone 13 Pro, Space Gray, IMEI…" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className={label}>Reported issue</label>
            <div className={fieldWrap}>
              <ClipboardList className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <textarea className={`${field} resize-none`} rows={4} value={reportedIssue} onChange={(e) => setReportedIssue(e.target.value)} placeholder="Customer-reported fault…" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className={label}>Estimated cost (optional)</label>
            <div className={fieldWrap}>
              <Banknote className={fieldIcon} />
              <input type="number" inputMode="decimal" className={field} value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} placeholder="0.00" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 sm:px-8 py-6 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3.5 rounded-2xl border border-border text-sm font-bold hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createRepair.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60 transition-all shadow-lg shadow-primary/25"
          >
            {createRepair.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {createRepair.isPending ? 'Creating…' : 'Create Job'}
          </button>
        </div>
      </form>
    </div>
  );
}
