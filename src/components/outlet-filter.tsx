'use client';

import { useAuthStore } from '@/store/auth';
import { useTenantId } from '@/hooks/useTenantId';
import { useOutletFilterStore, type OutletOption } from '@/store/outlet-filter';
import { fetchOutlets, type OutletListItem } from '@/lib/api/outlets';
import { apiClient } from '@/lib/api/client';
import { canAccessAllOutlets, tokenOutletLimit } from '@/lib/auth/outlet-access';
import { SearchableCombobox } from '@bengo-hub/shared-ui-lib/combobox';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

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

  // HQ/admin/manager users can drill into specific outlets — same role gate as the header
  // outlet switcher (see canAccessAllOutlets), so the two never drift out of sync again.
  // A manager limited to certain outlets (the list comes back filtered) switches among theirs, with
  // no All Outlets choice since the server would answer with one outlet only.
  const accessToken = useAuthStore((s) => s.session?.accessToken);
  const limited = tokenOutletLimit(accessToken).length > 0;
  const canFilter = limited || canAccessAllOutlets(user);

  const { selectedOutlet, allOutlets, outlets, setOutlets, selectOutlet } = useOutletFilterStore();

  const tenantId = useTenantId() ?? '';

  const { data: fetchedOutlets = [] } = useQuery<OutletListItem[]>({
    queryKey: ['outlet_list', tenantId],
    queryFn: () => fetchOutlets(tenantId),
    enabled: canFilter && !!tenantId,
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

  // Sync selected outlet → apiClient X-Outlet-ID header. With no drill-down the user's home
  // outlet applies, so non-HQ queries stay on their assigned outlet; the explicit All Outlets
  // choice clears the header, the same as the top-nav switcher.
  const homeOutletId = useAuthStore((s) => s.outlet?.id ?? null);
  useEffect(() => {
    apiClient.setOutletID(selectedOutlet?.id ?? (allOutlets ? null : homeOutletId));
  }, [selectedOutlet, allOutlets, homeOutletId]);

  if (!canFilter || outlets.length === 0) return null;

  return (
    <div className={cn('min-w-40', className)}>
      <SearchableCombobox
        options={outlets.map((o) => ({
          value: o.id,
          label: o.name,
          hint: o.code,
          description: [o.useCase, o.isHq ? 'HQ' : null].filter(Boolean).join(' · ') || undefined,
        }))}
        value={selectedOutlet?.id ?? ''}
        onChange={(value) => {
          // Clearing is the "All Outlets" placeholder, the same choice as the header's All Outlets.
          if (!value) { selectOutlet(null); return; }
          const o = outlets.find((x) => x.id === value);
          if (o) selectOutlet(o);
        }}
        placeholder={limited ? 'Select outlet' : 'All Outlets'}
        clearable={!limited}
      />
    </div>
  );
}
