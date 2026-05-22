'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

import { Button } from '@/components/ui/base';
import { createLayawayPlan, type CreateLayawayPlanInput } from '@/lib/api/layaway';
import { useAuthStore } from '@/store/auth';
import { Loader2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

function NewLayawayPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const router = useRouter();
  const tenantSlug = useAuthStore((s) => s.user?.tenant_slug ?? '');

  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<CreateLayawayPlanInput>({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    total_amount: 0,
    deposit_amount: 0,
    due_date: '',
    notes: '',
  });

  const set = <K extends keyof CreateLayawayPlanInput>(key: K, value: CreateLayawayPlanInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_name || !form.total_amount || !form.deposit_amount) {
      toast.error('Please fill in all required fields');
      return;
    }
    setSubmitting(true);
    try {
      const payload: CreateLayawayPlanInput = {
        customer_name: form.customer_name,
        total_amount: Number(form.total_amount),
        deposit_amount: Number(form.deposit_amount),
      };
      if (form.customer_phone) payload.customer_phone = form.customer_phone;
      if (form.customer_email) payload.customer_email = form.customer_email;
      if (form.due_date) payload.due_date = form.due_date;
      if (form.notes) payload.notes = form.notes;

      const plan = await createLayawayPlan(tenantSlug, payload);
      toast.success('Layaway plan created');
      router.push(`/${orgSlug}/layaway/${plan.id}`);
    } catch {
      toast.error('Failed to create layaway plan');
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">New Layaway Plan</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Set up a customer payment plan</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 bg-card rounded-2xl border border-border p-6">
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
            Customer Name <span className="text-destructive">*</span>
          </label>
          <input
            required
            value={form.customer_name}
            onChange={(e) => set('customer_name', e.target.value)}
            placeholder="Full name"
            className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Phone</label>
          <input
            value={form.customer_phone}
            onChange={(e) => set('customer_phone', e.target.value)}
            placeholder="+254 700 000 000"
            type="tel"
            className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Email</label>
          <input
            value={form.customer_email}
            onChange={(e) => set('customer_email', e.target.value)}
            placeholder="customer@email.com"
            type="email"
            className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
              Total Amount (KES) <span className="text-destructive">*</span>
            </label>
            <input
              required
              type="number"
              min="0"
              value={form.total_amount || ''}
              onChange={(e) => set('total_amount', e.target.valueAsNumber)}
              placeholder="0"
              className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
              Deposit Amount (KES) <span className="text-destructive">*</span>
            </label>
            <input
              required
              type="number"
              min="0"
              value={form.deposit_amount || ''}
              onChange={(e) => set('deposit_amount', e.target.valueAsNumber)}
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
            onChange={(e) => set('due_date', e.target.value)}
            className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Notes</label>
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Any additional notes…"
            className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1 min-h-11"
            onClick={() => router.back()}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" className="flex-1 min-h-11" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Create Plan
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NewLayawayPageGated() {
  return (
    <ModuleGate moduleKey="layaway" fallback={<ModuleUnavailablePage moduleKey="layaway" />}>
      <NewLayawayPage />
    </ModuleGate>
  );
}
