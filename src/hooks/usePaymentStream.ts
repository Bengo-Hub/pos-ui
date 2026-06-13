'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { apiClient } from '@/lib/api/client';

export type PaymentStreamStatus = 'idle' | 'waiting' | 'paid' | 'timeout';

// Bounded exponential-backoff poll schedule (ms). The first check is immediate (t=0) so a Paystack
// return_url redirect confirms instantly; it then backs off and caps. ~12 checks over ~3 min — well
// within the API rate limit, with NO long-lived SSE connection to reconnect-storm (the previous
// stream caused 429s). Payment completion is owned server-side by the treasury NATS subscriber; this
// hook just reads the already-updated status.
const POLL_DELAYS_MS = [0, 3000, 5000, 8000, 13000, 21000, 21000, 21000, 21000, 21000, 21000, 21000];

/**
 * Watches an order's payment status by polling GET /pos/orders/{id}/payment-status with bounded
 * backoff. Pass orderId=null to stay idle (e.g. before the intent is created). Returns the same
 * `{ status }` shape the old SSE hook did, so callers are unchanged.
 */
export function usePaymentStream(orderId: string | null) {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const [status, setStatus] = useState<PaymentStreamStatus>('idle');

  useEffect(() => {
    if (!orderId || !tenantID) {
      setStatus('idle');
      return;
    }

    let cancelled = false;
    let resolved = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setStatus('waiting');

    const path = `/api/v1/${tenantID}/pos/orders/${orderId}/payment-status`;

    const finish = (s: PaymentStreamStatus) => {
      resolved = true;
      setStatus(s);
    };

    const check = async (attempt: number) => {
      if (cancelled || resolved) return;
      try {
        const res = await apiClient.get<{ status?: string }>(path);
        if (cancelled || resolved) return;
        if (res?.status === 'paid') return finish('paid');
        if (res?.status === 'failed') return finish('timeout');
      } catch {
        // transient error (e.g. brief rate-limit/network blip) — keep to the schedule
      }
      if (cancelled || resolved) return;
      if (attempt + 1 >= POLL_DELAYS_MS.length) return finish('timeout');
      timer = setTimeout(() => check(attempt + 1), POLL_DELAYS_MS[attempt + 1]);
    };

    // When the cashier returns from the Paystack hosted page (return_url redirect / tab refocus),
    // re-check immediately — a one-shot that doesn't disturb the backoff schedule.
    const onFocus = async () => {
      if (cancelled || resolved) return;
      try {
        const res = await apiClient.get<{ status?: string }>(path);
        if (cancelled || resolved) return;
        if (res?.status === 'paid') finish('paid');
        else if (res?.status === 'failed') finish('timeout');
      } catch {
        /* ignore — the scheduled poll will catch it */
      }
    };
    window.addEventListener('focus', onFocus);

    timer = setTimeout(() => check(0), POLL_DELAYS_MS[0]);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      setStatus('idle');
    };
  }, [orderId, tenantID]);

  return { status };
}
