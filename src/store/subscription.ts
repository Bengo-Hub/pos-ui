import { create } from 'zustand';

export type SubscriptionPlan = 'STARTER' | 'GROWTH' | 'PROFESSIONAL' | string;
export type SubscriptionStatus =
  | 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'CANCELLED' | 'SUSPENDED' | string;

const GRACE_PERIOD_DAYS = 7;
const IDB_DB_NAME = 'pos-subscription';
const IDB_STORE_NAME = 'subscriptions';
const IDB_VERSION = 1;

export interface SubscriptionState {
  plan: SubscriptionPlan | null;
  status: SubscriptionStatus | null;
  expiresAt: Date | null;
  gracePeriodEndsAt: Date | null;
  features: string[];
  limits: Record<string, number>;
  isInGracePeriod: boolean;
  isExpired: boolean;
  daysUntilExpiry: number | null;
}

interface SubscriptionStore extends SubscriptionState {
  hydrated: boolean;
  setFromRaw: (raw: RawSubscriptionData, tenantSlug: string) => void;
  loadFromIDB: (tenantSlug: string) => Promise<void>;
  clear: () => void;
}

interface RawSubscriptionData {
  plan?: string | null;
  status?: string | null;
  expiresAt?: string | null;
  features?: string[];
  limits?: Record<string, number>;
}

function computeDerived(
  status: SubscriptionStatus | null,
  expiresAt: Date | null,
): Pick<SubscriptionState, 'gracePeriodEndsAt' | 'isInGracePeriod' | 'isExpired' | 'daysUntilExpiry'> {
  const now = Date.now();
  const gracePeriodEndsAt = expiresAt
    ? new Date(expiresAt.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
    : null;

  const normalized = (status ?? '').toUpperCase();

  let isInGracePeriod = false;
  let isExpired = false;
  let daysUntilExpiry: number | null = null;

  if (expiresAt) {
    const msUntil = expiresAt.getTime() - now;
    daysUntilExpiry = Math.ceil(msUntil / (1000 * 60 * 60 * 24));

    if (now > expiresAt.getTime()) {
      if (gracePeriodEndsAt && now <= gracePeriodEndsAt.getTime()) {
        isInGracePeriod = true;
      } else {
        isExpired = true;
      }
    }
  }

  if (normalized === 'EXPIRED' || normalized === 'CANCELLED') {
    if (!isInGracePeriod) isExpired = true;
  }

  return { gracePeriodEndsAt, isInGracePeriod, isExpired, daysUntilExpiry };
}

function openIDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_DB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE_NAME); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

async function idbGet(key: string): Promise<unknown> {
  const db = await openIDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const req = tx.objectStore(IDB_STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openIDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      tx.objectStore(IDB_STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  });
}

const EMPTY_STATE: SubscriptionState = {
  plan: null,
  status: null,
  expiresAt: null,
  gracePeriodEndsAt: null,
  features: [],
  limits: {},
  isInGracePeriod: false,
  isExpired: false,
  daysUntilExpiry: null,
};

export const useSubscriptionStore = create<SubscriptionStore>((set) => ({
  ...EMPTY_STATE,
  hydrated: false,

  setFromRaw: (raw, tenantSlug) => {
    const plan = (raw.plan ?? null) as SubscriptionPlan | null;
    const status = (raw.status ?? null) as SubscriptionStatus | null;
    const expiresAt = raw.expiresAt ? new Date(raw.expiresAt) : null;
    const features = raw.features ?? [];
    const limits = raw.limits ?? {};
    const derived = computeDerived(status, expiresAt);

    set({ plan, status, expiresAt, features, limits, ...derived, hydrated: true });

    idbSet(`subscription_${tenantSlug}`, {
      plan, status,
      expiresAt: expiresAt?.toISOString() ?? null,
      features, limits,
    }).catch(() => {});
  },

  loadFromIDB: async (tenantSlug) => {
    const raw = await idbGet(`subscription_${tenantSlug}`);
    if (!raw || typeof raw !== 'object') { set({ hydrated: true }); return; }
    const data = raw as RawSubscriptionData;
    const plan = (data.plan ?? null) as SubscriptionPlan | null;
    const status = (data.status ?? null) as SubscriptionStatus | null;
    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    const features = data.features ?? [];
    const limits = data.limits ?? {};
    set({ plan, status, expiresAt, features, limits, ...computeDerived(status, expiresAt), hydrated: true });
  },

  clear: () => set({ ...EMPTY_STATE, hydrated: false }),
}));
