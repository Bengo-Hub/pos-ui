'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { apiClient } from '@/lib/api/client';

export type PaymentStreamStatus = 'idle' | 'waiting' | 'paid' | 'timeout';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://posapi.codevertexitsolutions.com';

/**
 * Streams payment status for an order via SSE.
 * Pass orderId=null to keep the stream idle (e.g. before M-Pesa intent is created).
 *
 * The hook uses fetch() with ReadableStream so that the Authorization header
 * can be sent — native EventSource does not support custom headers.
 *
 * On chi's 30s request timeout the connection closes; the hook reconnects
 * automatically until status is resolved or the component unmounts.
 */
export function usePaymentStream(orderId: string | null) {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const [status, setStatus] = useState<PaymentStreamStatus>('idle');
  const abortRef = useRef<AbortController | null>(null);
  const resolvedRef = useRef(false);

  useEffect(() => {
    if (!orderId || !tenantID) {
      setStatus('idle');
      return;
    }

    resolvedRef.current = false;
    setStatus('waiting');

    let active = true;

    const connect = async () => {
      while (active && !resolvedRef.current) {
        const abort = new AbortController();
        abortRef.current = abort;

        try {
          const res = await fetch(
            `${API_BASE}/api/v1/${tenantID}/pos/orders/${orderId}/payment-status/stream`,
            { headers: apiClient.getAuthHeaders(), signal: abort.signal }
          );

          if (!res.ok || !res.body) {
            // Brief back-off before retry (e.g. 404 on order not found)
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }

          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = '';

          while (active && !resolvedRef.current) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              try {
                const d = JSON.parse(line.slice(6));
                if (d.status === 'paid') {
                  resolvedRef.current = true;
                  setStatus('paid');
                  return;
                }
                if (d.status === 'timeout') {
                  resolvedRef.current = true;
                  setStatus('timeout');
                  return;
                }
              } catch {
                // keepalive comment or malformed line — skip
              }
            }
          }
        } catch (e: any) {
          if (e?.name === 'AbortError') return;
          // Network error — retry after 1s
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    };

    connect();

    return () => {
      active = false;
      abortRef.current?.abort();
      abortRef.current = null;
      setStatus('idle');
      resolvedRef.current = false;
    };
  }, [orderId, tenantID]);

  return { status };
}
