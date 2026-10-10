'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, MapPin, Truck } from 'lucide-react';
import { useTerminal } from '@/components/pos/terminal/terminal-context';
import { useDeliveryAreas, useDeliveryQuote, type DeliveryArea } from '@/hooks/usePOS';
import { cn } from '@/lib/utils';

/**
 * Delivery details for a till delivery order: the customer's delivery area (from logistics'
 * delivery areas), the street or landmark, and notes for the rider. The area's pin is quoted by
 * logistics and the fee is added as the order's shipping charge; pos-api re-quotes on save, so
 * the till never sets a delivery price of its own.
 */
export function DeliveryPanel() {
  const t = useTerminal();
  const info = t.deliveryInfo;
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState('');

  const areas = useDeliveryAreas(t.orderOutletID || undefined);
  const point = info.lat != null && info.lng != null ? { lat: info.lat, lng: info.lng } : null;
  const quote = useDeliveryQuote(point, t.orderOutletID || undefined, t.subtotal);

  // Keep the shipping charge equal to the quoted fee, so the payable the cashier collects
  // matches what pos-api charges.
  const fee = quote.data?.serviceable ? quote.data.fee : undefined;
  useEffect(() => {
    if (fee === undefined) return;
    if ((t.charges.shipping ?? 0) === fee) return;
    t.applyCharges({ ...t.charges, shipping: fee });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fee]);

  const matches = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = areas.data ?? [];
    if (!q) return list;
    return list.filter(
      (a) => a.name.toLowerCase().includes(q) || (a.aliases ?? []).some((x) => x.toLowerCase().includes(q)),
    );
  }, [areas.data, filter]);

  const pick = (a: DeliveryArea) => {
    setFilter('');
    t.setDeliveryInfo({
      ...info,
      areaId: a.id,
      areaName: a.name,
      lat: a.center?.lat,
      lng: a.center?.lng,
    });
  };

  const notServiceable = quote.data && !quote.data.serviceable;

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-semibold"
      >
        <span className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-primary" /> Delivery
          {info.areaName && <span className="font-normal text-muted-foreground">to {info.areaName}</span>}
        </span>
        <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
          {quote.isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : fee !== undefined ? (
            fee === 0 ? 'Free delivery' : `Fee ${fee.toLocaleString()}`
          ) : null}
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div className="space-y-3 px-3 pb-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Delivery area</label>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={info.areaName ? `${info.areaName} (type to change)` : 'Search an area, e.g. Bugengi'}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {(filter || !info.areaName) && (
              <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-border">
                {areas.isLoading ? (
                  <p className="p-2 text-xs text-muted-foreground">Loading delivery areas...</p>
                ) : areas.isError ? (
                  <p className="p-2 text-xs text-destructive">Delivery areas are unavailable. Add the fee with Charges.</p>
                ) : matches.length === 0 ? (
                  <p className="p-2 text-xs text-muted-foreground">No delivery area matches.</p>
                ) : (
                  matches.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => pick(a)}
                      className={cn(
                        'flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/60',
                        a.id === info.areaId && 'bg-primary/5',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" /> {a.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {a.free ? 'Free' : a.fee.toLocaleString()}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
            {notServiceable && (
              <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /> This area is outside the delivery areas.
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Street, building or landmark</label>
            <input
              value={info.address}
              onChange={(e) => t.setDeliveryInfo({ ...info, address: e.target.value })}
              placeholder="e.g. Opposite Total petrol station"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Notes for the rider</label>
            <input
              value={info.notes}
              onChange={(e) => t.setDeliveryInfo({ ...info, notes: e.target.value })}
              placeholder="Gate code, call on arrival..."
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>
      )}
    </div>
  );
}
