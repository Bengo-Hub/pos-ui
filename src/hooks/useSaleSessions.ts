'use client';

/**
 * useSaleSessions — wires the multi-cart Sale tabs to the live TerminalProvider cart.
 *
 * The provider owns ONE active cart (its useStates). This hook snapshots/swaps that state around it:
 *  - hydrate: on scope load, restore the persisted active tab into the provider (so a reload brings
 *    every in-progress cart back);
 *  - autosave: debounced write of the live cart snapshot into the active tab (localStorage-backed);
 *  - switch/new/close: flush the outgoing tab, then apply the incoming tab's snapshot;
 *  - beforeunload: block reload/close while any tab still holds items.
 *
 * The provider injects `snapshot` (its current editable state, recomputed each render) and `apply`
 * (writes a snapshot back into its useStates). When `enabled` is false (non-retail use cases) the
 * hook is inert and the terminal behaves exactly as the classic single-cart flow.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useSaleSessionsStore } from '@/store/sale-sessions';
import {
  type SaleSession,
  type SaleSessionSnapshot,
  emptySnapshot,
  snapshotHasItems,
} from '@/lib/pos/sale-session';

interface UseSaleSessionsArgs {
  /** Multi-cart is retail-only — false everywhere else (hook does nothing). */
  enabled: boolean;
  /** slug:outletId:userId — sessions are scoped so tenants/cashiers never share carts on one device. */
  scopeKey: string;
  /** The provider's current editable state, recomputed each render. */
  snapshot: SaleSessionSnapshot;
  /** Write a snapshot back into the provider's useStates (setCart, setDiscount, …). */
  apply: (s: SaleSessionSnapshot) => void;
}

export interface SaleSessionControls {
  enabled: boolean;
  sessions: SaleSession[];
  activeId: string;
  /** Open a fresh empty tab and switch to it. */
  newSession: () => void;
  /** Make an existing tab active, preserving the one being left. */
  switchSession: (id: string) => void;
  /** Drop a tab (Discard on close, or closing an empty tab). */
  discardSession: (id: string) => void;
  /** Remove the active tab (after it was parked to Drafts) and move to a neighbour. */
  removeActiveSession: () => void;
  /** After a completed sale: close the finished tab when others are open, else keep the lone tab. */
  finalizeActiveSession: () => void;
  /** Discard every tab and reset to one empty Sale 1. */
  clearAll: () => void;
  /** Rename a tab. */
  rename: (id: string, label: string) => void;
}

const AUTOSAVE_MS = 400;

export function useSaleSessions({ enabled, scopeKey, snapshot, apply }: UseSaleSessionsArgs): SaleSessionControls {
  const sessions = useSaleSessionsStore((s) => s.sessions);
  const activeId = useSaleSessionsStore((s) => s.activeId);

  // Latest provider snapshot, read synchronously by the switch/close/unload paths (a captured value
  // would be one render stale and could persist the wrong tab's cart).
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const appliedScopeRef = useRef<string>('');

  // ── Hydrate on scope load ────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !scopeKey) return;
    const store = useSaleSessionsStore.getState();
    store.loadScope(scopeKey);
    if (appliedScopeRef.current !== scopeKey) {
      appliedScopeRef.current = scopeKey;
      const st = useSaleSessionsStore.getState();
      const active = st.sessions.find((s) => s.id === st.activeId);
      // Restore the active tab, but never wipe a cart the cashier already started: apply only when
      // the restored tab has items, or when the live cart is currently empty (safe to overwrite).
      if (active && (snapshotHasItems(active.snapshot) || !snapshotHasItems(snapshotRef.current))) {
        apply(active.snapshot);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, scopeKey]);

  // ── Debounced autosave of the live cart into the active tab ───────────────
  useEffect(() => {
    if (!enabled || !activeId) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      useSaleSessionsStore.getState().updateSnapshot(activeId, snapshotRef.current);
    }, AUTOSAVE_MS);
    return () => clearTimeout(timerRef.current);
    // `snapshot` is a fresh object each render — the effect re-arms on every edit, debounced.
  }, [enabled, activeId, snapshot]);

  // ── Leave guard: block reload/close while any cart has items ──────────────
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: BeforeUnloadEvent) => {
      const st = useSaleSessionsStore.getState();
      const anyItems =
        st.sessions.some((s) => snapshotHasItems(s.snapshot)) || snapshotHasItems(snapshotRef.current);
      if (anyItems) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [enabled]);

  // ── Controls ─────────────────────────────────────────────────────────────

  /** Flush the current live cart into the active tab synchronously (cancels the pending debounce). */
  const flushActive = useCallback(() => {
    clearTimeout(timerRef.current);
    const st = useSaleSessionsStore.getState();
    if (st.activeId) st.updateSnapshot(st.activeId, snapshotRef.current);
  }, []);

  const switchSession = useCallback(
    (id: string) => {
      const st = useSaleSessionsStore.getState();
      if (id === st.activeId) return;
      flushActive();
      st.setActive(id);
      const target = useSaleSessionsStore.getState().sessions.find((s) => s.id === id);
      apply(target ? target.snapshot : emptySnapshot());
    },
    [apply, flushActive],
  );

  const newSession = useCallback(() => {
    flushActive();
    useSaleSessionsStore.getState().addSession(); // makes the new tab active
    apply(emptySnapshot());
  }, [apply, flushActive]);

  const discardSession = useCallback(
    (id: string) => {
      const before = useSaleSessionsStore.getState();
      const wasActive = id === before.activeId;
      clearTimeout(timerRef.current);
      before.removeSession(id);
      if (wasActive) {
        const after = useSaleSessionsStore.getState();
        const active = after.sessions.find((s) => s.id === after.activeId);
        apply(active ? active.snapshot : emptySnapshot());
      }
    },
    [apply],
  );

  const removeActiveSession = useCallback(() => {
    discardSession(useSaleSessionsStore.getState().activeId);
  }, [discardSession]);

  const finalizeActiveSession = useCallback(() => {
    const st = useSaleSessionsStore.getState();
    // >1 tab → close the just-completed tab and move to a neighbour; lone tab → keep it (already
    // cleared by the provider's clearCart) so the till always has a live cart ready.
    if (st.sessions.length > 1) {
      removeActiveSession();
    }
  }, [removeActiveSession]);

  const clearAll = useCallback(() => {
    clearTimeout(timerRef.current);
    useSaleSessionsStore.getState().clearAll();
    apply(emptySnapshot());
  }, [apply]);

  const rename = useCallback((id: string, label: string) => {
    useSaleSessionsStore.getState().rename(id, label);
  }, []);

  return {
    enabled,
    sessions,
    activeId,
    newSession,
    switchSession,
    discardSession,
    removeActiveSession,
    finalizeActiveSession,
    clearAll,
    rename,
  };
}
