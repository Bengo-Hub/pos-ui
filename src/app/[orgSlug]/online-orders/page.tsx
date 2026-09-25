'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Bike, History as HistoryIcon, Loader2, Package, QrCode } from 'lucide-react';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { isAwaitingAcceptance, isOrderPaid, isOrderReady, isOnlineOrder, type PickupOrder } from '@/lib/api/online-orders';
import {
  useDeliveryDispatch, useNewOnlineOrderAlert, usePickupHistory, usePickupOrders,
} from '@/hooks/useOnlineOrders';
import { AssignRiderDialog } from '@/components/online-orders/assign-rider-dialog';
import { MenuQRCard } from '@/components/online-orders/menu-qr-card';
import {
  HOSPITALITY_VOCAB, OnlineOrderCard, RETAIL_VOCAB,
} from '@/components/online-orders/online-order-card';
import { HandoverDialog, RejectDialog, VerifyPaymentDialog } from '@/components/online-orders/order-action-dialogs';
import { POSPaymentModal } from '@/components/pos/payment-modal';
import { AccessoriesModal } from '@/components/pos/accessories-modal';
import { useModuleAccess } from '@/hooks/use-module-access';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { useAuthStore } from '@/store/auth';
import { useQueryClient } from '@tanstack/react-query';
import { cn, formatCurrency } from '@/lib/utils';

// Public online-store/menu base — the same URL the header's "Online Store" link uses.
const ORDERING_URL = process.env.NEXT_PUBLIC_ORDERING_UI_URL ?? 'https://ordering.codevertexafrica.com';
// Absolute pos-api base — the menu document is served by pos-api, NOT the pos-ui Next.js host.
const POS_API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://posapi.codevertexafrica.com';

type Tab = 'pickup' | 'delivery' | 'history';

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

function HistoryCard({ order, currency }: { order: PickupOrder; currency: string }) {
  const collected = order.metadata?.collected === true;
  const reason = (order.metadata?.rejected_reason ?? order.metadata?.cancel_reason) as string | undefined;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-bold text-foreground">{order.order_number}</p>
        <p className="text-sm text-muted-foreground">{order.customer_name || (isOnlineOrder(order) ? 'Online customer' : 'Walk-in')}</p>
        {!collected && reason && <p className="mt-1 text-xs text-muted-foreground">Reason: {reason}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold">{formatCurrency(order.total_amount, currency)}</p>
        <span className={cn(
          'mt-1 inline-block text-xs px-2.5 py-1 rounded-full font-semibold',
          collected ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-500/10 text-red-700 dark:text-red-400',
        )}>
          {collected ? (order.metadata?.dispatch_status === 'delivered' ? 'Delivered' : 'Collected') : 'Cancelled'}
        </span>
      </div>
    </div>
  );
}

function OnlineOrdersPage() {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const outletId = useAuthStore((s) => s.outlet?.id ?? '');
  const orgSlug = (useParams()?.orgSlug as string) || '';
  const qc = useQueryClient();
  const { useCase } = useModuleAccess();
  const vocab = useCase === 'retail' ? RETAIL_VOCAB : HOSPITALITY_VOCAB;
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';

  const { data: pickupOrders = [], isLoading: pickupLoading, isSuccess: pickupLoaded } = usePickupOrders();
  const { data: deliveryOrders = [], isLoading: deliveryLoading, isSuccess: deliveryLoaded } = useDeliveryDispatch();
  const [tab, setTab] = useState<Tab>('pickup');
  const { data: historyOrders = [], isLoading: historyLoading } = usePickupHistory(undefined, tab === 'history');

  // Ring for every new online order, whichever tab is open.
  const allLive = useMemo(() => [...pickupOrders, ...deliveryOrders], [pickupOrders, deliveryOrders]);
  useNewOnlineOrderAlert(allLive, pickupLoaded && deliveryLoaded);

  const [handover, setHandover] = useState<PickupOrder | null>(null);
  const [verify, setVerify] = useState<PickupOrder | null>(null);
  const [rejecting, setRejecting] = useState<PickupOrder | null>(null);
  const [assign, setAssign] = useState<PickupOrder | null>(null);
  const [settle, setSettle] = useState<PickupOrder | null>(null);
  const [accessories, setAccessories] = useState<PickupOrder | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['pickup-orders', tenantID] });
    qc.invalidateQueries({ queryKey: ['delivery-dispatch', tenantID] });
    qc.invalidateQueries({ queryKey: ['pos-orders'] });
  };

  // Orders waiting to be accepted come first; the rest follow the kitchen/counter flow.
  const toAccept = (list: PickupOrder[]) => list.filter((o) => isAwaitingAcceptance(o));
  const live = (list: PickupOrder[]) => list.filter((o) => !isAwaitingAcceptance(o));
  const pickupToAccept = toAccept(pickupOrders);
  const deliveryToAccept = toAccept(deliveryOrders);
  const inPrep = live(pickupOrders).filter((o) => !isOrderReady(o));
  const atCounter = live(pickupOrders).filter((o) => isOrderReady(o));
  const deliveryPrep = live(deliveryOrders).filter((o) => !isOrderReady(o));
  const deliveryReady = live(deliveryOrders).filter((o) => isOrderReady(o));

  const TABS = [
    { key: 'pickup' as const, label: vocab.pickupTab, icon: Package, count: pickupOrders.length },
    { key: 'delivery' as const, label: 'Delivery', icon: Bike, count: deliveryOrders.length },
    { key: 'history' as const, label: 'History', icon: HistoryIcon, count: undefined as number | undefined },
  ];

  const card = (o: PickupOrder) => (
    <OnlineOrderCard
      key={o.id}
      order={o}
      currency={currency}
      vocab={vocab}
      onHandover={setHandover}
      onVerify={setVerify}
      onReject={setRejecting}
      onAssignRider={setAssign}
      onSettle={setSettle}
      onAccessories={setAccessories}
    />
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Online Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Orders from your online store and takeaway/delivery orders from the till. New online
            orders ring and appear here automatically.
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
              <QrCode className="h-4 w-4" /> {useCase === 'retail' ? 'Catalogue PDF' : 'Menu PDF'}
            </a>
            <a
              href={`${POS_API_BASE}/api/v1/${tenantID}/pos/outlets/${outletId}/menu.html`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border border-border hover:bg-accent transition-colors"
            >
              {useCase === 'retail' ? 'Web catalogue' : 'Web menu'}
            </a>
          </div>
        )}
      </div>

      {orgSlug && <MenuQRCard url={`${ORDERING_URL}/${orgSlug}`} />}

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
            {t.count !== undefined && t.count > 0 && <span className="px-1.5 rounded-full text-[10px] bg-muted">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'pickup' && (
        pickupLoading ? <QueueLoading /> : pickupOrders.length === 0 ? <QueueEmpty label="No pickup orders right now." /> : (
          <div className="space-y-8">
            {pickupToAccept.length > 0 && (
              <QueueSection title={`New orders to accept (${pickupToAccept.length})`} color="text-primary">{pickupToAccept.map(card)}</QueueSection>
            )}
            {inPrep.length > 0 && (
              <QueueSection title={`${vocab.preparing} (${inPrep.length})`} color="text-muted-foreground">{inPrep.map(card)}</QueueSection>
            )}
            {atCounter.length > 0 && (
              <QueueSection title={`Ready at the counter (${atCounter.length})`} color="text-green-700 dark:text-green-400">{atCounter.map(card)}</QueueSection>
            )}
          </div>
        )
      )}

      {tab === 'delivery' && (
        deliveryLoading ? <QueueLoading /> : deliveryOrders.length === 0 ? <QueueEmpty label="No delivery orders right now." /> : (
          <div className="space-y-8">
            {deliveryToAccept.length > 0 && (
              <QueueSection title={`New orders to accept (${deliveryToAccept.length})`} color="text-primary">{deliveryToAccept.map(card)}</QueueSection>
            )}
            {deliveryPrep.length > 0 && (
              <QueueSection title={`${vocab.preparing} (${deliveryPrep.length})`} color="text-muted-foreground">{deliveryPrep.map(card)}</QueueSection>
            )}
            {deliveryReady.length > 0 && (
              <QueueSection title={`Ready for the rider (${deliveryReady.length})`} color="text-purple-700 dark:text-purple-400">{deliveryReady.map(card)}</QueueSection>
            )}
          </div>
        )
      )}

      {tab === 'history' && (
        historyLoading ? <QueueLoading /> : historyOrders.length === 0 ? <QueueEmpty label="No collection records yet." /> : (
          <div className="space-y-3">{historyOrders.map((o) => <HistoryCard key={o.id} order={o} currency={currency} />)}</div>
        )
      )}

      <HandoverDialog key={handover?.id ?? 'handover'} order={handover} currency={currency} onClose={() => setHandover(null)} />
      <VerifyPaymentDialog key={verify?.id ?? 'verify'} order={verify} currency={currency} onClose={() => setVerify(null)} onReject={setRejecting} />
      <RejectDialog key={rejecting?.id ?? 'reject'} order={rejecting} onClose={() => setRejecting(null)} />
      <AssignRiderDialog open={assign !== null} onOpenChange={(open) => { if (!open) setAssign(null); }} order={assign} />
      {settle && !isOrderPaid(settle) && (
        <POSPaymentModal
          open onClose={() => setSettle(null)} orderId={settle.id} orderNumber={settle.order_number}
          total={settle.total_amount} tenantSlug={orgSlug}
          onPaymentConfirmed={() => { setSettle(null); refresh(); }}
        />
      )}
      {accessories && (
        <AccessoriesModal open orderId={accessories.id} orderNumber={accessories.order_number} onClose={() => setAccessories(null)} onAdded={refresh} />
      )}
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
