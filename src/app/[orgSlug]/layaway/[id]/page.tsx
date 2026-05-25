'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Badge, Button } from '@/components/ui/base';
import {
  useLayawayPlan,
  useRecordLayawayPayment,
  useCancelLayaway,
  type LayawayPlan,
  type RecordPaymentInput,
} from '@/hooks/useLayaway';
import { cn } from '@/lib/utils';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

function statusVariant(status: LayawayPlan['status']): 'default' | 'success' | 'outline' {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'outline';
  return 'default';
}

const PAYMENT_METHODS = ['cash', 'mpesa', 'card'] as const;

function LayawayDetailPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const id = params?.id as string;
  const router = useRouter();

  const { data: plan, isLoading } = useLayawayPlan(id);
  const recordPayment = useRecordLayawayPayment(id);
  const cancelPlan = useCancelLayaway();

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState<RecordPaymentInput>({
    amount: 0,
    payment_method: 'cash',
    reference: '',
    notes: '',
  });
  const [cancelOpen, setCancelOpen] = useState(false);

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentForm.amount || paymentForm.amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    recordPayment.mutate(
      {
        amount: Number(paymentForm.amount),
        payment_method: paymentForm.payment_method,
        reference: paymentForm.reference || undefined,
        notes: paymentForm.notes || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Payment recorded');
          setPaymentOpen(false);
          setPaymentForm({ amount: 0, payment_method: 'cash', reference: '', notes: '' });
        },
        onError: () => toast.error('Failed to record payment'),
      }
    );
  };

  const handleCancel = () => {
    cancelPlan.mutate(id, {
      onSuccess: () => {
        toast.success('Layaway plan cancelled');
        setCancelOpen(false);
      },
      onError: () => toast.error('Failed to cancel plan'),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading…</span>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>Plan not found.</p>
        <button onClick={() => router.back()} className="text-sm text-primary underline mt-2">Go back</button>
      </div>
    );
  }

  const progressPct = Math.min(100, (plan.paid_amount / plan.total_amount) * 100);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{plan.customer_name}</h1>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <Badge
              variant={statusVariant(plan.status)}
              className={cn(plan.status === 'active' && 'bg-blue-500/10 text-blue-600 border-blue-500/20')}
            >
              {plan.status}
            </Badge>
            {plan.customer_phone && (
              <span className="text-sm text-muted-foreground">{plan.customer_phone}</span>
            )}
            {plan.customer_email && (
              <span className="text-sm text-muted-foreground">{plan.customer_email}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {plan.status === 'active' && (
            <>
              <Button onClick={() => setPaymentOpen(true)} className="min-h-10 px-4">
                Record Payment
              </Button>
              <Button variant="destructive" className="min-h-10 px-4" onClick={() => setCancelOpen(true)}>
                Cancel Plan
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Total</p>
            <p className="text-xl font-bold font-mono">KES {plan.total_amount.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Paid</p>
            <p className="text-xl font-bold font-mono text-green-600">{plan.paid_amount.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Remaining</p>
            <p className="text-xl font-bold font-mono text-amber-600">{plan.remaining_amount.toLocaleString()}</p>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Progress</span>
            <span>{progressPct.toFixed(0)}%</span>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        {plan.due_date && (
          <p className="text-sm text-muted-foreground">
            Due: <span className="font-semibold text-foreground">{new Date(plan.due_date).toLocaleDateString()}</span>
          </p>
        )}
        {plan.notes && <p className="text-sm text-muted-foreground italic">{plan.notes}</p>}
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-bold text-base">Payment History</h2>
        </div>
        {!plan.payments?.length ? (
          <p className="text-sm text-muted-foreground px-5 py-6">No payments recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/20">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Amount</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Method</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Reference</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {plan.payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-mono font-semibold text-green-600">KES {p.amount.toLocaleString()}</td>
                  <td className="px-4 py-3 capitalize">{p.payment_method}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.reference ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(p.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Record Payment Modal */}
      {paymentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-base">Record Payment</h3>
              <button onClick={() => setPaymentOpen(false)} className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Amount (KES) <span className="text-destructive">*</span>
                </label>
                <input
                  required
                  type="number"
                  min="1"
                  value={paymentForm.amount || ''}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.valueAsNumber }))}
                  placeholder="0"
                  className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Payment Method <span className="text-destructive">*</span>
                </label>
                <div className="flex gap-2">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentForm((p) => ({ ...p, payment_method: m }))}
                      className={cn(
                        'flex-1 py-2 rounded-xl border-2 text-sm font-semibold capitalize transition-all',
                        paymentForm.payment_method === m
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border hover:border-primary/30'
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Reference</label>
                <input
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, reference: e.target.value }))}
                  placeholder="Transaction ref…"
                  className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Notes</label>
                <input
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Optional notes…"
                  className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <Button type="button" variant="outline" className="flex-1 min-h-11" onClick={() => setPaymentOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 min-h-11" disabled={recordPayment.isPending}>
                  {recordPayment.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Record
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Confirm Modal */}
      {cancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm p-6 shadow-2xl text-center">
            <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
            <h3 className="font-bold text-base mb-2">Cancel Layaway Plan?</h3>
            <p className="text-sm text-muted-foreground mb-6">
              This will cancel the plan for <strong>{plan.customer_name}</strong>. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 min-h-11" onClick={() => setCancelOpen(false)}>
                Keep Plan
              </Button>
              <Button variant="destructive" className="flex-1 min-h-11" disabled={cancelPlan.isPending} onClick={handleCancel}>
                {cancelPlan.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Cancel Plan
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LayawayDetailPageGated() {
  return (
    <ModuleGate moduleKey="layaway" fallback={<ModuleUnavailablePage moduleKey="layaway" />}>
      <LayawayDetailPage />
    </ModuleGate>
  );
}
