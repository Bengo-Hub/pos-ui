'use client';

import { useState } from 'react';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

import { onlineOrdersApi, type PickupOrder, type DeliveryOrder } from '@/lib/api/online-orders';
import { useDeliveryOrders } from '@/hooks/useOnlineOrders';
import { AssignRiderDialog } from '@/components/online-orders/assign-rider-dialog';
import { usePermissions, P } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Bike, CheckCircle2, Clock, Loader2, MapPin, Package, Phone, UserCheck } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_COLOR: Record<string, string> = {
  pending:           'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  confirmed:         'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  preparing:         'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  ready_for_pickup:  'bg-green-500/10 text-green-700 dark:text-green-400',
  ready:             'bg-green-500/10 text-green-700 dark:text-green-400',
  out_for_delivery:  'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  dispatched:        'bg-purple-500/10 text-purple-700 dark:text-purple-400',
};

const STATUS_LABEL: Record<string, string> = {
  pending:           'Pending',
  confirmed:         'Preparing',
  preparing:         'Preparing',
  ready_for_pickup:  'Ready',
  ready:             'Ready',
  out_for_delivery:  'Out for delivery',
  dispatched:        'Dispatched',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('text-xs px-2.5 py-1 rounded-full font-semibold', STATUS_COLOR[status] ?? 'bg-muted text-muted-foreground')}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function OrderHeader({ order }: { order: PickupOrder }) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <p className="font-bold text-foreground">{order.order_number}</p>
        {order.customer_name && (
          <p className="text-sm text-muted-foreground mt-0.5">{order.customer_name}</p>
        )}
        {order.customer_phone && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
            <Phone className="h-3 w-3" />
            {order.customer_phone}
          </div>
        )}
      </div>
      <div className="text-right">
        <StatusBadge status={order.status} />
        <p className="text-xs text-muted-foreground mt-2">
          <Clock className="h-3 w-3 inline mr-1" />
          {new Date(order.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

function OrderCard({ order, tenantID }: { order: PickupOrder; tenantID: string }) {
  const qc = useQueryClient();
  const { can } = usePermissions();

  const markReady = useMutation({
    mutationFn: () => onlineOrdersApi.markReady(tenantID, order.id),
    onSuccess: () => {
      toast.success(`Order ${order.order_number} marked ready`);
      qc.invalidateQueries({ queryKey: ['pickup-orders', tenantID] });
    },
    onError: () => toast.error('Failed to update status'),
  });

  const markCollected = useMutation({
    mutationFn: () => onlineOrdersApi.markCollected(tenantID, order.id),
    onSuccess: () => {
      toast.success(`Order ${order.order_number} collected`);
      qc.invalidateQueries({ queryKey: ['pickup-orders', tenantID] });
    },
    onError: () => toast.error('Failed to update status'),
  });

  const status = order.status;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <OrderHeader order={order} />

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">
          KES {order.total_amount.toLocaleString()}
        </p>
        <div className="flex gap-2">
          {status !== 'ready_for_pickup' && can(P.ORDERS_CHANGE) && (
            <button
              onClick={() => markReady.mutate()}
              disabled={markReady.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {markReady.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Ready
            </button>
          )}
          {status === 'ready_for_pickup' && can(P.ORDERS_MANAGE) && (
            <button
              onClick={() => markCollected.mutate()}
              disabled={markCollected.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {markCollected.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
              Collected
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DeliveryOrderCard({ order, onAssign }: { order: DeliveryOrder; onAssign: (o: DeliveryOrder) => void }) {
  const { can } = usePermissions();

  const assignedRiderName =
    (order.metadata?.rider_name as string | undefined) ??
    (order.metadata?.rider_id ? 'Rider assigned' : undefined);
  const deliveryAddress = order.metadata?.delivery_address as string | undefined;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <OrderHeader order={order} />

      {deliveryAddress && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span className="line-clamp-2">{deliveryAddress}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">
          KES {order.total_amount.toLocaleString()}
        </p>
        <div className="flex items-center gap-2">
          {assignedRiderName && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400">
              <UserCheck className="h-3.5 w-3.5" />
              {assignedRiderName}
            </span>
          )}
          {can(P.ORDERS_MANAGE) && (
            <button
              onClick={() => onAssign(order)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Bike className="h-3.5 w-3.5" />
              {assignedRiderName ? 'Reassign Rider' : 'Assign Rider'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function OnlineOrdersPage() {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');

  const { data: pickupOrders = [], isLoading: pickupLoading } = useQuery({
    queryKey: ['pickup-orders', tenantID],
    queryFn: () => onlineOrdersApi.listPickup(tenantID),
    enabled: !!tenantID,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const { data: deliveryOrders = [], isLoading: deliveryLoading } = useDeliveryOrders();

  const [assignTarget, setAssignTarget] = useState<DeliveryOrder | null>(null);

  const pending = pickupOrders.filter((o) => o.status !== 'ready_for_pickup');
  const ready   = pickupOrders.filter((o) => o.status === 'ready_for_pickup');

  const isLoading = pickupLoading || deliveryLoading;
  const isEmpty = pickupOrders.length === 0 && deliveryOrders.length === 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Online Orders</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Click-and-collect pickups and online delivery orders. Assign a rider to delivery
          orders from here. Auto-refreshes every 15s.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading orders…</span>
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
          <Package className="h-12 w-12 opacity-20" />
          <p className="text-sm">No pending online orders right now.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {deliveryOrders.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-400 mb-3">
                <Bike className="h-4 w-4" />
                Delivery ({deliveryOrders.length})
              </h2>
              <div className="space-y-3">
                {deliveryOrders.map((o) => (
                  <DeliveryOrderCard key={o.id} order={o} onAssign={setAssignTarget} />
                ))}
              </div>
            </section>
          )}

          {pending.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Preparing — Pickup ({pending.length})
              </h2>
              <div className="space-y-3">
                {pending.map((o) => (
                  <OrderCard key={o.id} order={o} tenantID={tenantID} />
                ))}
              </div>
            </section>
          )}

          {ready.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-green-700 dark:text-green-400 mb-3">
                Ready for Pickup ({ready.length})
              </h2>
              <div className="space-y-3">
                {ready.map((o) => (
                  <OrderCard key={o.id} order={o} tenantID={tenantID} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <AssignRiderDialog
        open={assignTarget !== null}
        onOpenChange={(open) => { if (!open) setAssignTarget(null); }}
        order={assignTarget}
      />
    </div>
  );
}

export default function OnlineOrdersPageGated() {
  return (
    <ModuleGate moduleKey="online_orders" fallback={<ModuleUnavailablePage moduleKey="online_orders" />}>
      <OnlineOrdersPage />
    </ModuleGate>
  );
}
