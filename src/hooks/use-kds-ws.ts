'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTenantId } from '@/hooks/useTenantId';
import { useEffectiveOutletID } from '@/hooks/usePOS';
import { acquireKDSSocket, subscribeKDSMessages, type KDSWSMessage } from '@/lib/kds/kds-live';

export type { KDSWSMessage, KDSTicketCreatedPayload } from '@/lib/kds/kds-live';

interface UseKDSWebSocketOptions {
  /** Defaults to the session tenant. */
  tenantID?: string;
  /** Defaults to the effective outlet (same one the REST calls carry). */
  outletID?: string;
  /** Turn the socket off without unmounting the caller. */
  enabled?: boolean;
  /** Called on every inbound message, after the ticket queries are invalidated. */
  onMessage?: (msg: KDSWSMessage) => void;
}

/**
 * Joins the shared KDS websocket (lib/kds/kds-live). Ticket pushes invalidate the
 * ['kds-tickets'] queries; REST polling in useKDSTickets keeps working as the fallback and
 * slows to 30s while the socket is open.
 */
export function useKDSWebSocket({ tenantID, outletID, enabled = true, onMessage }: UseKDSWebSocketOptions = {}) {
  const qc = useQueryClient();
  const sessionTenant = useTenantId() ?? '';
  const effectiveOutlet = useEffectiveOutletID();
  const tid = tenantID ?? sessionTenant;
  const oid = outletID ?? effectiveOutlet;

  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled || !tid) return;
    const release = acquireKDSSocket(qc, tid, oid);
    const unsubscribe = subscribeKDSMessages((msg) => onMessageRef.current?.(msg));
    return () => {
      unsubscribe();
      release();
    };
  }, [enabled, tid, oid, qc]);
}
