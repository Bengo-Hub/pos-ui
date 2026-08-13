'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { cn, formatCurrency } from '@/lib/utils';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { RefreshCw, Users } from 'lucide-react';
import { FeatureLock } from '@bengo-hub/shared-ui-lib/subscription';
import { DataTable } from '@bengo-hub/shared-ui-lib/data-table';
import { useMemo, useState } from 'react';
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker';
import { buildStaffCreditColumns, type StaffCreditLink } from './staff-credit-columns';

const FEATURE = 'staff_fund_from_salary';

function useStaffCredit(from?: string, to?: string) {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  return useQuery({
    queryKey: ['staff-credit', tenantID, from, to],
    queryFn: () => apiClient.get<{ data: StaffCreditLink[] }>(`/api/v1/${tenantID}/pos/staff-credit`, {
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
    enabled: !!tenantID,
    staleTime: 30_000,
  });
}

function StaffCreditPage() {
  const [range, setRange] = useState<DateRange>({ from: '', to: '' });
  const { data, isLoading, isError, refetch, isFetching } = useStaffCredit(range.from || undefined, range.to || undefined);
  const rows: StaffCreditLink[] = data?.data ?? [];
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';
  const money = (v: number) => formatCurrency(v, currency);
  const columns = useMemo(() => buildStaffCreditColumns(money), [currency]);

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Staff Credit</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Staff purchases funded from salary — synced to ERP payroll for recovery.
          </p>
        </div>
        <DateRangePicker value={range} onChange={setRange} className="w-60" />
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          title="Refresh — pulls in newly recovered/settled amounts"
          className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
        </button>
      </div>

      {/* Premium — visible + upgrade-gated (never hidden) */}
      <FeatureLock feature={FEATURE} mode="block">
        <DataTable<StaffCreditLink>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={isLoading}
          error={isError}
          onRetry={() => refetch()}
          storageKey="staff-credit-col-prefs"
          emptyState={
            <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Users className="h-8 w-8 opacity-30" />
              <p>No staff credit yet.</p>
            </div>
          }
        />
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
