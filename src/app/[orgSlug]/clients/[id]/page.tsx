'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Gift, Phone, ShoppingBag, Star, UserX } from 'lucide-react';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { useClient, useClientOrders } from '@/hooks/useClients';
import { CreditTermsCard } from '@/components/pos/clients/credit-terms';
import { useModuleAccess } from '@/hooks/use-module-access';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

function fmt(n: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n);
}

interface ClientAppointment {
  id: string;
  date: string;
  time: string;
  service_name: string;
  staff_name?: string;
  status: string;
  duration_minutes: number;
}

function useClientAppointments(customerName: string) {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  return useQuery({
    queryKey: ['client-appointments', tenantID, customerName],
    queryFn: () =>
      apiClient.get<{ data: ClientAppointment[] }>(
        `/api/v1/${tenantID}/pos/appointments?customer_name=${encodeURIComponent(customerName)}&limit=20`
      ),
    enabled: !!tenantID && !!customerName,
    staleTime: 60_000,
  });
}

const ORDER_STATUS_COLORS: Record<string, string> = {
  paid:       'text-emerald-600',
  completed:  'text-emerald-600',
  pending:    'text-amber-600',
  voided:     'text-red-500',
  refunded:   'text-blue-500',
  cancelled:  'text-muted-foreground/60',
};

const STATUS_COLORS: Record<string, string> = {
  completed:   'text-emerald-600',
  confirmed:   'text-blue-600',
  scheduled:   'text-muted-foreground',
  no_show:     'text-red-500',
  cancelled:   'text-muted-foreground/60',
  in_progress: 'text-amber-600',
};

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params?.orgSlug as string) || '';
  const accountID = (params?.id as string) || '';
  const { isRetail } = useModuleAccess();

  const { data: account, isLoading } = useClient(accountID);
  const { data: apptData } = useClientAppointments(account?.customer_name ?? '');
  const { data: ordersData } = useClientOrders(account?.customer_phone);
  const appointments = apptData?.data ?? [];
  const orders = ordersData?.data ?? [];
  const noShowCount = appointments.filter((a) => a.status === 'no_show').length;
  const completedCount = appointments.filter((a) => a.status === 'completed').length;
  const serviceFrequency = appointments.reduce<Record<string, number>>((acc, a) => {
    if (a.service_name) acc[a.service_name] = (acc[a.service_name] ?? 0) + 1;
    return acc;
  }, {});
  const topServices = Object.entries(serviceFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }));

  return (
    <ModuleGate moduleKey="loyalty" fallback={<ModuleUnavailablePage moduleKey="loyalty" />}>
      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Clients
        </button>

        {isLoading ? (
          <div className="space-y-3">
            <div className="h-24 rounded-2xl bg-muted animate-pulse" />
            <div className="h-32 rounded-2xl bg-muted animate-pulse" />
          </div>
        ) : !account ? (
          <div className="text-center py-12 text-muted-foreground">Client not found</div>
        ) : (
          <>
            {/* Profile header */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xl">
                  {account.customer_name[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="font-bold text-lg truncate">{account.customer_name}</h1>
                  {account.customer_phone && (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                      <Phone className="h-3.5 w-3.5" />
                      {account.customer_phone}
                    </p>
                  )}
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                    <Calendar className="h-3 w-3" />
                    Member since {new Date(account.created_at).toLocaleDateString('en-KE', { dateStyle: 'medium' })}
                  </p>
                </div>
              </div>
            </div>

            {/* Visit stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card border border-border rounded-2xl p-4 text-center">
                <Calendar className="h-5 w-5 text-primary mx-auto mb-1" />
                <p className="text-xl font-bold tabular-nums">{completedCount}</p>
                <p className="text-xs text-muted-foreground">Visits</p>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4 text-center">
                <UserX className="h-5 w-5 text-red-500 mx-auto mb-1" />
                <p className="text-xl font-bold tabular-nums text-red-500">{noShowCount}</p>
                <p className="text-xs text-muted-foreground">No Shows</p>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4 text-center">
                <Star className="h-5 w-5 text-primary mx-auto mb-1" />
                <p className="text-xl font-bold tabular-nums">{account.points_balance.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Points</p>
              </div>
            </div>

            {/* Credit terms (QA req 1): AR balance + credit limit / payment period from treasury */}
            <CreditTermsCard accountId={account.id} />

            {/* Service preferences */}
            {topServices.length > 0 && (
              <div className="bg-card border border-border rounded-2xl p-4">
                <p className="text-xs font-bold text-muted-foreground mb-3">Preferred Services</p>
                <div className="space-y-2">
                  {topServices.map((s) => (
                    <div key={s.name} className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{s.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0 ml-2">{s.count}×</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lifetime loyalty stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-2xl p-4 text-center">
                <Gift className="h-5 w-5 text-primary mx-auto mb-1" />
                <p className="text-xl font-bold tabular-nums">{account.lifetime_points.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Lifetime Points</p>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4 text-center">
                <Phone className="h-5 w-5 text-primary mx-auto mb-1" />
                <p className="text-sm font-bold truncate">{account.customer_phone || '—'}</p>
                <p className="text-xs text-muted-foreground">Phone</p>
              </div>
            </div>

            {/* Visit history */}
            {appointments.length > 0 && (
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-xs font-bold text-muted-foreground">Visit History</p>
                </div>
                <div className="divide-y divide-border">
                  {appointments.slice(0, 10).map((a) => (
                    <div key={a.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">{a.service_name || '—'}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(a.date).toLocaleDateString('en-KE', { dateStyle: 'medium' })} · {a.time}
                          {a.staff_name ? ` · ${a.staff_name}` : ''}
                        </p>
                      </div>
                      <span className={cn('text-[10px] font-bold capitalize', STATUS_COLORS[a.status] ?? 'text-muted-foreground')}>
                        {a.status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Purchase history */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs font-bold text-muted-foreground">Purchase History</p>
                {ordersData && (
                  <span className="ml-auto text-xs text-muted-foreground">{ordersData.total} orders</span>
                )}
              </div>
              {orders.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">No orders yet</div>
              ) : (
                <div className="divide-y divide-border">
                  {orders.map((o) => (
                    <div key={o.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">
                          {o.order_number ? `#${o.order_number}` : o.id.slice(0, 8).toUpperCase()}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(o.created_at).toLocaleDateString('en-KE', { dateStyle: 'medium' })}
                          {o.order_subtype ? ` · ${o.order_subtype.replace('_', ' ')}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums">{fmt(parseFloat(o.total_amount))}</p>
                        <span className={cn('text-[10px] font-bold capitalize', ORDER_STATUS_COLORS[o.status] ?? 'text-muted-foreground')}>
                          {o.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => router.push(`/${orgSlug}/${isRetail ? 'retail' : 'order'}`)}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Start New Order
              </button>
              <button
                type="button"
                onClick={() => router.push(`/${orgSlug}/appointments`)}
                className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors"
              >
                Book Appointment
              </button>
            </div>
          </>
        )}
      </div>
    </ModuleGate>
  );
}
