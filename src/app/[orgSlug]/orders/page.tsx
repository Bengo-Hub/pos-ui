'use client';

import { Badge, Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import { useOrders, useReleaseTable } from '@/hooks/usePOS';
import { usePermissions, P } from '@/hooks/usePermissions';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  CreditCard,
  Download,
  Eye,
  Filter,
  Loader2,
  Map,
  ChevronLeft,
  ChevronRight,
  Search,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TrackingIframeModal } from '@bengo-hub/shared-ui-lib';
import { POSPaymentModal } from '@/components/pos/payment-modal';
import { PrintReceiptButton } from '@/components/pos/print-receipt-button';
import { useAuthStore } from '@/store/auth';

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
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const releaseTable = useReleaseTable();

  // Roles with only view_own should see their own orders; full view sees all.
  const viewOwnOnly = can(P.ORDERS_VIEW_OWN) && !can(P.ORDERS_VIEW);
  const staffId = viewOwnOnly ? (user as any)?.staffId ?? (user as any)?.id : undefined;

  const { data: ordersData, isLoading } = useOrders(
    useMemo(() => ({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      staffId,
      page,
      limit: PAGE_SIZE,
    }), [statusFilter, staffId, page])
  );

  const orders = ordersData?.data ?? [];
  const total = ordersData?.meta?.total ?? ordersData?.total ?? orders.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filtered = orders.filter((order: any) => {
    if (!searchQuery) return true;
    return (order.order_number || '').toLowerCase().includes(searchQuery.toLowerCase());
  });

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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
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

      <div className="flex gap-6">
        {/* Orders table */}
        <Card className={cn("transition-all", selectedOrder ? "flex-1" : "w-full")}>
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
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
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
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-accent/5">
                        <th className="text-left px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Order #</th>
                        <th className="text-center px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Items</th>
                        <th className="text-right px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Total</th>
                        <th className="text-center px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                        <th className="text-right px-6 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Time</th>
                        <th className="px-6 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtered.map((order: any) => (
                        <tr
                          key={order.id}
                          className={cn(
                            "hover:bg-accent/5 transition-colors cursor-pointer",
                            selectedOrder?.id === order.id && "bg-accent/10"
                          )}
                          onClick={() => setSelectedOrder(order)}
                        >
                          <td className="px-6 py-4 font-mono text-xs font-bold">{order.order_number}</td>
                          <td className="px-6 py-4 text-center text-xs">{order.edges?.lines?.length ?? 0}</td>
                          <td className="px-6 py-4 text-right font-bold text-xs">KES {(order.total_amount || 0).toLocaleString()}</td>
                          <td className="px-6 py-4 text-center">
                            <Badge variant={
                              order.status === 'completed' ? 'success' :
                                order.status === 'pending_payment' ? 'warning' :
                                  order.status === 'cancelled' ? 'error' : 'default'
                            }>
                              {order.status === 'pending_payment' ? 'Ready for Payment' : order.status}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-right text-xs text-muted-foreground">{formatTime(order.created_at)}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  setSelectedOrder(order);
                                }}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <PrintReceiptButton orderId={order.id} size="icon" variant="ghost" className="h-8 w-8 p-0" />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length === 0 && (
                    <div className="p-12 text-center text-muted-foreground">No orders match your filters.</div>
                  )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-6 py-3 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      Page {page} of {totalPages} · {total} orders
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handlePageChange(page - 1)}
                        disabled={page <= 1}
                        className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-40"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                        return p <= totalPages ? (
                          <button
                            key={p}
                            onClick={() => handlePageChange(p)}
                            className={cn(
                              "h-8 w-8 rounded-lg text-xs font-semibold transition-all",
                              p === page ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent"
                            )}
                          >
                            {p}
                          </button>
                        ) : null;
                      })}
                      <button
                        onClick={() => handlePageChange(page + 1)}
                        disabled={page >= totalPages}
                        className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-40"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Order detail side panel */}
        {selectedOrder && (
          <Card className="w-96 shrink-0 self-start sticky top-8">
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
                    return (
                      <div key={line.id ?? i} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-foreground font-medium">
                            {line.quantity}x {line.name ?? line.item_name ?? 'Item'}
                          </span>
                          <span className="font-medium">KES {lineTotal.toLocaleString()}</span>
                        </div>
                        {(line.unit_price ?? 0) > 0 && (
                          <p className="text-[11px] text-muted-foreground pl-3">@ KES {line.unit_price.toLocaleString()} each</p>
                        )}
                      </div>
                    );
                  })}
                  <div className="border-t pt-2 space-y-1">
                    {(selectedOrder.subtotal ?? 0) > 0 && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Subtotal</span><span>KES {(selectedOrder.subtotal || 0).toLocaleString()}</span>
                      </div>
                    )}
                    {(selectedOrder.tax_total ?? 0) > 0 && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Tax (VAT)</span><span>KES {(selectedOrder.tax_total || 0).toLocaleString()}</span>
                      </div>
                    )}
                    {(selectedOrder.discount_total ?? 0) > 0 && (
                      <div className="flex items-center justify-between text-xs text-green-600">
                        <span>Discount</span><span>- KES {(selectedOrder.discount_total || 0).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs font-bold border-t pt-1">
                      <span>Total</span><span>KES {(selectedOrder.total_amount || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-1 text-xs text-muted-foreground">
                <p>Created: {formatTime(selectedOrder.created_at)}</p>
                {selectedOrder.order_subtype && (
                  <p>Type: <span className="capitalize">{selectedOrder.order_subtype.replace('_', ' ')}</span></p>
                )}
                {selectedOrder.table_reference && <p>Table: {selectedOrder.table_reference}</p>}
                {selectedOrder.currency && <p>Currency: {selectedOrder.currency}</p>}
              </div>

              {['pending_payment', 'open'].includes(selectedOrder.status) && can(P.PAYMENTS_ADD) && (
                <Button className="w-full gap-2" onClick={() => setPaymentOpen(true)}>
                  <CreditCard className="h-4 w-4" />
                  Collect Payment
                  {(selectedOrder.total_amount ?? 0) > 0 && (
                    <span className="ml-auto font-bold text-sm">KES {(selectedOrder.total_amount ?? 0).toLocaleString()}</span>
                  )}
                </Button>
              )}

              {/* Print receipt (completed orders) or the current bill (open/unpaid) — available to
                  waiters, cashiers, managers and admins for (re)printing at any time. */}
              <PrintReceiptButton
                orderId={selectedOrder.id}
                label={selectedOrder.status === 'completed' ? 'Print Receipt' : 'Print Bill'}
                className="w-full justify-center"
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
        <POSPaymentModal
          open={paymentOpen}
          onClose={() => setPaymentOpen(false)}
          orderId={selectedOrder.id}
          orderNumber={selectedOrder.order_number}
          total={selectedOrder.total_amount ?? 0}
          tenantSlug={orgSlug}
          isHospitality={isHospitality}
          onPaymentConfirmed={() => {
            const tableId = selectedOrder?.table_id;
            setPaymentOpen(false);
            setSelectedOrder(null);
            queryClient.invalidateQueries({ queryKey: ['pos-orders'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-recent-orders'] });
            if (tableId) {
              releaseTable.mutate(tableId);
            }
          }}
        />
      )}
    </div>
  );
}
