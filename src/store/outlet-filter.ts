import { create } from 'zustand';
import { useAuthStore } from '@/store/auth';
import { apiClient } from '@/lib/api/client';
import { canAccessAllOutlets, tokenOutletLimit } from '@/lib/auth/outlet-access';
import { getStoredDrillDown, setStoredDrillDown } from '@/lib/auth/outlet-storage';

export interface OutletOption {
  id: string;
  code: string;
  name: string;
  useCase?: string;
  isHq?: boolean;
}

interface OutletFilterState {
  /** Selected outlet for drill-down (HQ/admin users only). null = no drill-down. */
  selectedOutlet: OutletOption | null;
  /**
   * The explicit "All Outlets" choice. Without a drill-down and without this, the session's own
   * outlet is the scope, which is what the header shows, so lists must follow it (see
   * useListOutletId). Before this flag "no drill-down" meant the header named the home outlet while
   * the sales, drafts and shipments lists loaded every outlet.
   */
  allOutlets: boolean;
  /** All outlets available to this tenant (populated on login for HQ/admin users). */
  outlets: OutletOption[];

  setOutlets: (outlets: OutletOption[]) => void;
  /** Drill into one outlet, or pass null for the explicit "All Outlets" choice. */
  selectOutlet: (outlet: OutletOption | null) => void;
  /** Back to the session's own outlet (no drill-down, not all outlets). */
  clearOutlet: () => void;
  /** UUID string ready for X-Outlet-ID header. Empty string when no drill-down. */
  outletIdHeader: () => string;
}

export const useOutletFilterStore = create<OutletFilterState>((set, get) => ({
  selectedOutlet: null,
  allOutlets: false,
  outlets: [],

  setOutlets: (outlets) => set({ outlets }),

  // THE outlet-switch action every switcher (header chip, sidebar, reports filter) calls.
  // Besides the filter state it bridges into the auth store's selectedOutletId — which pushes
  // the X-Outlet-ID header AND is what useEffectiveOutletID (the catalog/menu/tables React-Query
  // keys + the per-outlet IndexedDB catalog cache) reads. Without this bridge, switching outlet
  // changed the header but the terminal kept serving the PREVIOUS outlet's catalog from cache —
  // the "outlet filter shows another branch's items" bug.
  selectOutlet: (outlet) => {
    set({ selectedOutlet: outlet, allOutlets: !outlet });
    setStoredDrillDown({ outlet, all: !outlet });
    useAuthStore.getState().setSelectedOutletId(outlet?.id ?? null);
  },

  clearOutlet: () => {
    set({ selectedOutlet: null, allOutlets: false });
    setStoredDrillDown(null);
    // Back to the home outlet scope: the header carries the session's own outlet again
    // (setSelectedOutletId(null) alone clears it, which is the All Outlets meaning).
    useAuthStore.getState().setSelectedOutletId(null);
    apiClient.setOutletID(useAuthStore.getState().outlet?.id ?? null);
  },

  outletIdHeader: () => get().selectedOutlet?.id ?? '',
}));

/**
 * The outlet_id a list or report query should send: the drill-down outlet, else "all" when the
 * user chose All Outlets, else the session's own outlet (the one the header shows), else "all"
 * for an admin with no outlet of their own. The server still decides what the caller may see.
 */
export function useListOutletId(): string {
  const selected = useOutletFilterStore((s) => s.selectedOutlet?.id ?? '');
  const all = useOutletFilterStore((s) => s.allOutlets);
  const home = useAuthStore(
    (s) => s.outlet?.id ?? (s.user as (typeof s.user & { outlet_id?: string }) | null)?.outlet_id ?? '',
  );
  if (selected) return selected;
  if (all) return 'all';
  return home || 'all';
}

// Restore the tab's drill-down after a reload, and drop it when the signed-in account changes or
// signs out, so a cashier taking over the till never inherits a manager's branch or all-outlets
// view. Only admins/managers keep one; for anyone else the stored value is ignored and cleared.
function restoreDrillDown() {
  const { user, session } = useAuthStore.getState();
  const limit = tokenOutletLimit(session?.accessToken);
  if (!session || !user || (limit.length === 0 && !canAccessAllOutlets(user))) {
    setStoredDrillDown(null);
    return;
  }
  const stored = getStoredDrillDown<OutletOption>(user.tenant_slug);
  if (!stored) return;
  // A limit set after this was stored: All Outlets, or an outlet they no longer hold, does not apply.
  if (limit.length > 0 && !(stored.outlet && limit.includes(stored.outlet.id))) {
    setStoredDrillDown(null);
    return;
  }
  useOutletFilterStore.setState({ selectedOutlet: stored.outlet, allOutlets: !stored.outlet && stored.all });
  useAuthStore.getState().setSelectedOutletId(stored.outlet?.id ?? null);
}

if (typeof window !== 'undefined') {
  restoreDrillDown();
  useAuthStore.subscribe((s, prev) => {
    const userChanged = (s.user as { id?: string } | null)?.id !== (prev.user as { id?: string } | null)?.id;
    if (!s.session || userChanged) {
      if (useOutletFilterStore.getState().selectedOutlet || useOutletFilterStore.getState().allOutlets) {
        useOutletFilterStore.setState({ selectedOutlet: null, allOutlets: false });
      }
      if (!s.session) {
        setStoredDrillDown(null);
      } else {
        restoreDrillDown();
      }
    }
  });
}
