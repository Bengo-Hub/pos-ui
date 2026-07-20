/**
 * Multi-cart sale-session store for the retail terminal.
 *
 * Holds the open Sale tabs (Sale 1/2/3…) and which one is active, persisted to localStorage so a
 * reload/crash restores every in-progress cart. Persistence is SCOPED to slug+outlet+user (mirrors
 * lib/auth/outlet-storage.ts) — a stale tenant's or another cashier's carts never leak onto a shared
 * terminal, and each cashier's tabs are theirs alone.
 *
 * The store is a dumb container: the useSaleSessions hook owns hydration timing, autosave debounce,
 * and the beforeunload guard. The TerminalProvider owns the live cart these snapshots mirror.
 */

import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import {
  type SaleSession,
  type SaleSessionSnapshot,
  emptySnapshot,
  nextSessionLabel,
} from '@/lib/pos/sale-session';

const STORAGE_PREFIX = 'pos-sale-sessions:';

interface PersistShape {
  scope: string;
  sessions: SaleSession[];
  activeId: string;
}

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}${scope}`;
}

function loadPersisted(scope: string): { sessions: SaleSession[]; activeId: string } | null {
  if (typeof window === 'undefined' || !scope) return null;
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistShape;
    if (parsed?.scope !== scope || !Array.isArray(parsed.sessions) || parsed.sessions.length === 0) {
      return null;
    }
    const sessions = parsed.sessions.filter((s) => s && s.id && s.snapshot);
    if (sessions.length === 0) return null;
    const activeId = sessions.some((s) => s.id === parsed.activeId) ? parsed.activeId : sessions[0].id;
    return { sessions, activeId };
  } catch {
    return null;
  }
}

function persist(scope: string, sessions: SaleSession[], activeId: string): void {
  if (typeof window === 'undefined' || !scope) return;
  try {
    const shape: PersistShape = { scope, sessions, activeId };
    localStorage.setItem(storageKey(scope), JSON.stringify(shape));
  } catch {
    /* storage disabled / quota — the in-memory sessions still work for this tab */
  }
}

function makeSession(label: string, snapshot?: SaleSessionSnapshot): SaleSession {
  const now = Date.now();
  return { id: uuid(), label, snapshot: snapshot ?? emptySnapshot(), createdAt: now, updatedAt: now };
}

interface SaleSessionsState {
  /** slug:outletId:userId — sessions belong to exactly one scope at a time. */
  scope: string | null;
  sessions: SaleSession[];
  activeId: string;

  /** Point the store at a scope: restore that scope's persisted tabs, or seed a single empty tab. */
  loadScope: (scope: string) => void;
  /** Make an existing tab active (no snapshot mutation — the hook writes the outgoing tab first). */
  setActive: (id: string) => void;
  /** Open a fresh empty tab and make it active. Returns its id. */
  addSession: () => string;
  /** Remove a tab; when the active one goes, the neighbour becomes active. Never drops below one tab. */
  removeSession: (id: string) => void;
  /** Overwrite a tab's snapshot (the autosave sink). */
  updateSnapshot: (id: string, snapshot: SaleSessionSnapshot) => void;
  /** Rename a tab. */
  rename: (id: string, label: string) => void;
  /** Discard every tab and start over with one empty Sale 1. */
  clearAll: () => void;
}

export const useSaleSessionsStore = create<SaleSessionsState>((set, get) => ({
  scope: null,
  sessions: [],
  activeId: '',

  loadScope: (scope) => {
    // Idempotent: re-loading the same, already-populated scope is a no-op (avoids clobbering live tabs
    // on re-render). Only (re)hydrate when the scope actually changes or nothing is loaded yet.
    const cur = get();
    if (cur.scope === scope && cur.sessions.length > 0) return;
    const restored = loadPersisted(scope);
    if (restored) {
      set({ scope, sessions: restored.sessions, activeId: restored.activeId });
      return;
    }
    const first = makeSession('Sale 1');
    set({ scope, sessions: [first], activeId: first.id });
    persist(scope, [first], first.id);
  },

  setActive: (id) => {
    const { scope, sessions } = get();
    if (!sessions.some((s) => s.id === id)) return;
    set({ activeId: id });
    if (scope) persist(scope, sessions, id);
  },

  addSession: () => {
    const { scope, sessions } = get();
    const session = makeSession(nextSessionLabel(sessions));
    const next = [...sessions, session];
    set({ sessions: next, activeId: session.id });
    if (scope) persist(scope, next, session.id);
    return session.id;
  },

  removeSession: (id) => {
    const { scope, sessions, activeId } = get();
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx === -1) return;
    let next = sessions.filter((s) => s.id !== id);
    // Never leave zero tabs — reseed an empty one so the terminal always has a live cart.
    if (next.length === 0) next = [makeSession('Sale 1')];
    let nextActive = activeId;
    if (activeId === id) {
      // Prefer the neighbour to the left, else the new first tab.
      nextActive = (next[idx - 1] ?? next[0]).id;
    }
    set({ sessions: next, activeId: nextActive });
    if (scope) persist(scope, next, nextActive);
  },

  updateSnapshot: (id, snapshot) => {
    const { scope, sessions, activeId } = get();
    let touched = false;
    const next = sessions.map((s) => {
      if (s.id !== id) return s;
      touched = true;
      return { ...s, snapshot, updatedAt: Date.now() };
    });
    if (!touched) return;
    set({ sessions: next });
    if (scope) persist(scope, next, activeId);
  },

  rename: (id, label) => {
    const { scope, sessions, activeId } = get();
    const clean = label.trim().slice(0, 32) || label;
    const next = sessions.map((s) => (s.id === id ? { ...s, label: clean } : s));
    set({ sessions: next });
    if (scope) persist(scope, next, activeId);
  },

  clearAll: () => {
    const { scope } = get();
    const first = makeSession('Sale 1');
    set({ sessions: [first], activeId: first.id });
    if (scope) persist(scope, [first], first.id);
  },
}));
