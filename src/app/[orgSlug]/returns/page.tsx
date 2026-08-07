'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { CustomerDetailsModal } from '@/components/pos/customers/customer-details-modal';
import { InitiateReturnModal } from '@/components/pos/returns/initiate-return-modal';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useMemo, useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Plus, RefreshCw, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DataTable } from '@bengo-hub/shared-ui-lib/data-table';
import { buildReturnsColumns, type ReturnItem } from './returns-columns';

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

  const columns = useMemo(() => buildReturnsColumns({ onOpenCustomer: setCustomerModal }), []);

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

      <DataTable<ReturnItem>
        columns={columns}
        rows={returns}
        rowKey={(ret) => ret.id}
        loading={isLoading}
        onRowClick={(ret) => router.push(`/${orgSlug}/returns/${ret.id}`)}
        storageKey="returns-col-prefs"
        emptyState={
          <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <RotateCcw className="h-10 w-10 opacity-30" />
            <p className="font-medium">No return requests found</p>
          </div>
        }
      />
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
