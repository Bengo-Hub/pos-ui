import { create } from 'zustand';

export type SubscriptionPlan = 'STARTER' | 'GROWTH' | 'PROFESSIONAL' | string;
export type SubscriptionStatus =
  | 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'CANCELLED' | 'SUSPENDED' | string;

const GRACE_PERIOD_DAYS = 7;
const IDB_DB_NAME = 'pos-subscription';
const IDB_STORE_NAME = 'subscriptions';
const IDB_VERSION = 1;

/** Per-feature tier metadata (subset of shared FeatureCatalogEntry) cached for offline gating. */
export interface CachedCatalogEntry {
  minPlanCode?: string;
  minTierLabel?: string;
  minTierOrder?: number;
  serviceTag?: string;
  label?: string;
}

export interface SubscriptionState {
  plan: SubscriptionPlan | null;
  status: SubscriptionStatus | null;
  /** Tier rank of the current plan (1=Starter,2=Growth,3=Professional). Drives tier-aware gating. */
  tierOrder: number | null;
  expiresAt: Date | null;
  gracePeriodEndsAt: Date | null;
  features: string[];
  limits: Record<string, number>;
  /** feature code → tier metadata; cached so the tier-aware wrapper resolves identically offline. */
  catalog: Record<string, CachedCatalogEntry>;
  isInGracePeriod: boolean;
  isExpired: boolean;
  daysUntilExpiry: number | null;
}

interface SubscriptionStore extends SubscriptionState {
  hydrated: boolean;
  setFromRaw: (raw: RawSubscriptionData, tenantSlug: string) => void;
  setCatalog: (catalog: Record<string, CachedCatalogEntry>, tenantSlug: string) => void;
  loadFromIDB: (tenantSlug: string) => Promise<void>;
  clear: () => void;
}

interface RawSubscriptionData {
  plan?: string | null;
  status?: string | null;
  tierOrder?: number | null;
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
  tierOrder: null,
  expiresAt: null,
  gracePeriodEndsAt: null,
  features: [],
  limits: {},
  catalog: {},
  isInGracePeriod: false,
  isExpired: false,
  daysUntilExpiry: null,
};

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  ...EMPTY_STATE,
  hydrated: false,

  setFromRaw: (raw, tenantSlug) => {
    const plan = (raw.plan ?? null) as SubscriptionPlan | null;
    const status = (raw.status ?? null) as SubscriptionStatus | null;
    const tierOrder = raw.tierOrder ?? null;
    const expiresAt = raw.expiresAt ? new Date(raw.expiresAt) : null;
    const features = raw.features ?? [];
    const limits = raw.limits ?? {};
    const derived = computeDerived(status, expiresAt);

    set({ plan, status, tierOrder, expiresAt, features, limits, ...derived, hydrated: true });

    idbSet(`subscription_${tenantSlug}`, {
      plan, status, tierOrder,
      expiresAt: expiresAt?.toISOString() ?? null,
      features, limits,
    }).catch(() => {});
  },

  // Cache the feature catalog (tier metadata) under a SEPARATE IDB key so it and the
  // subscription record never clobber each other; the tier-aware wrapper reads it offline.
  setCatalog: (catalog, tenantSlug) => {
    set({ catalog: catalog ?? {} });
    idbSet(`subscription_catalog_${tenantSlug}`, catalog ?? {}).catch(() => {});
  },

  loadFromIDB: async (tenantSlug) => {
    const [raw, cat] = await Promise.all([
      idbGet(`subscription_${tenantSlug}`),
      idbGet(`subscription_catalog_${tenantSlug}`),
    ]);
    const catalog = (cat && typeof cat === 'object' ? (cat as Record<string, CachedCatalogEntry>) : get().catalog) ?? {};
    if (!raw || typeof raw !== 'object') { set({ catalog, hydrated: true }); return; }
    const data = raw as RawSubscriptionData;
    const plan = (data.plan ?? null) as SubscriptionPlan | null;
    const status = (data.status ?? null) as SubscriptionStatus | null;
    const tierOrder = data.tierOrder ?? null;
    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    const features = data.features ?? [];
    const limits = data.limits ?? {};
    set({ plan, status, tierOrder, expiresAt, features, limits, catalog, ...computeDerived(status, expiresAt), hydrated: true });
  },

  clear: () => set({ ...EMPTY_STATE, hydrated: false }),
}));
