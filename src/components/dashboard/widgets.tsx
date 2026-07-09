'use client';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ClipboardList,
  Clock,
  ShoppingBag,
  TrendingUp,
  UtensilsCrossed,
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
            {Math.round(Math.abs(trend) * 100) / 100}%
          </span>
        )}
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff} min ago`;
  return `${Math.floor(diff / 60)}h ago`;
}

const subtypeLabels: Record<string, string> = {
  dine_in: 'Dine-in',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
  room_service: 'Room Svc',
  bar_tab: 'Bar Tab',
  walk_in: 'Walk-in',
};

function statusVariantClass(status: string) {
  if (status === 'pending_payment') return 'bg-amber-100 text-amber-700';
  if (status === 'completed') return 'bg-emerald-100 text-emerald-700';
  if (status === 'cancelled') return 'bg-red-100 text-red-700';
  return 'bg-blue-100 text-blue-700';
}

function statusLabel(status: string) {
  if (status === 'pending_payment') return 'Ready';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// ── Recent orders mini-list ───────────────────────────────────────────────────

export function RecentOrdersCard({ orgSlug }: { orgSlug: string }) {
  const tenantID = useTenantID();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-recent-orders', tenantID],
    queryFn: () =>
      apiClient.get<{ data: any[] }>(`/api/v1/${tenantID}/pos/orders`, {
        limit: 8,
        status: 'open,pending_payment',
      }),
    enabled: !!tenantID,
    refetchInterval: 15_000,
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
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="p-8 text-center">
          <ShoppingBag className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No open orders</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {orders.map((order: any) => {
            const subtype = order.order_subtype ?? order.order_type;
            const lineCount = order.edges?.lines?.length ?? order.items_count ?? 0;
            const tableRef = order.table_reference ?? order.table_name ?? order.edges?.table?.name;
            return (
              <Link
                key={order.id}
                href={`/${orgSlug}/orders?order_id=${order.id}`}
                className="flex items-start gap-3 px-5 py-4 hover:bg-accent/50 transition-colors"
              >
                {/* Order number badge */}
                <div className="h-9 w-9 rounded-lg bg-primary/8 flex items-center justify-center shrink-0 mt-0.5">
                  <UtensilsCrossed className="h-4 w-4 text-primary" />
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  {/* Row 1: order number + pills */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold font-mono text-foreground">
                      #{order.order_number ?? order.id?.slice(-6)}
                    </span>
                    {subtype && (
                      <span className="text-[10px] font-semibold bg-secondary/60 text-secondary-foreground px-1.5 py-0.5 rounded">
                        {subtypeLabels[subtype] ?? subtype}
                      </span>
                    )}
                    {tableRef && (
                      <span className="text-[10px] font-semibold bg-accent text-accent-foreground px-1.5 py-0.5 rounded">
                        {tableRef}
                      </span>
                    )}
                  </div>
                  {/* Row 2: item count + time */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{lineCount} item{lineCount !== 1 ? 's' : ''}</span>
                    {order.created_at && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />
                        {timeAgo(order.created_at)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: total + status */}
                <div className="text-right shrink-0 space-y-1">
                  <p className="text-sm font-bold tabular-nums text-foreground">
                    {fmt(order.total_amount ?? 0)}
                  </p>
                  <span className={cn(
                    'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                    statusVariantClass(order.status)
                  )}>
                    {statusLabel(order.status)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
