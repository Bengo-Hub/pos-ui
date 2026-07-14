import { create } from 'zustand';
import { useAuthStore } from '@/store/auth';

export interface OutletOption {
  id: string;
  code: string;
  name: string;
  useCase?: string;
  isHq?: boolean;
}

interface OutletFilterState {
  /** Selected outlet for drill-down (HQ/admin users only). null = "All Outlets". */
  selectedOutlet: OutletOption | null;
  /** All outlets available to this tenant (populated on login for HQ/admin users). */
  outlets: OutletOption[];

  setOutlets: (outlets: OutletOption[]) => void;
  selectOutlet: (outlet: OutletOption | null) => void;
  clearOutlet: () => void;
  /** UUID string ready for X-Outlet-ID header. Empty string when no drill-down. */
  outletIdHeader: () => string;
}

export const useOutletFilterStore = create<OutletFilterState>((set, get) => ({
  selectedOutlet: null,
  outlets: [],

  setOutlets: (outlets) => set({ outlets }),

  // THE outlet-switch action every switcher (header chip, sidebar, reports filter) calls.
  // Besides the filter state it bridges into the auth store's selectedOutletId — which pushes
  // the X-Outlet-ID header AND is what useEffectiveOutletID (the catalog/menu/tables React-Query
  // keys + the per-outlet IndexedDB catalog cache) reads. Without this bridge, switching outlet
  // changed the header but the terminal kept serving the PREVIOUS outlet's catalog from cache —
  // the "outlet filter shows another branch's items" bug.
  selectOutlet: (outlet) => {
    set({ selectedOutlet: outlet });
    useAuthStore.getState().setSelectedOutletId(outlet?.id ?? null);
  },

  clearOutlet: () => {
    set({ selectedOutlet: null });
    // Back to the home outlet scope (header falls back to outlet.id inside the auth store).
    useAuthStore.getState().setSelectedOutletId(null);
  },

  outletIdHeader: () => get().selectedOutlet?.id ?? '',
}));
