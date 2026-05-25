'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Badge, Button } from '@/components/ui/base';
import {
  useLayawayPlans,
  useCreateLayaway,
  type LayawayPlan,
  type CreateLayawayInput,
} from '@/hooks/useLayaway';
import { cn } from '@/lib/utils';
import { Loader2, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

function statusVariant(status: LayawayPlan['status']): 'default' | 'success' | 'outline' {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'outline';
  return 'default';
}

const EMPTY_FORM: CreateLayawayInput = {
  customer_name: '',
  customer_phone: '',
  customer_email: '',
  total_amount: 0,
  deposit_amount: 0,
  due_date: '',
  notes: '',
};

function LayawayListPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const router = useRouter();
  const searchParams = useSearchParams();

  const { data: plans = [], isLoading, isError } = useLayawayPlans('active');
  const createLayaway = useCreateLayaway();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateLayawayInput>(EMPTY_FORM);

  // ?new=1 from redirect (e.g. navigating to /layaway/new)
  useEffect(() => {
    if (searchParams?.get('new') === '1') {
      setCreateOpen(true);
      router.replace(`/${orgSlug}/layaway`);
    }
  }, [searchParams, orgSlug, router]);

  const setField = <K extends keyof CreateLayawayInput>(key: K, value: CreateLayawayInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_name || !form.total_amount || !form.deposit_amount) {
      toast.error('Please fill in all required fields');
      return;
    }
    const payload: CreateLayawayInput = {
      customer_name: form.customer_name,
      total_amount: Number(form.total_amount),
      deposit_amount: Number(form.deposit_amount),
    };
    if (form.customer_phone) payload.customer_phone = form.customer_phone;
    if (form.customer_email) payload.customer_email = form.customer_email;
    if (form.due_date) payload.due_date = form.due_date;
    if (form.notes) payload.notes = form.notes;

    createLayaway.mutate(payload, {
      onSuccess: (plan) => {
        toast.success('Layaway plan created');
        setCreateOpen(false);
        setForm(EMPTY_FORM);
        router.push(`/${orgSlug}/layaway/${plan.id}`);
      },
      onError: () => toast.error('Failed to create layaway plan'),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading…</span>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Layaway Plans</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage customer layaway agreements</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5">
          <Plus className="h-4 w-4" />
          New Layaway
        </Button>
      </div>

      {isError && (
        <p className="text-sm text-destructive mb-4">Failed to load layaway plans.</p>
      )}

      {plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
          <p className="font-medium">No active layaway plans</p>
          <button onClick={() => setCreateOpen(true)} className="text-sm text-primary underline">
            Create one
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Customer</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Phone</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Total</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Paid</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Remaining</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Due Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {plans.map((plan) => (
                <tr
                  key={plan.id}
                  onClick={() => router.push(`/${orgSlug}/layaway/${plan.id}`)}
                  className="hover:bg-accent/30 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3.5 font-medium">{plan.customer_name}</td>
                  <td className="px-4 py-3.5 text-muted-foreground">{plan.customer_phone ?? '—'}</td>
                  <td className="px-4 py-3.5 text-right font-mono">KES {plan.total_amount.toLocaleString()}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-green-600">{plan.paid_amount.toLocaleString()}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-amber-600">{plan.remaining_amount.toLocaleString()}</td>
                  <td className="px-4 py-3.5">
                    <Badge
                      variant={statusVariant(plan.status)}
                      className={cn(plan.status === 'active' && 'bg-blue-500/10 text-blue-600 border-blue-500/20')}
                    >
                      {plan.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground">
                    {plan.due_date ? new Date(plan.due_date).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Layaway Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-lg p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-base">New Layaway Plan</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Set up a customer payment plan</p>
              </div>
              <button
                onClick={() => { setCreateOpen(false); setForm(EMPTY_FORM); }}
                className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Customer Name <span className="text-destructive">*</span>
                </label>
                <input
                  required
                  value={form.customer_name}
                  onChange={(e) => setField('customer_name', e.target.value)}
                  placeholder="Full name"
                  className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Phone</label>
                  <input
                    value={form.customer_phone}
                    onChange={(e) => setField('customer_phone', e.target.value)}
                    placeholder="+254 700 000 000"
                    type="tel"
                    className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Email</label>
                  <input
                    value={form.customer_email}
                    onChange={(e) => setField('customer_email', e.target.value)}
                    placeholder="customer@email.com"
                    type="email"
                    className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    Total (KES) <span className="text-destructive">*</span>
                  </label>
                  <input
                    required
                    type="number"
                    min="0"
                    value={form.total_amount || ''}
                    onChange={(e) => setField('total_amount', e.target.valueAsNumber)}
                    placeholder="0"
                    className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    Deposit (KES) <span className="text-destructive">*</span>
                  </label>
                  <input
                    required
                    type="number"
                    min="0"
                    value={form.deposit_amount || ''}
                    onChange={(e) => setField('deposit_amount', e.target.valueAsNumber)}
                    placeholder="0"
                    className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Due Date</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setField('due_date', e.target.value)}
                  className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Notes</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                  placeholder="Any additional notes…"
                  className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 min-h-11"
                  onClick={() => { setCreateOpen(false); setForm(EMPTY_FORM); }}
                  disabled={createLayaway.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 min-h-11" disabled={createLayaway.isPending}>
                  {createLayaway.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Create Plan
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LayawayListPageGated() {
  return (
    <ModuleGate moduleKey="layaway" fallback={<ModuleUnavailablePage moduleKey="layaway" />}>
      <LayawayListPage />
    </ModuleGate>
  );
}
