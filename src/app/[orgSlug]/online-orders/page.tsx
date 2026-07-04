'use client';

import { useState } from 'react';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

import { onlineOrdersApi, type PickupOrder, type DeliveryOrder } from '@/lib/api/online-orders';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useDeliveryOrders, useDeliveryDispatch, usePickupHistory, onlineOrderKeys } from '@/hooks/useOnlineOrders';
import { AssignRiderDialog } from '@/components/online-orders/assign-rider-dialog';
import { MenuQRCard } from '@/components/online-orders/menu-qr-card';
import { POSPaymentModal } from '@/components/pos/payment-modal';
import { AccessoriesModal } from '@/components/pos/accessories-modal';
import { Utensils, Wallet, History as HistoryIcon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { usePermissions, P } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Bike, CheckCircle2, Clock, Loader2, MapPin, Package, Phone, QrCode, UserCheck } from 'lucide-react';
import { toast } from 'sonner';

// Public online-store/menu base — the same URL the header's "Online Store" link uses.
const ORDERING_URL = process.env.NEXT_PUBLIC_ORDERING_UI_URL ?? 'https://ordersapp.codevertexitsolutions.com';
// Absolute pos-api base — the menu document is served by pos-api, NOT the pos-ui Next.js host, so
// these links must be absolute (a relative /api/v1 path 404s on the pos-ui domain). Matches apiClient.
const POS_API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://posapi.codevertexitsolutions.com';

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

// isPaid — a completed order has been settled; the pickup queue then shows "Collected".
function isPaid(order: PickupOrder): boolean {
  return order.status === 'completed' || order.status === 'paid' || (order.metadata?.payment_status === 'paid');
}
// kitchenDone — the kitchen has finished (order awaiting settle/handover).
function kitchenDone(order: PickupOrder): boolean {
  return ['pending_payment', 'ready_for_pickup', 'ready', 'completed', 'paid'].includes(order.status);
}

function OrderCard({ order, tenantID, orgSlug }: { order: PickupOrder; tenantID: string; orgSlug: string }) {
  const qc = useQueryClient();
  const { can, canAny } = usePermissions();
  const [payOpen, setPayOpen] = useState(false);
  const [accOpen, setAccOpen] = useState(false);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['pickup-orders', tenantID] });
    qc.invalidateQueries({ queryKey: ['pos-orders'] });
  };

  const markReady = useMutation({
    mutationFn: () => onlineOrdersApi.markReady(tenantID, order.id),
    onSuccess: () => { toast.success(`Order ${order.order_number} marked ready`); invalidate(); },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to update status')),
  });
  const markCollected = useMutation({
    mutationFn: () => onlineOrdersApi.markCollected(tenantID, order.id),
    onSuccess: () => { toast.success(`Order ${order.order_number} collected`); invalidate(); },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to update status')),
  });

  const paid = isPaid(order);
  const done = kitchenDone(order);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <OrderHeader order={order} />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-semibold text-foreground">KES {order.total_amount.toLocaleString()}</p>
        <div className="flex gap-2 flex-wrap">
          {/* Accessories (spoon/knife/packaging) — while the bill is still open. */}
          {!paid && can(P.ORDERS_ADD) && (
            <button onClick={() => setAccOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-accent transition-colors">
              <Utensils className="h-3.5 w-3.5" /> Accessories
            </button>
          )}
          {/* Preparing → mark ready (optional; the kitchen also auto-advances on serve). */}
          {!done && can(P.ORDERS_CHANGE) && (
            <button onClick={() => markReady.mutate()} disabled={markReady.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors">
              {markReady.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Ready
            </button>
          )}
          {/* Kitchen done + unpaid → settle the bill here. */}
          {done && !paid && can(P.PAYMENTS_ADD) && order.total_amount > 0 && (
            <button onClick={() => setPayOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
              <Wallet className="h-3.5 w-3.5" /> Settle
            </button>
          )}
          {/* Paid → hand over / collect. */}
          {paid && canAny([P.ORDERS_MANAGE, P.ORDERS_CHANGE]) && (
            <button onClick={() => markCollected.mutate()} disabled={markCollected.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {markCollected.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />} Collected
            </button>
          )}
        </div>
      </div>

      {payOpen && (
        <POSPaymentModal
          open onClose={() => setPayOpen(false)} orderId={order.id} orderNumber={order.order_number}
          total={order.total_amount} tenantSlug={orgSlug}
          onPaymentConfirmed={() => { setPayOpen(false); invalidate(); }}
        />
      )}
      {accOpen && (
        <AccessoriesModal open orderId={order.id} orderNumber={order.order_number} onClose={() => setAccOpen(false)} onAdded={invalidate} />
      )}
    </div>
  );
}

function DeliveryOrderCard({ order, tenantID, orgSlug, onAssign }: { order: DeliveryOrder; tenantID: string; orgSlug: string; onAssign: (o: DeliveryOrder) => void }) {
  const qc = useQueryClient();
  const { can, canAny } = usePermissions();
  const [payOpen, setPayOpen] = useState(false);
  const [accOpen, setAccOpen] = useState(false);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: onlineOrderKeys.dispatch(tenantID) });
    qc.invalidateQueries({ queryKey: onlineOrderKeys.delivery(tenantID) });
    qc.invalidateQueries({ queryKey: ['pos-orders'] });
  };

  const markCollected = useMutation({
    mutationFn: () => onlineOrdersApi.markCollected(tenantID, order.id),
    onSuccess: () => { toast.success(`Delivery ${order.order_number} completed`); invalidate(); },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to update status')),
  });

  const assignedRiderName = (order.metadata?.rider_name as string | undefined) ?? (order.metadata?.rider_id ? 'Rider assigned' : undefined);
  const deliveryAddress = order.metadata?.delivery_address as string | undefined;
  const paid = isPaid(order);
  const done = kitchenDone(order);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <OrderHeader order={order} />
      {deliveryAddress && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span className="line-clamp-2">{deliveryAddress}</span>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-semibold text-foreground">KES {order.total_amount.toLocaleString()}</p>
        <div className="flex items-center gap-2 flex-wrap">
          {assignedRiderName && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400"><UserCheck className="h-3.5 w-3.5" />{assignedRiderName}</span>
          )}
          {!paid && can(P.ORDERS_ADD) && (
            <button onClick={() => setAccOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-accent transition-colors">
              <Utensils className="h-3.5 w-3.5" /> Accessories
            </button>
          )}
          {done && !paid && can(P.PAYMENTS_ADD) && order.total_amount > 0 && (
            <button onClick={() => setPayOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
              <Wallet className="h-3.5 w-3.5" /> Settle
            </button>
          )}
          {canAny([P.ORDERS_MANAGE, P.ORDERS_CHANGE]) && (
            <button onClick={() => onAssign(order)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
              <Bike className="h-3.5 w-3.5" />{assignedRiderName ? 'Reassign Rider' : 'Assign Rider'}
            </button>
          )}
          {paid && assignedRiderName && canAny([P.ORDERS_MANAGE, P.ORDERS_CHANGE]) && (
            <button onClick={() => markCollected.mutate()} disabled={markCollected.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {markCollected.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />} Delivered
            </button>
          )}
        </div>
      </div>

      {payOpen && (
        <POSPaymentModal open onClose={() => setPayOpen(false)} orderId={order.id} orderNumber={order.order_number} total={order.total_amount} tenantSlug={orgSlug} onPaymentConfirmed={() => { setPayOpen(false); invalidate(); }} />
      )}
      {accOpen && (
        <AccessoriesModal open orderId={order.id} orderNumber={order.order_number} onClose={() => setAccOpen(false)} onAdded={invalidate} />
      )}
    </div>
  );
}

// A read-only card for the collection History tab.
function HistoryCard({ order }: { order: DeliveryOrder }) {
  const collected = order.metadata?.collected === true;
  const subtype = (order as any).order_subtype as string | undefined;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
      <OrderHeader order={order} />
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">KES {order.total_amount.toLocaleString()}</p>
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${collected ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-500/10 text-red-700 dark:text-red-400'}`}>
          {collected ? 'Collected' : 'Not collected'}{subtype ? ` · ${subtype}` : ''}
        </span>
      </div>
    </div>
  );
}

function QueueLoading() {
  return (
    <div className="flex items-center justify-center h-48 gap-3">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <span className="text-sm text-muted-foreground">Loading orders…</span>
    </div>
  );
}
function QueueEmpty({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
      <Package className="h-12 w-12 opacity-20" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
function QueueSection({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className={cn('text-sm font-semibold uppercase tracking-wide mb-3', color)}>{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function OnlineOrdersPage() {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const outletId = useAuthStore((s) => s.outlet?.id ?? '');
  const orgSlug = (useParams()?.orgSlug as string) || '';

  const { data: pickupOrders = [], isLoading: pickupLoading } = useQuery({
    queryKey: ['pickup-orders', tenantID],
    queryFn: () => onlineOrdersApi.listPickup(tenantID),
    enabled: !!tenantID,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const { data: deliveryOrders = [], isLoading: deliveryLoading } = useDeliveryOrders();
  // POS-native delivery orders placed at the terminal — dispatched directly to logistics.
  const { data: dispatchOrders = [], isLoading: dispatchLoading } = useDeliveryDispatch();

  const [assignTarget, setAssignTarget] = useState<DeliveryOrder | null>(null);
  const [tab, setTab] = useState<'delivery' | 'takeaway' | 'history'>('delivery');

  const { data: historyOrders = [], isLoading: historyLoading } = usePickupHistory(undefined, tab === 'history');

  // Delivery tab = POS dispatch + online delivery. Takeaway tab = the pickup queue (takeaway + online pickup).
  const allDelivery = [...dispatchOrders, ...deliveryOrders];
  const takeawayPrep = pickupOrders.filter((o) => !isPaid(o) && !kitchenDone(o));
  const takeawayReady = pickupOrders.filter((o) => !isPaid(o) && kitchenDone(o));
  const takeawayCollectable = pickupOrders.filter((o) => isPaid(o));

  const isLoading = pickupLoading || deliveryLoading || dispatchLoading;

  const TABS = [
    { key: 'delivery' as const, label: 'Delivery', icon: Bike, count: allDelivery.length },
    { key: 'takeaway' as const, label: 'Takeaway', icon: Package, count: pickupOrders.length },
    { key: 'history' as const, label: 'History', icon: HistoryIcon, count: undefined as number | undefined },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Online Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Click-and-collect pickups and online delivery orders. Assign a rider to delivery
            orders from here. Auto-refreshes every 15s.
          </p>
        </div>
        {outletId && (
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={`${POS_API_BASE}/api/v1/${tenantID}/pos/outlets/${outletId}/menu.pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <QrCode className="h-4 w-4" /> Menu PDF
            </a>
            <a
              href={`${POS_API_BASE}/api/v1/${tenantID}/pos/outlets/${outletId}/menu.html`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border border-border hover:bg-accent transition-colors"
            >
              Web menu
            </a>
          </div>
        )}
      </div>

      {orgSlug && <MenuQRCard url={`${ORDERING_URL}/${orgSlug}`} />}

      {/* Order-type tabs */}
      <div className="flex gap-2 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors',
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="px-1.5 rounded-full text-[10px] bg-muted">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Delivery tab ── */}
      {tab === 'delivery' && (
        isLoading ? <QueueLoading /> : allDelivery.length === 0 ? <QueueEmpty label="No delivery orders right now." /> : (
          <div className="space-y-3">
            {allDelivery.map((o) => (
              <DeliveryOrderCard key={o.id} order={o} tenantID={tenantID} orgSlug={orgSlug} onAssign={setAssignTarget} />
            ))}
          </div>
        )
      )}

      {/* ── Takeaway tab ── */}
      {tab === 'takeaway' && (
        isLoading ? <QueueLoading /> : pickupOrders.length === 0 ? <QueueEmpty label="No takeaway orders right now." /> : (
          <div className="space-y-8">
            {takeawayPrep.length > 0 && (
              <QueueSection title={`Preparing (${takeawayPrep.length})`} color="text-muted-foreground">
                {takeawayPrep.map((o) => <OrderCard key={o.id} order={o} tenantID={tenantID} orgSlug={orgSlug} />)}
              </QueueSection>
            )}
            {takeawayReady.length > 0 && (
              <QueueSection title={`Ready — Settle (${takeawayReady.length})`} color="text-amber-600 dark:text-amber-400">
                {takeawayReady.map((o) => <OrderCard key={o.id} order={o} tenantID={tenantID} orgSlug={orgSlug} />)}
              </QueueSection>
            )}
            {takeawayCollectable.length > 0 && (
              <QueueSection title={`Ready for Pickup (${takeawayCollectable.length})`} color="text-green-700 dark:text-green-400">
                {takeawayCollectable.map((o) => <OrderCard key={o.id} order={o} tenantID={tenantID} orgSlug={orgSlug} />)}
              </QueueSection>
            )}
          </div>
        )
      )}

      {/* ── History tab ── */}
      {tab === 'history' && (
        historyLoading ? <QueueLoading /> : historyOrders.length === 0 ? <QueueEmpty label="No collection records yet." /> : (
          <div className="space-y-3">
            {historyOrders.map((o) => <HistoryCard key={o.id} order={o} />)}
          </div>
        )
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
