'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
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
    'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="flex-1">
            <h2 className="font-bold text-base">New Repair</h2>
            <p className="text-xs text-muted-foreground">Open a job card at intake</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Customer name</label>
              <input className={field} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Phone</label>
              <input className={field} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="07…" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Device</label>
            <input className={field} value={deviceDescription} onChange={(e) => setDeviceDescription(e.target.value)} placeholder="iPhone 13 Pro, Space Gray, IMEI…" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Reported issue</label>
            <textarea className={`${field} resize-none`} rows={3} value={reportedIssue} onChange={(e) => setReportedIssue(e.target.value)} placeholder="Customer-reported fault…" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Estimated cost (optional)</label>
            <input type="number" inputMode="decimal" className={field} value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} placeholder="0.00" />
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createRepair.isPending}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {createRepair.isPending ? 'Creating…' : 'Create Job'}
          </button>
        </div>
      </form>
    </div>
  );
}
