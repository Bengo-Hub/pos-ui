'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

import { useCommissions, type CommissionRecord } from '@/hooks/useCommissions';
import { usePermissions, P } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { Loader2, TrendingUp } from 'lucide-react';
import { useState, useMemo } from 'react';
import { toast } from 'sonner';

function formatCurrency(amount: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function CommissionsPage() {
  const { can } = usePermissions();
  const user = useAuthStore((s) => s.user);

  // Roles with view_own only (stylist, therapist, technician) see their own commissions.
  const viewOwnOnly = can(P.COMMISSIONS_VIEW_OWN) && !can(P.COMMISSIONS_VIEW);
  const [staffFilter, setStaffFilter] = useState('');

  const effectiveFilter = useMemo(() => {
    if (viewOwnOnly) return { staff_member_id: (user as any)?.staffId ?? (user as any)?.id ?? '' };
    return staffFilter ? { staff_member_id: staffFilter } : undefined;
  }, [viewOwnOnly, staffFilter, user]);

  const { data: records = [], isLoading, error } = useCommissions(effectiveFilter);

  if (error) {
    toast.error('Failed to load commissions');
  }

  const totalAmount = records.reduce((sum, r) => sum + (r.amount ?? 0), 0);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Commissions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{viewOwnOnly ? 'Your commission records' : 'Staff sales commission records'}</p>
        </div>
        {records.length > 0 && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total shown</p>
            <p className="text-xl font-bold text-primary">{formatCurrency(totalAmount)}</p>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
          <TrendingUp className="h-10 w-10 opacity-30" />
          <p className="font-medium">No commission records found</p>
          <p className="text-xs">Commissions are recorded automatically when orders are completed.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Staff ID</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Order ID</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Base Amount</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Rate</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Commission</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {records.map((rec) => (
                <tr key={rec.id} className="hover:bg-accent/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {rec.staff_member_id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {rec.order_id ? rec.order_id.slice(0, 8) + '…' : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">{formatCurrency(rec.base_amount)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {(rec.rate * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-primary">
                    {formatCurrency(rec.amount)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(rec.created_at)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-accent/30">
                <td colSpan={4} className="px-4 py-3 font-semibold text-muted-foreground">Total</td>
                <td className="px-4 py-3 text-right font-bold text-primary">{formatCurrency(totalAmount)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
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
