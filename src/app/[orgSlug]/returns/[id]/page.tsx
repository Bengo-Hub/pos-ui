'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, RotateCcw, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReturnLine {
  id: string;
  sku?: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  reason?: string;
}

interface ReturnDetail {
  id: string;
  return_number: string;
  order_id: string;
  return_type: 'refund' | 'exchange' | 'store_credit';
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  reason?: string;
  reason_code?: string;
  refund_amount: number;
  requested_by: string;
  approved_by?: string;
  treasury_refund_ref?: string;
  created_at: string;
  updated_at: string;
  edges?: { lines?: ReturnLine[] };
}

const STATUS_CONFIG: Record<ReturnDetail['status'], { label: string; className: string }> = {
  pending:   { label: 'Pending',   className: 'bg-amber-500/10 text-amber-700 border-amber-200' },
  approved:  { label: 'Approved',  className: 'bg-blue-500/10 text-blue-700 border-blue-200' },
  completed: { label: 'Completed', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-200' },
  rejected:  { label: 'Rejected',  className: 'bg-red-500/10 text-red-600 border-red-200' },
};

const REASON_CODE_LABELS: Record<string, string> = {
  changed_mind: 'Changed mind',
  defective:    'Defective item',
  damaged:      'Damaged item',
  wrong_item:   'Wrong item',
  expired:      'Expired product',
  other:        'Other',
};

function useReturnDetail(returnId: string) {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  return useQuery({
    queryKey: ['return', tenantID, returnId],
    queryFn: () => apiClient.get<ReturnDetail>(`/api/v1/${tenantID}/pos/returns/${returnId}`),
    enabled: !!tenantID && !!returnId,
    staleTime: 30_000,
  });
}

function useApproveReturn(returnId: string) {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { action: 'approve' | 'reject'; notes?: string }) =>
      apiClient.patch(`/api/v1/${tenantID}/pos/returns/${returnId}/approve`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['return', tenantID, returnId] });
      qc.invalidateQueries({ queryKey: ['returns', tenantID] });
    },
  });
}

export default function ReturnDetailPage() {
  const params = useParams<{ orgSlug: string; id: string }>();
  const router = useRouter();
  const orgSlug = params?.orgSlug ?? '';
  const returnId = params?.id ?? '';

  const { data: ret, isLoading } = useReturnDetail(returnId);
  const approve = useApproveReturn(returnId);
  const [notes, setNotes] = useState('');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading return details…</span>
      </div>
    );
  }

  if (!ret) {
    return (
      <div className="p-6 text-center text-muted-foreground">Return not found.</div>
    );
  }

  const lines = ret.edges?.lines ?? [];
  const cfg = STATUS_CONFIG[ret.status] ?? { label: ret.status, className: 'bg-muted text-muted-foreground border-border' };
  const isPending = ret.status === 'pending';

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Back + header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push(`/${orgSlug}/returns`)}
          className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <RotateCcw className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{ret.return_number}</h1>
              <p className="text-xs text-muted-foreground">{new Date(ret.created_at).toLocaleString()}</p>
            </div>
          </div>
        </div>
        <span className={cn('text-xs font-bold px-3 py-1 rounded-full border', cfg.className)}>
          {cfg.label}
        </span>
      </div>

      {/* Summary card */}
      <div className="rounded-2xl border border-border bg-card p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Return Type</p>
          <p className="text-sm font-semibold capitalize mt-0.5">{ret.return_type.replace('_', ' ')}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Refund Amount</p>
          <p className="text-sm font-bold text-emerald-600 mt-0.5">KES {ret.refund_amount.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Reason Code</p>
          <p className="text-sm font-semibold mt-0.5">
            {ret.reason_code ? REASON_CODE_LABELS[ret.reason_code] ?? ret.reason_code : '—'}
          </p>
        </div>
        {ret.reason && (
          <div className="col-span-2 md:col-span-3">
            <p className="text-xs text-muted-foreground">Reason</p>
            <p className="text-sm mt-0.5">{ret.reason}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-muted-foreground">Original Order</p>
          <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">{ret.order_id}</p>
        </div>
        {ret.treasury_refund_ref && (
          <div>
            <p className="text-xs text-muted-foreground">Refund Reference</p>
            <p className="text-xs font-mono text-emerald-600 mt-0.5">{ret.treasury_refund_ref}</p>
          </div>
        )}
      </div>

      {/* Return lines */}
      {lines.length > 0 && (
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <div className="px-4 py-3 border-b border-border bg-accent/20">
            <p className="text-sm font-bold">Returned Items</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs">Item</th>
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs">SKU</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs">Qty</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs">Unit Price</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3">{l.name}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs font-mono">{l.sku ?? '—'}</td>
                  <td className="px-4 py-3 text-right">{l.quantity}</td>
                  <td className="px-4 py-3 text-right">KES {l.unit_price.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-semibold">KES {l.total_price.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Approve / Reject (only when pending) */}
      {isPending && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <p className="text-sm font-bold">Action Required</p>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Add notes for the decision…"
              className="mt-1 w-full bg-background border border-border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => approve.mutate({ action: 'reject', notes })}
              disabled={approve.isPending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 text-red-600 bg-red-50 text-sm font-semibold hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              Reject
            </button>
            <button
              onClick={() => approve.mutate({ action: 'approve', notes })}
              disabled={approve.isPending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Approve Return
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
