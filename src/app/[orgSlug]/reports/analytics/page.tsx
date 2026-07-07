'use client';

/**
 * Sales Analytics — tabbed report browser over the pos-api analytics endpoints
 * (sales-by-staff, sales-by-hour, sales-by-category, sales-by-kds-station, product-mix,
 * void-summary). Two filter layers: a SHARED bar (date range + outlet) that scopes every tab,
 * and PER-TAB filters (search/dropdown) that refine the already-fetched rows for that report.
 */

import { useMemo, useState } from 'react';
import { BarChart3, Users, Clock, Tag, Package, Ban, ChefHat, Search, X } from 'lucide-react';
import {
  useSalesByStaff, useSalesByHour, useSalesByCategory, useSalesByKDSStation, useProductMix, useVoidSummary,
} from '@/hooks/useReports';
import { ReportDocumentButton } from '@/components/reports/report-document-button';
import { OutletFilter } from '@/components/outlet-filter';
import { useOutletFilterStore } from '@/store/outlet-filter';
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker';
import { cn } from '@/lib/utils';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => `KES ${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

type TabId = 'staff' | 'hour' | 'category' | 'kds' | 'mix' | 'voids';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'staff', label: 'Staff', icon: Users },
  { id: 'hour', label: 'Hour', icon: Clock },
  { id: 'category', label: 'Category', icon: Tag },
  { id: 'kds', label: 'KDS Station', icon: ChefHat },
  { id: 'mix', label: 'Product Mix', icon: Package },
  { id: 'voids', label: 'Voids', icon: Ban },
];

export default function AnalyticsReportPage() {
  const [range, setRange] = useState<DateRange>({ from: isoDaysAgo(30), to: todayISO() });
  const [tab, setTab] = useState<TabId>('staff');

  // Shared outlet filter — HQ/admin users only (OutletFilter itself hides for regular staff).
  const selectedOutlet = useOutletFilterStore((s) => s.selectedOutlet);
  const outletId = selectedOutlet?.id;

  // Sales by Hour is a single-day breakdown server-side; it gets its own date control,
  // seeded from the shared range's "to" date but independently adjustable.
  const [hourDate, setHourDate] = useState(range.to);

  const staff = useSalesByStaff(range.from, range.to, outletId);
  const hours = useSalesByHour(hourDate, outletId);
  const cats = useSalesByCategory(range.from, range.to, outletId);
  const kdsStations = useSalesByKDSStation(range.from, range.to, outletId);
  const mix = useProductMix(range.from, range.to, outletId);
  const voids = useVoidSummary(range.from, range.to, outletId);

  // ── Per-tab filters (client-side refinement of the already-fetched rows) ──────────────
  const [staffSearch, setStaffSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [stationType, setStationType] = useState('');
  const [mixSearch, setMixSearch] = useState('');
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

  const mixRows = useMemo(() => {
    const q = mixSearch.trim().toLowerCase();
    return (mix.data ?? []).filter((r) => !q || r.label.toLowerCase().includes(q));
  }, [mix.data, mixSearch]);

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
        {TABS.map((t) => {
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
        <Section title="Sales by Staff" icon={Users} loading={staff.isLoading} empty={!staffRows.length}
          head={['Staff', 'Orders', 'Revenue']}
          rows={staffRows.map((r) => [r.staff_name || `${r.user_id.slice(0, 8)}…`, String(r.order_count), fmt(r.revenue)])}
          filters={<SearchBox value={staffSearch} onChange={setStaffSearch} placeholder="Search staff…" />}
          actions={
            <ReportDocumentButton
              report="staff" params={{ from: range.from, to: range.to, outlet_id: outletId }}
              fileName={`sales-by-staff-${range.from}-to-${range.to}.pdf`} title="Sales by Staff"
              label="Export" size="sm" className="gap-1.5 h-7 text-xs px-2.5"
            />
          } />
      )}

      {tab === 'hour' && (
        <Section title="Sales by Hour" icon={Clock} loading={hours.isLoading} empty={!hours.data?.length}
          head={['Hour', 'Orders', 'Revenue']}
          rows={(hours.data ?? []).map((r) => [`${String(r.hour).padStart(2, '0')}:00`, String(r.order_count), fmt(r.revenue)])}
          filters={
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Day
              <input type="date" value={hourDate} onChange={(e) => setHourDate(e.target.value)}
                className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </label>
          } />
      )}

      {tab === 'category' && (
        <Section title="Sales by Category" icon={Tag} loading={cats.isLoading} empty={!categoryRows.length}
          head={['Category', 'Qty Sold', 'Revenue']}
          rows={categoryRows.map((r) => [r.category_name, String(r.quantity_sold), fmt(r.revenue)])}
          filters={<SearchBox value={categorySearch} onChange={setCategorySearch} placeholder="Search categories…" />} />
      )}

      {tab === 'kds' && (
        <Section title="Sales by KDS Station" icon={ChefHat} loading={kdsStations.isLoading} empty={!kdsRows.length}
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
            <ReportDocumentButton
              report="sales-by-kds-station-document" params={{ from: range.from, to: range.to, outlet_id: outletId }}
              fileName={`sales-by-kds-station-${range.from}-to-${range.to}.pdf`} title="Sales by KDS Station"
              label="Export" size="sm" className="gap-1.5 h-7 text-xs px-2.5"
            />
          } />
      )}

      {tab === 'mix' && (
        <Section title="Product Mix" icon={Package} loading={mix.isLoading} empty={!mixRows.length}
          head={['Product', 'Qty', 'Orders', 'Revenue']}
          rows={mixRows.map((r) => [r.label, String(r.quantity), String(r.order_count), fmt(r.revenue)])}
          filters={<SearchBox value={mixSearch} onChange={setMixSearch} placeholder="Search products…" />} />
      )}

      {tab === 'voids' && (
        <Section title="Voids" icon={Ban} loading={voids.isLoading} empty={!voidRows.length}
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
          } />
      )}
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

function Section({ title, icon: Icon, loading, empty, head, rows, actions, filters }: {
  title: string; icon: React.ElementType; loading: boolean; empty: boolean; head: string[]; rows: string[][];
  actions?: React.ReactNode; filters?: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-border">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="font-semibold text-sm">{title}</h2>
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        {filters && <div className={cn('flex items-center gap-2', !actions && 'ml-auto')}>{filters}</div>}
      </div>
      {loading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
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
