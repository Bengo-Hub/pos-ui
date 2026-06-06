'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { playNotificationChime } from '@/lib/sounds';
import { apiClient } from '@/lib/api/client';

// Stream against the API host (matches REST/SSE), not the UI host.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://posapi.codevertexitsolutions.com';

export type NotificationStreamMessage =
  | { type: 'order_ready_for_payment'; payload: { order_id: string; order_number: string } }
  | { type: 'waiter_called'; payload: { order_id: string; order_number: string } }
  | { type: 'ping' | 'pong'; payload: { ts: number } };

interface UseNotificationStreamOptions {
  tenantID: string;
  userID?: string;
  onMessage?: (msg: NotificationStreamMessage) => void;
}

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;
const PING_INTERVAL_MS = 25_000;

/**
 * Connects to the POS notification WebSocket endpoint:
 *   GET /api/v1/{tenantID}/pos/notifications/stream?user_id={userID}
 *
 * On order_ready_for_payment: plays a chime and invalidates the orders cache.
 * Falls back gracefully if WebSocket is unavailable.
 */
export function useNotificationStream({ tenantID, userID, onMessage }: UseNotificationStreamOptions) {
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptRef = useRef(0);
  const unmountedRef = useRef(false);

  const connect = useCallback(() => {
    if (unmountedRef.current || !tenantID) return;
    if (typeof WebSocket === 'undefined') return;

    // https→wss, http→ws. Auth header can't be set on a browser WS, so the
    // access token rides as a query param (pos-api promotes it server-side).
    const wsBase = API_BASE.replace(/^http/, 'ws');
    const params = new URLSearchParams();
    if (userID) params.set('user_id', userID);
    const token = apiClient.getAccessToken();
    if (token) params.set('access_token', token);
    const qs = params.toString();
    const url = `${wsBase}/api/v1/${tenantID}/pos/notifications/stream${qs ? `?${qs}` : ''}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      attemptRef.current = 0;
      pingTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping', payload: { ts: Date.now() } }));
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      let msg: NotificationStreamMessage;
      try {
        msg = JSON.parse(event.data as string) as NotificationStreamMessage;
      } catch {
        return;
      }

      if (msg.type === 'order_ready_for_payment' || msg.type === 'waiter_called') {
        playNotificationChime();
        qc.invalidateQueries({ queryKey: ['pos-orders'] });
        qc.invalidateQueries({ queryKey: ['pos-notifications'] });
      }

      onMessage?.(msg);
    };

    ws.onerror = () => {
      // onclose handles reconnect
    };

    ws.onclose = () => {
      if (pingTimer.current) clearInterval(pingTimer.current);
      if (unmountedRef.current) return;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attemptRef.current, RECONNECT_MAX_MS);
      attemptRef.current += 1;
      reconnectTimer.current = setTimeout(connect, delay);
    };
  }, [tenantID, userID, onMessage, qc]);

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
