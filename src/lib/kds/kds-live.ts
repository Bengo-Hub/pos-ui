'use client';

/**
 * One shared KDS websocket per tab (GET /api/v1/{tenant}/pos/kds/stream).
 *
 * The board and the app-level new-order alert both need ticket pushes, so the connection is
 * ref-counted here instead of each caller opening its own socket. Ticket events invalidate the
 * ['kds-tickets'] queries; ticket_created is also re-emitted to listeners (new-order alerts).
 */

import type { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { apiClient } from '@/lib/api/client';

// Stream against the API host (matches REST/SSE), not the UI host.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://posapi.codevertexafrica.com';

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;
const PING_INTERVAL_MS = 25_000;

/** ticket_created payload as pos-api pushes it (orders/service.go). Not a full KDSTicket. */
export interface KDSTicketCreatedPayload {
  ticket_id: string;
  order_id: string;
  order_number: string;
  station_id: string;
  table_reference?: string;
  status?: string;
  items?: Array<{ name?: string; quantity?: number; qty?: number; modifiers?: string[]; notes?: string }>;
  order_subtype?: string;
  order_source?: string;
  channel?: string;
  course?: number;
}

export type KDSWSMessage =
  | { type: 'ticket_created'; payload: KDSTicketCreatedPayload }
  | { type: 'ticket_updated'; payload: { ticket_id: string; status?: string } & Record<string, unknown> }
  | { type: 'waiter_called'; payload: { ticket_id: string; order_number: string } }
  | { type: 'ping' | 'pong'; payload: { ts: number } };

type MessageListener = (msg: KDSWSMessage) => void;

let ws: WebSocket | null = null;
let connKey = '';
let refCount = 0;
let attempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let queryClient: QueryClient | null = null;
let open = false;
const openListeners = new Set<() => void>();
const messageListeners = new Set<MessageListener>();
let target = { tenantID: '', outletID: '' };

function setOpen(v: boolean) {
  if (open === v) return;
  open = v;
  openListeners.forEach((l) => l());
}

// A burst of updates (a big order touches several stations) refetches once. The refetch keeps
// the cards on screen (useKDSTickets keeps previous data), so nothing flashes. The day view's
// hourly tally reloads with the tickets so both stay computed from the same rows.
let refetchTimer: ReturnType<typeof setTimeout> | null = null;
function invalidateTickets() {
  if (refetchTimer) clearTimeout(refetchTimer);
  refetchTimer = setTimeout(() => {
    refetchTimer = null;
    queryClient?.invalidateQueries({ queryKey: ['kds-tickets'] });
    queryClient?.invalidateQueries({ queryKey: ['kds-day-summary'] });
  }, 750);
}

function clearTimers() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (pingTimer) clearInterval(pingTimer);
  if (refetchTimer) clearTimeout(refetchTimer);
  reconnectTimer = null;
  pingTimer = null;
  refetchTimer = null;
}

function connect() {
  if (refCount <= 0 || !target.tenantID || typeof WebSocket === 'undefined') return;
  // Browser websockets cannot set headers, so the access token rides as ?access_token=
  // (pos-api RequireAnyAuth promotes it). pos-api has no short-lived stream ticket yet.
  const params = new URLSearchParams();
  if (target.outletID) params.set('outlet_id', target.outletID);
  const token = apiClient.getAccessToken();
  if (!token) {
    scheduleReconnect();
    return;
  }
  params.set('access_token', token);
  const url = `${API_BASE.replace(/^http/, 'ws')}/api/v1/${target.tenantID}/pos/kds/stream?${params}`;

  const socket = new WebSocket(url);
  ws = socket;

  socket.onopen = () => {
    attempt = 0;
    setOpen(true);
    // Catch up on anything missed while disconnected.
    invalidateTickets();
    pingTimer = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping', payload: { ts: Date.now() } }));
      }
    }, PING_INTERVAL_MS);
  };

  socket.onmessage = (event) => {
    let msg: KDSWSMessage;
    try {
      msg = JSON.parse(event.data as string) as KDSWSMessage;
    } catch {
      return;
    }
    if (msg.type === 'ticket_created' || msg.type === 'ticket_updated') {
      // Payloads are partial, so refetch the list rather than patch it.
      invalidateTickets();
    }
    messageListeners.forEach((l) => {
      try { l(msg); } catch { /* a listener must not break the socket */ }
    });
  };

  socket.onclose = () => {
    if (ws === socket) ws = null;
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
    setOpen(false);
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (refCount <= 0 || reconnectTimer) return;
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
  attempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function disconnect() {
  clearTimers();
  const socket = ws;
  ws = null;
  if (socket) {
    socket.onclose = null;
    socket.close(1000, 'released');
  }
  setOpen(false);
}

/** Adds a user of the shared socket. Returns the release function. */
export function acquireKDSSocket(qc: QueryClient, tenantID: string, outletID: string): () => void {
  queryClient = qc;
  const key = `${tenantID}|${outletID}`;
  refCount += 1;
  if (key !== connKey) {
    connKey = key;
    target = { tenantID, outletID };
    attempt = 0;
    disconnect();
  }
  if (!ws && !reconnectTimer) connect();
  return () => {
    refCount -= 1;
    if (refCount <= 0) {
      refCount = 0;
      connKey = '';
      disconnect();
    }
  };
}

export function subscribeKDSMessages(listener: MessageListener): () => void {
  messageListeners.add(listener);
  return () => { messageListeners.delete(listener); };
}

function subscribeOpen(cb: () => void) {
  openListeners.add(cb);
  return () => { openListeners.delete(cb); };
}

/** True while the shared KDS socket is connected. Polling slows down while it is. */
export function useKDSSocketOpen(): boolean {
  return useSyncExternalStore(subscribeOpen, () => open, () => false);
}
