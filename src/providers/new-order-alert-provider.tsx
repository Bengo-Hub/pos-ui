'use client';

/**
 * App-level new-order alert. Mounted once in org-shell for staff who can see the KDS or the
 * online-orders queue. Two sources feed it:
 *  - KDS ticket_created pushes from the shared KDS websocket (dine-in, takeaway, delivery...)
 *  - new online orders in the live queue (useNewOnlineOrders, the same queries the page uses)
 * Each new order opens a modal and rings the tone chosen in Settings > KDS, again every 30s
 * until someone acknowledges it. Sound can be muted per device.
 */

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, Volume2, VolumeX } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useModuleAccess } from '@/hooks/use-module-access';
import { usePermissions, P } from '@/hooks/usePermissions';
import { useSubscription } from '@/hooks/use-subscription';
import { useKDSWebSocket, type KDSWSMessage } from '@/hooks/use-kds-ws';
import { useDeliveryDispatch, useNewOnlineOrders, usePickupOrders } from '@/hooks/useOnlineOrders';
import { isDeliveryOrder, type PickupOrder } from '@/lib/api/online-orders';
import { channelLabel, type KDSChannel } from '@/lib/kds/board';
import { isKDSAudioUnlocked, playKDSTone, unlockKDSAudio } from '@/lib/kds-sounds';
import { useAuthStore } from '@/store/auth';

const RING_EVERY_MS = 30_000;
const MUTE_KEY = 'pos.newOrderAlert.muted';

interface AlertLine {
  name: string;
  quantity: number;
  notes?: string;
}

interface OrderAlert {
  /** POS order id. KDS tickets and online orders share it, so one order alerts once. */
  orderId: string;
  orderNumber: string;
  channel: string;
  table?: string;
  customer?: string;
  lines: AlertLine[];
  at: number;
}

function readMuted(): boolean {
  try { return window.localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

function writeMuted(v: boolean) {
  try { window.localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch { /* storage unavailable */ }
}

function onlineChannel(o: PickupOrder): string {
  return isDeliveryOrder(o) ? 'Online delivery' : 'Online pickup';
}

/** Online-order queue watcher. Its own component so the queue polls only for online-orders staff. */
function OnlineOrderSource({ onNew, onWaiting }: { onNew: (a: OrderAlert[]) => void; onWaiting: (w: boolean) => void }) {
  const { data: pickup = [], isSuccess: pickupLoaded } = usePickupOrders();
  const { data: delivery = [], isSuccess: deliveryLoaded } = useDeliveryDispatch();
  const all = useMemo(() => [...pickup, ...delivery], [pickup, delivery]);
  const { waiting } = useNewOnlineOrders(all, pickupLoaded && deliveryLoaded, (fresh) => {
    onNew(fresh.map((o) => ({
      orderId: o.id,
      orderNumber: o.order_number,
      channel: onlineChannel(o),
      customer: o.customer_name,
      lines: (o.edges?.lines ?? []).map((l) => ({ name: l.name, quantity: l.quantity })),
      at: Date.now(),
    })));
  });
  useEffect(() => { onWaiting(waiting); }, [waiting, onWaiting]);
  useEffect(() => () => onWaiting(false), [onWaiting]);
  return null;
}

export function NewOrderAlertProvider({ children }: { children?: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const { hasModule } = useModuleAccess();
  const { canAny } = usePermissions();
  const { hasFeature } = useSubscription();

  const authed = status === 'authenticated';
  const kdsEnabled = authed && hasModule('kds') && hasFeature('kds')
    && canAny([P.KDS_VIEW, P.KDS_CHANGE, P.KDS_MANAGE]);
  const onlineEnabled = authed && hasModule('online_orders') && hasFeature('online_ordering')
    && canAny([P.ONLINE_ORDERS_VIEW, P.ONLINE_ORDERS_CHANGE, P.ORDERS_MANAGE, P.ORDERS_CHANGE, P.QUEUE_MANAGE]);

  const [alerts, setAlerts] = useState<OrderAlert[]>([]);
  const [muted, setMuted] = useState(false);
  const [soundLocked, setSoundLocked] = useState(false);
  const [onlineWaiting, setOnlineWaiting] = useState(false);
  // Orders already alerted this session, so a second ticket (another station or course) or the
  // online queue seeing the same order does not alert again.
  const alerted = useRef<Set<string>>(new Set());
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  useEffect(() => { setMuted(readMuted()); }, []);

  const ring = useCallback(() => {
    if (mutedRef.current) return;
    if (!isKDSAudioUnlocked()) setSoundLocked(true);
    playKDSTone();
  }, []);

  const push = useCallback((incoming: OrderAlert[]) => {
    const fresh = incoming.filter((a) => a.orderId && !alerted.current.has(a.orderId));
    if (fresh.length === 0) return;
    fresh.forEach((a) => alerted.current.add(a.orderId));
    setAlerts((prev) => [...prev, ...fresh]);
    ring();
  }, [ring]);

  // KDS pushes. Tickets of one order arrive per station; merge their lines into one alert.
  const onKDSMessage = useCallback((msg: KDSWSMessage) => {
    if (msg.type !== 'ticket_created') return;
    const p = msg.payload;
    const lines: AlertLine[] = (p.items ?? []).map((i) => ({
      name: i.name ?? 'Item',
      quantity: i.quantity ?? i.qty ?? 1,
      notes: [...(i.modifiers ?? []), i.notes].filter(Boolean).join(', ') || undefined,
    }));
    if (alerted.current.has(p.order_id)) {
      setAlerts((prev) => prev.map((a) => (a.orderId === p.order_id ? { ...a, lines: [...a.lines, ...lines] } : a)));
      return;
    }
    push([{
      orderId: p.order_id,
      orderNumber: p.order_number,
      channel: p.channel ? channelLabel(p.channel as KDSChannel) : 'Dine-in',
      table: p.table_reference || undefined,
      lines,
      at: Date.now(),
    }]);
  }, [push]);

  useKDSWebSocket({ enabled: kdsEnabled, onMessage: onKDSMessage });

  // Re-ring every 30s while an alert is unacknowledged, or an online order still awaits acceptance.
  const needsRing = alerts.length > 0 || onlineWaiting;
  useEffect(() => {
    if (!needsRing || muted) return;
    const id = setInterval(ring, RING_EVERY_MS);
    return () => clearInterval(id);
  }, [needsRing, muted, ring]);

  // Browsers block sound until the first user gesture: unlock on the first tap or key press.
  useEffect(() => {
    if (!kdsEnabled && !onlineEnabled) return;
    const unlock = () => {
      void unlockKDSAudio().then((ok) => {
        if (ok) {
          setSoundLocked(false);
          window.removeEventListener('pointerdown', unlock);
          window.removeEventListener('keydown', unlock);
        }
      });
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [kdsEnabled, onlineEnabled]);

  const acknowledge = () => setAlerts([]);
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    writeMuted(next);
  };

  const shown = alerts.slice(0, 5);

  return (
    <>
      {children}
      {onlineEnabled && <OnlineOrderSource onNew={push} onWaiting={setOnlineWaiting} />}

      {soundLocked && !muted && (kdsEnabled || onlineEnabled) && (
        <button
          type="button"
          onClick={() => { void unlockKDSAudio().then((ok) => ok && setSoundLocked(false)); }}
          className="fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg lg:bottom-4"
        >
          <Volume2 className="h-4 w-4" />
          Tap to enable sound
        </button>
      )}

      <Dialog open={alerts.length > 0} onOpenChange={(open) => { if (!open) acknowledge(); }}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-primary" />
              {alerts.length === 1 ? 'New order' : `${alerts.length} new orders`}
            </DialogTitle>
            <DialogDescription>Acknowledge to stop the alert.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {shown.map((a) => (
              <div key={a.orderId} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">#{a.orderNumber}</span>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold">{a.channel}</span>
                </div>
                {(a.table || a.customer) && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{[a.table, a.customer].filter(Boolean).join(' . ')}</p>
                )}
                {a.lines.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-sm">
                    {a.lines.map((l, i) => (
                      <li key={i}>
                        <span className="font-semibold">{l.quantity}x</span> {l.name}
                        {l.notes && <span className="text-xs text-muted-foreground"> ({l.notes})</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {alerts.length > shown.length && (
              <p className="text-xs text-muted-foreground">and {alerts.length - shown.length} more</p>
            )}
          </div>

          <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
            <Button variant="ghost" size="sm" onClick={toggleMute} title="Mute alerts on this device">
              {muted ? <VolumeX className="mr-1 h-4 w-4" /> : <Volume2 className="mr-1 h-4 w-4" />}
              {muted ? 'Sound off' : 'Sound on'}
            </Button>
            <Button onClick={acknowledge}>Acknowledge</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
