/**
 * Printer discovery + dispatch for the POS, backed by QZ Tray.
 *
 * A browser cannot enumerate OS / network / USB / Bluetooth printers or print silently to a named one
 * on its own. QZ Tray — a small local app the operator installs — exposes the machine's printers over
 * a secure WebSocket and prints silently. This module lazily loads the `qz-tray` client, wires its
 * certificate + signature promises to the pos-api signing endpoints (the private key never touches the
 * browser), connects, and prints. When QZ Tray isn't running we degrade to the browser print dialog.
 *
 * Production silent printing requires a signed connection: pos-api serves the platform digital
 * certificate and signs each request with the platform private key (env-configured). If signing is
 * not configured, QZ still connects unsigned (the operator sees a one-time allow prompt) and printing
 * works; only the silent/no-prompt guarantee is lost.
 */

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';

export type PrinterSource = 'qz' | 'webusb' | 'bluetooth' | 'none';

export interface DiscoveredDevice {
  name: string;
  source: PrinterSource;
  detail?: string;
}

export interface DiscoverResult {
  /** Primary source — 'qz' when the QZ bridge answered, else the first source that found a device,
   *  else 'none'. Kept for back-compat with existing callers. */
  source: PrinterSource;
  /** Flat, de-duplicated list of printer names usable in the station dropdowns. */
  printers: string[];
  defaultPrinter?: string;
  /** First/primary human note (back-compat). See `notes` for the full per-source list. */
  note?: string;
  /** Labelled devices from every source that answered (QZ / WebUSB / Bluetooth). */
  devices?: DiscoveredDevice[];
  /** One actionable diagnostic line per source attempted. */
  notes?: string[];
}

let qzPromise: Promise<any | null> | null = null;
let configured = false;

function tenantSlug(): string {
  try { return useAuthStore.getState().user?.tenant_id ?? ''; } catch { return ''; }
}

/** Lazily import qz-tray, wire cert/signature promises to pos-api, and connect. Returns null when the
 *  QZ Tray app isn't reachable (caller then uses the browser print dialog). Cached after first call. */
async function loadQz(): Promise<any | null> {
  if (typeof window === 'undefined') return null;
  const existing = (window as any).qz;
  if (existing?.websocket?.isActive?.()) return existing;
  if (qzPromise) return qzPromise;

  qzPromise = (async () => {
    try {
      const mod: any = await import('qz-tray');
      const qz = mod.default ?? mod;

      if (!configured) {
        const slug = tenantSlug();
        const base = slug ? `/api/v1/${slug}/pos/printing/qz` : '';
        // Certificate: served by pos-api (public). Empty string → QZ treats the connection as
        // unsigned (operator allow-prompt) rather than failing.
        qz.security.setCertificatePromise((resolve: (v: string) => void) => {
          if (!base) { resolve(''); return; }
          apiClient
            .get<{ certificate?: string }>(`${base}/cert`)
            .then((r) => resolve(r?.certificate ?? ''))
            .catch(() => resolve(''));
        });
        try { qz.security.setSignatureAlgorithm('SHA512'); } catch { /* older qz */ }
        // Signature: pos-api signs the request with the platform private key (never exposed here).
        qz.security.setSignaturePromise((toSign: string) => (resolve: (v: string) => void) => {
          if (!base) { resolve(''); return; }
          apiClient
            .post<{ signature?: string }>(`${base}/sign`, { request: toSign })
            .then((r) => resolve(r?.signature ?? ''))
            .catch(() => resolve(''));
        });
        configured = true;
      }

      if (!(qz.websocket.isActive && qz.websocket.isActive())) {
        await qz.websocket.connect();
      }
      (window as any).qz = qz;
      return qz;
    } catch {
      qzPromise = null; // allow a later retry (e.g. after the operator starts QZ Tray)
      return null;
    }
  })();
  return qzPromise;
}

/** ── WebUSB ────────────────────────────────────────────────────────────────────
 *  Browsers (Chromium: Chrome/Edge on desktop & Android) expose USB printers via the WebUSB API.
 *  `getDevices()` returns only devices the user has ALREADY granted — discovery is silent but limited
 *  to previously-paired printers; pairing a new one needs a user gesture (see requestUSBPrinter). */
const USB_PRINTER_CLASS = 0x07; // USB base class "Printer"

function usbDeviceName(d: any): string {
  const parts = [d?.manufacturerName, d?.productName].filter(Boolean);
  if (parts.length) return parts.join(' ').trim();
  const vid = typeof d?.vendorId === 'number' ? d.vendorId.toString(16).padStart(4, '0') : '????';
  const pid = typeof d?.productId === 'number' ? d.productId.toString(16).padStart(4, '0') : '????';
  return `USB printer ${vid}:${pid}`;
}

function isUsbPrinter(d: any): boolean {
  // Class can sit on the device or on an interface alternate; accept either.
  if (d?.deviceClass === USB_PRINTER_CLASS) return true;
  const cfgs = d?.configurations ?? [];
  for (const cfg of cfgs) {
    for (const intf of cfg?.interfaces ?? []) {
      for (const alt of intf?.alternates ?? []) {
        if (alt?.interfaceClass === USB_PRINTER_CLASS) return true;
      }
    }
  }
  return false;
}

async function detectWebUSB(): Promise<DiscoveredDevice[]> {
  if (typeof navigator === 'undefined' || !(navigator as any).usb) return [];
  try {
    const devices: any[] = await (navigator as any).usb.getDevices();
    return devices.filter(isUsbPrinter).map((d) => ({ name: usbDeviceName(d), source: 'webusb' as const, detail: 'USB' }));
  } catch {
    return [];
  }
}

/** Prompt the operator to pick & grant a USB printer. MUST be called from a user gesture (click). */
export async function requestUSBPrinter(): Promise<DiscoveredDevice | null> {
  if (typeof navigator === 'undefined' || !(navigator as any).usb) return null;
  try {
    const d = await (navigator as any).usb.requestDevice({ filters: [{ classCode: USB_PRINTER_CLASS }] });
    return d ? { name: usbDeviceName(d), source: 'webusb', detail: 'USB' } : null;
  } catch {
    return null; // user cancelled or unsupported
  }
}

/** ── Web Bluetooth ─────────────────────────────────────────────────────────────
 *  Chromium-only. There is no silent enumeration except `getDevices()` (permitted devices, behind a
 *  flag on some platforms); pairing a new BT printer needs a user gesture (see requestBluetoothPrinter). */
async function detectBluetooth(): Promise<DiscoveredDevice[]> {
  const bt = typeof navigator !== 'undefined' ? (navigator as any).bluetooth : undefined;
  if (!bt || typeof bt.getDevices !== 'function') return [];
  try {
    const devices: any[] = await bt.getDevices();
    return devices.map((d) => ({ name: d?.name || 'Bluetooth printer', source: 'bluetooth' as const, detail: 'Bluetooth' }));
  } catch {
    return [];
  }
}

/** Prompt the operator to pick & pair a Bluetooth printer. MUST be called from a user gesture. */
export async function requestBluetoothPrinter(): Promise<DiscoveredDevice | null> {
  const bt = typeof navigator !== 'undefined' ? (navigator as any).bluetooth : undefined;
  if (!bt) return null;
  try {
    // Thermal printers commonly expose the 0x18F0 serial-print service; accept all so generic
    // printers are also pickable, requesting that service as optional for later writes.
    const d = await bt.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'],
    });
    return d ? { name: d?.name || 'Bluetooth printer', source: 'bluetooth', detail: 'Bluetooth' } : null;
  } catch {
    return null; // user cancelled or unsupported
  }
}

/**
 * Discover printers across every available source on this terminal:
 *  - QZ Tray (OS / network / USB / Bluetooth printers already installed in the OS) — silent printing,
 *  - WebUSB (already-granted USB printers) — Chromium,
 *  - Web Bluetooth (already-permitted BT printers) — Chromium.
 * Each source is probed independently and never throws; the result carries a flat name list (for the
 * dropdowns), labelled devices, and one diagnostic note per source so the UI can tell the operator
 * exactly why nothing was found.
 */
export async function discoverPrinters(): Promise<DiscoverResult> {
  const notes: string[] = [];
  const devices: DiscoveredDevice[] = [];
  let primary: PrinterSource = 'none';
  let defaultPrinter: string | undefined;

  // 1) QZ Tray
  const qz = await loadQz();
  if (qz) {
    try {
      const list: string[] = await qz.printers.find();
      try { defaultPrinter = await qz.printers.getDefault(); } catch { /* optional */ }
      const names = Array.isArray(list) ? list : [list].filter(Boolean);
      names.forEach((n) => devices.push({ name: n, source: 'qz', detail: 'OS / network' }));
      if (names.length) primary = 'qz';
      notes.push(`QZ Tray: found ${names.length} OS printer(s).${names.length ? '' : ' Tip: a network printer must be ADDED to this computer (Windows “Add a printer”) before QZ can list it.'}`);
    } catch {
      notes.push('QZ Tray: connected but could not read the printer list.');
    }
  } else {
    notes.push('QZ Tray: not running on this terminal. Install & start QZ Tray for silent printing and to list OS/network printers; without it, printing uses the browser dialog.');
  }

  // 2) WebUSB
  if (typeof navigator !== 'undefined' && (navigator as any).usb) {
    const usb = await detectWebUSB();
    usb.forEach((d) => devices.push(d));
    if (usb.length && primary === 'none') primary = 'webusb';
    notes.push(`WebUSB: ${usb.length} granted USB printer(s).${usb.length ? '' : ' Use “Add USB printer” to pick one.'}`);
  } else {
    notes.push('WebUSB: not supported by this browser (USB detection needs Chrome/Edge on desktop or Android).');
  }

  // 3) Web Bluetooth
  const bt = typeof navigator !== 'undefined' ? (navigator as any).bluetooth : undefined;
  if (bt) {
    const ble = await detectBluetooth();
    ble.forEach((d) => devices.push(d));
    if (ble.length && primary === 'none') primary = 'bluetooth';
    notes.push(`Bluetooth: ${ble.length} permitted device(s).${ble.length ? '' : ' Use “Add Bluetooth printer” to pair one.'}`);
  } else {
    notes.push('Bluetooth: not supported by this browser.');
  }

  // De-duplicate names for the dropdowns (preserve first occurrence / source order: QZ → USB → BT).
  const printers = Array.from(new Set(devices.map((d) => d.name).filter(Boolean)));

  return {
    source: primary,
    printers,
    defaultPrinter,
    devices,
    notes,
    note: notes[0],
  };
}

// ── Cash drawer (ESC/POS drawer kick) ───────────────────────────────────────────
//
// A cash drawer has no network/USB interface of its own: it plugs into the receipt printer's RJ11/12
// port and is opened by an ESC/POS "drawer kick" pulse — ESC p m t1 t2 (0x1B 0x70 m t1 t2) — sent to
// that printer. With QZ Tray already bridging the printer, the kick is just those raw bytes printed to
// the assigned printer. No second device bridge is needed.

/** ESC/POS drawer-kick byte sequences, keyed by the pin variant configured per outlet.
 *  - default/pin2: ESC p 0  25 250  → pin 2, the common Epson/generic default.
 *  - pin5:         ESC p 1  25 250  → pin 5, for drawers wired to the second pin.
 *  - legacy:       ESC p 0  50 250  → longer pulse for older/stiff drawers.
 *  Bytes are sent to QZ as a hex "rawhex" command. */
export type DrawerKickCode = 'default' | 'pin2' | 'pin5' | 'legacy';

function kickHex(code: DrawerKickCode): string {
  switch (code) {
    case 'pin5':
      return '1B700119FA'; // ESC p 1 25 250
    case 'legacy':
      return '1B700032FA'; // ESC p 0 50 250
    case 'pin2':
    case 'default':
    default:
      return '1B700019FA'; // ESC p 0 25 250
  }
}

/**
 * Pop the cash drawer wired to `printerName` by sending an ESC/POS drawer-kick pulse via QZ Tray.
 * Returns true on success. Returns false (no throw) when there is no QZ bridge or no real printer
 * name — callers treat that as "drawer not available" rather than a hard error, since the sale itself
 * must never be blocked by drawer hardware.
 */
export async function openCashDrawer(
  printerName: string | undefined,
  code: DrawerKickCode = 'default',
): Promise<boolean> {
  const named = printerName && printerName.toLowerCase() !== 'browser' ? printerName : '';
  if (!named) return false;
  const qz = await loadQz();
  if (!qz) return false;
  try {
    const cfg = qz.configs.create(named);
    // QZ Tray raw command, hex flavor: the ESC/POS drawer-kick bytes are sent verbatim to the printer.
    await qz.print(cfg, [{ type: 'raw', format: 'command', flavor: 'hex', data: kickHex(code) }]);
    return true;
  } catch {
    return false;
  }
}

/** Best-effort sync check: is a QZ connection already active? (Used for UI hints only.) */
export function canSilentPrint(): boolean {
  if (typeof window === 'undefined') return false;
  const qz = (window as any).qz;
  return Boolean(qz?.websocket?.isActive?.());
}

function browserPrint(title: string, html: string, paperWidth = '80mm') {
  if (typeof window === 'undefined') return;
  const w = paperWidth === '58mm' ? '58mm' : '80mm';
  const win = window.open('', '_blank', 'width=380,height=640');
  if (!win) { window.print(); return; }
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title>` +
    `<style>@page{size:${w} auto;margin:3mm 4mm}html,body{margin:0;padding:0;background:#fff}</style>` +
    `</head><body>${html}</body></html>`,
  );
  win.document.close();
  let printed = false;
  const doPrint = () => { if (printed) return; printed = true; win.focus(); win.print(); setTimeout(() => win.close(), 400); };
  win.onload = doPrint;
  setTimeout(doPrint, 600);
}

/**
 * Print HTML to a station's assigned printer. With QZ Tray + a real printer name it prints silently to
 * that printer; otherwise (no bridge, or printerName empty/'browser') it falls back to the browser
 * print window so a receipt is never lost.
 */
export async function printHtmlToPrinter(
  printerName: string | undefined,
  title: string,
  html: string,
  paperWidth = '80mm',
): Promise<void> {
  const named = printerName && printerName.toLowerCase() !== 'browser' ? printerName : '';
  if (!named) { browserPrint(title, html, paperWidth); return; }
  const qz = await loadQz();
  if (!qz) { browserPrint(title, html, paperWidth); return; }
  try {
    const cfg = qz.configs.create(named, { size: { width: paperWidth === '58mm' ? 58 : 80, height: null }, units: 'mm' });
    await qz.print(cfg, [{ type: 'html', format: 'plain', data: `<div style="font-family:'Courier New',monospace">${html}</div>` }]);
  } catch {
    browserPrint(title, html, paperWidth); // never lose the receipt
  }
}
