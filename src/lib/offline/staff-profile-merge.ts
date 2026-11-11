/**
 * Pure helpers for the PIN picker and its offline cache, kept free of IndexedDB so node tests can
 * load them. Since 2026-11-11 pos-api's public PIN profile list (/pos/auth/pin/profile) carries
 * only the staff id, name, initials, tenant id and has_pin: no auth user id and no role. The
 * picker signs in by staff id and the offline cache is matched by staff id.
 */

/** One row of the public PIN profile list. */
export interface PinProfileListItem {
  staff_id: string;
  tenant_id: string;
  name: string;
  initials?: string;
  has_pin?: boolean;
}

/** The offline cache row shape (mirrors CachedStaffProfile in src/lib/db/pos-db.ts). */
export interface PinCacheRow {
  user_id: string;
  staff_id?: string;
  tenant_id: string;
  name: string;
  email: string;
  roles: string[];
  permissions: string[];
  pin_hash?: string;
  cached_at: string;
}

/** The `user` block of a PIN login response, as far as the cache needs it. */
export interface PinLoginUser {
  user_id: string;
  staff_id?: string;
  name: string;
  role?: string;
  tenant_id: string;
  permissions?: string[];
  pin_hash?: string;
}

/** Body for POST /pos/auth/pin: the opaque staff id and the PIN, never a user id. */
export function pinLoginBody(staffId: string, pin: string): { staff_id: string; pin: string } {
  return { staff_id: staffId, pin };
}

/**
 * Rows to write back after a profile list refresh: each cached row of the same tenant whose
 * staff id is in the list gets the current name. The pin_hash is never added (only an online
 * login on this device supplies one) but it IS dropped when the list says has_pin === false:
 * pos-api clears a PIN when a role raise happens, and the old, possibly manager-chosen PIN must
 * stop working offline too. No row is ever created: a person who has not signed in here has no
 * PIN hash to check offline. Legacy rows cached before staff ids (no staff_id) are skipped; that
 * person's next online login writes the staff id.
 */
export function mergePinProfiles<T extends PinCacheRow>(list: PinProfileListItem[], cached: T[], now: string): T[] {
  const byStaff = new Map<string, PinProfileListItem>();
  for (const p of list) {
    if (p.staff_id) byStaff.set(p.staff_id, p);
  }
  const out: T[] = [];
  for (const row of cached) {
    if (!row.staff_id) continue;
    const p = byStaff.get(row.staff_id);
    if (!p || p.tenant_id !== row.tenant_id) continue;
    const next: T = { ...row, name: p.name, cached_at: now };
    if (p.has_pin === false) delete (next as PinCacheRow).pin_hash;
    out.push(next);
  }
  return out;
}

/**
 * The pin_hash to keep when the live-permissions refresher rewrites a cache row. Kept only when
 * the new permission set grants nothing the cached row did not already have. A new grant means
 * a raise, and the cached PIN may be one a manager chose before it; the person then signs in
 * online once to cache the PIN that goes with the raised permissions.
 */
export function pinHashAfterPermissionRefresh(
  existing: { pin_hash?: string; permissions?: string[] } | undefined,
  nextPermissions: string[],
): string | undefined {
  if (!existing?.pin_hash) return undefined;
  const held = new Set(existing.permissions ?? []);
  return nextPermissions.every((p) => held.has(p)) ? existing.pin_hash : undefined;
}

/**
 * The cache row to store after a successful online PIN login, or null when the response has no
 * PIN hash (nothing to check offline). Keyed by user id in IndexedDB as before; the staff id
 * lets profile refreshes find it.
 */
export function cacheRowFromLogin(user: PinLoginUser, now: string): PinCacheRow | null {
  if (!user.pin_hash) return null;
  return {
    user_id: user.user_id,
    staff_id: user.staff_id,
    tenant_id: user.tenant_id,
    name: user.name,
    email: '',
    roles: user.role ? [user.role] : [],
    permissions: user.permissions ?? [],
    pin_hash: user.pin_hash,
    cached_at: now,
  };
}
