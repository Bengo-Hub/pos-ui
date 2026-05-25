'use client';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ClipboardList,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import React from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────

export function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

export function fmt(n: number): string {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(n);
}

export function fmtNum(n: number): string {
  return new Intl.NumberFormat('en-KE').format(n);
}

// ── Dashboard summary hook ────────────────────────────────────────────────────

export function useDashboardSummary() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['dashboard-summary', tenantID],
    queryFn: () => apiClient.get<any>(`/api/v1/${tenantID}/pos/reports/summary`),
    enabled: !!tenantID,
    staleTime: 2 * 60_000,
    retry: false,
  });
}

// ── QuickAction card ──────────────────────────────────────────────────────────

export function QuickAction({
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

export function KPICard({
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

// ── Recent orders mini-list ───────────────────────────────────────────────────

export function RecentOrdersCard({ orgSlug }: { orgSlug: string }) {
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
          {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="p-8 text-center">
          <ShoppingBag className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No open orders</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {orders.map((order: any) => (
            <Link key={order.id} href={`/${orgSlug}/orders`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-accent/50 transition-colors">
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
