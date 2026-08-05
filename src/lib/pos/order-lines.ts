/**
 * Centralizes "how much of an order line is still active" — quantity minus whatever a
 * partial Edit-Sale reduction or admin reversal has voided. voided_qty is CUMULATIVE
 * (pos-api's reversals/saleedit orchestrator increments it, never overwrites), never a
 * one-shot flag — a line can be reduced more than once and still have a real remaining
 * quantity.
 *
 * Root cause of a live bug (2026-08-05, order #000141): the Edit Sale cart's prefill treated
 * ANY non-null voided_qty as "fully gone" (`!line.voided_qty`) instead of subtracting it, so
 * a line reduced from 3 to 1 vanished from the cart entirely on the next Edit Sale entry.
 * Since Edit Sale sends the FULL desired line set and pos-api's diff engine treats "a line
 * missing from the request" as "remove it," the vanished line got silently, fully deleted on
 * the next save — destroying a unit the operator never touched. Same underlying quantity
 * math the backend already uses (orders.Service, reversals, saleedit's diff.go); use these
 * helpers everywhere a line's live UI state is derived instead of re-deriving it inline.
 */
export interface OrderLineLike {
  quantity: number;
  voided_qty?: number | null;
}

export function remainingLineQty(line: OrderLineLike): number {
  const voided = line.voided_qty ?? 0;
  const remaining = (line.quantity ?? 0) - voided;
  return remaining > 0 ? remaining : 0;
}

export function isLineActive(line: OrderLineLike): boolean {
  return remainingLineQty(line) > 0.009;
}

/** True once a line has lost ANY quantity to a partial or full void — used to flag it in
 *  read-only views (Sell Details) even when it's still partially active. */
export function isLineVoided(line: OrderLineLike): boolean {
  return (line.voided_qty ?? 0) > 0.009;
}
