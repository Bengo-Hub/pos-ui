'use client';

import { toast } from 'sonner';
import {
  Bike, CalendarClock, CheckCircle2, Clock, Globe, Loader2, MapPin, Package, Phone, ShieldCheck,
  Store, UserCheck, Utensils, Wallet, XCircle,
} from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { cn, formatCurrency } from '@/lib/utils';
import {
  amountDue, isDeliveryOrder, isManualMpesa, isOnlineOrder, isOrderPaid, isOrderReady,
  type PickupOrder, type QueueOrderLine,
} from '@/lib/api/online-orders';
import { useOnlineOrderActions } from '@/hooks/useOnlineOrders';
import { usePermissions, P } from '@/hooks/usePermissions';

/** Words the queue uses, which differ between a kitchen and a shop floor. */
export interface QueueVocabulary {
  preparing: string;
  markReady: string;
  pickupTab: string;
  showAccessories: boolean;
}

export const HOSPITALITY_VOCAB: QueueVocabulary = {
  preparing: 'Preparing',
  markReady: 'Ready',
  pickupTab: 'Pickup & Takeaway',
  showAccessories: true,
};

export const RETAIL_VOCAB: QueueVocabulary = {
  preparing: 'To pick & pack',
  markReady: 'Packed & ready',
  pickupTab: 'Click & Collect',
  showAccessories: false,
};

const DELIVERY_STATE: Record<string, string> = {
  rider_assigned: 'Rider assigned',
  rider_accepted: 'Rider on the way to you',
  en_route_pickup: 'Rider on the way to you',
  arrived_pickup: 'Rider is at the counter',
  picked_up: 'Out for delivery',
  out_for_delivery: 'Out for delivery',
  en_route_dropoff: 'Out for delivery',
  arrived_dropoff: 'Rider at the customer',
  needs_rider: 'Needs a new rider',
};

function modifierLabels(meta?: Record<string, any>): string[] {
  const raw = meta?.modifiers;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m: any) => (typeof m === 'string' ? m : m?.option_name ?? m?.name ?? ''))
    .filter(Boolean);
}

function OrderLines({ lines }: { lines?: QueueOrderLine[] }) {
  if (!lines?.length) return null;
  return (
    <ul className="space-y-1 rounded-lg bg-muted/40 px-3 py-2">
      {lines.map((l) => {
        const mods = modifierLabels(l.metadata);
        const notes = l.metadata?.notes as string | undefined;
        return (
          <li key={l.id} className="text-sm">
            <span className="font-semibold">{l.quantity}×</span> {l.name}
            {(mods.length > 0 || notes) && (
              <span className="block pl-5 text-xs text-muted-foreground">
                {[mods.join(', '), notes].filter(Boolean).join(' | ')}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PaymentBadge({ order, currency }: { order: PickupOrder; currency: string }) {
  if (!isOnlineOrder(order)) return null;
  const method = String(order.metadata?.payment_method ?? '');
  if (isOrderPaid(order)) {
    const via = isManualMpesa(order) ? 'M-Pesa (confirmed)' : method === 'paystack' ? 'card' : method === 'wallet' ? 'wallet' : 'M-Pesa';
    return <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">Paid online · {via}</span>;
  }
  if (isManualMpesa(order)) {
    return (
      <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
        M-Pesa {order.metadata?.mpesa_code} · confirm payment
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
      {isDeliveryOrder(order) ? 'Pay on delivery' : 'Pay at counter'} · {formatCurrency(amountDue(order), currency)}
    </span>
  );
}

interface CardProps {
  order: PickupOrder;
  currency: string;
  vocab: QueueVocabulary;
  onHandover: (o: PickupOrder) => void;
  onVerify: (o: PickupOrder) => void;
  onReject: (o: PickupOrder) => void;
  onAssignRider: (o: PickupOrder) => void;
  onSettle: (o: PickupOrder) => void;
  onAccessories: (o: PickupOrder) => void;
}

const btn = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50';

/**
 * OnlineOrderCard is one order in the counter queue. It shows where the order came from, whether it
 * is paid (or what to collect), what is in it, and only the actions that make sense next:
 * mark ready, confirm a manual M-Pesa payment, hand over / deliver, assign a rider, or reject.
 * POS takeaway orders keep the till's own settle flow.
 */
export function OnlineOrderCard({ order, currency, vocab, onHandover, onVerify, onReject, onAssignRider, onSettle, onAccessories }: CardProps) {
  const { can, canAny } = usePermissions();
  const { markReady } = useOnlineOrderActions();
  const online = isOnlineOrder(order);
  const delivery = isDeliveryOrder(order);
  const paid = isOrderPaid(order);
  const ready = isOrderReady(order);
  const manage = canAny([P.ORDERS_MANAGE, P.ORDERS_CHANGE]);
  const scheduled = order.metadata?.scheduled_for_label as string | undefined;
  const address = order.metadata?.delivery_address as string | undefined;
  const orderNotes = order.metadata?.order_notes as string | undefined;
  const riderState = DELIVERY_STATE[String(order.metadata?.dispatch_status ?? '')];
  const riderAssigned = !!order.metadata?.rider_id || !!riderState;
  const needsVerify = online && isManualMpesa(order) && !paid;

  const ready_ = () =>
    markReady.mutate(order.id, {
      onSuccess: () => toast.success(online ? `${order.order_number} ready, customer notified` : `${order.order_number} marked ready`),
      onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to update status')),
    });

  return (
    <div className={cn('rounded-2xl border bg-card p-4 space-y-3', needsVerify ? 'border-amber-400/60' : 'border-border')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-foreground">{order.order_number}</p>
            <span className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase',
              online ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300' : 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
            )}>
              {online ? <Globe className="h-3 w-3" /> : <Store className="h-3 w-3" />}
              {online ? 'Online' : 'POS'}
            </span>
            {scheduled && (
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300">
                <CalendarClock className="h-3 w-3" /> For {scheduled}
              </span>
            )}
          </div>
          {order.customer_name && <p className="mt-0.5 text-sm text-muted-foreground">{order.customer_name}</p>}
          {order.customer_phone && (
            <a href={`tel:${order.customer_phone}`} className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Phone className="h-3 w-3" /> {order.customer_phone}
            </a>
          )}
        </div>
        <div className="shrink-0 text-right">
          <span className={cn(
            'rounded-full px-2.5 py-1 text-xs font-semibold',
            ready ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
          )}>
            {ready ? 'Ready' : vocab.preparing}
          </span>
          <p className="mt-2 text-xs text-muted-foreground">
            <Clock className="mr-1 inline h-3 w-3" />
            {new Date(order.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      <OrderLines lines={order.edges?.lines} />
      {orderNotes && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">Note: {orderNotes}</p>}
      {delivery && address && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{address}</p>
      )}
      {delivery && riderState && (
        <p className={cn('flex items-center gap-1.5 text-xs font-medium', order.metadata?.dispatch_status === 'needs_rider' ? 'text-destructive' : 'text-green-700 dark:text-green-400')}>
          <UserCheck className="h-3.5 w-3.5" /> {riderState}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{formatCurrency(Number(order.metadata?.online_grand_total ?? order.total_amount), currency)}</p>
          <PaymentBadge order={order} currency={currency} />
        </div>
        <div className="flex flex-wrap gap-2">
          {!online && !paid && vocab.showAccessories && can(P.ORDERS_ADD) && (
            <button onClick={() => onAccessories(order)} className={cn(btn, 'border border-border hover:bg-accent')}>
              <Utensils className="h-3.5 w-3.5" /> Accessories
            </button>
          )}
          {!ready && manage && (
            <button onClick={ready_} disabled={markReady.isPending} className={cn(btn, 'bg-green-600 text-white hover:bg-green-700')}>
              {markReady.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} {vocab.markReady}
            </button>
          )}
          {needsVerify && canAny([P.PAYMENTS_ADD, P.ORDERS_CHANGE, P.ORDERS_MANAGE]) && (
            <button onClick={() => onVerify(order)} className={cn(btn, 'bg-amber-500 text-white hover:bg-amber-600')}>
              <ShieldCheck className="h-3.5 w-3.5" /> Confirm M-Pesa
            </button>
          )}
          {!online && ready && !paid && can(P.PAYMENTS_ADD) && order.total_amount > 0 && (
            <button onClick={() => onSettle(order)} className={cn(btn, 'bg-primary text-primary-foreground hover:bg-primary/90')}>
              <Wallet className="h-3.5 w-3.5" /> Settle
            </button>
          )}
          {delivery && manage && !['picked_up', 'out_for_delivery', 'en_route_dropoff', 'arrived_dropoff'].includes(String(order.metadata?.dispatch_status ?? '')) && (
            <button onClick={() => onAssignRider(order)} className={cn(btn, 'border border-border hover:bg-accent')}>
              <Bike className="h-3.5 w-3.5" /> {riderAssigned ? 'Reassign rider' : 'Assign rider'}
            </button>
          )}
          {ready && manage && !needsVerify && (online || paid) && (
            <button onClick={() => onHandover(order)} className={cn(btn, 'bg-primary text-primary-foreground hover:bg-primary/90')}>
              <Package className="h-3.5 w-3.5" /> {delivery ? 'Delivered (own staff)' : online && !paid ? 'Collect & hand over' : 'Hand over'}
            </button>
          )}
          {online && manage && (
            <button onClick={() => onReject(order)} className={cn(btn, 'text-destructive hover:bg-destructive/10')}>
              <XCircle className="h-3.5 w-3.5" /> Reject
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
