'use client';

import { Can } from '@/components/auth/can';
import { GenerateComplimentaryCodeButton } from '@/components/pos/generate-complimentary-code-button';
import { GenerateVoidCodeButton } from '@/components/pos/generate-void-code-button';
import { PrintReceiptButton } from '@/components/pos/print-receipt-button';
import { ReceiptShareButtons } from '@/components/pos/sales/receipt-share-actions';
import { SplitPaymentModal } from '@/components/pos/split-payment-modal';
import { VoidBillButton } from '@/components/pos/void-bill-button';
import { VoidLineButton } from '@/components/pos/void-line-button';
import { Badge, Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { useOrders, useReleaseTable } from '@/hooks/usePOS';
import { P, usePermissions } from '@/hooks/usePermissions';
import { orderSubtypeBadge } from '@/lib/pos/order-subtype-label';
import { useOwnScope } from '@/lib/rbac/scope';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { TrackingIframeModal } from '@bengo-hub/shared-ui-lib';
import { DataTable, type DataTableColumn } from '@bengo-hub/shared-ui-lib/data-table';
import { useQueryClient } from '@tanstack/react-query';
import {
    CreditCard,
    Download,
    Eye,
    Filter,
    Map,
    Plus,
    Search,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const PAGE_SIZE = 20;

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending_payment', label: 'Ready for Payment' },
  { value: 'open', label: 'Open' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export default function OrdersPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { can, canAny } = usePermissions();
  const user = useAuthStore((s) => s.user);
  const outlet = useAuthStore((s) => s.outlet);
  const queryClient = useQueryClient();

  const outletUseCase = (outlet?.use_case ?? (user as any)?.outlet_use_case ?? '').toLowerCase();
  const isHospOrQSR = ['hospitality', 'quick_service'].includes(outletUseCase);
  const isCashierHospOrQSR = isHospOrQSR && (user?.roles ?? []).includes('cashier');
  const isHospitality = ['hospitality', 'quick_service', 'hotel'].includes(outletUseCase);
  const isRetail = outletUseCase === 'retail';

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  // Advanced filters (all server-side via useOrders — reuses the existing /orders query params).
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('all');
  const [source, setSource] = useState('all');
  const [customer, setCustomer] = useState('');
  const [debouncedCustomer, setDebouncedCustomer] = useState('');
  const [page, setPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const releaseTable = useReleaseTable();
  const selCurrency = selectedOrder?.currency ?? 'KES';

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCustomer(customer.trim()), 350);
    return () => clearTimeout(t);
  }, [customer]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Any change to a server-side filter → back to page 1.
  useEffect(() => {
    setPage(1);
  }, [statusFilter, dateFrom, dateTo, paymentMethod, source, debouncedCustomer, debouncedSearch]);

  const activeFilterCount =
    (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) + (paymentMethod !== 'all' ? 1 : 0) + (source !== 'all' ? 1 : 0) + (debouncedCustomer ? 1 : 0);

  // Roles with only view_own see their own orders; full view (or a super-waiter with
  // pos.orders.view, or an "outlet"-visibility outlet) sees all. Shared useOwnScope keeps this
  // identical to the Tables/sales-list surfaces + the server.
  const { ownOnly: viewOwnOnly } = useOwnScope();
  const staffId = viewOwnOnly ? (user as any)?.staffId ?? (user as any)?.id : undefined;

  const { data: ordersData, isLoading } = useOrders(
    useMemo(() => ({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      staffId,
      from: dateFrom || undefined,
      to: dateTo || undefined,
      paymentMethod: paymentMethod !== 'all' ? paymentMethod : undefined,
      source: source !== 'all' ? source : undefined,
      customer: debouncedCustomer || undefined,
      orderNumber: debouncedSearch || undefined,
      page,
      limit: PAGE_SIZE,
    }), [statusFilter, staffId, dateFrom, dateTo, paymentMethod, source, debouncedCustomer, debouncedSearch, page])
  );

  const orders = ordersData?.data ?? [];
  const total = ordersData?.meta?.total ?? ordersData?.total ?? orders.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const clearFilters = () => {
    setDateFrom(''); setDateTo(''); setPaymentMethod('all'); setSource('all'); setCustomer('');
  };

  // Order-# search is SERVER-side (order_number param) with a page reset — a client-side
  // filter over the current page silently hid matches living on other pages.
  const filtered = orders;

  const formatTime = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const isDeliveryOrder = (order: any) =>
    order.order_type === 'delivery' || order.fulfillment_type === 'delivery';

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    setSelectedOrder(null);
  };

  const statusBadge = (status: string) => (
    <Badge variant={
      status === 'completed' ? 'success' :
        status === 'pending_payment' ? 'warning' :
          status === 'cancelled' ? 'error' : 'default'
    }>
      {status === 'pending_payment' ? 'Ready for Payment' : status}
    </Badge>
  );

  // Shared DataTable columns — one config drives both the desktop grid and the mobile
  // card view (order # as the card title, the row actions in the card's top-right slot).
  const orderColumns: DataTableColumn<any>[] = [
    {
      key: 'order_number', header: 'Order #', primary: true,
      accessor: (o) => o.order_number,
      render: (o) => <span className="font-mono text-xs font-bold">{o.order_number}</span>,
    },
    {
      key: 'items', header: 'Items', align: 'center',
      accessor: (o) => o.edges?.lines?.length ?? 0,
      render: (o) => <span className="text-xs">{o.edges?.lines?.length ?? 0}</span>,
    },
    {
      key: 'total', header: 'Total', align: 'right',
      accessor: (o) => o.total_amount ?? 0,
      render: (o) => <span className="font-bold text-xs tabular-nums whitespace-nowrap">{formatCurrency(o.total_amount || 0, o.currency ?? 'KES')}</span>,
    },
    {
      key: 'status', header: 'Status', align: 'center',
      accessor: (o) => o.status,
      render: (o) => statusBadge(o.status),
    },
    {
      key: 'time', header: 'Time', align: 'right',
      accessor: (o) => o.created_at,
      render: (o) => <span className="text-xs text-muted-foreground whitespace-nowrap">{formatTime(o.created_at)}</span>,
    },
    {
      key: 'actions', header: '', exportable: false, mobileAction: true,
      render: (o) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSelectedOrder(o)}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
          {o.status !== 'cancelled' && (
            <PrintReceiptButton
              orderId={o.id}
              size="icon"
              variant="ghost"
              className="h-8 w-8 p-0"
              label={o.status === 'completed' ? 'Print Receipt' : 'Print Bill'}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{viewOwnOnly ? 'My Orders' : 'Order History'}</h1>
          <p className="text-muted-foreground mt-1">{viewOwnOnly ? 'Your orders and bills.' : 'View and manage all orders.'}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Hide New Order button for cashier in hospitality/quick_service — they clear bills, not take orders */}
          {can(P.ORDERS_ADD) && !isCashierHospOrQSR && (
            <Button asChild className="gap-2">
              <Link href={`/${orgSlug}/${isRetail ? 'retail' : 'order'}`}>
                <span className="h-4 w-4">+</span> New Order
              </Link>
            </Button>
          )}
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {/* Below lg the detail panel stacks BELOW the list at full width instead of squeezing
          beside it — a fixed w-96 (384px) side panel on its own exceeds the entire viewport on
          every supported phone width (375-430px), which visibly clipped/forced horizontal scroll
          the moment an order was selected. */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Orders table */}
        <Card className={cn("transition-all", selectedOrder ? "lg:flex-1" : "w-full")}>
          <CardHeader className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between py-4">
            <div className="relative w-full max-w-sm group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                placeholder="Search by order #..."
                className="w-full bg-accent/30 border-none rounded-lg py-2 pl-10 pr-4 text-sm focus:ring-1 focus:ring-primary transition-all"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {STATUS_FILTERS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => { setStatusFilter(value); setPage(1); }}
                  className={cn("px-3 py-1 rounded-full text-xs font-bold transition-all",
                    statusFilter === value ? "bg-primary text-primary-foreground" : "bg-accent/30 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => setShowFilters((v) => !v)}
                className={cn("inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold transition-all",
                  showFilters || activeFilterCount > 0 ? "bg-primary/10 text-primary" : "bg-accent/30 text-muted-foreground hover:text-foreground")}
              >
                <Filter className="h-3.5 w-3.5" /> Filters
                {activeFilterCount > 0 && (
                  <span className="ml-0.5 rounded-full bg-primary text-primary-foreground text-[10px] px-1.5 leading-4">{activeFilterCount}</span>
                )}
              </button>
            </div>
          </CardHeader>

          {/* Advanced filters — date range, payment method, source, customer. All server-side. */}
          {showFilters && (
            <div className="px-6 pb-4 -mt-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 border-b border-border">
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-semibold text-muted-foreground">From</span>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-accent/30 border border-border rounded-lg py-1.5 px-2 text-sm focus:ring-1 focus:ring-primary outline-none" />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-semibold text-muted-foreground">To</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                  className="bg-accent/30 border border-border rounded-lg py-1.5 px-2 text-sm focus:ring-1 focus:ring-primary outline-none" />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-semibold text-muted-foreground">Payment</span>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
                  className="bg-accent/30 border border-border rounded-lg py-1.5 px-2 text-sm focus:ring-1 focus:ring-primary outline-none">
                  <option value="all">Any method</option>
                  <option value="cash">Cash</option>
                  <option value="mpesa">M-Pesa</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="on_account">On account (credit)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-semibold text-muted-foreground">Source</span>
                <select value={source} onChange={(e) => setSource(e.target.value)}
                  className="bg-accent/30 border border-border rounded-lg py-1.5 px-2 text-sm focus:ring-1 focus:ring-primary outline-none">
                  <option value="all">Any source</option>
                  <option value="pos_terminal">POS terminal</option>
                  <option value="back_office">Back office</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-semibold text-muted-foreground">Customer</span>
                <input type="text" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Name or phone"
                  className="bg-accent/30 border border-border rounded-lg py-1.5 px-2 text-sm focus:ring-1 focus:ring-primary outline-none" />
              </label>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="sm:col-span-2 lg:col-span-5 justify-self-start text-xs font-semibold text-muted-foreground hover:text-destructive">
                  Clear all filters
                </button>
              )}
            </div>
          )}
          <CardContent className="p-4">
            <DataTable<any>
              columns={orderColumns}
              rows={filtered}
              rowKey={(o) => o.id}
              loading={isLoading}
              storageKey="pos-orders"
              emptyText="No orders match your filters."
              onRowClick={(o) => setSelectedOrder(o)}
              rowClassName={(o) => (selectedOrder?.id === o.id ? 'bg-accent/10' : undefined)}
              page={page}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              total={total}
              pageSize={PAGE_SIZE}
            />
          </CardContent>
        </Card>

        {/* Order detail side panel — full width when stacked on mobile, fixed sticky sidebar at lg+ */}
        {selectedOrder && (
          <Card className="w-full lg:w-96 lg:shrink-0 lg:self-start lg:sticky lg:top-8">
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <div>
                <h2 className="text-sm font-bold">Order {selectedOrder.order_number}</h2>
                <Badge
                  variant={
                    selectedOrder.status === 'completed' ? 'success' :
                      selectedOrder.status === 'pending_payment' ? 'warning' :
                        selectedOrder.status === 'cancelled' ? 'error' : 'default'
                  }
                  className="mt-1"
                >
                  {selectedOrder.status === 'pending_payment' ? 'Ready for Payment' : selectedOrder.status}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => { setSelectedOrder(null); setPaymentOpen(false); }}
              >
                ×
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedOrder.edges?.lines && selectedOrder.edges.lines.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Items</p>
                  {selectedOrder.edges.lines.map((line: any, i: number) => {
                    const lineTotal = line.total_price ?? (line.unit_price != null && line.quantity != null ? line.unit_price * line.quantity : 0);
                    const fullyVoided = line.voided_qty != null && line.voided_qty >= (line.quantity ?? 0);
                    const partiallyVoided = line.voided_qty != null && line.voided_qty < (line.quantity ?? 0);
                    return (
                      <div key={line.id ?? i} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs gap-2">
                          <span className={cn('font-medium', fullyVoided ? 'text-muted-foreground line-through' : 'text-foreground')}>
                            {line.quantity}x {line.name ?? line.item_name ?? 'Item'}
                            {fullyVoided && <span className="ml-1.5 no-underline text-[10px] font-semibold text-destructive">Voided</span>}
                            {partiallyVoided && <span className="ml-1.5 text-[10px] font-semibold text-amber-600">−{line.voided_qty} voided</span>}
                          </span>
                          <span className={cn('font-medium shrink-0', fullyVoided && 'text-muted-foreground line-through')}>{formatCurrency(lineTotal, selCurrency)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 pl-3">
                          {(line.unit_price ?? 0) > 0 ? (
                            <p className="text-[11px] text-muted-foreground">@ {formatCurrency(line.unit_price, selCurrency)} each</p>
                          ) : <span />}
                          {/* Partial voiding: drop just this item (e.g. an ingredient ran out) without
                              voiding the whole bill — same manager-approval flow as Void Bill. */}
                          <VoidLineButton
                            orderId={selectedOrder.id}
                            orderNumber={selectedOrder.order_number}
                            lineId={line.id}
                            name={line.name ?? line.item_name ?? 'Item'}
                            quantity={line.quantity ?? 1}
                            status={selectedOrder.status}
                            voidedQty={line.voided_qty}
                            compact
                            onVoided={({ lineId, voidedQty }) => {
                              setSelectedOrder((prev: any) => {
                                if (!prev) return prev;
                                const lns = prev.edges?.lines ?? [];
                                const target = lns.find((ln: any) => ln.id === lineId);
                                if (!target) return prev;
                                const unit = (target.quantity ?? 0) > 0
                                  ? (target.total_price ?? (target.unit_price ?? 0) * target.quantity) / target.quantity
                                  : 0;
                                const voidedValue = unit * voidedQty;
                                return {
                                  ...prev,
                                  subtotal: Math.max(0, (prev.subtotal ?? 0) - voidedValue),
                                  total_amount: Math.max(0, (prev.total_amount ?? 0) - voidedValue),
                                  edges: { ...prev.edges, lines: lns.map((ln: any) => ln.id === lineId ? { ...ln, voided_qty: voidedQty } : ln) },
                                };
                              });
                              queryClient.invalidateQueries({ queryKey: ['pos-orders'] });
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="border-t pt-2 space-y-1">
                    {(selectedOrder.subtotal ?? 0) > 0 && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Subtotal</span><span>{formatCurrency(selectedOrder.subtotal || 0, selCurrency)}</span>
                      </div>
                    )}
                    {(selectedOrder.tax_total ?? 0) > 0 && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Tax (VAT)</span><span>{formatCurrency(selectedOrder.tax_total || 0, selCurrency)}</span>
                      </div>
                    )}
                    {(selectedOrder.discount_total ?? 0) > 0 && (
                      <div className="flex items-center justify-between text-xs text-green-600">
                        <span>Discount</span><span>- {formatCurrency(selectedOrder.discount_total || 0, selCurrency)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs font-bold border-t pt-1">
                      <span>Total</span><span>{formatCurrency(selectedOrder.total_amount || 0, selCurrency)}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-1 text-xs text-muted-foreground">
                <p>Created: {formatTime(selectedOrder.created_at)}</p>
                {(() => {
                  const badge = orderSubtypeBadge(selectedOrder as any, outlet?.use_case);
                  return badge ? <p>Type: <span className="capitalize">{badge}</span></p> : null;
                })()}
                {selectedOrder.table_reference && <p>Table: {selectedOrder.table_reference}</p>}
                {selectedOrder.currency && <p>Currency: {selectedOrder.currency}</p>}
              </div>

              {['pending_payment', 'open'].includes(selectedOrder.status) && (
                <Can permission={P.ORDERS_ADD}>
                  <Link
                    href={`/${orgSlug}/order?order_id=${selectedOrder.id}&order_total=${selectedOrder.total_amount ?? 0}&covers=${selectedOrder.covers_count ?? 1}${selectedOrder.table_reference ? `&table_name=${encodeURIComponent(selectedOrder.table_reference)}` : ''}${selectedOrder.metadata?.table_id ? `&table_id=${selectedOrder.metadata.table_id}` : ''}&mode=add_to_bill`}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors"
                  >
                    <Plus className="h-4 w-4" /> Add to Bill
                  </Link>
                </Can>
              )}

              {['pending_payment', 'open'].includes(selectedOrder.status) && (
                <Can permission={P.PAYMENTS_ADD}>
                  <Button className="w-full gap-2" onClick={() => setPaymentOpen(true)}>
                    <CreditCard className="h-4 w-4" />
                    Collect Payment
                    {(selectedOrder.total_amount ?? 0) > 0 && (
                      <span className="ml-auto font-bold text-sm">{formatCurrency(selectedOrder.total_amount ?? 0, selCurrency)}</span>
                    )}
                  </Button>
                </Can>
              )}

              {/* Print receipt (completed orders) or the current bill (open/unpaid). Cancelled
                  orders have nothing to print. */}
              {selectedOrder.status !== 'cancelled' && (
                <PrintReceiptButton
                  orderId={selectedOrder.id}
                  label={selectedOrder.status === 'completed' ? 'Print Receipt' : 'Print Bill'}
                  className="w-full justify-center"
                />
              )}

              <ReceiptShareButtons order={selectedOrder} className="w-full" buttonClassName="w-full justify-center" />

              {/* Manager: generate a shareable one-time code to authorize a remote void. */}
              <GenerateVoidCodeButton
                orderId={selectedOrder.id}
                orderNumber={selectedOrder.order_number}
                status={selectedOrder.status}
                className="w-full justify-center flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-500/40 text-amber-600 dark:text-amber-400 text-sm font-semibold hover:bg-amber-500/5 transition-colors"
              />

              {/* Manager: generate a shareable one-time code to authorize closing this bill as
                  complimentary remotely — same "manager not around" flow as void. */}
              <GenerateComplimentaryCodeButton
                orderId={selectedOrder.id}
                orderNumber={selectedOrder.order_number}
                status={selectedOrder.status}
                className="w-full justify-center flex items-center gap-2 px-4 py-2 rounded-xl border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/5 transition-colors"
              />

              {/* Void the bill (permission-gated; cashiers require manager approval via scan/PIN/code).
                  Only shows for still-voidable bills — the "void bill" entry point in My Bills/Orders. */}
              <VoidBillButton
                orderId={selectedOrder.id}
                orderNumber={selectedOrder.order_number}
                status={selectedOrder.status}
                className="w-full justify-center flex items-center gap-2 px-4 py-2 rounded-xl border border-destructive/40 text-destructive text-sm font-semibold hover:bg-destructive/5 transition-colors"
                onVoided={() => { setSelectedOrder(null); queryClient.invalidateQueries({ queryKey: ['pos-orders'] }); }}
              />

              {isDeliveryOrder(selectedOrder) && (
                <Button variant="outline" className="w-full gap-2" onClick={() => setTrackingOpen(true)}>
                  <Map className="h-4 w-4" /> Track Delivery
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {selectedOrder && (
        <TrackingIframeModal
          open={trackingOpen}
          onOpenChange={setTrackingOpen}
          trackingCode={selectedOrder.tracking_code ?? selectedOrder.id}
        />
      )}

      {selectedOrder && (
        <SplitPaymentModal
          open={paymentOpen}
          onClose={() => setPaymentOpen(false)}
          orderId={selectedOrder.id}
          orderNumber={selectedOrder.order_number}
          total={selectedOrder.total_amount ?? 0}
          tenantSlug={orgSlug}
          tenantId={user?.tenant_id ?? ''}
          orderLines={(selectedOrder.edges?.lines ?? []).map((line: any, i: number) => ({
            id: line.id ?? String(i),
            name: line.name ?? line.item_name ?? 'Item',
            quantity: line.quantity ?? 1,
            unitPrice: line.unit_price ?? 0,
            totalPrice: line.total_price ?? ((line.unit_price ?? 0) * (line.quantity ?? 1)),
          }))}
          isHospitality={isHospitality}
          onPaymentConfirmed={() => {
            const tableId = selectedOrder?.table_id ?? selectedOrder?.metadata?.table_id;
            setPaymentOpen(false);
            setSelectedOrder(null);
            queryClient.invalidateQueries({ queryKey: ['pos-orders'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-recent-orders'] });
            // pos-api frees the table on completion; refresh the grid to reflect it.
            queryClient.invalidateQueries({ queryKey: ['pos-tables'] });
            if (tableId) {
              releaseTable.mutate(tableId);
            }
          }}
        />
      )}
    </div>
  );
}
