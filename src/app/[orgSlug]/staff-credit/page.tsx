'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { cn, formatCurrency } from '@/lib/utils';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { Loader2, Users } from 'lucide-react';
import { FeatureLock } from '@bengo-hub/shared-ui-lib/subscription';

const FEATURE = 'staff_fund_from_salary';

interface StaffCreditLink {
  id: string;
  origin: 'layaway' | 'credit_sale';
  principal: number;
  amount_settled: number;
  outstanding: number;
  sync_status: 'pending' | 'synced' | 'failed';
  status: 'active' | 'settled' | 'cancelled';
  created_at: string;
}

const SYNC_CLS: Record<string, string> = {
  synced: 'bg-success/10 text-success',
  pending: 'bg-warning/10 text-warning',
  failed: 'bg-destructive/10 text-destructive',
};
function useStaffCredit() {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  return useQuery({
    queryKey: ['staff-credit', tenantID],
    queryFn: () => apiClient.get<{ data: StaffCreditLink[] }>(`/api/v1/${tenantID}/pos/staff-credit`),
    enabled: !!tenantID,
    staleTime: 30_000,
  });
}

function StaffCreditPage() {
  const { data, isLoading, isError } = useStaffCredit();
  const rows = data?.data ?? [];
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';
  const money = (v: number) => formatCurrency(v, currency);

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Staff Credit</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Staff purchases funded from salary — synced to ERP payroll for recovery.
          </p>
        </div>
      </div>

      {/* Premium — visible + upgrade-gated (never hidden) */}
      <FeatureLock feature={FEATURE} mode="block">
        {isLoading ? (
          <div className="flex items-center gap-3 h-40 justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">Failed to load. Please retry.</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <Users className="h-8 w-8 opacity-30" />
            <p>No staff credit yet.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border overflow-hidden bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-accent/30 text-left">
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Origin</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Principal</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Recovered</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Outstanding</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Sync</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Status</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-accent/20">
                    <td className="px-4 py-3 capitalize">{r.origin.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-right">{money(r.principal)}</td>
                    <td className="px-4 py-3 text-right text-success">{money(r.amount_settled)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{money(r.outstanding)}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', SYNC_CLS[r.sync_status] ?? 'bg-muted')}>
                        {r.sync_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{r.status}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FeatureLock>
    </div>
  );
}

export default function StaffCreditPageGated() {
  return (
    <ModuleGate moduleKey="layaway" fallback={<ModuleUnavailablePage moduleKey="layaway" />}>
      <StaffCreditPage />
    </ModuleGate>
  );
}
