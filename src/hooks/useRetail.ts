'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import {
  lookupItemByBarcode,
  getScaleReading,
  captureSerials,
  getSerialHistory,
} from '@/lib/api/retail';

// ─── Barcode lookup ───────────────────────────────────────────────────────────

export function useBarcodeLookup(tenantSlug: string, barcode: string) {
  return useQuery({
    queryKey: ['retail-barcode', tenantSlug, barcode],
    queryFn: () => lookupItemByBarcode(tenantSlug, barcode),
    enabled: !!tenantSlug && barcode.length >= 8,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

// ─── Scale reading ────────────────────────────────────────────────────────────

export function useScaleReading(tenantSlug: string, deviceId: string, enabled = true) {
  return useQuery({
    queryKey: ['retail-scale', tenantSlug, deviceId],
    queryFn: () => getScaleReading(tenantSlug, deviceId),
    enabled: enabled && !!tenantSlug && !!deviceId,
    refetchInterval: enabled && !!deviceId ? 500 : false,
    staleTime: 0,
    retry: false,
  });
}

// ─── Capture serials ──────────────────────────────────────────────────────────

export function useCaptureSerials(tenantSlug: string) {
  return useMutation({
    mutationFn: ({
      orderId,
      lineId,
      serials,
    }: {
      orderId: string;
      lineId: string;
      serials: string[];
    }) => captureSerials(tenantSlug, orderId, lineId, serials),
  });
}

// ─── Serial history ───────────────────────────────────────────────────────────

export function useSerialHistory(tenantSlug: string, serial: string) {
  return useQuery({
    queryKey: ['retail-serial-history', tenantSlug, serial],
    queryFn: () => getSerialHistory(tenantSlug, serial),
    enabled: !!tenantSlug && serial.length > 0,
    staleTime: 60_000,
    retry: false,
  });
}
