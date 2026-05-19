'use client';

import { useAuthStore } from '@/store/auth';
import { useOutletFilterStore, type OutletOption } from '@/store/outlet-filter';
import { apiClient } from '@/lib/api/client';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Store, X } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://posapi.codevertexitsolutions.com';

interface OutletListItem {
  id: string;
  code: string;
  name: string;
  use_case?: string;
  is_hq?: boolean;
  status?: string;
}

async function fetchOutlets(accessToken: string, tenantId: string): Promise<OutletListItem[]> {
  const res = await fetch(`${API_URL}/api/v1/${tenantId}/pos/outlets`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const outlets: OutletListItem[] = Array.isArray(data) ? data : data.outlets ?? data.data ?? [];
  return outlets.filter((o) => o.status !== 'archived');
}

/**
 * OutletFilter — single-select dropdown for HQ/admin users to drill into a specific outlet/branch.
 *
 * Behaviour:
 * - Platform owners + tenant admins + is_hq_user: shown, defaults to "All Outlets"
 * - Regular staff: hidden (they are scoped to their assigned outlet by the backend)
 *
 * When an outlet is selected, X-Outlet-ID is sent on every API request via apiClient.
 */
export function OutletFilter({ className }: { className?: string }) {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const user = useAuthStore((s) => s.user);
  const session = useAuthStore((s) => s.session);

  // HQ/admin users can drill into specific outlets
  const canFilter = !!(
    user?.isPlatformOwner ||
    user?.isSuperUser ||
    user?.roles?.some((r) => ['admin', 'superuser', 'manager', 'pos_admin'].includes(r))
  );

  const { selectedOutlet, outlets, setOutlets, selectOutlet, clearOutlet } = useOutletFilterStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const tenantId = user?.tenant_id ?? '';

  const { data: fetchedOutlets = [] } = useQuery<OutletListItem[]>({
    queryKey: ['outlet_list', tenantId],
    queryFn: () => fetchOutlets(session?.accessToken ?? '', tenantId),
    enabled: canFilter && !!session?.accessToken && !!tenantId,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (fetchedOutlets.length > 0) {
      const mapped: OutletOption[] = fetchedOutlets.map((o) => ({
        id: o.id,
        code: o.code,
        name: o.name,
        useCase: o.use_case,
        isHq: o.is_hq,
      }));
      setOutlets(mapped);
    }
  }, [fetchedOutlets, setOutlets]);

  // Sync selected outlet → apiClient X-Outlet-ID header.
  // When drill-down is cleared (null), fall back to the user's home outlet
  // so non-HQ queries still get scoped to their assigned outlet.
  const homeOutletId = useAuthStore((s) => s.outlet?.id ?? null);
  useEffect(() => {
    apiClient.setOutletID(selectedOutlet?.id ?? homeOutletId);
  }, [selectedOutlet, homeOutletId]);

  if (!canFilter || outlets.length === 0) return null;

  const filtered = search
    ? outlets.filter(
        (o) =>
          o.name.toLowerCase().includes(search.toLowerCase()) ||
          o.code.toLowerCase().includes(search.toLowerCase()),
      )
    : outlets;

  const label = selectedOutlet ? selectedOutlet.name : 'All Outlets';

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors min-w-[160px]"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Store className="size-4 text-muted-foreground shrink-0" />
        <span className="truncate flex-1 text-left">{label}</span>
        {selectedOutlet && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); clearOutlet(); }}
            className="p-0.5 rounded hover:bg-muted-foreground/20"
            aria-label="Clear outlet filter"
          >
            <X className="size-3" />
          </button>
        )}
        <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSearch(''); }} aria-hidden />
          <div className="absolute left-0 top-full mt-1 z-50 w-64 rounded-xl border border-border bg-popover shadow-xl flex flex-col">
            {outlets.length > 5 && (
              <div className="p-2 border-b border-border">
                <input
                  autoFocus
                  placeholder="Search outlets…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-accent/30 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => { clearOutlet(); setOpen(false); setSearch(''); }}
              className={cn(
                'flex items-center gap-2 w-full text-left px-3 py-2.5 text-sm font-medium hover:bg-muted transition-colors',
                !selectedOutlet && 'bg-primary/10 text-primary',
              )}
            >
              {!selectedOutlet ? <Check className="size-3.5 shrink-0" /> : <span className="size-3.5 shrink-0" />}
              All Outlets
            </button>

            <div className="max-h-56 overflow-y-auto">
              {filtered.map((o) => {
                const selected = selectedOutlet?.id === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => { selectOutlet(o); setOpen(false); setSearch(''); }}
                    className={cn(
                      'flex items-center gap-2 w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors',
                      selected && 'bg-primary/5',
                    )}
                  >
                    <span className={cn(
                      'size-3.5 shrink-0 rounded-full border flex items-center justify-center',
                      selected ? 'bg-primary border-primary' : 'border-border',
                    )}>
                      {selected && <span className="size-1.5 rounded-full bg-primary-foreground" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate font-medium">{o.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {o.code}{o.useCase ? ` · ${o.useCase}` : ''}{o.isHq ? ' · HQ' : ''}
                      </span>
                    </span>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">No outlets found</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
