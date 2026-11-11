// pos-api merges duplicate loyalty accounts of the same phone number. A till that still holds the
// old (now empty) account id gets 409 { code: "loyalty_account_merged", account_id,
// survivor_account_id } when it redeems or pays with points. These helpers let the till swap to
// the survivor so the cashier does not have to pick the customer again.

export const LOYALTY_ACCOUNT_MERGED_CODE = 'loyalty_account_merged';

/** Window event the redeem hooks fire on that 409; the terminal and the loyalty panel listen. */
export const LOYALTY_ACCOUNT_MERGED_EVENT = 'pos:loyalty-account-merged';

export interface MergedLoyaltyAccount {
  shellId: string;
  survivorId: string;
}

/** The merge details carried by an API error, or null when the error is anything else. */
export function mergedLoyaltySurvivor(err: unknown): MergedLoyaltyAccount | null {
  if (!err || typeof err !== 'object') return null;
  const response = (err as { response?: { status?: number; data?: unknown } }).response;
  if (!response || response.status !== 409) return null;
  const data = response.data as { code?: unknown; account_id?: unknown; survivor_account_id?: unknown } | undefined;
  if (!data || data.code !== LOYALTY_ACCOUNT_MERGED_CODE) return null;
  if (typeof data.account_id !== 'string' || typeof data.survivor_account_id !== 'string') return null;
  if (!data.account_id || !data.survivor_account_id) return null;
  return { shellId: data.account_id, survivorId: data.survivor_account_id };
}

/** The account id a holder of `current` should switch to, or null when it is not the merged one. */
export function nextLoyaltyAccountId(current: string | undefined | null, merged: MergedLoyaltyAccount): string | null {
  return current && current === merged.shellId ? merged.survivorId : null;
}

/** Tell every listener on this page that a loyalty account was merged. Safe outside a browser. */
export function announceLoyaltyMerge(merged: MergedLoyaltyAccount): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<MergedLoyaltyAccount>(LOYALTY_ACCOUNT_MERGED_EVENT, { detail: merged }));
}

/** Listen for merges; returns the unsubscribe function (use it as a useEffect cleanup). */
export function onLoyaltyMerge(handler: (merged: MergedLoyaltyAccount) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<MergedLoyaltyAccount>).detail;
    if (detail?.shellId && detail?.survivorId) handler(detail);
  };
  window.addEventListener(LOYALTY_ACCOUNT_MERGED_EVENT, listener);
  return () => window.removeEventListener(LOYALTY_ACCOUNT_MERGED_EVENT, listener);
}
