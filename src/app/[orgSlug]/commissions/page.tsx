'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

import { useCommissions } from '@/hooks/useCommissions';
import { usePermissions, P } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/auth';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp } from 'lucide-react';
import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@bengo-hub/shared-ui-lib/data-table';
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker';
import { buildCommissionsColumns } from './commissions-columns';

function CommissionsPage() {
  const { can } = usePermissions();
  const user = useAuthStore((s) => s.user);
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';

  // Roles with view_own only (stylist, therapist, technician) see their own commissions.
  const viewOwnOnly = can(P.COMMISSIONS_VIEW_OWN) && !can(P.COMMISSIONS_VIEW);
  const [staffFilter, setStaffFilter] = useState('');
  const [range, setRange] = useState<DateRange>({ from: '', to: '' });

  const effectiveFilter = useMemo(() => {
    const dateBounds = { from: range.from || undefined, to: range.to || undefined };
    if (viewOwnOnly) return { staff_member_id: (user as any)?.staffId ?? (user as any)?.id ?? '', ...dateBounds };
    return { ...(staffFilter ? { staff_member_id: staffFilter } : {}), ...dateBounds };
  }, [viewOwnOnly, staffFilter, user, range]);

  const { data: records = [], isLoading, error } = useCommissions(effectiveFilter);

  if (error) {
    toast.error('Failed to load commissions');
  }

  const totalAmount = records.reduce((sum, r) => sum + (r.commission_amount ?? 0), 0);
  const columns = useMemo(() => buildCommissionsColumns(currency), [currency]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Commissions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{viewOwnOnly ? 'Your commission records' : 'Staff sales commission records'}</p>
        </div>
        <DateRangePicker value={range} onChange={setRange} className="w-60" />
        {records.length > 0 && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total shown</p>
            <p className="text-xl font-bold text-primary">{formatCurrency(totalAmount, currency)}</p>
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={records}
        rowKey={(rec) => rec.id}
        loading={isLoading}
        storageKey="commissions-col-prefs"
        emptyState={
          <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <TrendingUp className="h-10 w-10 opacity-30" />
            <p className="font-medium">No commission records found</p>
            <p className="text-xs">Commissions are recorded automatically when orders are completed.</p>
          </div>
        }
      />
    </div>
  );
}

export default function CommissionsPageGated() {
  return (
    <ModuleGate moduleKey="commissions" fallback={<ModuleUnavailablePage moduleKey="commissions" />}>
      <CommissionsPage />
    </ModuleGate>
  );
}
