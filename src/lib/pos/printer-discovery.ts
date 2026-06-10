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

export type PrinterSource = 'qz' | 'none';

export interface DiscoverResult {
  source: PrinterSource;
  printers: string[];
  defaultPrinter?: string;
  note?: string;
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

/** Discover printers via QZ Tray; empty list + source 'none' when no bridge is reachable. */
export async function discoverPrinters(): Promise<DiscoverResult> {
  const qz = await loadQz();
  if (!qz) {
    return {
      source: 'none',
      printers: [],
      note: 'No print bridge detected. Install & run QZ Tray on this terminal to auto-detect network, USB & Bluetooth printers and enable silent auto-print. Without it, printing uses the browser print dialog.',
    };
  }
  try {
    const list: string[] = await qz.printers.find();
    let def: string | undefined;
    try { def = await qz.printers.getDefault(); } catch { /* optional */ }
    const printers = Array.isArray(list) ? list : [list].filter(Boolean);
    return { source: 'qz', printers, defaultPrinter: def, note: `Found ${printers.length} printer(s) via QZ Tray.` };
  } catch {
    return { source: 'none', printers: [], note: 'Could not read printers from QZ Tray.' };
  }
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
