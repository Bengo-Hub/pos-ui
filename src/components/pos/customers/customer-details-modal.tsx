'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Banknote, CreditCard, Loader2, Mail, Phone, User, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api/client';
import { clientsApi, type LoyaltyAccount } from '@/lib/api/clients';
import { useClientCreditByIdentifier } from '@/hooks/useClients';
import { useAuthStore } from '@/store/auth';
import { RecordPaymentModal } from '@/components/pos/sales/record-payment-modal';

const PAYMENT_STATUS_STYLES: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  due: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  overdue: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  refunded: 'bg-muted text-muted-foreground',
  voided: 'bg-muted text-muted-foreground',
  cancelled: 'bg-muted text-muted-foreground',
};

const OWING = new Set(['due', 'partial', 'overdue']);
const fmt = (n: number) => (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

/**
 * CustomerDetailsModal — the reusable customer profile opened from the All-Sales customer
 * link (which used to point at a nonexistent /clients route): contact details, credit/debt
 * position (treasury AR via the pos credit proxy), recent order history with per-order
 * Record-payment actions for on-account sales.
 */
export function CustomerDetailsModal({
  customerName,
  customerPhone,
  onClose,
}: {
  customerName?: string | null;
  customerPhone: string;
  onClose: () => void;
}) {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const [payOrder, setPayOrder] = useState<any | null>(null);

  // Loyalty/CRM account for this phone → the key the credit proxy needs.
  const { data: accountData } = useQuery({
    queryKey: ['customer-modal-account', tenantID, customerPhone],
    queryFn: () => clientsApi.searchAccounts(tenantID, customerPhone),
    enabled: !!tenantID && !!customerPhone,
    staleTime: 60_000,
  });
  const account: LoyaltyAccount | undefined = accountData?.accounts?.[0];

  // Treasury AR position (balance due + credit limit/period), proxied by pos-api. Identifier-based
  // (crm_contact_id, falling back to phone) so a customer with no loyalty account yet still shows
  // their real balance — shares the 'pos-client-credit' query-key prefix with useClientCredit /
  // useClientCreditByIdentifier so a return-completion invalidation refreshes this modal too.
  const { data: credit } = useClientCreditByIdentifier(account?.crm_contact_id, customerPhone);

  // Recent sales for this customer (same filter the All-Sales table uses).
  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['customer-modal-orders', tenantID, customerPhone],
    queryFn: () =>
      apiClient.get<{ data: any[] }>(`/api/v1/${tenantID}/pos/orders`, {
        customer: customerPhone,
        limit: 15,
      }),
    enabled: !!tenantID && !!customerPhone,
    staleTime: 30_000,
  });
  const orders: any[] = (ordersData as any)?.data ?? [];

  const owedTotal = useMemo(
    () => orders.filter((o) => OWING.has(o.payment_status)).reduce((s, o) => s + (o.amount_due ?? 0), 0),
    [orders],
  );
  const balanceDue = credit ? parseFloat(credit.balance_due ?? '0') || 0 : owedTotal;
  const creditLimit = credit?.credit_limit ? parseFloat(credit.credit_limit) || 0 : 0;

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold truncate">{account?.customer_name || customerName || 'Customer'}</h2>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{customerPhone}</span>
                {account?.customer_email && (
                  <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{account.customer_email}</span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Credit / debt position */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Balance due</p>
              <p className={cn('text-lg font-bold tabular-nums', balanceDue > 0 ? 'text-amber-600' : 'text-emerald-600')}>
                {fmt(balanceDue)}
              </p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Credit limit</p>
              <p className="text-lg font-bold tabular-nums">{creditLimit > 0 ? fmt(creditLimit) : 'No limit'}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Credit period</p>
              <p className="text-lg font-bold tabular-nums">
                {credit?.credit_period_days ? `${credit.credit_period_days}d` : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Loyalty points</p>
              <p className="text-lg font-bold tabular-nums">{account?.points_balance ?? 0}</p>
            </div>
          </div>

          {/* Order history */}
          <section className="rounded-2xl border border-border overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2"><CreditCard className="h-4 w-4" /> Recent sales</h3>
              {owedTotal > 0 && (
                <span className="text-xs font-semibold text-amber-600">Owed on sales: {fmt(owedTotal)}</span>
              )}
            </div>
            {ordersLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading sales…
              </div>
            ) : orders.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No sales recorded for this customer.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {orders.map((o) => (
                  <div key={o.id} className="px-4 py-2.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{o.order_number}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString()} · {(o.item_count ?? 0)} item{(o.item_count ?? 0) === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold capitalize shrink-0', PAYMENT_STATUS_STYLES[o.payment_status] ?? 'bg-muted text-muted-foreground')}>
                      {(o.payment_status ?? o.status ?? '').replace('_', ' ')}
                    </span>
                    <span className="tabular-nums text-sm font-semibold w-24 text-right shrink-0">{fmt(o.total_amount ?? 0)}</span>
                    {OWING.has(o.payment_status) && (o.amount_due ?? 0) > 0 ? (
                      <button
                        onClick={() => setPayOrder(o)}
                        className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-primary text-primary-foreground px-2.5 py-1.5 text-xs font-bold"
                      >
                        <Banknote className="h-3.5 w-3.5" /> Record payment
                      </button>
                    ) : (
                      <span className="w-[104px] shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {payOrder && (
        <RecordPaymentModal order={payOrder} onClose={() => setPayOrder(null)} />
      )}
    </div>,
    document.body,
  );
}
