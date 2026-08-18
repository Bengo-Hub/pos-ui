'use client';

/**
 * Hotel Occupancy Report — occupancy %, ADR, RevPAR, and a room-vs-ancillary revenue split for
 * hotel-module outlets. Backed by pos-api's GET /reports/hotel-occupancy (ReportsHandler.
 * HotelOccupancyReport), which itself is gated hospitality + hotel_module — same gate as the rest
 * of the /hotel section, so this page (behind ModuleGate moduleKey="hotel" like every other hotel
 * page) never renders anywhere it can't resolve real data.
 */

import { useState } from 'react';
import { BedDouble, TrendingUp, Wallet, Percent } from 'lucide-react';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Card, CardContent } from '@/components/ui/base';
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker';
import { OutletFilter } from '@/components/outlet-filter';
import { useOutletFilterStore } from '@/store/outlet-filter';
import { useHotelOccupancyReport } from '@/hooks/useReports';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { cn } from '@/lib/utils';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
const todayISO = () => new Date().toISOString().slice(0, 10);

// Human labels for the RoomFolioItem.charge_type enum (mirrors pos-api's schema comment).
const CHARGE_TYPE_LABELS: Record<string, string> = {
  room_charge: 'Room',
  food: 'Food',
  restaurant: 'Restaurant',
  room_service: 'Room Service',
  minibar: 'Minibar',
  laundry: 'Laundry',
  amenity: 'Amenity',
  facility: 'Facility',
  conference: 'Conference',
  meal_voucher: 'Meal Voucher',
  package: 'Package',
  late_checkout: 'Late Checkout',
  damage: 'Damage',
  other: 'Other',
};

function StatCard({ icon: Icon, label, value, hint }: { icon: React.ElementType; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="size-10 rounded-xl flex items-center justify-center bg-primary/10 text-primary shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-foreground truncate">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {hint && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function HotelReportsPage() {
  const [range, setRange] = useState<DateRange>({ from: isoDaysAgo(30), to: todayISO() });
  const selectedOutlet = useOutletFilterStore((s) => s.selectedOutlet);
  const outletId = selectedOutlet?.id;
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';
  const fmt = (n: number) => `${currency} ${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const { data, isLoading } = useHotelOccupancyReport(range.from, range.to, outletId);

  const breakdown = (data?.revenue_by_charge_type ?? []).slice().sort((a, b) => b.amount - a.amount);
  const maxAmount = Math.max(1, ...breakdown.map((b) => b.amount));

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Hotel Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Occupancy, ADR, RevPAR &amp; revenue mix</p>
        </div>
        <div className="flex items-center gap-2">
          <OutletFilter />
          <DateRangePicker value={range} onChange={setRange} className="w-64" />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 h-16 animate-pulse bg-muted/40 rounded-xl">&nbsp;</CardContent></Card>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Percent}
              label="Occupancy Rate"
              value={`${((data?.occupancy_rate ?? 0) * 100).toFixed(1)}%`}
              hint={`${(data?.occupied_room_nights ?? 0).toFixed(0)} of ${(data?.available_room_nights ?? 0).toFixed(0)} room-nights`}
            />
            <StatCard
              icon={Wallet}
              label="ADR (Average Daily Rate)"
              value={fmt(data?.adr ?? 0)}
              hint="Room revenue ÷ occupied room-nights"
            />
            <StatCard
              icon={TrendingUp}
              label="RevPAR"
              value={fmt(data?.revpar ?? 0)}
              hint="Room revenue ÷ available room-nights"
            />
            <StatCard
              icon={BedDouble}
              label="Total Revenue"
              value={fmt(data?.total_revenue ?? 0)}
              hint={`Room ${fmt(data?.room_revenue ?? 0)} · Ancillary ${fmt(data?.ancillary_revenue ?? 0)}`}
            />
          </div>

          <Card>
            <CardContent className="p-5 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Revenue by Charge Type</h2>
              {breakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">No folio charges in this period.</p>
              ) : (
                <div className="space-y-2.5">
                  {breakdown.map((b) => (
                    <div key={b.charge_type} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">{CHARGE_TYPE_LABELS[b.charge_type] ?? b.charge_type}</span>
                        <span className="text-muted-foreground">{fmt(b.amount)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn('h-full rounded-full', b.charge_type === 'room_charge' ? 'bg-primary' : 'bg-primary/50')}
                          style={{ width: `${Math.max(2, (b.amount / maxAmount) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function HotelReportsPageGated() {
  return (
    <ModuleGate moduleKey="hotel" fallback={<ModuleUnavailablePage moduleKey="hotel" />}>
      <HotelReportsPage />
    </ModuleGate>
  );
}
