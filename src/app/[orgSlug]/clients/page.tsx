'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { ClientSearchBar } from '@/components/service/ClientSearchBar';
import { ClientProfileCard } from '@/components/service/ClientProfileCard';
import { useCustomersDirectory } from '@/hooks/useClients';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 24;

const FILTERS = [
  { id: 'all', label: 'All customers' },
  { id: 'loyalty', label: 'Loyalty members' },
] as const;
type Filter = (typeof FILTERS)[number]['id'];

export default function ClientsPage() {
  // ?q= lets other screens (sales list, returns, sell details) deep-link a customer here.
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [debounced, setDebounced] = useState(query);
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  // New search or filter → back to page 1.
  useEffect(() => {
    setPage(1);
  }, [debounced, filter]);

  const { data, isLoading, isFetching } = useCustomersDirectory(debounced, page, filter, PAGE_SIZE);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <ModuleGate moduleKey="loyalty" fallback={<ModuleUnavailablePage moduleKey="loyalty" />}>
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none">Client Profiles</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {total > 0 ? `${total.toLocaleString()} customer${total === 1 ? '' : 's'}` : 'All your customers — search by phone, name or email'}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="flex-1">
            <ClientSearchBar value={query} onChange={setQuery} />
          </div>
          {/* Source filter — All (CRM master, incl. non-loyalty) vs loyalty members only. */}
          <div className="flex gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  'rounded-xl border px-3 py-2 text-xs font-semibold transition-colors',
                  filter === f.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/40',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground/40 gap-2">
            <p className="text-sm">
              {debounced ? `No customers found for "${debounced}"` : 'No customers yet'}
            </p>
          </div>
        ) : (
          <>
            <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3', isFetching && 'opacity-60')}>
              {rows.map((account) => (
                <ClientProfileCard key={account.id || account.crm_contact_id || account.customer_phone} account={account} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-muted-foreground">
                  Page {page} of {totalPages} · {total.toLocaleString()} customers
                </p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={page <= 1 || isFetching}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary/40 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages || isFetching}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary/40 disabled:opacity-40"
                  >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ModuleGate>
  );
}
