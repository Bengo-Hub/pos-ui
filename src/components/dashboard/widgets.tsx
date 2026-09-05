'use client';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useOutletFilterStore } from '@/store/outlet-filter';
import { orderSubtypeBadge } from '@/lib/pos/order-subtype-label';
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

// currency defaults to KES only as a last resort (a tenant summary that hasn't loaded yet) —
// every real call site now passes the tenant's actual currency, resolved server-side from
// POSOrder.Currency (see GetSummary's "currency" field) rather than assuming KES.
export function fmt(n: number, currency = 'KES'): string {
  try {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
  }
}

export function fmtNum(n: number): string {
  return new Intl.NumberFormat('en-KE').format(n);
}

// ── Dashboard summary hook ────────────────────────────────────────────────────

// Omitting from/to preserves GetSummary's original today-vs-yesterday default — every caller
// that doesn't pass a range (cashier tab, any dashboard not wired to the range filter yet) keeps
// behaving exactly as before.
export function useDashboardSummary(range?: { from?: string; to?: string }) {
  const tenantID = useTenantID();
  const { from, to } = range ?? {};
  return useQuery({
    queryKey: ['dashboard-summary', tenantID, from, to],
    queryFn: () => apiClient.get<any>(`/api/v1/${tenantID}/pos/reports/summary`, from && to ? { from, to } : undefined),
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

// ── Quick action tile (compact, home-screen-icon style) ────────────────────────
// A denser alternative to QuickAction for the top-of-dashboard 4-column grid — icon-over-label,
// no description, so it stays legible at phone width without wrapping into a tall list.

/** Icon tint palette — gives each tile its own color instead of every non-primary action reading
 *  as the same flat pink, the way a real app's home-screen action row varies icon color by
 *  function (sales=primary, lists=blue, inventory=purple, analytics=emerald, cash=amber…). */
const TILE_TINTS = {
  primary: 'bg-primary/10 text-primary',
  blue: 'bg-blue-500/10 text-blue-600',
  purple: 'bg-purple-500/10 text-purple-600',
  emerald: 'bg-emerald-500/10 text-emerald-600',
  amber: 'bg-amber-500/10 text-amber-600',
  rose: 'bg-rose-500/10 text-rose-600',
  teal: 'bg-teal-500/10 text-teal-600',
} as const;
export type QuickActionTint = keyof typeof TILE_TINTS;

export function QuickActionTile({
  icon: Icon,
  label,
  href,
  accent = false,
  tint = 'primary',
}: {
  icon: React.ElementType;
  label: string;
  href: string;
  accent?: boolean;
  /** Icon tint when not `accent` — ignored for the accent (solid primary) tile. */
  tint?: QuickActionTint;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group relative flex flex-col items-center justify-center gap-2 sm:gap-2.5 p-3.5 sm:p-5 rounded-2xl border overflow-hidden text-center transition-all duration-200',
        accent
          ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-primary shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35 hover:-translate-y-0.5'
          : 'bg-card border-border hover:border-primary/30 hover:shadow-lg hover:shadow-primary/8 hover:-translate-y-0.5'
      )}
    >
      <div className={cn(
        'h-11 w-11 sm:h-14 sm:w-14 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110',
        accent ? 'bg-primary-foreground/15' : TILE_TINTS[tint],
      )}>
        <Icon className={cn('h-5 w-5 sm:h-6 sm:w-6', accent && 'text-primary-foreground')} />
      </div>
      <p className={cn('font-semibold text-xs sm:text-sm leading-tight', accent ? 'text-primary-foreground' : 'text-foreground')}>{label}</p>
    </Link>
  );
}

/** Quick-action "home screen" row — 2 columns on the narrowest phones, 4 across from small-tablet
 *  width up, so up to 4 actions always land in a single row and a 5th/6th simply wraps below. */
export function QuickActionGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">{children}</div>;
}

// ── KPI card ──────────────────────────────────────────────────────────────────

export function KPICard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  loading,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  // null means the backend deliberately suppressed the figure (e.g. a near-zero previous-period
  // baseline would make the percentage meaningless — see reports.go's growthPct) — treated the
  // same as "no trend at all", not as a real 0%.
  trend?: number | null;
  loading?: boolean;
  /** Optional — makes the whole card a link (e.g. "Active Staff" → the Team-on-shift tab). */
  href?: string;
}) {
  const content = (
    <div className={cn(
      'bg-card border border-border rounded-2xl p-3.5 sm:p-5 flex flex-col gap-2 sm:gap-3 min-w-0',
      href && 'hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer',
    )}>
      <div className="flex items-center justify-between gap-2 min-w-0">
        <p className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">{label}</p>
        <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
        </div>
      </div>
      {loading ? (
        <div className="h-7 sm:h-8 w-24 bg-muted rounded-lg animate-pulse" />
      ) : (
        // break-words (never truncate) — these are financial figures; on a narrow phone card the
        // value wraps to a second line instead of silently clipping with an ellipsis.
        <p className="text-lg sm:text-2xl font-bold text-foreground tabular-nums font-display leading-tight break-words">{value}</p>
      )}
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        {trend !== undefined && trend !== null && (
          <span className={cn(
            'text-xs font-semibold flex items-center gap-0.5 shrink-0',
            trend >= 0 ? 'text-emerald-500' : 'text-red-500'
          )}>
            <TrendingUp className={cn('h-3 w-3', trend < 0 && 'rotate-180')} />
            {Math.round(Math.abs(trend) * 100) / 100}%
          </span>
        )}
        {sub && <span className="text-xs text-muted-foreground truncate">{sub}</span>}
      </div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff} min ago`;
  return `${Math.floor(diff / 60)}h ago`;
}

// Subtype badges are use-case aware (orderSubtypeBadge): retail/services show
// Walk-in / Online / Shipping; Dine-in etc. are hospitality/quick-service only.

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
  // Active use case (drill-down outlet wins over the session's home outlet) — drives the
  // Walk-in/Online/Shipping vs Dine-in/Takeaway badge vocabulary.
  const homeUseCase = useAuthStore((s) => s.outlet?.use_case);
  const activeUseCase = useOutletFilterStore((s) => s.selectedOutlet?.useCase) ?? homeUseCase;
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
            const badge = orderSubtypeBadge(order, activeUseCase);
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
                    {badge && (
                      <span className="text-[10px] font-semibold bg-secondary/60 text-secondary-foreground px-1.5 py-0.5 rounded">
                        {badge}
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
                    {fmt(order.total_amount ?? 0, order.currency || 'KES')}
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
