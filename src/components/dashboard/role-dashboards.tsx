'use client';

import { apiClient } from '@/lib/api/client';
import { useModuleAccess } from '@/hooks/use-module-access';
import { cn } from '@/lib/utils';
import { QuickAction, KPICard, RecentOrdersCard, useDashboardSummary, useTenantID, fmt, fmtNum } from './widgets';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, BarChart3, BedDouble, Calendar, ChefHat,
  ClipboardList, Clock, CreditCard, Grid3x3, Package,
  Pill, Plus, RefreshCw, ShoppingBag, TrendingUp, Users,
  Wallet, Wine,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

export function AdminDashboard({ orgSlug }: { orgSlug: string }) {
  const { data: summary, isLoading, refetch, isFetching } = useDashboardSummary();
  const { hasModule, isPharmacy, isServices, isRetail, isQuickService } = useModuleAccess();
  const s = summary ?? {};

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground font-display">Today&apos;s Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <button onClick={() => refetch()} className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-accent transition-colors">
          <RefreshCw className={cn('h-4 w-4 text-muted-foreground', isFetching && 'animate-spin')} />
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Today's Revenue" value={fmt(s.total_revenue ?? 0)} sub="vs yesterday" icon={TrendingUp} trend={s.revenue_growth} loading={isLoading} />
        <KPICard label="Orders" value={fmtNum(s.total_orders ?? 0)} sub="today" icon={ClipboardList} trend={s.orders_growth} loading={isLoading} />
        <KPICard label="Avg Ticket" value={fmt(s.avg_ticket ?? 0)} sub="per order" icon={CreditCard} loading={isLoading} />
        <KPICard label="Active Staff" value={fmtNum(s.active_staff ?? 0)} sub="on shift" icon={Users} loading={isLoading} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentOrdersCard orgSlug={orgSlug} />
        </div>
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quick Actions</p>
          <QuickAction icon={Plus} label="New Order" desc="Start order entry" href={`/${orgSlug}/order`} accent />
          {isPharmacy && hasModule('pharmacy') && (
            <QuickAction icon={Pill} label="Prescriptions" desc="Fill & dispense" href={`/${orgSlug}/pharmacy`} />
          )}
          {isServices && hasModule('appointments') && (
            <QuickAction icon={Calendar} label="Appointments" desc="Manage bookings" href={`/${orgSlug}/appointments`} />
          )}
          {isRetail && (
            <QuickAction icon={ShoppingBag} label="Layaway" desc="Manage layaway orders" href={`/${orgSlug}/layaway`} />
          )}
          {!isPharmacy && !isServices && !isRetail && !isQuickService && hasModule('tables') && (
            <QuickAction icon={Grid3x3} label="Tables" desc="View floor plan" href={`/${orgSlug}/tables`} />
          )}
          {hasModule('reports') && (
            <QuickAction icon={BarChart3} label="Reports" desc="Sales & analytics" href={`/${orgSlug}/reports`} />
          )}
          <QuickAction icon={Wallet} label="Cash Drawer" desc="Open or close drawer" href={`/${orgSlug}/drawer`} />
        </div>
      </div>
    </div>
  );
}

export function CashierDashboard({ orgSlug }: { orgSlug: string }) {
  const tenantID = useTenantID();
  const { hasModule } = useModuleAccess();
  const { data: drawerData } = useQuery({
    queryKey: ['dashboard-drawer', tenantID],
    queryFn: () => apiClient.get<any>(`/api/v1/${tenantID}/pos/drawers/current`),
    enabled: !!tenantID, retry: false, staleTime: 30_000,
  });
  const { data: currentShift } = useQuery({
    queryKey: ['shift-current', tenantID],
    queryFn: () => apiClient.get<any>(`/api/v1/${tenantID}/pos/devices/current/sessions/current`),
    enabled: !!tenantID,
    retry: (count, err: any) => err?.response?.status !== 404 && count < 2,
    staleTime: 30_000,
  });
  const drawer = drawerData?.data ?? drawerData;
  const drawerOpen = drawer?.isOpen === true || drawer?.status === 'open' || !!currentShift?.id;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold font-display">Good {greeting()}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Ready to serve customers</p>
      </div>
      <div className={cn('flex items-center gap-4 p-4 rounded-2xl border', drawerOpen ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/20')}>
        <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center', drawerOpen ? 'bg-emerald-500/15' : 'bg-amber-500/15')}>
          <Wallet className={cn('h-5 w-5', drawerOpen ? 'text-emerald-500' : 'text-amber-500')} />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm">{drawerOpen ? 'Drawer is open' : 'Drawer is closed'}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {drawerOpen ? `Float: ${fmt(drawer?.opening_cash ?? 0)}` : 'Open a drawer to start taking payments'}
          </p>
        </div>
        <Link href={`/${orgSlug}/drawer`} className="text-xs font-semibold text-primary hover:underline">
          {drawerOpen ? 'View' : 'Open'}
        </Link>
      </div>
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Actions</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <QuickAction icon={Plus} label="New Order" desc="Start a new sale" href={`/${orgSlug}/order`} accent />
          <QuickAction icon={ClipboardList} label="Orders" desc="View open bills" href={`/${orgSlug}/orders`} />
          {hasModule('shifts') && <QuickAction icon={Clock} label="Shifts" desc="View shift status" href={`/${orgSlug}/shifts`} />}
          <QuickAction icon={Wallet} label="Cash Drawer" desc="Manage drawer" href={`/${orgSlug}/drawer`} />
        </div>
      </div>
      <RecentOrdersCard orgSlug={orgSlug} />
    </div>
  );
}

export function WaiterDashboard({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const { hasModule } = useModuleAccess();
  const showTables = hasModule('tables');

  // Redirect waiters directly to the tables page — no dashboard needed.
  useEffect(() => {
    if (showTables) router.replace(`/${orgSlug}/tables`);
  }, [orgSlug, router, showTables]);

  if (showTables) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Grid3x3 className="h-10 w-10 animate-pulse" />
          <p className="text-sm">Loading Tables…</p>
        </div>
      </div>
    );
  }

  // Fallback for non-table use cases (appointments-only, etc.)
  const showAppointments = hasModule('appointments');
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold font-display">Good {greeting()}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your orders and appointments</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {showAppointments && <QuickAction icon={Calendar} label="Appointments" desc="View today's schedule" href={`/${orgSlug}/appointments`} accent />}
        <QuickAction icon={Plus} label="New Order" desc="Take a new order" href={`/${orgSlug}/order`} />
        <QuickAction icon={ClipboardList} label="Open Bills" desc="Manage running orders" href={`/${orgSlug}/orders`} />
      </div>
      <RecentOrdersCard orgSlug={orgSlug} />
    </div>
  );
}

export function KitchenDashboard({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const { hasModule } = useModuleAccess();
  useEffect(() => {
    if (hasModule('kds')) router.replace(`/${orgSlug}/kds`);
  }, [orgSlug, router, hasModule]);
  if (hasModule('kds')) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <ChefHat className="h-10 w-10 animate-pulse" />
          <p className="text-sm">Loading Kitchen Display…</p>
        </div>
      </div>
    );
  }
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold font-display">Good {greeting()}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Ready to work</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <QuickAction icon={ClipboardList} label="Orders" desc="View active orders" href={`/${orgSlug}/orders`} accent />
        <QuickAction icon={Plus} label="New Order" desc="Start a new order" href={`/${orgSlug}/order`} />
      </div>
      <RecentOrdersCard orgSlug={orgSlug} />
    </div>
  );
}

export function BarDashboard({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const { hasModule } = useModuleAccess();
  useEffect(() => {
    if (hasModule('kds')) router.replace(`/${orgSlug}/bar`);
  }, [orgSlug, router, hasModule]);
  if (hasModule('kds')) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Wine className="h-10 w-10 animate-pulse" />
          <p className="text-sm">Loading Bar Display…</p>
        </div>
      </div>
    );
  }
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold font-display">Good {greeting()}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Ready to serve</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <QuickAction icon={ClipboardList} label="Orders" desc="View active orders" href={`/${orgSlug}/orders`} accent />
        <QuickAction icon={Plus} label="New Order" desc="Start a new order" href={`/${orgSlug}/order`} />
      </div>
      <RecentOrdersCard orgSlug={orgSlug} />
    </div>
  );
}

export function ReceptionistDashboard({ orgSlug }: { orgSlug: string }) {
  const tenantID = useTenantID();
  const { data: roomsData, isLoading } = useQuery({
    queryKey: ['dashboard-rooms', tenantID],
    queryFn: () => apiClient.get<{ data: any[] }>(`/api/v1/${tenantID}/hotel/rooms`),
    enabled: !!tenantID, staleTime: 60_000, retry: false,
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

export function RetailDashboard({ orgSlug }: { orgSlug: string }) {
  const { data: summary, isLoading, refetch, isFetching } = useDashboardSummary();
  const tenantID = useTenantID();
  const s = summary ?? {};
  const { data: lowStockData } = useQuery({
    queryKey: ['dashboard-low-stock', tenantID],
    queryFn: () => apiClient.get<any>(`/api/v1/${tenantID}/pos/catalog/items?low_stock=true`),
    enabled: !!tenantID, staleTime: 5 * 60_000, retry: false,
  });
  const lowStockCount = lowStockData?.meta?.total ?? lowStockData?.data?.length ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground font-display">Retail Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <button onClick={() => refetch()} className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-accent transition-colors">
          <RefreshCw className={cn('h-4 w-4 text-muted-foreground', isFetching && 'animate-spin')} />
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Today's Revenue" value={fmt(s.total_revenue ?? 0)} sub="vs yesterday" icon={TrendingUp} trend={s.revenue_growth} loading={isLoading} />
        <KPICard label="Transactions" value={fmtNum(s.total_orders ?? 0)} sub="today" icon={ClipboardList} trend={s.orders_growth} loading={isLoading} />
        <KPICard label="Avg Basket Value" value={fmt(s.avg_ticket ?? 0)} sub="per transaction" icon={ShoppingBag} loading={isLoading} />
        <KPICard label="Low Stock Alerts" value={fmtNum(lowStockCount)} sub="items below reorder" icon={Package} loading={isLoading} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2"><RecentOrdersCard orgSlug={orgSlug} /></div>
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quick Actions</p>
          <QuickAction icon={Plus} label="New Sale" desc="Start a new transaction" href={`/${orgSlug}/order`} accent />
          <QuickAction icon={ClipboardList} label="Orders" desc="View all transactions" href={`/${orgSlug}/orders`} />
          <QuickAction icon={Package} label="Purchase Orders" desc="Receive stock" href={`/${orgSlug}/purchase-orders`} />
          <QuickAction icon={BarChart3} label="Reports" desc="Sales & inventory" href={`/${orgSlug}/reports`} />
        </div>
      </div>
    </div>
  );
}

export function QuickServiceDashboard({ orgSlug }: { orgSlug: string }) {
  const tenantID = useTenantID();
  const { hasModule } = useModuleAccess();
  const { data: summary, isLoading, refetch, isFetching } = useDashboardSummary();
  const s = summary ?? {};
  const { data: kdsData } = useQuery({
    queryKey: ['dashboard-kds-queue', tenantID],
    queryFn: () => apiClient.get<any>(`/api/v1/${tenantID}/pos/kds/tickets?status=pending`),
    enabled: !!tenantID && hasModule('kds'), refetchInterval: 30_000, retry: false,
  });
  const queueDepth = kdsData?.meta?.total ?? kdsData?.data?.length ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground font-display">Quick Service Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <button onClick={() => refetch()} className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-accent transition-colors">
          <RefreshCw className={cn('h-4 w-4 text-muted-foreground', isFetching && 'animate-spin')} />
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Orders Today" value={fmtNum(s.total_orders ?? 0)} sub="total" icon={ClipboardList} trend={s.orders_growth} loading={isLoading} />
        <KPICard label="Revenue Today" value={fmt(s.total_revenue ?? 0)} sub="vs yesterday" icon={TrendingUp} trend={s.revenue_growth} loading={isLoading} />
        <KPICard label="Avg Ticket" value={fmt(s.avg_ticket ?? 0)} sub="per order" icon={CreditCard} loading={isLoading} />
        <KPICard label="Kitchen Queue" value={fmtNum(queueDepth)} sub="pending tickets" icon={ChefHat} loading={isLoading} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2"><RecentOrdersCard orgSlug={orgSlug} /></div>
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quick Actions</p>
          <QuickAction icon={Plus} label="New Order" desc="Take a quick order" href={`/${orgSlug}/order`} accent />
          {hasModule('kds') && <QuickAction icon={ChefHat} label="Kitchen Display" desc="View KDS queue" href={`/${orgSlug}/kds`} />}
          <QuickAction icon={ShoppingBag} label="Order Queue" desc="Pickup & takeout" href={`/${orgSlug}/queue`} />
          <QuickAction icon={BarChart3} label="Reports" desc="Sales & speed metrics" href={`/${orgSlug}/reports`} />
        </div>
      </div>
    </div>
  );
}

export function PharmacyDashboard({ orgSlug }: { orgSlug: string }) {
  const tenantID = useTenantID();
  const { data: summary, isLoading, refetch, isFetching } = useDashboardSummary();
  const s = summary ?? {};
  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['dashboard-rx-pending', tenantID],
    queryFn: () => apiClient.get<any>(`/api/v1/${tenantID}/pos/pharmacy/prescriptions?status=pending`),
    enabled: !!tenantID, refetchInterval: 30_000, retry: false,
  });
  const pendingCount = pendingData?.meta?.total ?? pendingData?.data?.length ?? 0;
  const pendingList = pendingData?.data?.slice(0, 5) ?? [];
  const { data: lowStockData } = useQuery({
    queryKey: ['dashboard-drug-low-stock', tenantID],
    queryFn: () => apiClient.get<any>(`/api/v1/${tenantID}/pos/catalog/items?low_stock=true&category=medication`),
    enabled: !!tenantID, staleTime: 5 * 60_000, retry: false,
  });
  const lowDrugCount = lowStockData?.meta?.total ?? lowStockData?.data?.length ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground font-display">Pharmacy Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <button onClick={() => refetch()} className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-accent transition-colors">
          <RefreshCw className={cn('h-4 w-4 text-muted-foreground', isFetching && 'animate-spin')} />
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Prescriptions Today" value={fmtNum(s.total_orders ?? 0)} sub="dispensed today" icon={Pill} trend={s.orders_growth} loading={isLoading} />
        <KPICard label="Pending Queue" value={fmtNum(pendingCount)} sub="awaiting dispensing" icon={ClipboardList} loading={pendingLoading} />
        <KPICard label="Revenue Today" value={fmt(s.total_revenue ?? 0)} sub="vs yesterday" icon={TrendingUp} trend={s.revenue_growth} loading={isLoading} />
        <KPICard label="Low Stock Drugs" value={fmtNum(lowDrugCount)} sub="below reorder level" icon={Package} loading={isLoading} />
      </div>
      {pendingList.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Pill className="h-4 w-4 text-primary" />
              <p className="font-semibold text-sm">Pending Prescriptions</p>
            </div>
            <Link href={`/${orgSlug}/pharmacy`} className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {pendingList.map((rx: any) => (
              <Link key={rx.id} href={`/${orgSlug}/pharmacy/${rx.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-accent/50 transition-colors">
                <div className="h-8 w-8 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                  <Pill className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{rx.prescription_number}</p>
                  <p className="text-xs text-muted-foreground">{rx.patient_name}</p>
                </div>
                <span className="text-xs font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">{rx.lines?.length ?? 0} items</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <QuickAction icon={Plus} label="New Prescription" desc="Receive & queue Rx" href={`/${orgSlug}/pharmacy`} accent />
        <QuickAction icon={Pill} label="All Prescriptions" desc="Fill & dispense" href={`/${orgSlug}/pharmacy`} />
        <QuickAction icon={Package} label="Drug Inventory" desc="Stock & expiry" href={`/${orgSlug}/drug-inventory`} />
      </div>
    </div>
  );
}

export function ServicesDashboard({ orgSlug }: { orgSlug: string }) {
  const tenantID = useTenantID();
  const { data: summary, isLoading, refetch, isFetching } = useDashboardSummary();
  const s = summary ?? {};
  const today = new Date().toISOString().split('T')[0];
  const { data: apptData, isLoading: apptLoading } = useQuery({
    queryKey: ['dashboard-appointments-today', tenantID, today],
    queryFn: () => apiClient.get<any>(`/api/v1/${tenantID}/pos/appointments?date=${today}`),
    enabled: !!tenantID, refetchInterval: 60_000, retry: false,
  });
  const todayAppts = apptData?.data ?? [];
  const confirmedCount = todayAppts.filter((a: any) => ['confirmed', 'in_progress'].includes(a.status)).length;
  const upcomingList = todayAppts.filter((a: any) => ['scheduled', 'confirmed'].includes(a.status)).slice(0, 5);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground font-display">Services Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <button onClick={() => refetch()} className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-accent transition-colors">
          <RefreshCw className={cn('h-4 w-4 text-muted-foreground', isFetching && 'animate-spin')} />
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Appointments Today" value={fmtNum(todayAppts.length)} sub="total booked" icon={Calendar} loading={apptLoading} />
        <KPICard label="Active / Confirmed" value={fmtNum(confirmedCount)} sub="in progress + confirmed" icon={Users} loading={apptLoading} />
        <KPICard label="Revenue Today" value={fmt(s.total_revenue ?? 0)} sub="vs yesterday" icon={TrendingUp} trend={s.revenue_growth} loading={isLoading} />
        <KPICard label="Avg Ticket" value={fmt(s.avg_ticket ?? 0)} sub="per service" icon={CreditCard} loading={isLoading} />
      </div>
      {(apptLoading || upcomingList.length > 0) && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <p className="font-semibold text-sm">Today&apos;s Appointments</p>
            </div>
            <Link href={`/${orgSlug}/appointments`} className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {apptLoading ? (
            <div className="p-5 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted rounded-xl animate-pulse" />)}</div>
          ) : (
            <div className="divide-y divide-border">
              {upcomingList.map((appt: any) => (
                <Link key={appt.id} href={`/${orgSlug}/appointments/${appt.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-accent/50 transition-colors">
                  <div className="h-8 w-8 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{appt.customer_name}</p>
                    <p className="text-xs text-muted-foreground">{appt.time} · {appt.duration_minutes}min</p>
                  </div>
                  <span className={cn(
                    'text-xs font-semibold px-2 py-0.5 rounded-full capitalize',
                    appt.status === 'confirmed'   && 'text-emerald-600 bg-emerald-500/10',
                    appt.status === 'in_progress' && 'text-amber-600 bg-amber-500/10',
                    appt.status === 'scheduled'   && 'text-blue-600 bg-blue-500/10',
                  )}>{appt.status?.replace('_', ' ')}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <QuickAction icon={Calendar} label="New Appointment" desc="Book a client" href={`/${orgSlug}/appointments`} accent />
        <QuickAction icon={Plus} label="New Sale" desc="Walk-in or product sale" href={`/${orgSlug}/order`} />
        <QuickAction icon={BarChart3} label="Reports" desc="Revenue & utilization" href={`/${orgSlug}/reports`} />
      </div>
    </div>
  );
}
