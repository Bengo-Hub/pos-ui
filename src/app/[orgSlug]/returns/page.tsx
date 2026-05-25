'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { useAuthStore } from '@/store/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useState } from 'react';
import { Loader2, Plus, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReturnItem {
  id: string;
  return_number: string;
  original_order_id?: string;
  original_receipt_number?: string;
  customer_name?: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  refund_amount?: number;
  currency?: string;
  refund_method?: string;
  created_at: string;
  line_items?: { name: string; qty: number; unit_price: number }[];
}

const STATUS_CONFIG: Record<ReturnItem['status'], { label: string; className: string }> = {
  pending:   { label: 'Pending',   className: 'bg-amber-500/10 text-amber-700' },
  approved:  { label: 'Approved',  className: 'bg-blue-500/10 text-blue-700' },
  completed: { label: 'Completed', className: 'bg-emerald-500/10 text-emerald-700' },
  rejected:  { label: 'Rejected',  className: 'bg-red-500/10 text-red-600' },
};

function useReturns(status: string) {
  const user = useAuthStore((s) => s.user);
  const tenantID = user?.tenant_id ?? '';
  return useQuery({
    queryKey: ['returns', tenantID, status],
    queryFn: () =>
      apiClient.get<{ data: ReturnItem[] }>(
        `/api/v1/${tenantID}/pos/returns${status ? `?status=${status}` : ''}`
      ),
    enabled: !!tenantID,
    staleTime: 60_000,
  });
}

function useInitiateReturn() {
  const user = useAuthStore((s) => s.user);
  const tenantID = user?.tenant_id ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { original_order_id: string; reason: string; refund_method: string }) =>
      apiClient.post(`/api/v1/${tenantID}/pos/returns`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['returns', tenantID] }),
  });
}

const FILTERS: { key: string; label: string }[] = [
  { key: '',          label: 'All'       },
  { key: 'pending',   label: 'Pending'   },
  { key: 'approved',  label: 'Approved'  },
  { key: 'completed', label: 'Completed' },
  { key: 'rejected',  label: 'Rejected'  },
];

const REFUND_METHODS = ['cash', 'card', 'store_credit', 'mpesa'];
const RETURN_REASONS = [
  'Defective / damaged',
  'Wrong item received',
  'Changed mind',
  'Duplicate purchase',
  'Item not as described',
  'Other',
];

function InitiateReturnModal({ onClose }: { onClose: () => void }) {
  const [orderId, setOrderId] = useState('');
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [refundMethod, setRefundMethod] = useState('cash');
  const { mutate, isPending, isError } = useInitiateReturn();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orderId.trim()) return;
    mutate({ original_order_id: orderId.trim(), reason, refund_method: refundMethod }, { onSuccess: onClose });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-background rounded-2xl border border-border shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold">Initiate Return</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-xl hover:bg-accent flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Original Order ID / Receipt #</label>
            <input
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="Order ID or receipt number"
              required
              className="mt-1 w-full bg-background border border-border rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Return Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full bg-background border border-border rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {RETURN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Refund Method</label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {REFUND_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setRefundMethod(m)}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors capitalize',
                    refundMethod === m
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {m.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
          {isError && <p className="text-xs text-red-500">Failed to initiate return. Please try again.</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !orderId.trim()}
              className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Submitting…' : 'Submit Return'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReturnsPage() {
  const [statusFilter, setStatusFilter] = useState('pending');
  const [showModal, setShowModal] = useState(false);
  const { data, isLoading } = useReturns(statusFilter);
  const returns = data?.data ?? [];

  return (
    <div className="p-6">
      {showModal && <InitiateReturnModal onClose={() => setShowModal(false)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <RotateCcw className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Returns</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Process refunds and manage return requests</p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Initiate Return
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-semibold transition-colors',
              statusFilter === f.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading returns…</span>
        </div>
      ) : returns.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
          <RotateCcw className="h-10 w-10 opacity-30" />
          <p className="font-medium">No return requests found</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Return #</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Customer</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Reason</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Refund</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Method</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {returns.map((ret) => {
                const cfg = STATUS_CONFIG[ret.status] ?? { label: ret.status, className: 'bg-muted text-muted-foreground' };
                return (
                  <tr key={ret.id} className="hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-3.5 font-mono text-xs font-semibold">{ret.return_number}</td>
                    <td className="px-4 py-3.5">{ret.customer_name ?? '—'}</td>
                    <td className="px-4 py-3.5 text-muted-foreground max-w-[180px] truncate">{ret.reason}</td>
                    <td className="px-4 py-3.5">
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border border-transparent', cfg.className)}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold">
                      {ret.refund_amount != null
                        ? `${ret.currency ?? 'KES'} ${ret.refund_amount.toLocaleString()}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground text-xs capitalize">
                      {ret.refund_method?.replace('_', ' ') ?? '—'}
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground text-xs">
                      {new Date(ret.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ReturnsPageGated() {
  return (
    <ModuleGate moduleKey="returns" fallback={<ModuleUnavailablePage moduleKey="returns" />}>
      <ReturnsPage />
    </ModuleGate>
  );
}
