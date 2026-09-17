import { create } from 'zustand';

interface MaintenanceState {
  /** True once an authenticated tenant request has come back tenant_under_repair. */
  active: boolean;
  tenantId?: string;
  reason?: string;
  /** ISO timestamp (RFC3339, as pos-api sends it) of when the window ends, if known. */
  endsAt?: string;
  show: (tenantId: string, data: { reason?: string; ends_at?: string }) => void;
  clear: () => void;
}

/**
 * The overlay is tenant-tagged because the API client is shared by the whole app. A response
 * from one tenant must never become a fleet-wide UI lock.
 */
export const useMaintenanceStore = create<MaintenanceState>((set) => ({
  active: false,
  tenantId: undefined,
  reason: undefined,
  endsAt: undefined,
  show: (tenantId, data) => set({ active: true, tenantId, reason: data.reason, endsAt: data.ends_at }),
  clear: () => set({ active: false, tenantId: undefined, reason: undefined, endsAt: undefined }),
}));
