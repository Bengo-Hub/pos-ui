'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { usePermissions, P } from '@/hooks/usePermissions';
import { Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

type PaymentTiming = 'settle_at_checkout' | 'pay_upfront' | 'per_day_split';

interface BookingPolicy {
  free_amendment_window_hours: number;
  cancellation_window_hours: number;
  amendment_fee: number;
  cancellation_fee: number;
  currency: string;
  payment_timing: PaymentTiming;
}

const PAYMENT_TIMING_OPTIONS: { value: PaymentTiming; label: string; hint: string }[] = [
  { value: 'settle_at_checkout', label: 'Settle at checkout', hint: 'Room + extras paid together when the guest checks out.' },
  { value: 'pay_upfront', label: 'Pay room upfront', hint: 'Full room charge taken at check-in; extras settled at checkout.' },
  { value: 'per_day_split', label: 'Per-night split', hint: 'Room charge split into per-night payments across the stay.' },
];

const base = (tenant: string) => `/api/v1/${tenant}/pos/settings/booking-policy`;

/**
 * Booking Policy settings — defines the free-amendment / cancellation windows and the
 * fees charged when a hotel booking is amended or cancelled inside those windows.
 * Backed by OutletSetting.metadata.booking_policy and enforced by pos-api on amend/cancel.
 */
export function BookingPolicyTab() {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canManage = can(P.CONFIG_MANAGE) || can(P.CONFIG_CHANGE);

  const { data, isLoading } = useQuery({
    queryKey: ['booking-policy', tenantID],
    queryFn: () => apiClient.get<BookingPolicy>(base(tenantID)),
    enabled: !!tenantID,
    staleTime: 60_000,
  });

  const [form, setForm] = useState<BookingPolicy>({
    free_amendment_window_hours: 48,
    cancellation_window_hours: 72,
    amendment_fee: 0,
    cancellation_fee: 0,
    currency: 'KES',
    payment_timing: 'settle_at_checkout',
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: () => apiClient.patch<BookingPolicy>(base(tenantID), form),
    onSuccess: () => {
      toast.success('Booking policy saved');
      qc.invalidateQueries({ queryKey: ['booking-policy', tenantID] });
    },
    onError: () => toast.error('Failed to save booking policy'),
  });

  function set<K extends keyof BookingPolicy>(k: K, v: BookingPolicy[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  if (isLoading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const num = 'mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Amendments and cancellations made <strong>more than</strong> the window (hours) before arrival are free.
        Made <strong>within</strong> the window, the corresponding fee applies. Set a fee to 0 for no penalty.
      </div>

      {/* Room payment timing */}
      <div className="space-y-2">
        <span className="text-sm font-semibold">Room payment timing</span>
        <p className="text-xs text-muted-foreground">
          When the room charge is collected. Folio extras (minibar / room service) are always settled at
          checkout, and checkout is blocked until the guest&apos;s balance is fully cleared.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {PAYMENT_TIMING_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={!canManage}
              onClick={() => set('payment_timing', opt.value)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                form.payment_timing === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:border-primary/40'
              } ${canManage ? '' : 'opacity-60'}`}
            >
              <span className="block text-sm font-semibold">{opt.label}</span>
              <span className="block text-xs text-muted-foreground mt-0.5">{opt.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Free amendment window (hours before arrival)</span>
          <input type="number" min={0} step={1} value={form.free_amendment_window_hours}
            onChange={(e) => set('free_amendment_window_hours', parseFloat(e.target.value) || 0)} className={num} disabled={!canManage} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Cancellation window (hours before arrival)</span>
          <input type="number" min={0} step={1} value={form.cancellation_window_hours}
            onChange={(e) => set('cancellation_window_hours', parseFloat(e.target.value) || 0)} className={num} disabled={!canManage} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Amendment fee (within window)</span>
          <input type="number" min={0} step={0.01} value={form.amendment_fee}
            onChange={(e) => set('amendment_fee', parseFloat(e.target.value) || 0)} className={num} disabled={!canManage} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Cancellation fee (within window)</span>
          <input type="number" min={0} step={0.01} value={form.cancellation_fee}
            onChange={(e) => set('cancellation_fee', parseFloat(e.target.value) || 0)} className={num} disabled={!canManage} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Currency</span>
          <select value={form.currency} onChange={(e) => set('currency', e.target.value)} className={num} disabled={!canManage}>
            {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      {canManage ? (
        <button onClick={() => save.mutate()} disabled={save.isPending}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {save.isPending ? 'Saving…' : 'Save Policy'}
        </button>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" /> You have read-only access to this policy.
        </div>
      )}
    </div>
  );
}
