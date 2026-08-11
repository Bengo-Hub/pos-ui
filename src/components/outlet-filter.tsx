'use client';

import { useAuthStore } from '@/store/auth';
import { useOutletFilterStore, type OutletOption } from '@/store/outlet-filter';
import { fetchOutlets, type OutletListItem } from '@/lib/api/outlets';
import { apiClient } from '@/lib/api/client';
import { canAccessAllOutlets } from '@/lib/auth/outlet-access';
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
  const canFilter = canAccessAllOutlets(user);

  const { selectedOutlet, outlets, setOutlets, selectOutlet, clearOutlet } = useOutletFilterStore();

  const tenantId = user?.tenant_id ?? '';

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

  // Sync selected outlet → apiClient X-Outlet-ID header.
  // When drill-down is cleared (null), fall back to the user's home outlet
  // so non-HQ queries still get scoped to their assigned outlet.
  const homeOutletId = useAuthStore((s) => s.outlet?.id ?? null);
  useEffect(() => {
    apiClient.setOutletID(selectedOutlet?.id ?? homeOutletId);
  }, [selectedOutlet, homeOutletId]);

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
          if (!value) { clearOutlet(); return; }
          const o = outlets.find((x) => x.id === value);
          if (o) selectOutlet(o);
        }}
        placeholder="All Outlets"
        clearable
      />
    </div>
  );
}
