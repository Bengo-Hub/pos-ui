'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/base';
import { usePosAuditLogs, usePosExceptions } from '@/hooks/useAudit';
import type { AuditLogEntry, ExceptionAgg } from '@/lib/api/audit';
import { useAuthStore } from '@/store/auth';
import { AlertTriangle, Loader2, ScrollText } from 'lucide-react';
import { useState } from 'react';

const PAGE = 50;

// Labels + colour bands for the fraud-relevant actions the audit log records.
const ACTION_META: Record<string, { label: string; cls: string }> = {
  'order.void': { label: 'Void', cls: 'bg-red-500/15 text-red-500' },
  'order.line_remove': { label: 'Line removed', cls: 'bg-orange-500/15 text-orange-500' },
  'order.line_qty_decrease': { label: 'Qty reduced', cls: 'bg-orange-500/15 text-orange-500' },
  'return.refund': { label: 'Refund', cls: 'bg-red-500/15 text-red-500' },
  'receipt.reprint': { label: 'Reprint', cls: 'bg-amber-500/15 text-amber-500' },
  'drawer.no_sale': { label: 'No-sale', cls: 'bg-yellow-500/15 text-yellow-600' },
  'drawer.pay_in': { label: 'Pay-in', cls: 'bg-blue-500/15 text-blue-500' },
  'drawer.pay_out': { label: 'Pay-out', cls: 'bg-red-500/15 text-red-500' },
  'drawer.cash_drop': { label: 'Cash drop', cls: 'bg-blue-500/15 text-blue-500' },
  'auth.step_up': { label: 'Approval (PIN)', cls: 'bg-green-500/15 text-green-600' },
  'auth.step_up_card': { label: 'Approval (card)', cls: 'bg-green-500/15 text-green-600' },
};

const inputClass = 'bg-accent/10 border border-border rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-primary outline-none';

export function AuditTab() {
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenant_id ?? '';
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);

  const range = {
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to).toISOString() : undefined,
  };

  const { data: exData, isLoading: exLoading } = usePosExceptions(tenantId, range);
  const { data: logData, isLoading: logLoading, isFetching } = usePosAuditLogs(tenantId, {
    ...range, limit: PAGE, offset: page * PAGE,
  });

  const exceptions = (exData?.data ?? []).slice().sort((a, b) => b.total - a.total);
  const rows = logData?.data ?? [];
  const total = logData?.total ?? 0;

  return (
    <div className="space-y-4">
      {/* Date range */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted-foreground">From</label>
        <input type="date" className={inputClass} value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
        <label className="text-xs text-muted-foreground">To</label>
        <input type="date" className={inputClass} value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
        {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Exception report — per-cashier counts of fraud-relevant actions */}
      <Card>
        <CardHeader>
          <span className="font-bold text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Exception report (per cashier)
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {exLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : exceptions.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No exceptions in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-accent/5 text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Cashier</th>
                    <th className="text-center px-4 py-3">Total</th>
                    <th className="text-left px-4 py-3">Breakdown</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {exceptions.map((e: ExceptionAgg) => (
                    <tr key={e.actor_user_id} className="hover:bg-accent/5">
                      <td className="px-4 py-3">
                        {e.actor_name
                          ? <span className="font-medium">{e.actor_name}</span>
                          : <span className="font-mono text-xs text-muted-foreground" title={e.actor_user_id}>{e.actor_user_id.slice(0, 8)}</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-bold">{e.total}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(e.counts).map(([action, n]) => {
                            const meta = ACTION_META[action] ?? { label: action, cls: 'bg-muted text-muted-foreground' };
                            return <span key={action} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}: {n}</span>;
                          })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full audit trail */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <span className="font-bold text-sm flex items-center gap-2"><ScrollText className="h-4 w-4 text-primary" /> Audit trail</span>
          <span className="text-xs text-muted-foreground">{total} entries</span>
        </CardHeader>
        <CardContent className="p-0">
          {logLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : rows.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No audit entries.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-accent/5 text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="text-left px-4 py-3">When</th>
                    <th className="text-left px-4 py-3">User</th>
                    <th className="text-left px-4 py-3">Action</th>
                    <th className="text-left px-4 py-3">Approved by</th>
                    <th className="text-right px-4 py-3">Amount</th>
                    <th className="text-left px-4 py-3">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((e: AuditLogEntry) => {
                    const meta = ACTION_META[e.action] ?? { label: e.action, cls: 'bg-muted text-muted-foreground' };
                    return (
                      <tr key={e.id} className="hover:bg-accent/5">
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">
                          {e.actor_name
                            ? <span className="font-medium">{e.actor_name}</span>
                            : <span className="font-mono text-muted-foreground" title={e.actor_user_id}>{e.actor_user_id?.slice(0, 8)}</span>}
                        </td>
                        <td className="px-4 py-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span></td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          {e.approver_user_id
                            ? <span className="inline-flex items-center gap-1 text-green-600"><span>✓</span>{e.approver_name ? <span className="text-foreground font-medium">{e.approver_name}</span> : null}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{e.amount != null ? e.amount.toLocaleString() : '—'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">{e.reason || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {total > PAGE && (
        <div className="flex items-center justify-center gap-3">
          <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="px-3 py-1.5 rounded-lg border border-border text-sm disabled:opacity-40 hover:bg-accent/10">Prev</button>
          <span className="text-xs text-muted-foreground">Page {page + 1} of {Math.ceil(total / PAGE)}</span>
          <button disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg border border-border text-sm disabled:opacity-40 hover:bg-accent/10">Next</button>
        </div>
      )}
    </div>
  );
}
