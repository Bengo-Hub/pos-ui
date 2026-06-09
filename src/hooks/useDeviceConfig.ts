'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Client-side POS peripheral configuration (cash drawer, receipt printer, barcode scanner).
 * Persisted per-browser in localStorage — these are device-local settings, not tenant data, so they
 * live on the till that owns the hardware rather than in pos-api. The cash-drawer kick and receipt
 * width are consumed by the receipt/print flow; the scanner toggle by the terminal's keydown listener.
 */
export interface DeviceConfig {
  cashDrawerEnabled: boolean;
  openDrawerOnCash: boolean;
  /** Blind close: count the drawer without seeing the expected total (shrinkage control). */
  blindClose: boolean;
  receiptWidth: '58' | '80';
  autoPrintReceipt: boolean;
  scannerEnabled: boolean;
}

const DEFAULT_CONFIG: DeviceConfig = {
  cashDrawerEnabled: false,
  openDrawerOnCash: true,
  blindClose: true,
  receiptWidth: '80',
  autoPrintReceipt: false,
  scannerEnabled: true,
};

const STORAGE_KEY = 'pos.deviceConfig';

export function useDeviceConfig() {
  const [config, setConfig] = useState<DeviceConfig>(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(raw) });
    } catch {
      /* ignore malformed storage */
    }
    setLoaded(true);
  }, []);

  const update = useCallback((patch: Partial<DeviceConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota/availability errors */
      }
      return next;
    });
  }, []);

  return { config, update, loaded };
}

/**
 * ESC/POS cash-drawer kick (ESC p 0 25 250) — the standard "open drawer" pulse sent to the connected
 * receipt printer. Returns the raw bytes so a print bridge / WebSerial path can emit them.
 */
export function cashDrawerKickBytes(): Uint8Array {
  return new Uint8Array([27, 112, 0, 25, 250]);
}
