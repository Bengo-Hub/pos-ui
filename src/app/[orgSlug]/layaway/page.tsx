'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

import { Badge } from '@/components/ui/base';
import { listLayawayPlans, type LayawayPlan } from '@/lib/api/layaway';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

function statusVariant(status: LayawayPlan['status']): 'default' | 'success' | 'outline' {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'outline';
  return 'default';
}

function LayawayListPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const router = useRouter();
  const tenantSlug = useAuthStore((s) => s.user?.tenant_slug ?? '');

  const [plans, setPlans] = useState<LayawayPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantSlug) return;
    listLayawayPlans(tenantSlug, { status: 'active' })
      .then((res) => setPlans(res.data ?? []))
      .catch(() => toast.error('Failed to load layaway plans'))
      .finally(() => setLoading(false));
  }, [tenantSlug]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Layaway Plans</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage customer layaway agreements</p>
        </div>
        <Link
          href={`/${orgSlug}/layaway/new`}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Layaway
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
          <p className="font-medium">No active layaway plans</p>
          <Link href={`/${orgSlug}/layaway/new`} className="text-sm text-primary underline">
            Create one
          </Link>
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
                    <Badge variant={statusVariant(plan.status)} className={cn(plan.status === 'active' && 'bg-blue-500/10 text-blue-600 border-blue-500/20')}>
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
