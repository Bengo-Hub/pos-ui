import { apiClient } from './client';

export interface OutletListItem {
  id: string;
  code: string;
  name: string;
  use_case?: string;
  is_hq?: boolean;
  status?: string;
}

/** The tenant's full outlet list (active only). Shared by OutletFilter and TeamTab so both use
 *  the SAME react-query cache key (['outlet_list', tenantId]) instead of double-fetching. */
export async function fetchOutlets(tenantId: string): Promise<OutletListItem[]> {
  const data = await apiClient.get<OutletListItem[] | { outlets?: OutletListItem[]; data?: OutletListItem[] }>(
    `/api/v1/${tenantId}/pos/outlets`,
  );
  const outlets: OutletListItem[] = Array.isArray(data) ? data : (data as any).outlets ?? (data as any).data ?? [];
  return outlets.filter((o) => o.status !== 'archived');
}
