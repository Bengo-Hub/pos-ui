/**
 * Printer discovery + dispatch for the POS.
 *
 * A browser cannot, by itself, enumerate OS / network / USB / Bluetooth printers or print silently to
 * a specific one — `window.print()` only opens the OS dialog where the user picks a printer. The
 * industry-standard bridge for web POS is **QZ Tray**: a small local app that exposes the machine's
 * printers (network, USB, Bluetooth — whatever the OS sees) over a secure WebSocket. When QZ Tray is
 * running and its client (`window.qz`) is loaded, we can list printers and print silently to a named
 * one. When it is NOT present we degrade gracefully to the browser print window (the default).
 *
 * This module never hard-depends on the qz-tray package (so the build stays clean); it detects the
 * runtime global `window.qz`. Loading qz-tray.js is an operator/deployment concern.
 */

export type PrinterSource = 'qz' | 'none';

export interface DiscoverResult {
  source: PrinterSource;
  printers: string[];
  defaultPrinter?: string;
  /** Human-readable note for the settings UI when no bridge is available. */
  note?: string;
}

function qz(): any | null {
  if (typeof window === 'undefined') return null;
  const q = (window as any).qz;
  return q && q.printers && q.websocket ? q : null;
}

async function ensureQzConnected(q: any): Promise<boolean> {
  try {
    if (q.websocket.isActive && q.websocket.isActive()) return true;
    await q.websocket.connect();
    return true;
  } catch {
    return false;
  }
}

/**
 * Discover available printers. Tries QZ Tray; returns an empty list with source 'none' when no bridge
 * is detected (the caller then offers only the browser-print default).
 */
export async function discoverPrinters(): Promise<DiscoverResult> {
  const q = qz();
  if (!q) {
    return {
      source: 'none',
      printers: [],
      note: 'No print bridge detected. Install/run QZ Tray to auto-detect network, USB & Bluetooth printers and enable silent auto-print. Without it, printing uses the browser print dialog.',
    };
  }
  const connected = await ensureQzConnected(q);
  if (!connected) {
    return {
      source: 'none',
      printers: [],
      note: 'QZ Tray is installed but not reachable. Start the QZ Tray app, then click Detect Printers again.',
    };
  }
  try {
    const list: string[] = await q.printers.find();
    let def: string | undefined;
    try { def = await q.printers.getDefault(); } catch { /* optional */ }
    return { source: 'qz', printers: Array.isArray(list) ? list : [list].filter(Boolean), defaultPrinter: def };
  } catch {
    return { source: 'none', printers: [], note: 'Could not read printers from QZ Tray.' };
  }
}

/** True when silent printing to a named printer is possible right now. */
export function canSilentPrint(): boolean {
  return qz() !== null;
}

const PAGE_WIDTH: Record<string, string> = { '58mm': '58mm', '80mm': '80mm' };

function browserPrint(title: string, html: string, paperWidth = '80mm') {
  if (typeof window === 'undefined') return;
  const w = PAGE_WIDTH[paperWidth] ?? '80mm';
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
 * Print HTML to a station's assigned printer. When QZ Tray + a real printer name are available the
 * job is sent silently to that printer; otherwise it falls back to the browser print window so a
 * receipt is always produced. `printerName` of '', 'browser', or undefined forces the browser path.
 */
export async function printHtmlToPrinter(
  printerName: string | undefined,
  title: string,
  html: string,
  paperWidth = '80mm',
): Promise<void> {
  const q = qz();
  const named = printerName && printerName.toLowerCase() !== 'browser' ? printerName : '';
  if (!q || !named) {
    browserPrint(title, html, paperWidth);
    return;
  }
  try {
    if (!(await ensureQzConnected(q))) { browserPrint(title, html, paperWidth); return; }
    const cfg = q.configs.create(named, { size: { width: paperWidth === '58mm' ? 58 : 80, height: null }, units: 'mm' });
    // Print as HTML so our thermal markup renders without ESC/POS hand-coding.
    await q.print(cfg, [{ type: 'html', format: 'plain', data: `<div style="font-family:'Courier New',monospace">${html}</div>` }]);
  } catch {
    // Any QZ failure → never lose the receipt; fall back to the browser dialog.
    browserPrint(title, html, paperWidth);
  }
}
