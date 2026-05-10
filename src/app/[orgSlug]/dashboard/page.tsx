'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useModuleAccess } from '@/hooks/use-module-access';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import {
  ArrowRight,
  BarChart3,
  BedDouble,
  ChefHat,
  ClipboardList,
  Clock,
  CreditCard,
  Grid3x3,
  Package,
  Plus,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet,
  Wine,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(n);
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat('en-KE').format(n);
}

// ── Quick action card ─────────────────────────────────────────────────────────

function QuickAction({
  icon: Icon,
  label,
  desc,
  href,
  accent = false,
}: {
  icon: React.ElementType;
  label: string;
  desc: string;
  href: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200',
        accent
          ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/25 hover:shadow-primary/35'
          : 'bg-card border-border hover:border-primary/30 hover:shadow-md hover:shadow-primary/8'
      )}
    >
      <div className={cn(
        'h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105',
        accent ? 'bg-primary-foreground/15' : 'bg-primary/8'
      )}>
        <Icon className={cn('h-5 w-5', accent ? 'text-primary-foreground' : 'text-primary')} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('font-semibold text-sm', accent ? 'text-primary-foreground' : 'text-foreground')}>{label}</p>
        <p className={cn('text-xs mt-0.5 truncate', accent ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{desc}</p>
      </div>
      <ArrowRight className={cn('h-4 w-4 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity', accent && 'text-primary-foreground')} />
    </Link>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  trend?: number;
  loading?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className="h-8 w-8 rounded-lg bg-primary/8 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
      {loading ? (
        <div className="h-8 w-24 bg-muted rounded-lg animate-pulse" />
      ) : (
        <p className="text-2xl font-bold text-foreground tabular-nums font-display">{value}</p>
      )}
      <div className="flex items-center gap-2">
        {trend !== undefined && (
          <span className={cn(
            'text-xs font-semibold flex items-center gap-0.5',
            trend >= 0 ? 'text-emerald-500' : 'text-red-500'
          )}>
            <TrendingUp className={cn('h-3 w-3', trend < 0 && 'rotate-180')} />
            {Math.abs(trend)}%
          </span>
        )}
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

// ── Recent orders mini-list ────────────────────────────────────────────────────

function RecentOrdersCard({ orgSlug }: { orgSlug: string }) {
  const tenantID = useTenantID();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-recent-orders', tenantID],
    queryFn: () => apiClient.get<{ data: any[] }>(`/api/v1/${tenantID}/pos/orders`, { limit: 5, status: 'open' }),
    enabled: !!tenantID,
    refetchInterval: 30_000,
  });
  const orders = data?.data ?? [];

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <p className="font-semibold text-sm">Open Orders</p>
        </div>
        <Link href={`/${orgSlug}/orders`} className="text-xs text-primary hover:underline flex items-center gap-1">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {isLoading ? (
        <div className="p-5 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="p-8 text-center">
          <ShoppingBag className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No open orders</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {orders.map((order: any) => (
            <Link
              key={order.id}
              href={`/${orgSlug}/orders`}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-accent/50 transition-colors"
            >
              <div className="h-8 w-8 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary">#{order.order_number ?? order.id?.slice(-3)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {order.order_type === 'dine_in' ? `Table ${order.table_number ?? '—'}` : order.order_type ?? 'Order'}
                </p>
                <p className="text-xs text-muted-foreground">{order.items_count ?? 0} items</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-foreground tabular-nums">{fmt(order.total_amount ?? 0)}</p>
                <p className="text-xs text-muted-foreground capitalize">{order.status}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Dashboard summary data hook ───────────────────────────────────────────────

function useDashboardSummary() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['dashboard-summary', tenantID],
    queryFn: () => apiClient.get<any>(`/api/v1/${tenantID}/pos/reports/summary`),
    enabled: !!tenantID,
    staleTime: 2 * 60_000,
    retry: false,
  });
}

// ── Role-specific dashboards ──────────────────────────────────────────────────

function AdminDashboard({ orgSlug }: { orgSlug: string }) {
  const { data: summary, isLoading, refetch, isFetching } = useDashboardSummary();
  const s = summary ?? {};

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground font-display">Today&apos;s Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-accent transition-colors"
        >
          <RefreshCw className={cn('h-4 w-4 text-muted-foreground', isFetching && 'animate-spin')} />
        </button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Today's Revenue"
          value={fmt(s.total_revenue ?? 0)}
          sub="vs yesterday"
          icon={TrendingUp}
          trend={s.revenue_growth}
          loading={isLoading}
        />
        <KPICard
          label="Orders"
          value={fmtNum(s.total_orders ?? 0)}
          sub="today"
          icon={ClipboardList}
          trend={s.orders_growth}
          loading={isLoading}
        />
        <KPICard
          label="Avg Ticket"
          value={fmt(s.avg_ticket ?? 0)}
          sub="per order"
          icon={CreditCard}
          loading={isLoading}
        />
        <KPICard
          label="Active Staff"
          value={fmtNum(s.active_staff ?? 0)}
          sub="on shift"
          icon={Users}
          loading={isLoading}
        />
      </div>

      {/* Quick actions + recent orders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentOrdersCard orgSlug={orgSlug} />
        </div>
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quick Actions</p>
          <QuickAction icon={Plus} label="New Order" desc="Start order entry" href={`/${orgSlug}/order`} accent />
          <QuickAction icon={Grid3x3} label="Tables" desc="View floor plan" href={`/${orgSlug}/tables`} />
          <QuickAction icon={BarChart3} label="Reports" desc="Sales & analytics" href={`/${orgSlug}/reports`} />
          <QuickAction icon={Wallet} label="Cash Drawer" desc="Open or close drawer" href={`/${orgSlug}/drawer`} />
        </div>
      </div>
    </div>
  );
}

function CashierDashboard({ orgSlug }: { orgSlug: string }) {
  const tenantID = useTenantID();

  const { data: drawerData } = useQuery({
    queryKey: ['dashboard-drawer', tenantID],
    queryFn: () => apiClient.get<any>(`/api/v1/${tenantID}/pos/drawers/current`),
    enabled: !!tenantID,
    retry: false,
  });

  const drawer = drawerData?.data ?? drawerData;
  const drawerOpen = drawer?.status === 'open';

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold font-display">Good {greeting()}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Ready to serve customers</p>
      </div>

      {/* Drawer status */}
      <div className={cn(
        'flex items-center gap-4 p-4 rounded-2xl border',
        drawerOpen ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/20'
      )}>
        <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center', drawerOpen ? 'bg-emerald-500/15' : 'bg-amber-500/15')}>
          <Wallet className={cn('h-5 w-5', drawerOpen ? 'text-emerald-500' : 'text-amber-500')} />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm">{drawerOpen ? 'Drawer is open' : 'Drawer is closed'}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {drawerOpen ? `Float: ${fmt(drawer?.opening_cash ?? 0)}` : 'Open a drawer to start taking payments'}
          </p>
        </div>
        <Link
          href={`/${orgSlug}/drawer`}
          className="text-xs font-semibold text-primary hover:underline"
        >
          {drawerOpen ? 'View' : 'Open'}
        </Link>
      </div>

      {/* Quick actions */}
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Actions</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <QuickAction icon={Plus} label="New Order" desc="Start a new sale" href={`/${orgSlug}/order`} accent />
          <QuickAction icon={ClipboardList} label="Orders" desc="View open bills" href={`/${orgSlug}/orders`} />
          <QuickAction icon={Clock} label="Shifts" desc="View shift status" href={`/${orgSlug}/shifts`} />
          <QuickAction icon={Wallet} label="Cash Drawer" desc="Manage drawer" href={`/${orgSlug}/drawer`} />
        </div>
      </div>

      <RecentOrdersCard orgSlug={orgSlug} />
    </div>
  );
}

function WaiterDashboard({ orgSlug }: { orgSlug: string }) {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold font-display">Good {greeting()}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your tables and orders</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <QuickAction icon={Grid3x3} label="Tables" desc="View your section" href={`/${orgSlug}/tables`} accent />
        <QuickAction icon={Plus} label="New Order" desc="Take a new order" href={`/${orgSlug}/order`} />
        <QuickAction icon={ClipboardList} label="Open Bills" desc="Manage running orders" href={`/${orgSlug}/orders`} />
      </div>

      <RecentOrdersCard orgSlug={orgSlug} />
    </div>
  );
}

function KitchenDashboard({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/${orgSlug}/kds`);
  }, [orgSlug, router]);
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <ChefHat className="h-10 w-10 animate-pulse" />
        <p className="text-sm">Loading Kitchen Display…</p>
      </div>
    </div>
  );
}

function BarDashboard({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/${orgSlug}/bar`);
  }, [orgSlug, router]);
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Wine className="h-10 w-10 animate-pulse" />
        <p className="text-sm">Loading Bar Display…</p>
      </div>
    </div>
  );
}

function ReceptionistDashboard({ orgSlug }: { orgSlug: string }) {
  const tenantID = useTenantID();
  const { data: roomsData, isLoading } = useQuery({
    queryKey: ['dashboard-rooms', tenantID],
    queryFn: () => apiClient.get<{ data: any[] }>(`/api/v1/${tenantID}/hotel/rooms`),
    enabled: !!tenantID,
    staleTime: 60_000,
    retry: false,
  });
  const rooms = roomsData?.data ?? [];
  const occupied = rooms.filter((r: any) => r.status === 'occupied').length;
  const available = rooms.filter((r: any) => r.status === 'available').length;
  const occupancyRate = rooms.length ? Math.round((occupied / rooms.length) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold font-display">Reception</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Occupancy KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <KPICard label="Occupied" value={isLoading ? '—' : fmtNum(occupied)} icon={BedDouble} loading={isLoading} />
        <KPICard label="Available" value={isLoading ? '—' : fmtNum(available)} icon={Package} loading={isLoading} />
        <KPICard label="Occupancy" value={isLoading ? '—' : `${occupancyRate}%`} icon={TrendingUp} loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <QuickAction icon={BedDouble} label="Rooms" desc="Check-in / check-out" href={`/${orgSlug}/hotel/rooms`} accent />
        <QuickAction icon={Users} label="Facilities" desc="Manage bookings" href={`/${orgSlug}/hotel/facilities`} />
        <QuickAction icon={Plus} label="New Order" desc="Room service order" href={`/${orgSlug}/order`} />
        <QuickAction icon={ClipboardList} label="Orders" desc="View active orders" href={`/${orgSlug}/orders`} />
      </div>
    </div>
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

// ── Root dashboard — picks the right view by role ──────────────────────────────

export default function DashboardPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const user = useAuthStore((s) => s.user);
  const { isSuperUser } = useModuleAccess();
  const roles = user?.roles ?? [];

  // Role priority: admin/manager > receptionist > cashier > waiter > kitchen > bar
  const primaryRole =
    isSuperUser || hasRole(roles, 'admin', 'pos_admin', 'superuser', 'super_admin')
      ? 'admin'
      : hasRole(roles, 'store_manager', 'manager')
      ? 'manager'
      : hasRole(roles, 'receptionist')
      ? 'receptionist'
      : hasRole(roles, 'cashier')
      ? 'cashier'
      : hasRole(roles, 'waiter')
      ? 'waiter'
      : hasRole(roles, 'kitchen')
      ? 'kitchen'
      : hasRole(roles, 'bar')
      ? 'bar'
      : 'cashier'; // default

  switch (primaryRole) {
    case 'admin':
    case 'manager':
      return <AdminDashboard orgSlug={orgSlug} />;
    case 'receptionist':
      return <ReceptionistDashboard orgSlug={orgSlug} />;
    case 'cashier':
      return <CashierDashboard orgSlug={orgSlug} />;
    case 'waiter':
      return <WaiterDashboard orgSlug={orgSlug} />;
    case 'kitchen':
      return <KitchenDashboard orgSlug={orgSlug} />;
    case 'bar':
      return <BarDashboard orgSlug={orgSlug} />;
    default:
      return <CashierDashboard orgSlug={orgSlug} />;
  }
}

function hasRole(roles: string[], ...check: string[]): boolean {
  return check.some((r) => roles.includes(r));
}
