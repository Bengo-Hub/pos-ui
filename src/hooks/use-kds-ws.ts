'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { KDSTicket } from './useKDS';
import { apiClient } from '@/lib/api/client';

// Stream against the API host (matches REST/SSE), not the UI host.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://posapi.codevertexafrica.com';

export type KDSWSMessage =
  | { type: 'ticket_created'; payload: KDSTicket }
  | { type: 'ticket_updated'; payload: Partial<KDSTicket> & { ticket_id: string } }
  | { type: 'waiter_called'; payload: { ticket_id: string; order_number: string } }
  | { type: 'ping' | 'pong'; payload: { ts: number } };

interface UseKDSWebSocketOptions {
  tenantID: string;
  outletID?: string;
  /** Called on every inbound message, after the query cache is updated. */
  onMessage?: (msg: KDSWSMessage) => void;
}

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;
const PING_INTERVAL_MS = 25_000;

/**
 * Connects to the KDS WebSocket endpoint (`GET /api/v1/{tenant}/pos/kds/stream`).
 * On connect, the query cache key `['kds', 'tickets']` is invalidated to trigger
 * a fresh REST load; subsequent mutations are pushed by the server.
 *
 * Falls back gracefully: if the connection drops or the browser doesn't support
 * WebSockets, the existing REST polling in useKDS continues working unchanged.
 */
export function useKDSWebSocket({ tenantID, outletID, onMessage }: UseKDSWebSocketOptions) {
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptRef = useRef(0);
  const unmountedRef = useRef(false);

  const invalidateTickets = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['kds', 'tickets'] });
    qc.invalidateQueries({ queryKey: ['kds', 'kitchen'] });
    qc.invalidateQueries({ queryKey: ['kds', 'bar'] });
  }, [qc]);

  const connect = useCallback(() => {
    if (unmountedRef.current || !tenantID) return;
    if (typeof WebSocket === 'undefined') return;

    // https→wss, http→ws. Auth header can't be set on a browser WS, so the
    // access token rides as a query param (pos-api promotes it server-side).
    const wsBase = API_BASE.replace(/^http/, 'ws');
    const params = new URLSearchParams();
    if (outletID) params.set('outlet_id', outletID);
    const token = apiClient.getAccessToken();
    if (token) params.set('access_token', token);
    const qs = params.toString();
    const url = `${wsBase}/api/v1/${tenantID}/pos/kds/stream${qs ? `?${qs}` : ''}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      attemptRef.current = 0;
      // Invalidate stale REST data on connect
      invalidateTickets();
      // Keepalive ping
      pingTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping', payload: { ts: Date.now() } }));
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      let msg: KDSWSMessage;
      try {
        msg = JSON.parse(event.data as string) as KDSWSMessage;
      } catch {
        return;
      }

      if (msg.type === 'ticket_created' || msg.type === 'ticket_updated') {
        // Optimistically update the ticket in the relevant query caches
        qc.setQueriesData<{ data: KDSTicket[]; total: number }>(
          { queryKey: ['kds', 'tickets'] },
          (old) => {
            if (!old) return old;
            if (msg.type === 'ticket_created') {
              return { data: [msg.payload, ...old.data], total: old.total + 1 };
            }
            // ticket_updated — patch the matching entry
            return {
              ...old,
              data: old.data.map((t) =>
                t.id === msg.payload.ticket_id ? { ...t, ...msg.payload } : t
              ),
            };
          }
        );
      }

      onMessage?.(msg);
    };

    ws.onerror = () => {
      // onclose will handle reconnect
    };

    ws.onclose = () => {
      if (pingTimer.current) clearInterval(pingTimer.current);
      if (unmountedRef.current) return;
      // Exponential backoff reconnect
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attemptRef.current, RECONNECT_MAX_MS);
      attemptRef.current += 1;
      reconnectTimer.current = setTimeout(connect, delay);
    };
  }, [tenantID, outletID, invalidateTickets, onMessage, qc]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();
    return () => {
      unmountedRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (pingTimer.current) clearInterval(pingTimer.current);
      wsRef.current?.close(1000, 'component unmounted');
    };
  }, [connect]);
}
