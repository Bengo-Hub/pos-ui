'use client';

/**
 * Sales Analytics — tabbed report browser over the pos-api analytics endpoints
 * (sales-by-staff, sales-by-hour, sales-by-category, sales-by-kds-station, product-mix,
 * void-summary). Two filter layers: a SHARED bar (date range + outlet) that scopes every tab,
 * and PER-TAB filters (search/dropdown) that refine the already-fetched rows for that report.
 */

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Users, Clock, Tag, Package, Ban, ChefHat, Monitor, Search, Wallet, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  useSalesByStaff, useSalesByHour, useSalesByCategory, useSalesByKDSStation, useProductMix, useVoidSummary,
  useRegisterDetails,
  type ProductMixAggRow,
} from '@/hooks/useReports';
import { ReportExportButtons } from '@/components/reports/report-document-button';
import { OutletFilter } from '@/components/outlet-filter';
import { useOutletFilterStore } from '@/store/outlet-filter';
import { useModuleAccess } from '@/hooks/use-module-access';
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker';
import { Card, CardContent } from '@/components/ui/base';
import { cn } from '@/lib/utils';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => `KES ${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

type TabId = 'staff' | 'hour' | 'category' | 'kds' | 'register' | 'products' | 'payments' | 'mix' | 'voids';

interface TabDef { id: TabId; label: string; icon: React.ElementType }
const COMMON_TABS_HEAD: TabDef[] = [
  { id: 'staff', label: 'Staff', icon: Users },
  { id: 'hour', label: 'Hour', icon: Clock },
  { id: 'category', label: 'Category', icon: Tag },
];
const COMMON_TABS_TAIL: TabDef[] = [
  { id: 'mix', label: 'Product Mix', icon: Package },
  { id: 'voids', label: 'Voids', icon: Ban },
];
// KDS Station is a kitchen concept — hospitality/quick_service only. Every other use case
// (retail/services/pharmacy) gets the register-oriented reports instead (all powered by the
// existing register-details endpoint — no KDS language on a duka/pharmacy screen).
const KDS_TAB: TabDef = { id: 'kds', label: 'KDS Station', icon: ChefHat };
const REGISTER_TABS: TabDef[] = [
  { id: 'register', label: 'Register', icon: Monitor },
  { id: 'products', label: 'Products & Brands', icon: Package },
  { id: 'payments', label: 'Payment Methods', icon: Wallet },
];

export default function AnalyticsReportPage() {
  const [range, setRange] = useState<DateRange>({ from: isoDaysAgo(30), to: todayISO() });
  const [tab, setTab] = useState<TabId>('staff');

  // Shared outlet filter — HQ/admin users only (OutletFilter itself hides for regular staff).
  const selectedOutlet = useOutletFilterStore((s) => s.selectedOutlet);
  const outletId = selectedOutlet?.id;

  // Tab list follows the outlet's use case: kitchen use cases get KDS Station, everything
  // else gets Register / Products & Brands / Payment Methods.
  const { isHospitality, isQuickService, isResolved } = useModuleAccess();
  const isKitchen = isHospitality || isQuickService;
  const tabs = useMemo<TabDef[]>(
    () => [...COMMON_TABS_HEAD, ...(!isResolved || isKitchen ? [KDS_TAB] : REGISTER_TABS), ...COMMON_TABS_TAIL],
    [isKitchen, isResolved],
  );
  useEffect(() => {
    if (isResolved && !tabs.some((t) => t.id === tab)) setTab('staff');
  }, [isResolved, tabs, tab]);

  // Sales by Hour is a single-day breakdown server-side; it gets its own date control,
  // seeded from the shared range's "to" date but independently adjustable.
  const [hourDate, setHourDate] = useState(range.to);

  const staff = useSalesByStaff(range.from, range.to, outletId);
  const hours = useSalesByHour(hourDate, outletId);
  const cats = useSalesByCategory(range.from, range.to, outletId);
  const kdsStations = useSalesByKDSStation(range.from, range.to, outletId, isKitchen || !isResolved);
  const register = useRegisterDetails(range.from, range.to, outletId, isResolved && !isKitchen);
  const mix = useProductMix(range.from, range.to, outletId);
  const voids = useVoidSummary(range.from, range.to, outletId);

  // ── Per-tab filters (client-side refinement of the already-fetched rows) ──────────────
  const [staffSearch, setStaffSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [stationType, setStationType] = useState('');
  const [mixSearch, setMixSearch] = useState('');
  const [mixCategories, setMixCategories] = useState<string[]>([]);
  const [mixStations, setMixStations] = useState<string[]>([]);
  const [voidSearch, setVoidSearch] = useState('');
  const [voidReason, setVoidReason] = useState('');

  const staffRows = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    return (staff.data ?? []).filter((r) => !q || (r.staff_name || '').toLowerCase().includes(q));
  }, [staff.data, staffSearch]);

  const categoryRows = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    return (cats.data ?? []).filter((r) => !q || r.category_name.toLowerCase().includes(q));
  }, [cats.data, categorySearch]);

  const stationTypeOptions = useMemo(
    () => Array.from(new Set((kdsStations.data ?? []).map((r) => r.station_type).filter(Boolean))),
    [kdsStations.data],
  );
  const kdsRows = useMemo(
    () => (kdsStations.data ?? []).filter((r) => !stationType || r.station_type === stationType),
    [kdsStations.data, stationType],
  );

  const mixItems = mix.data?.items ?? [];
  const mixCategoryOptions = useMemo(
    () => Array.from(new Set(mixItems.map((r) => r.category).filter((c): c is string => !!c))).sort(),
    [mixItems],
  );
  const mixStationOptions = useMemo(
    () => Array.from(new Set(mixItems.map((r) => r.station_name || 'Unassigned'))).sort(),
    [mixItems],
  );
  const mixRows = useMemo(() => {
    const q = mixSearch.trim().toLowerCase();
    return mixItems.filter((r) => {
      if (q && !r.label.toLowerCase().includes(q)) return false;
      if (mixCategories.length && !mixCategories.includes(r.category || '')) return false;
      if (mixStations.length && !mixStations.includes(r.station_name || 'Unassigned')) return false;
      return true;
    });
  }, [mixItems, mixSearch, mixCategories, mixStations]);

  const voidReasonOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of voids.data ?? []) for (const reason of Object.keys(r.reasons || {})) set.add(reason);
    return Array.from(set);
  }, [voids.data]);
  const voidRows = useMemo(() => {
    const q = voidSearch.trim().toLowerCase();
    return (voids.data ?? []).filter((r) => {
      if (q && !(r.staff_name || '').toLowerCase().includes(q)) return false;
      if (voidReason && !(r.reasons || {})[voidReason]) return false;
      return true;
    });
  }, [voids.data, voidSearch, voidReason]);

  // ── At-a-glance stat tiles per tab — computed from the full fetched range (not the
  // per-tab search filter), matching the totals the exported PDF's stat cards show. ──────
  const staffStats = useMemo(() => {
    const rows = staff.data ?? [];
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    const orders = rows.reduce((s, r) => s + r.order_count, 0);
    return [
      { label: 'Total Revenue', value: fmt(revenue) },
      { label: 'Orders', value: orders.toLocaleString() },
      { label: 'Avg Ticket', value: fmt(orders ? revenue / orders : 0) },
    ];
  }, [staff.data]);

  const hourStats = useMemo(() => {
    const rows = hours.data ?? [];
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    const orders = rows.reduce((s, r) => s + r.order_count, 0);
    const profit = rows.reduce((s, r) => s + (r.profit ?? 0), 0);
    const peak = rows.reduce((best, r) => (r.revenue > (best?.revenue ?? -1) ? r : best), rows[0]);
    return [
      { label: 'Total Revenue', value: fmt(revenue) },
      { label: 'Orders', value: orders.toLocaleString() },
      { label: 'Peak Hour', value: peak ? `${String(peak.hour).padStart(2, '0')}:00` : '—' },
      { label: 'Profit Margin', value: revenue ? `${((profit / revenue) * 100).toFixed(1)}%` : '—' },
    ];
  }, [hours.data]);

  const categoryStats = useMemo(() => {
    const rows = cats.data ?? [];
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    const qty = rows.reduce((s, r) => s + r.quantity_sold, 0);
    return [
      { label: 'Total Revenue', value: fmt(revenue) },
      { label: 'Categories', value: rows.length.toLocaleString() },
      { label: 'Qty Sold', value: qty.toLocaleString() },
    ];
  }, [cats.data]);

  const kdsStats = useMemo(() => {
    const rows = kdsStations.data ?? [];
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    const orders = rows.reduce((s, r) => s + r.order_count, 0);
    return [
      { label: 'Total Revenue', value: fmt(revenue) },
      { label: 'Stations', value: rows.length.toLocaleString() },
      { label: 'Orders', value: orders.toLocaleString() },
    ];
  }, [kdsStations.data]);

  const mixStats = useMemo(() => {
    const rows = mixItems;
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    const qty = rows.reduce((s, r) => s + r.quantity, 0);
    return [
      { label: 'Total Revenue', value: fmt(revenue) },
      { label: 'Products Sold', value: rows.length.toLocaleString() },
      { label: 'Qty Sold', value: qty.toLocaleString() },
    ];
  }, [mixItems]);

  const voidStats = useMemo(() => {
    const rows = voids.data ?? [];
    const count = rows.reduce((s, r) => s + r.void_count, 0);
    const amount = rows.reduce((s, r) => s + r.total_voided_amount, 0);
    return [
      { label: 'Total Voids', value: count.toLocaleString() },
      { label: 'Total Voided Amount', value: fmt(amount) },
      { label: 'Staff Involved', value: rows.length.toLocaleString() },
    ];
  }, [voids.data]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header + shared filters */}
      <div className="flex flex-wrap items-center gap-3">
        <BarChart3 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Sales Analytics</h1>
        <div className="flex items-center gap-2 ml-auto">
          <OutletFilter />
          <DateRangePicker value={range} onChange={setRange} className="w-64" />
        </div>
      </div>

      {/* Tab bar — mirrors the Settings page top-nav style */}
      <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-accent/30 border border-border w-fit">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap',
                active ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'staff' && (
        <>
          <StatCards items={staffStats} />
          <Section title="Sales by Staff" icon={Users} loading={staff.isLoading} error={staff.error} empty={!staffRows.length}
            head={['Staff', 'Orders', 'Revenue']}
            rows={staffRows.map((r) => [r.staff_name || `${r.user_id.slice(0, 8)}…`, String(r.order_count), fmt(r.revenue)])}
            filters={<SearchBox value={staffSearch} onChange={setStaffSearch} placeholder="Search staff…" />}
            actions={
              <ReportExportButtons
                report="staff" params={{ from: range.from, to: range.to, outlet_id: outletId }}
                fileNameBase={`sales-by-staff-${range.from}-to-${range.to}`} title="Sales by Staff" orientation="landscape"
              />
            } />
        </>
      )}

      {tab === 'hour' && (
        <>
          <StatCards items={hourStats} />
          <Section title="Sales by Hour" icon={Clock} loading={hours.isLoading} error={hours.error} empty={!hours.data?.length}
            head={['Hour', 'Orders', 'Revenue', 'Profit', 'Margin']}
            rows={(hours.data ?? []).map((r) => [
              `${String(r.hour).padStart(2, '0')}:00`, String(r.order_count), fmt(r.revenue),
              fmt(r.profit ?? 0), `${(r.margin_pct ?? 0).toFixed(1)}%`,
            ])}
            filters={
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Day
                <input type="date" value={hourDate} onChange={(e) => setHourDate(e.target.value)}
                  className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </label>
            }
            actions={
              <ReportExportButtons
                report="sales-by-hour-document" params={{ date: hourDate, outlet_id: outletId }}
                fileNameBase={`sales-by-hour-${hourDate}`} title="Sales by Hour"
              />
            } />
        </>
      )}

      {tab === 'category' && (
        <>
          <StatCards items={categoryStats} />
          <Section title="Sales by Category" icon={Tag} loading={cats.isLoading} error={cats.error} empty={!categoryRows.length}
            head={['Category', 'Qty Sold', 'Revenue']}
            rows={categoryRows.map((r) => [r.category_name, String(r.quantity_sold), fmt(r.revenue)])}
            filters={<SearchBox value={categorySearch} onChange={setCategorySearch} placeholder="Search categories…" />}
            actions={
              <ReportExportButtons
                report="sales-by-category-document" params={{ from: range.from, to: range.to, outlet_id: outletId }}
                fileNameBase={`sales-by-category-${range.from}-to-${range.to}`} title="Sales by Category"
              />
            } />
        </>
      )}

      {tab === 'kds' && (
        <>
          <StatCards items={kdsStats} />
          <Section title="Sales by KDS Station" icon={ChefHat} loading={kdsStations.isLoading} error={kdsStations.error} empty={!kdsRows.length}
            head={['Station', 'Orders', 'Items', 'Revenue']}
            rows={kdsRows.map((r) => [
              r.station_type ? `${r.station_name} (${r.station_type})` : r.station_name,
              String(r.order_count), String(r.item_count), fmt(r.revenue),
            ])}
            filters={
              stationTypeOptions.length > 1 ? (
                <SelectBox value={stationType} onChange={setStationType} placeholder="All station types"
                  options={stationTypeOptions.map((s) => ({ value: s, label: s }))} />
              ) : undefined
            }
            actions={
              <ReportExportButtons
                report="sales-by-kds-station-document" params={{ from: range.from, to: range.to, outlet_id: outletId }}
                fileNameBase={`sales-by-kds-station-${range.from}-to-${range.to}`} title="Sales by KDS Station"
              />
            } />
        </>
      )}

      {tab === 'register' && (
        <>
          <StatCards items={[
            { label: 'Total Sales', value: fmt(register.data?.total_sales ?? 0) },
            { label: 'Payments Received', value: fmt(register.data?.total_payment ?? 0) },
            { label: 'Credit Sales', value: fmt(register.data?.credit_sales ?? 0) },
            { label: 'Refunds', value: fmt(register.data?.total_refund ?? 0) },
            { label: 'Orders', value: (register.data?.order_count ?? 0).toLocaleString() },
          ]} />
          <Section title="Register Performance" icon={Monitor} loading={register.isLoading} error={register.error}
            empty={!register.data?.payment_methods?.length}
            head={['Payment Method', 'Amount Collected']}
            rows={(register.data?.payment_methods ?? []).map((m) => [m.method.replace(/_/g, ' '), fmt(m.sell_amount)])}
            actions={
              <ReportExportButtons
                report="reset-summary" params={{ from: range.from, to: range.to, outlet_id: outletId }}
                fileNameBase={`register-${range.from}-to-${range.to}`} title="Register Report"
              />
            } />
        </>
      )}

      {tab === 'products' && (
        <>
          <StatCards items={[
            { label: 'Products Sold', value: (register.data?.products_sold?.length ?? 0).toLocaleString() },
            { label: 'Brands', value: (register.data?.products_by_brand?.length ?? 0).toLocaleString() },
            { label: 'Revenue', value: fmt((register.data?.products_sold ?? []).reduce((s, p) => s + p.total_amount, 0)) },
          ]} />
          <Section title="Sales by Product" icon={Package} loading={register.isLoading} error={register.error}
            empty={!register.data?.products_sold?.length}
            head={['Product', 'SKU', 'Qty', 'Revenue']}
            rows={(register.data?.products_sold ?? []).map((p) => [p.name, p.sku || '—', String(p.quantity), fmt(p.total_amount)])}
            actions={
              <ReportExportButtons
                report="sales-by-item-type" params={{ from: range.from, to: range.to, outlet_id: outletId }}
                fileNameBase={`sales-by-item-type-${range.from}-to-${range.to}`} title="Sales by Item Type"
              />
            } />
          <Section title="Sales by Brand" icon={Tag} loading={register.isLoading} error={register.error}
            empty={!register.data?.products_by_brand?.length}
            head={['Brand', 'Qty', 'Revenue']}
            rows={(register.data?.products_by_brand ?? []).map((b) => [b.brand, String(b.quantity), fmt(b.total_amount)])} />
        </>
      )}

      {tab === 'payments' && (
        <>
          <StatCards items={[
            { label: 'Payments Received', value: fmt(register.data?.total_payment ?? 0) },
            { label: 'Credit (on account)', value: fmt(register.data?.credit_sales ?? 0) },
            { label: 'Refunded', value: fmt(register.data?.total_refund ?? 0) },
          ]} />
          <Section title="Sales by Payment Method" icon={Wallet} loading={register.isLoading} error={register.error}
            empty={!register.data?.payment_methods?.length}
            head={['Method', 'Amount Collected']}
            rows={(register.data?.payment_methods ?? []).map((m) => [m.method.replace(/_/g, ' '), fmt(m.sell_amount)])} />
          <Section title="Refunds by Payment Method" icon={Ban} loading={register.isLoading} error={register.error}
            empty={!register.data?.refund_by_method?.length}
            head={['Method', 'Amount Refunded']}
            rows={(register.data?.refund_by_method ?? []).map((m) => [m.method.replace(/_/g, ' '), fmt(m.sell_amount)])} />
        </>
      )}

      {tab === 'mix' && (
        <>
          <StatCards items={mixStats} />
          <div className={cn('grid grid-cols-1 gap-4', isKitchen && 'lg:grid-cols-2')}>
            <MixBarChart title="Revenue by Category" icon={Tag} rows={mix.data?.byCategory ?? []} loading={mix.isLoading} />
            {/* KDS-station chart/column/filter are kitchen concepts — hidden for retail/services/pharmacy. */}
            {isKitchen && (
              <MixBarChart title="Revenue by KDS Station" icon={ChefHat} rows={mix.data?.byStation ?? []} loading={mix.isLoading} />
            )}
          </div>
          <Section title="Product Mix" icon={Package} loading={mix.isLoading} error={mix.error} empty={!mixRows.length}
            head={isKitchen ? ['Product', 'Category', 'Station', 'Qty', 'Orders', 'Revenue'] : ['Product', 'Category', 'Qty', 'Orders', 'Revenue']}
            rows={mixRows.map((r) => (isKitchen
              ? [r.label, r.category || '—', r.station_name || 'Unassigned', String(r.quantity), String(r.order_count), fmt(r.revenue)]
              : [r.label, r.category || '—', String(r.quantity), String(r.order_count), fmt(r.revenue)]))}
            filters={
              <div className="flex flex-wrap items-center gap-2">
                <SearchBox value={mixSearch} onChange={setMixSearch} placeholder="Search products…" />
                {mixCategoryOptions.length > 1 && (
                  <MultiSelectChips label="Category" options={mixCategoryOptions} selected={mixCategories} onChange={setMixCategories} />
                )}
                {isKitchen && mixStationOptions.length > 1 && (
                  <MultiSelectChips label="Station" options={mixStationOptions} selected={mixStations} onChange={setMixStations} />
                )}
              </div>
            }
            actions={
              <ReportExportButtons
                report="product-mix-document"
                params={{
                  from: range.from, to: range.to, outlet_id: outletId,
                  categories: mixCategories.join(','), stations: mixStations.join(','),
                }}
                fileNameBase={`product-mix-${range.from}-to-${range.to}`} title="Product Mix"
              />
            } />
        </>
      )}

      {tab === 'voids' && (
        <>
          <StatCards items={voidStats} />
          <Section title="Voids" icon={Ban} loading={voids.isLoading} error={voids.error} empty={!voidRows.length}
            head={['Staff', 'Voids', 'Amount', 'Reasons']}
            rows={voidRows.map((r) => [
              r.staff_name || `${(r.voided_by || '').slice(0, 8)}…`, String(r.void_count), fmt(r.total_voided_amount),
              Object.keys(r.reasons || {}).join(', ') || '—',
            ])}
            filters={
              <div className="flex flex-wrap items-center gap-2">
                <SearchBox value={voidSearch} onChange={setVoidSearch} placeholder="Search staff…" />
                {voidReasonOptions.length > 0 && (
                  <SelectBox value={voidReason} onChange={setVoidReason} placeholder="All reasons"
                    options={voidReasonOptions.map((r) => ({ value: r, label: r }))} />
                )}
              </div>
            }
            actions={
              <ReportExportButtons
                report="void-summary-document" params={{ from: range.from, to: range.to, outlet_id: outletId }}
                fileNameBase={`voids-${range.from}-to-${range.to}`} title="Voids"
              />
            } />
        </>
      )}
    </div>
  );
}

function StatCards({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {items.map((s) => (
        <Card key={s.label}>
          <CardContent className="p-4">
            <p className="text-lg font-bold tabular-nums truncate">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-card border border-border rounded-lg pl-8 pr-7 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function SelectBox({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/** Toggleable-chip multi-select (e.g. "filter to these categories/stations") — a popover of
 *  checkboxes rather than a native <select multiple>, which is unusable on touch/mobile. */
function MultiSelectChips({ label, options, selected, onChange }: {
  label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm',
          selected.length ? 'border-primary/50 bg-primary/5 text-primary font-medium' : 'border-border text-muted-foreground hover:text-foreground',
        )}
      >
        {label}{selected.length > 0 && ` (${selected.length})`}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-52 max-h-64 overflow-y-auto rounded-xl border border-border bg-card shadow-xl py-1.5">
            {selected.length > 0 && (
              <button type="button" onClick={() => onChange([])} className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent">
                <X className="h-3 w-3" /> Clear all
              </button>
            )}
            {options.map((o) => (
              <label key={o} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent cursor-pointer">
                <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} className="rounded border-border" />
                {o}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Single-hue magnitude bar chart (revenue by category/station) — one series, so no legend;
 *  rounded bar ends, recessive grid, hover tooltip. */
function MixBarChart({ title, icon: Icon, rows, loading }: {
  title: string; icon: React.ElementType; rows: ProductMixAggRow[]; loading: boolean;
}) {
  const data = [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="font-semibold text-sm">{title}</h2>
      </div>
      {loading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
      ) : data.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">No data for this range</div>
      ) : (
        <div className="p-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'hsl(var(--accent))' }}
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                formatter={(value) => [fmt(Number(value ?? 0)), 'Revenue']}
              />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, loading, error, empty, head, rows, actions, filters }: {
  title: string; icon: React.ElementType; loading: boolean; error?: unknown; empty: boolean; head: string[]; rows: string[][];
  actions?: React.ReactNode; filters?: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-border">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="font-semibold text-sm">{title}</h2>
        {filters && <div className="ml-auto flex items-center gap-2">{filters}</div>}
        {actions && <div className={cn('flex items-center gap-2', !filters && 'ml-auto')}>{actions}</div>}
      </div>
      {loading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
      ) : error ? (
        // A failed request must never render as "No data" — that reads as "the range is
        // genuinely empty" when it's actually a 401/500/etc the report silently swallowed
        // (this exact confusion already happened once with the Hour tab's stale range param).
        <div className="p-6 text-center text-sm text-destructive">
          Failed to load: {(error as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error
            || (error as Error)?.message || 'unknown error'}
        </div>
      ) : empty ? (
        <div className="p-6 text-center text-sm text-muted-foreground">No data for this range</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b border-border bg-muted/30">
              {head.map((h, i) => (
                <th key={h} className={i === 0 ? 'text-left px-5 py-2 font-medium' : 'text-right px-5 py-2 font-medium'}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={j === 0 ? 'px-5 py-2.5' : 'px-5 py-2.5 text-right tabular-nums'}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
