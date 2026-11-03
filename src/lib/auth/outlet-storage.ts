/**
 * Slug-scoped persistence for the last-selected POS outlet.
 *
 * The value is stored as JSON `{slug, id}` under the legacy 'pos-selected-outlet-id'
 * key. Reads validate the stored slug against the org slug the user is actually on —
 * a stale outlet from ANOTHER tenant is never returned. (Previously the raw outlet id
 * survived a logout + slug change and pin-login sent the OLD tenant's outlet_id to the
 * NEW tenant's /auth/pin/identify, failing every login until storage was hand-cleared.)
 *
 * Legacy plain-UUID values (pre-scoping) can't be attributed to a tenant, so they are
 * dropped on first read — the outlet selector shows once and re-persists slug-scoped.
 */
export const POS_SELECTED_OUTLET_KEY = 'pos-selected-outlet-id';

interface StoredOutlet {
  slug: string;
  id: string;
}

/** Org slug from the URL path — the source of truth for the tenant being worked in. */
function currentSlug(): string {
  if (typeof window === 'undefined') return '';
  return window.location.pathname.split('/')[1] ?? '';
}

/** Last-selected outlet id for the given org slug ('' when none / another tenant's). */
export function getStoredOutletId(slug?: string): string {
  if (typeof window === 'undefined') return '';
  const scope = slug || currentSlug();
  try {
    const raw = localStorage.getItem(POS_SELECTED_OUTLET_KEY);
    if (!raw) return '';
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as StoredOutlet;
      return parsed?.slug && parsed.slug === scope && parsed.id ? parsed.id : '';
    }
    // Legacy unscoped value — unknown tenant; drop it rather than leak cross-tenant.
    localStorage.removeItem(POS_SELECTED_OUTLET_KEY);
    return '';
  } catch {
    return '';
  }
}

/**
 * Admin/manager outlet drill-down (top-nav switcher), kept per browser tab in sessionStorage so a
 * reload keeps the branch the user picked instead of silently widening every list to all
 * outlets. Slug-scoped like the stored outlet above. `all` is the explicit "All Outlets" choice.
 */
const POS_OUTLET_DRILLDOWN_KEY = 'pos-outlet-drilldown';

export interface StoredDrillDown<T> {
  outlet: T | null;
  all: boolean;
}

export function getStoredDrillDown<T>(slug?: string): StoredDrillDown<T> | null {
  if (typeof window === 'undefined') return null;
  const scope = slug || currentSlug();
  try {
    const raw = sessionStorage.getItem(POS_OUTLET_DRILLDOWN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDrillDown<T> & { slug?: string };
    if (!parsed || parsed.slug !== scope) return null;
    return { outlet: parsed.outlet ?? null, all: !!parsed.all };
  } catch {
    return null;
  }
}

/** Persist the drill-down for the current org slug; null clears it. */
export function setStoredDrillDown<T>(value: StoredDrillDown<T> | null, slug?: string): void {
  if (typeof window === 'undefined') return;
  const scope = slug || currentSlug();
  try {
    if (value && scope && (value.outlet || value.all)) {
      sessionStorage.setItem(POS_OUTLET_DRILLDOWN_KEY, JSON.stringify({ slug: scope, ...value }));
    } else {
      sessionStorage.removeItem(POS_OUTLET_DRILLDOWN_KEY);
    }
  } catch {
    /* storage disabled */
  }
}

/** Persist (or clear, with null) the last-selected outlet for the given org slug. */
export function setStoredOutletId(id: string | null, slug?: string): void {
  if (typeof window === 'undefined') return;
  const scope = slug || currentSlug();
  try {
    if (id && scope) {
      localStorage.setItem(POS_SELECTED_OUTLET_KEY, JSON.stringify({ slug: scope, id }));
    } else {
      localStorage.removeItem(POS_SELECTED_OUTLET_KEY);
    }
  } catch {
    /* storage disabled */
  }
}
