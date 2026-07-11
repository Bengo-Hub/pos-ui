/**
 * Route → permission resolver used by the central RouteGuard so that EVERY page (and report
 * sub-page) is permission-covered, including direct-URL navigation — not just the ones that
 * happen to wrap themselves in <PageGuard>.
 *
 * The table is built from the single source of truth for nav (buildNavGroups) so page access
 * always agrees with sidebar visibility, PLUS an explicit map for routes that are reachable but
 * not in the sidebar (report sub-pages, detail pages, kiosk-ish utility pages).
 *
 * Matching is longest-prefix on the path with the /[orgSlug] segment stripped. A route with NO
 * mapping is ALLOWED (fail-open) — we only ever block routes we have deliberately classified, so
 * adding a new page never silently locks it out.
 */
import type { Permission } from '@/lib/rbac/permissions';
import { P } from '@/lib/rbac/permissions';
import { buildNavGroups } from './nav-config';

export interface RouteAccess {
  moduleKey?: string;
  permission?: Permission[];
}

// Explicit entries for routes not represented (or only partially) in the sidebar nav.
// Keyed by the internal path (no orgSlug). Longest-prefix wins, so detail routes inherit
// their section's rule unless a more specific entry exists.
const EXTRA_ROUTES: Record<string, RouteAccess> = {
  '/orders':                 { moduleKey: 'orders',   permission: [P.ORDERS_VIEW, P.ORDERS_VIEW_OWN, P.ORDERS_CHANGE, P.ORDERS_MANAGE, P.ORDERS_ADD] },
  '/sessions':               { moduleKey: 'shifts',   permission: [P.SESSIONS_VIEW, P.SESSIONS_VIEW_OWN, P.SESSIONS_ADD, P.SESSIONS_MANAGE] },
  '/webhooks':               { moduleKey: 'settings', permission: [P.CONFIG_MANAGE, P.CONFIG_CHANGE] },
  '/bar':                    { moduleKey: 'bar',      permission: [P.KDS_VIEW, P.KDS_CHANGE, P.KDS_MANAGE] },
  '/retail':                 { moduleKey: 'retail',   permission: [P.ORDERS_ADD, P.ORDERS_MANAGE] },
  '/staff/pin-management':   { moduleKey: 'settings', permission: [P.USERS_MANAGE, P.STAFF_MANAGE] },
  '/hotel/housekeeping':     { moduleKey: 'hotel',    permission: [P.HOTEL_VIEW, P.HOTEL_MANAGE] },
  // Reports index + every sub-report. The report pages read sales data; cashiers now hold
  // pos.reports.view (own-sales scoped server-side) so they can open these too.
  '/reports':                { moduleKey: 'reports',  permission: [P.REPORTS_VIEW, P.REPORTS_MANAGE] },
  // Detail/child routes inherit their parent by prefix: /orders/[id], /reports/eod/[date],
  // /clients/[id], /hotel/rooms/[roomId], /patients/[id], /layaway/[id], /loyalty/[id],
  // /returns/[id], /staff/[staffId]/schedule, /hotel/conference/[eventId] — no extra entries needed.
};

// Routes that are always allowed regardless of permissions (auth plumbing / neutral pages).
const ALLOW_PREFIXES = ['/unauthorized', '/auth', '/pin-login', '/select-outlet', '/platform'];

let cachedTable: { prefix: string; access: RouteAccess }[] | null = null;

function buildTable(): { prefix: string; access: RouteAccess }[] {
  if (cachedTable) return cachedTable;
  const entries: { prefix: string; access: RouteAccess }[] = [];
  // From nav-config (internal hrefs only — external cross-service links start with http).
  for (const group of buildNavGroups('')) {
    for (const item of group.items) {
      if (!item.href || item.href.startsWith('http')) continue;
      const prefix = item.href.split('?')[0];
      if (!prefix.startsWith('/')) continue;
      const permission = item.permission
        ? (Array.isArray(item.permission) ? item.permission : [item.permission])
        : undefined;
      entries.push({ prefix, access: { moduleKey: item.moduleKey, permission } });
    }
  }
  // Explicit extras override / extend nav entries (same prefix → keep the more specific extra).
  for (const [prefix, access] of Object.entries(EXTRA_ROUTES)) {
    const existing = entries.find((e) => e.prefix === prefix);
    if (existing) existing.access = access;
    else entries.push({ prefix, access });
  }
  cachedTable = entries;
  return entries;
}

/** Strip a leading /[orgSlug] segment from a pathname → the internal route path. */
export function stripOrgSlug(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length <= 1) return '/';
  return '/' + parts.slice(1).join('/');
}

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/');
}

/**
 * Resolve the access requirement for a full pathname (which still includes /[orgSlug]).
 * Returns null when the route is unclassified (→ allow) or explicitly always-allowed.
 */
export function resolveRouteAccess(pathname: string | null): RouteAccess | null {
  if (!pathname) return null;
  const path = stripOrgSlug(pathname);
  if (path === '/' || ALLOW_PREFIXES.some((p) => matchesPrefix(path, p))) return null;

  const table = buildTable();
  let best: { prefix: string; access: RouteAccess } | null = null;
  for (const e of table) {
    if (matchesPrefix(path, e.prefix)) {
      if (!best || e.prefix.length > best.prefix.length) best = e;
    }
  }
  return best?.access ?? null;
}
