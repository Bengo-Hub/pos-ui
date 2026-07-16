'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Badge, Button } from '@/components/ui/base';
import { CreateLayawayModal } from '@/components/pos/layaway/create-layaway-modal';
import { useLayawayPlans, type LayawayPlan } from '@/hooks/useLayaway';
import { useOutletFilterStore } from '@/store/outlet-filter';
import { cn } from '@/lib/utils';
import { Loader2, Plus } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

function statusVariant(status: LayawayPlan['status']): 'default' | 'success' | 'outline' {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'outline';
  return 'default';
}

function LayawayListPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const router = useRouter();
  const searchParams = useSearchParams();

  // Branch filter (QA req 7a): filter plans by outlet; "" = all branches.
  // Preselects + follows the globally selected outlet (top-nav switcher).
  const outlets = useOutletFilterStore((s) => s.outlets);
  const selectedOutlet = useOutletFilterStore((s) => s.selectedOutlet);
  const [outletFilter, setOutletFilter] = useState(selectedOutlet?.id ?? '');
  useEffect(() => {
    setOutletFilter(selectedOutlet?.id ?? '');
  }, [selectedOutlet?.id]);
  const outletNameById = useMemo(() => Object.fromEntries(outlets.map((o) => [o.id, o.name])), [outlets]);

  const { data: plans = [], isLoading, isError } = useLayawayPlans('active', outletFilter || undefined);
  const [createOpen, setCreateOpen] = useState(false);

  // ?new=1 from redirect (e.g. navigating to /layaway/new)
  useEffect(() => {
    if (searchParams?.get('new') === '1') {
      setCreateOpen(true);
      router.replace(`/${orgSlug}/layaway`);
    }
  }, [searchParams, orgSlug, router]);

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
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Layaway Plans</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage customer layaway agreements</p>
        </div>
        <div className="flex items-center gap-2">
          {outlets.length > 1 && (
            <select
              value={outletFilter}
              onChange={(e) => setOutletFilter(e.target.value)}
              className="bg-background border border-border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="Filter by branch"
            >
              <option value="">All branches</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
          <Button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5">
            <Plus className="h-4 w-4" />
            New Layaway
          </Button>
        </div>
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
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Branch</th>
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
                  <td className="px-4 py-3.5 text-muted-foreground">{(plan.outlet_id && outletNameById[plan.outlet_id]) || '—'}</td>
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

      <CreateLayawayModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(plan) => {
          setCreateOpen(false);
          router.push(`/${orgSlug}/layaway/${plan.id}`);
        }}
      />
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
