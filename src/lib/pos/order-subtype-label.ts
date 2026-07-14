/**
 * Order source/subtype badge labels, use-case aware.
 *
 * Retail / pharmacy / services never do table service, so their orders read:
 *   - "Walk-in"  — a counter sale rung at the terminal or Add Sale (subtype 'retail',
 *                  plus legacy rows stored with the old 'dine_in' default)
 *   - "Online"   — orders synced from the online store / widget
 *   - "Shipping" — delivery-subtype orders (dispatched to a rider)
 * Hospitality / quick-service keep the table-service vocabulary (Dine-in, Takeaway, …).
 */

const HOSPITALITY_LABELS: Record<string, string> = {
  dine_in: 'Dine-in',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
  room_service: 'Room Svc',
  bar_tab: 'Bar Tab',
  retail: 'Walk-in',
};

interface BadgeOrder {
  order_subtype?: string | null;
  order_type?: string | null;
  /** pos-api: "pos_terminal" | "back_office" | "online_widget" */
  source?: string | null;
  /** ordering-backend-synced orders stamp metadata.source = "online_delivery" / "online_*". */
  metadata?: Record<string, unknown> | null;
}

function isOnlineOrder(order: BadgeOrder): boolean {
  if ((order.source ?? '').startsWith('online')) return true;
  const metaSource = String((order.metadata as Record<string, unknown> | null)?.source ?? '');
  return metaSource.startsWith('online');
}

export function orderSubtypeBadge(order: BadgeOrder, useCase?: string | null): string | null {
  const subtype = (order.order_subtype ?? order.order_type ?? '').toLowerCase();
  if (isOnlineOrder(order)) return 'Online';

  const uc = (useCase ?? '').toLowerCase();
  const hospitality = uc === 'hospitality' || uc === 'quick_service' || uc === 'hotel';
  if (!hospitality) {
    if (subtype === 'delivery') return 'Shipping';
    // Terminal / back-office counter sale — incl. legacy rows stored with the old
    // 'dine_in' default, which never meant table service on these use cases.
    return 'Walk-in';
  }
  if (!subtype) return null;
  return HOSPITALITY_LABELS[subtype] ?? subtype.replace(/_/g, ' ');
}
