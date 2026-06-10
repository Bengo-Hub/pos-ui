import { create } from "zustand";
import type { LimitReachedInfo } from "@/lib/api/error-handler";

interface LimitModalState {
  open: boolean;
  info: LimitReachedInfo | null;
  /** Called after the user enables extra usage so the original action can be retried. */
  onRetry?: (() => void) | null;
  show: (info: LimitReachedInfo, onRetry?: () => void) => void;
  close: () => void;
}

/**
 * Global limit-reached modal state. Triggered imperatively from the API error
 * interceptor (402 usage_limit_exceeded) so any failed mutation across the app
 * surfaces the same modal with the overage price + "enable extra usage" switch.
 */
export const useLimitModal = create<LimitModalState>((set) => ({
  open: false,
  info: null,
  onRetry: null,
  show: (info, onRetry) => set({ open: true, info, onRetry: onRetry ?? null }),
  close: () => set({ open: false, info: null, onRetry: null }),
}));
