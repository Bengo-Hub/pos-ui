'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { CustomerDetailsModal } from '@/components/pos/customers/customer-details-modal';
import { InitiateReturnModal } from '@/components/pos/returns/initiate-return-modal';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Plus, RefreshCw, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReturnItem {
  id: string;
  return_number: string;
  original_order_id?: string;
  original_receipt_number?: string;
  customer_name?: string;
  customer_phone?: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  refund_amount?: number;
  currency?: string;
  // refund_channel is the backend field (cash|mpesa|bank|cheque|store_credit|offset_invoice);
  // refund_method is kept as a fallback for any legacy serialization.
  refund_channel?: string;
  refund_method?: string;
  created_at: string;
  line_items?: { name: string; qty: number; unit_price: number }[];
}

const STATUS_CONFIG: Record<ReturnItem['status'], { label: string; className: string }> = {
  pending:   { label: 'Pending',   className: 'bg-warning/10 text-warning' },
  approved:  { label: 'Approved',  className: 'bg-primary/10 text-primary' },
  completed: { label: 'Completed', className: 'bg-success/10 text-success' },
  rejected:  { label: 'Rejected',  className: 'bg-destructive/10 text-destructive' },
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

// Return-initiation types/hook/modal live in the shared component (components/pos/returns/
// initiate-return-modal.tsx) — reused here and from Sell Details.

const FILTERS: { key: string; label: string }[] = [
  { key: '',          label: 'All'       },
  { key: 'pending',   label: 'Pending'   },
  { key: 'approved',  label: 'Approved'  },
  { key: 'completed', label: 'Completed' },
  { key: 'rejected',  label: 'Rejected'  },
];

function ReturnsPage() {
  const [statusFilter, setStatusFilter] = useState('pending');
  const [showModal, setShowModal] = useState(false);
  // Set only for a deep-linked open (Sell Details' "Sell Return" used to route here via
  // ?invoice=<no.>, previously into a separate Return-by-Invoice modal) — pre-loads that exact
  // sale in the SAME InitiateReturnModal every other entry point uses.
  const [deepLinkOrderNumber, setDeepLinkOrderNumber] = useState('');
  const [customerModal, setCustomerModal] = useState<{ name?: string | null; phone: string } | null>(null);
  const { data, isLoading, refetch, isFetching } = useReturns(statusFilter);
  const returns = data?.data ?? [];
  const params = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgSlug = params?.orgSlug ?? '';

  // Any remaining external entry point that still deep-links with ?invoice=<no.> (e.g. a
  // notification link) opens the same Initiate Return modal pre-loaded, then strips the param so
  // a refresh or close doesn't reopen it. Sell Details itself now opens the modal inline instead
  // of navigating here at all.
  const invoiceParam = searchParams?.get('invoice') ?? '';
  useEffect(() => {
    if (!invoiceParam) return;
    setDeepLinkOrderNumber(invoiceParam);
    setShowModal(true);
    router.replace(`/${orgSlug}/returns`);
  }, [invoiceParam, orgSlug, router]);

  return (
    <div className="p-6">
      {showModal && (
        <InitiateReturnModal
          initialOrderNumber={deepLinkOrderNumber || undefined}
          onClose={() => { setShowModal(false); setDeepLinkOrderNumber(''); }}
        />
      )}

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
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh — pulls in returns filed from another till"
            className="h-10 w-10 rounded-xl border border-border flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Initiate Return
          </button>
        </div>
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
                  <tr
                    key={ret.id}
                    className="hover:bg-accent/20 transition-colors cursor-pointer"
                    onClick={() => router.push(`/${orgSlug}/returns/${ret.id}`)}
                  >
                    <td className="px-4 py-3.5 font-mono text-xs font-semibold text-primary underline-offset-2 hover:underline">{ret.return_number}</td>
                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      {ret.customer_phone ? (
                        <button type="button"
                          onClick={() => setCustomerModal({ name: ret.customer_name, phone: ret.customer_phone as string })}
                          className="text-primary hover:underline" title="Open customer profile">
                          {ret.customer_name || ret.customer_phone}
                        </button>
                      ) : (ret.customer_name ?? '—')}
                    </td>
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
                      {(ret.refund_channel ?? ret.refund_method)?.replace('_', ' ') ?? '—'}
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
      {customerModal && (
        <CustomerDetailsModal
          customerName={customerModal.name}
          customerPhone={customerModal.phone}
          onClose={() => setCustomerModal(null)}
        />
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
