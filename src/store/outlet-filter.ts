import { create } from 'zustand';

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

  selectOutlet: (outlet) => set({ selectedOutlet: outlet }),

  clearOutlet: () => set({ selectedOutlet: null }),

  outletIdHeader: () => get().selectedOutlet?.id ?? '',
}));
