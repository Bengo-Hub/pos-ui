'use client';

import { offlineOrderLabel } from '@/hooks/usePOS';
import type { OfflineOrder } from '@/lib/db/pos-db';
import { getActiveTimeZone } from '@/lib/user-timezone';

/**
 * Recently synced offline bills: the provisional "Offline XXXXXX" label printed on the kitchen
 * chit next to the number the server gave the bill, so staff holding a paper chit can find the
 * real order. The caller passes at most 20 rows (getRecentlySyncedOfflineOrders).
 */
export function SyncedOfflineBills({ orders }: { orders: OfflineOrder[] }) {
  if (orders.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <h2 className="px-4 py-3 border-b border-border text-sm font-bold">Recently synced offline bills</h2>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2">Chit label</th>
              <th className="px-4 py-2">Server number</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2 text-right">Synced</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.local_id} className="border-t border-border/60">
                <td className="px-4 py-2 font-medium">{offlineOrderLabel(o.local_id)}</td>
                {/* Rows synced before the number was recorded only kept the server id. */}
                <td className="px-4 py-2 tabular-nums">
                  {o.server_order_number
                    ? `#${o.server_order_number}`
                    : <span className="text-muted-foreground">not recorded</span>}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                  {o.currency} {o.total_amount.toFixed(2)}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground">
                  {o.synced_at
                    ? new Date(o.synced_at).toLocaleString(undefined, { timeZone: getActiveTimeZone() })
                    : 'earlier'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
