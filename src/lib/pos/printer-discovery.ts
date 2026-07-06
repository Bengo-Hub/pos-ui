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
import type { PrinterProfile } from '@/lib/api/settings';
import { paperOf } from '@/lib/pos/printer-stations';

export type PrinterSource = 'agent' | 'network' | 'qz' | 'webusb' | 'bluetooth' | 'none';

/** Local print agent — a tiny helper the operator runs on the terminal (like QZ Tray). Because it
 *  runs ON the terminal it can actually scan the LAN (mDNS + TCP 9100) and print to raw network
 *  printers, which a browser and a cloud pos-api cannot. Loopback is a secure context, so an HTTPS
 *  POS page may call it. Override the port with NEXT_PUBLIC_PRINT_AGENT_PORT. */
const AGENT_PORT = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_PRINT_AGENT_PORT) || '9330';
const AGENT_BASE = `http://127.0.0.1:${AGENT_PORT}`;

export interface DiscoveredDevice {
  name: string;
  source: PrinterSource;
  detail?: string;
  /** For network printers found by the agent/backend LAN scan — used to auto-fill the IP+port. */
  ip?: string;
  port?: number;
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
    let qz: any = null;
    try {
      const mod: any = await import('qz-tray');
      qz = mod.default ?? mod;

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
        // QZ's default connect walks several ports (8181/8282/8443/8283) with retries and can hang
        // ~10s+ when QZ Tray is NOT running — the operator just sees an endless "Detecting…". Cap the
        // retries and race the connect against a timeout so detection resolves promptly with an
        // accurate result (and the caller falls back to the browser print dialog).
        await Promise.race([
          qz.websocket.connect({ retries: 1, delay: 1 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('qz-connect-timeout')), 6000)),
        ]);
      }
      if (!(qz.websocket.isActive && qz.websocket.isActive())) throw new Error('qz-not-active');
      (window as any).qz = qz;
      return qz;
    } catch {
      try { qz?.websocket?.disconnect?.(); } catch { /* socket may be mid-handshake; ignore */ }
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

/** ── Backend LAN scan (on-prem pos-api) ──────────────────────────────────────────
 *  Tried FIRST by discoverPrinters(). pos-api scans ITS OWN network (mDNS / TCP 9100·631·515 / SNMP)
 *  and returns named printers. This only finds anything when pos-api shares the LAN with the printer
 *  (on-prem); a cloud deployment returns { enabled: false } and we silently fall back to QZ/USB/BT. */
async function detectBackend(): Promise<{ devices: DiscoveredDevice[]; note?: string }> {
  if (typeof window === 'undefined') return { devices: [] };
  const slug = tenantSlug();
  if (!slug) return { devices: [] };
  try {
    const res = await apiClient.get<{
      enabled?: boolean;
      printers?: Array<{ name?: string; ip?: string; port?: number; source?: string; model?: string }>;
      note?: string;
    }>(`/api/v1/${slug}/pos/printing/discover`);
    if (!res?.enabled) return { devices: [] }; // disabled on cloud → use the local bridges
    const devices: DiscoveredDevice[] = (res.printers ?? []).map((p) => ({
      name: p.name || (p.ip ? `${p.ip}:${p.port ?? 9100}` : 'Network printer'),
      source: 'network' as const,
      detail: p.ip ? `${p.ip}${p.port ? ':' + p.port : ''}${p.model ? ' · ' + p.model : ''}` : p.model,
      ip: p.ip,
      port: p.port ?? (p.ip ? 9100 : undefined),
    }));
    return { devices, note: res.note || `Server network scan: ${devices.length} printer(s).` };
  } catch {
    return { devices: [] };
  }
}

/** ── Local print agent (on-terminal LAN scan) ────────────────────────────────────
 *  The one source that can auto-find a printer sharing the terminal's LAN. Reaches the agent over
 *  loopback; returns [] silently when the agent isn't installed/running. */
async function detectAgent(): Promise<{ devices: DiscoveredDevice[]; note?: string; ok: boolean }> {
  if (typeof window === 'undefined') return { devices: [], ok: false };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${AGENT_BASE}/discover`, { signal: ctrl.signal, mode: 'cors' });
    clearTimeout(t);
    if (!res.ok) return { devices: [], ok: true, note: 'Local print agent: reachable but returned an error.' };
    const body = (await res.json()) as { printers?: Array<{ name?: string; ip?: string; port?: number; model?: string }> };
    const devices: DiscoveredDevice[] = (body.printers ?? []).map((p) => ({
      name: p.name || (p.ip ? `${p.ip}:${p.port ?? 9100}` : 'Network printer'),
      source: 'network' as const,
      detail: p.ip ? `${p.ip}${p.port ? ':' + p.port : ''}${p.model ? ' · ' + p.model : ''}` : p.model,
      ip: p.ip,
      port: p.port ?? (p.ip ? 9100 : undefined),
    }));
    return { devices, ok: true, note: `Local print agent: found ${devices.length} network printer(s).` };
  } catch {
    return { devices: [], ok: false };
  }
}

/** Is the local print agent running? (UI hint / status pill.) */
export async function agentAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${AGENT_BASE}/health`, { signal: ctrl.signal, mode: 'cors' });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
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

  // 0a) Local print agent FIRST — the only source that can auto-scan the terminal's own LAN and so
  //     find a network printer that isn't installed in the OS. This is the fix for "printer is on the
  //     same Wi-Fi but nothing is detected". Silent no-op when the agent isn't running.
  const agent = await detectAgent();
  if (agent.devices.length) {
    agent.devices.forEach((d) => devices.push(d));
    primary = 'network';
  }
  if (agent.note) notes.push(agent.note);
  else notes.push('Local print agent: not running on this terminal. Install & start it to auto-detect and print to network printers on this Wi-Fi/LAN without adding them to the OS first.');

  // 0b) Backend LAN scan (on-prem pos-api on the same network). On a cloud deployment this is
  //    disabled server-side and returns nothing, so we fall through to the local bridges below.
  const backend = await detectBackend();
  if (backend.devices.length) {
    backend.devices.forEach((d) => devices.push(d));
    if (primary === 'none') primary = 'network';
  }
  if (backend.note) notes.push(backend.note);

  // 1) QZ Tray
  const qz = await loadQz();
  if (qz) {
    try {
      const list: string[] = await qz.printers.find();
      try { defaultPrinter = await qz.printers.getDefault(); } catch { /* optional */ }
      const names = Array.isArray(list) ? list : [list].filter(Boolean);
      names.forEach((n) => devices.push({ name: n, source: 'qz', detail: 'OS / network' }));
      if (names.length && primary === 'none') primary = 'qz';
      notes.push(`QZ Tray: found ${names.length} OS printer(s).${names.length ? '' : ' Tip: a network printer must be ADDED to this computer (Windows “Add a printer”) before QZ can list it.'}`);
    } catch {
      notes.push('QZ Tray: connected but could not read the printer list.');
    }
  } else {
    notes.push('QZ Tray: not running on this terminal. A web page cannot list OS printers on its own — your installed printer still prints via the browser Print dialog (pick it there or set it as the Windows default). Install & start QZ Tray only to enable SILENT auto-printing and to list/auto-select printers here.');
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

/**
 * Pop the cash drawer wired to a printer PROFILE (supports OS/USB/BT by name and raw network by IP).
 * Prefers the QZ bridge; for a network drawer with no QZ it kicks via the local agent. Never throws.
 */
export async function openCashDrawerProfile(
  profile: PrinterProfile | undefined,
  code: DrawerKickCode = 'default',
): Promise<boolean> {
  const target = targetOf(profile);
  if (!target) return false;
  const hex = kickHex(code);
  const qz = await loadQz();
  if (qz) {
    try {
      const cfg = 'host' in target ? qz.configs.create({ host: target.host, port: target.port }) : qz.configs.create(target.name);
      await qz.print(cfg, [{ type: 'raw', format: 'command', flavor: 'hex', data: hex }]);
      return true;
    } catch { /* fall through to the agent for network drawers */ }
  }
  if ('host' in target) return printRawToNetwork(target.host, target.port, hex);
  return false;
}

/** Best-effort sync check: is a QZ connection already active? (Used for UI hints only.) */
export function canSilentPrint(): boolean {
  if (typeof window === 'undefined') return false;
  const qz = (window as any).qz;
  return Boolean(qz?.websocket?.isActive?.());
}

// ── Paper geometry ───────────────────────────────────────────────────────────────
// Thermal roll widths print as a continuous strip (fixed width, auto height); cut-sheet sizes
// (A6…A4, Letter) print a full page. Drives both the QZ config and the browser @page fallback.
const THERMAL_WIDTHS: Record<string, number> = { '58mm': 58, '76mm': 76, '80mm': 80 };
const SHEET_MM: Record<string, { w: number; h: number }> = {
  A6: { w: 105, h: 148 }, A5: { w: 148, h: 210 }, A4: { w: 210, h: 297 }, Letter: { w: 216, h: 279 },
};

/** QZ config size for a paper size: thermal → fixed width + continuous height; sheet → full page. */
function qzSize(size: string): { size: { width: number; height: number | null }; units: 'mm' } | undefined {
  if (THERMAL_WIDTHS[size]) return { size: { width: THERMAL_WIDTHS[size], height: null }, units: 'mm' };
  const s = SHEET_MM[size];
  if (s) return { size: { width: s.w, height: s.h }, units: 'mm' };
  return undefined;
}

/** CSS @page size token for the browser fallback. */
function cssPageSize(size: string): string {
  if (THERMAL_WIDTHS[size]) return `${THERMAL_WIDTHS[size]}mm auto`;
  if (size === 'Letter') return 'letter';
  if (SHEET_MM[size]) return size; // A4 / A5 / A6 are valid @page size keywords
  return '80mm auto';
}

function browserPrint(title: string, html: string, paperSize = '80mm') {
  if (typeof window === 'undefined') return;
  const margin = THERMAL_WIDTHS[paperSize] ? '3mm 4mm' : '8mm';
  const win = window.open('', '_blank', 'width=420,height=680');
  if (!win) { window.print(); return; }
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title>` +
    `<style>@page{size:${cssPageSize(paperSize)};margin:${margin}}html,body{margin:0;padding:0;background:#fff}</style>` +
    `</head><body>${html}</body></html>`,
  );
  win.document.close();
  let printed = false;
  const doPrint = () => { if (printed) return; printed = true; win.focus(); win.print(); setTimeout(() => win.close(), 400); };
  win.onload = doPrint;
  setTimeout(doPrint, 600);
}

/** A resolved print destination — an OS/QZ/USB/BT printer by name, or a raw network printer by host. */
type PrintTarget = { name: string } | { host: string; port: number };

function targetOf(p?: PrinterProfile | null): PrintTarget | null {
  if (!p) return null;
  if (p.printer_type === 'network' && p.printer_ip) return { host: p.printer_ip, port: p.printer_port || 9100 };
  const named = p.printer_name && p.printer_name.toLowerCase() !== 'browser' ? p.printer_name : '';
  return named ? { name: named } : null;
}

/**
 * Print HTML to a resolved printer profile. Order of preference:
 *  1. QZ Tray — silent, works for OS/USB/BT printers (by name) AND raw network printers (by host/port,
 *     no OS install needed).
 *  2. Local Print Agent — for a NETWORK printer when QZ isn't present: relay server-built ESC/POS
 *     bytes (pass `escposHex`) straight to the printer's IP:port. This is how a network printer prints
 *     silently from a cloud deployment without QZ Tray.
 *  3. Browser print window — so a receipt is never lost when there is no bridge. With
 *     `opts.silent` (auto-print flows) this fallback is DISABLED: the promise resolves false and the
 *     caller decides (toast/skip) — a background job must never pop a browser print dialog.
 *
 * Returns true when the job reached a destination (bridge or browser window), false when silent mode
 * had nowhere to print.
 */
export async function printProfileHtml(
  profile: PrinterProfile | undefined,
  title: string,
  html: string,
  escposHex?: string,
  opts?: { silent?: boolean },
): Promise<boolean> {
  const size = paperOf(profile);
  const target = targetOf(profile);
  if (!target) {
    if (opts?.silent) return false;
    browserPrint(title, html, size);
    return true;
  }

  const qz = await loadQz();
  if (qz) {
    try {
      const qzOpts = qzSize(size);
      const cfg = 'host' in target
        ? qz.configs.create({ host: target.host, port: target.port }, qzOpts)
        : qz.configs.create(target.name, qzOpts);
      await qz.print(cfg, [{ type: 'html', format: 'plain', data: `<div style="font-family:'Courier New',monospace">${html}</div>` }]);
      return true;
    } catch {
      /* fall through to the agent / browser */
    }
  }

  // No QZ (or QZ failed): a network printer can print via the on-terminal agent using ESC/POS bytes.
  if ('host' in target && escposHex) {
    const ok = await printRawToNetwork(target.host, target.port, escposHex);
    if (ok) return true;
  }

  if (opts?.silent) return false; // background job: report failure instead of opening a dialog
  browserPrint(title, html, size); // never lose the receipt
  return true;
}

/**
 * Back-compat: print HTML to a named printer (or browser when empty/'browser'). New code should use
 * printProfileHtml so network IP printers and the full paper-size range are honoured.
 */
export async function printHtmlToPrinter(
  printerName: string | undefined,
  title: string,
  html: string,
  paperSize = '80mm',
): Promise<boolean> {
  const named = printerName && printerName.toLowerCase() !== 'browser' ? printerName : '';
  return printProfileHtml(
    named ? { id: 'adhoc', label: named, printer_type: 'os', printer_name: named, paper_size: paperSize as PrinterProfile['paper_size'] } : undefined,
    title,
    html,
  );
}

/** Fetch server-built ESC/POS bytes (hex) for an order's receipt/ticket, WITHOUT dispatching (the
 *  cloud can't reach the LAN printer). The browser relays these to the Local Print Agent for a
 *  silent network print. Returns null on failure (caller falls back to browser/QZ). tenantId is the
 *  tenant UUID (the print endpoint parses it as a UUID). */
export async function fetchReceiptEscposHex(
  tenantId: string,
  orderId: string,
  type: 'customer' | 'kitchen_ticket' | 'waiter_copy' | 'void' = 'customer',
  printerId = 'customer',
): Promise<string | null> {
  if (!tenantId || !orderId) return null;
  try {
    const res = await apiClient.post<{ escpos_hex?: string }>(
      `/api/v1/${tenantId}/pos/orders/${orderId}/print`,
      { printer_id: printerId, type, build_only: true },
    );
    return res?.escpos_hex ?? null;
  } catch {
    return null;
  }
}

/** Result of a network-printer connectivity check. */
export interface PingResult {
  ok: boolean;
  ms?: number;
  error?: string;
  /** true when the local print agent itself was unreachable (vs. the printer being down). */
  agentDown?: boolean;
}

/**
 * Ping a raw (JetDirect/9100) network printer by opening a short-lived TCP connection to ip:port via
 * the Local Print Agent, then closing it — no data is sent to the printer. Only the on-terminal agent
 * can do a raw TCP connectivity check (a browser cannot), so this reports `agentDown` when the agent
 * isn't running so the UI can tell the operator to start it. Backs the "Ping printer" button.
 */
export async function pingNetworkPrinter(host: string, port = 9100): Promise<PingResult> {
  if (typeof window === 'undefined') return { ok: false, error: 'unavailable' };
  if (!host) return { ok: false, error: 'no printer IP set' };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4500);
    const res = await fetch(`${AGENT_BASE}/ping?ip=${encodeURIComponent(host)}&port=${port || 9100}`, {
      signal: ctrl.signal,
      mode: 'cors',
    });
    clearTimeout(t);
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; ms?: number; error?: string };
    if (res.ok && body?.ok) return { ok: true, ms: body.ms };
    return { ok: false, error: body?.error || `unreachable (HTTP ${res.status})` };
  } catch {
    // Agent not installed/running (or blocked): the browser can't TCP-ping on its own.
    return { ok: false, agentDown: true, error: 'Local print agent not reachable' };
  }
}

/** Fetch server-built ESC/POS bytes (hex) for a diagnostic test ticket, WITHOUT dispatching. The
 *  browser relays these to the Local Print Agent (or QZ) for a SILENT background test print — no
 *  browser print dialog. Returns null on failure (caller falls back to the browser window). */
export async function fetchTestTicketEscposHex(station: string, paper: string): Promise<string | null> {
  const slug = tenantSlug();
  if (!slug) return null;
  try {
    const res = await apiClient.post<{ escpos_hex?: string }>(
      `/api/v1/${slug}/pos/printing/test-ticket`,
      { station, paper },
    );
    return res?.escpos_hex ?? null;
  } catch {
    return null;
  }
}

/** Send raw ESC/POS bytes (hex) to a network printer via the local agent — used when there is no QZ
 *  bridge. Returns true on success. */
async function printRawToNetwork(host: string, port: number, hex: string): Promise<boolean> {
  try {
    const res = await fetch(`${AGENT_BASE}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip: host, port, format: 'rawhex', data: hex }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
