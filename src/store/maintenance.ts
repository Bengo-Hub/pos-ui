import { create } from 'zustand';

interface MaintenanceState {
  /** True once any request has come back tenant_under_repair — sticky until the app is reloaded
   *  or an explicit clear() runs. There is no "dismiss": a maintenance window blocks everything
   *  by design, so nothing in the UI is allowed to close this on its own. */
  active: boolean;
  reason?: string;
  /** ISO timestamp (RFC3339, as pos-api sends it) of when the window ends, if known. */
  endsAt?: string;
  show: (data: { reason?: string; ends_at?: string }) => void;
  clear: () => void;
}

/**
 * Global "tenant under repair" state (product name: Repair Mode). Set imperatively from the API
 * error interceptor (pos-api's maintenance-window gate, 503 tenant_under_repair) so ANY failed
 * request anywhere in the app — not just a specific page — brings up the same full-screen
 * overlay. Also set directly by the PIN-login screen, which gets the same error code from the
 * login endpoint itself before any session/token exists.
 */
export const useMaintenanceStore = create<MaintenanceState>((set) => ({
  active: false,
  reason: undefined,
  endsAt: undefined,
  show: (data) => set({ active: true, reason: data.reason, endsAt: data.ends_at }),
  clear: () => set({ active: false, reason: undefined, endsAt: undefined }),
}));
