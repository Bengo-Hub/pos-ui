'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/base';
import { useActiveHappyHours, useHappyHours, useCreateHappyHour } from '@/hooks/useHotel';
import { usePermissions, P } from '@/hooks/usePermissions';
import type { CreateHappyHourInput } from '@/lib/api/hotel';
import { Loader2, Plus, Wine } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

const DAYS = [
  { v: 1, l: 'Mon' }, { v: 2, l: 'Tue' }, { v: 3, l: 'Wed' },
  { v: 4, l: 'Thu' }, { v: 5, l: 'Fri' }, { v: 6, l: 'Sat' }, { v: 0, l: 'Sun' },
];

function HappyHourPageInner() {
  const { data: active = [] } = useActiveHappyHours();
  const { data: all = [], isLoading } = useHappyHours();
  const createMut = useCreateHappyHour();
  const { can } = usePermissions();
  const canManage = can(P.PROMOTIONS_ADD);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [windowStart, setWindowStart] = useState('16:00');
  const [windowEnd, setWindowEnd] = useState('18:00');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed_amount' | 'fixed_price'>('percentage');
  const [discountValue, setDiscountValue] = useState('20');
  const [mealPeriod, setMealPeriod] = useState('');

  function toggleDay(d: number) {
    setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  }

  async function handleCreate() {
    if (!name.trim()) { toast.error('Name is required'); return; }
    const body: CreateHappyHourInput = {
      name: name.trim(),
      promo_kind: 'happy_hour',
      days_of_week: days,
      window_start: windowStart,
      window_end: windowEnd,
      auto_apply: true,
      scope_type: 'all',
      discount_type: discountType,
      discount_value: parseFloat(discountValue) || 0,
      ...(mealPeriod ? { meal_period: mealPeriod as CreateHappyHourInput['meal_period'] } : {}),
    };
    try {
      await createMut.mutateAsync(body);
      toast.success('Happy hour created');
      setShowForm(false);
      setName('');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to create happy hour'));
    }
  }

  const happyHours = all.filter((p) => p.promo_kind === 'happy_hour');

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 lg:px-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Wine className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Happy Hour</h1>
            <p className="text-sm text-muted-foreground">Time-windowed bar &amp; lounge discounts</p>
          </div>
        </div>
        {canManage && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> New
          </button>
        )}
      </div>

      {active.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-green-600 mb-2">● Active now</p>
            <ul className="space-y-1 text-sm">
              {active.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{p.name}</span>
                  <span className="text-muted-foreground">until {p.window_end}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {showForm && canManage && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <label className="block">
              <span className="text-sm font-medium">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sundowner Happy Hour"
                className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            </label>

            <div>
              <span className="text-sm font-medium">Days</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {DAYS.map((d) => (
                  <button key={d.v} type="button" onClick={() => toggleDay(d.v)}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${days.includes(d.v) ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted'}`}>
                    {d.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium">Window Start</span>
                <input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)}
                  className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Window End</span>
                <input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)}
                  className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Discount Type</span>
                <select value={discountType} onChange={(e) => setDiscountType(e.target.value as typeof discountType)}
                  className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed_amount">Fixed Amount off (KES)</option>
                  <option value="fixed_price">Fixed Price — negotiated rate (KES)</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium">{discountType === 'percentage' ? 'Percentage' : discountType === 'fixed_price' ? 'Negotiated Price' : 'Amount off'}</span>
                <input type="number" min="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)}
                  className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </label>
              <label className="block col-span-2">
                <span className="text-sm font-medium">Meal Period <span className="text-xs text-muted-foreground">(optional — tag a negotiated lunch/dinner rate)</span></span>
                <select value={mealPeriod} onChange={(e) => setMealPeriod(e.target.value)}
                  className="mt-1 w-full px-4 py-2.5 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">— Not meal-specific —</option>
                  <option value="breakfast">Breakfast</option>
                  <option value="am_break">AM Break</option>
                  <option value="lunch">Lunch</option>
                  <option value="pm_break">PM Break</option>
                  <option value="dinner">Dinner</option>
                </select>
              </label>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-border font-medium hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handleCreate} disabled={createMut.isPending}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {createMut.isPending ? 'Saving…' : 'Create Happy Hour'}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : happyHours.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No happy hours configured yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {happyHours.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(p.days_of_week ?? []).map((d) => DAYS.find((x) => x.v === d)?.l).join(', ')} · {p.window_start}–{p.window_end}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${p.status === 'active' ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                    {p.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function HappyHourPage() {
  return (
    <ModuleGate moduleKey="hotel" fallback={<ModuleUnavailablePage moduleKey="hotel" />}>
      <HappyHourPageInner />
    </ModuleGate>
  );
}
