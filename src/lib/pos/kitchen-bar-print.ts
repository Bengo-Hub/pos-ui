/**
 * Kitchen/Bar ticket printing for the POS — routed by the SAME KDS stations the kitchen displays use.
 *
 * "Send to kitchen" splits the order lines across the outlet's live KDS stations by their
 * `category_filter` (an exact mirror of the pos-api `routeLinesToStations` rule), then prints each
 * station's ticket to that station's assigned printer (OutletSetting.printer_profiles, keyed by the
 * station id). The priced Customer Bill prints to the fixed 'customer' profile.
 *
 *   - MULTIPLE printers (a real printer assigned to any station) → one silent job per station.
 *   - SINGLE / no printer → one combined "3-in-1" browser job (Bill + each station section).
 *
 * Because routing uses the station category_filter (not keyword guessing), a ticket always lands on
 * the printer of the station the KDS routed it to.
 */

import { printProfileHtml } from './printer-discovery';
import { configFor, anyRealPrinter, hasRealPrinter, BILL_PROFILE_ID } from './printer-stations';
import type { PrinterProfile } from '@/lib/api/settings';
import type { KDSStation } from '@/hooks/useKDS';

export interface TicketLine {
  name: string;
  quantity: number;
  category?: string;
  notes?: string;
  unitPrice?: number;
  totalPrice?: number;
}

// Hot beverages are kitchen items (never bar), mirroring the pos-api isHotBeverage rule.
const HOT_BEVERAGES = [
  'coffee', 'tea', 'espresso', 'cappuccino', 'latte', 'americano', 'macchiato',
  'mocha', 'hot chocolate', 'chai', 'flat white', 'cortado', 'affogato', 'hot beverage', 'hot drink',
];

function includesAny(hay: string, needles: string[]): boolean {
  const h = hay.toLowerCase();
  return needles.some((n) => h.includes(n));
}

/** Iced coffee/tea are cold drinks, not hot beverages. */
function isHotBeverage(name: string, category: string): boolean {
  const hay = `${name} ${category}`.toLowerCase();
  if (includesAny(hay, ['iced coffee', 'iced tea', 'ice coffee', 'ice tea'])) return false;
  return includesAny(hay, HOT_BEVERAGES);
}

/**
 * Route lines to KDS stations, mirroring pos-api `routeLinesToStations` exactly:
 *  - hot beverages → the kitchen station (when one exists), before category matching;
 *  - else STRICT category match: the line's category must equal one of a station's category_filter
 *    entries (case-insensitive); when the line has no category, fall back to a name-substring match;
 *  - unrouted lines → every expo/all station, else the first active station.
 * Returns a Map of stationId → lines. Bar stations are skipped for hot beverages.
 */
export function routeLinesToStations(lines: TicketLine[], stations: KDSStation[]): Map<string, TicketLine[]> {
  const active = stations.filter((s) => s.is_active !== false);
  const buckets = new Map<string, TicketLine[]>();
  const push = (id: string, l: TicketLine) => {
    const arr = buckets.get(id);
    if (arr) arr.push(l); else buckets.set(id, [l]);
  };
  const expo = active.filter((s) => s.station_type === 'expo' || s.station_type === 'all');
  const kitchen = active.find((s) => s.station_type === 'kitchen');

  for (const l of lines) {
    const cat = (l.category ?? '').trim().toLowerCase();
    const name = (l.name ?? '').toLowerCase();
    const hot = isHotBeverage(name, cat);
    let routed: string | null = null;

    if (hot && kitchen) routed = kitchen.id;

    if (!routed) {
      for (const s of active) {
        if (s.station_type === 'expo' || s.station_type === 'all') continue;
        if (hot && s.station_type === 'bar') continue;
        for (const c of s.category_filter ?? []) {
          const needle = c.trim().toLowerCase();
          if (!needle) continue;
          const match = cat ? cat === needle : name.includes(needle);
          if (match) { routed = s.id; break; }
        }
        if (routed) break;
      }
    }

    if (routed) { push(routed, l); continue; }
    if (expo.length) { expo.forEach((e) => push(e.id, l)); continue; }
    if (active.length) push(active[0].id, l);
  }
  return buckets;
}

const TICKET_CSS = `
  @page { size: 80mm auto; margin: 3mm 4mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  /* Force pure-black bold ink on white so thermal/non-colour printers stay crisp (no faint gray). */
  .t-root, .t-root * { color: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .t-root { font-family: 'Courier New', Courier, 'DejaVu Sans Mono', monospace; font-weight: bold; color: #000; width: 72mm; padding: 4mm 0; margin: 0 auto; }
  .t-title { text-align: center; font-size: 16px; font-weight: 800; margin: 2px 0; text-transform: uppercase; }
  .t-sub { text-align: center; font-size: 11px; font-weight: 700; margin: 1px 0; }
  .t-div { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  .t-line { display: flex; justify-content: space-between; font-size: 14px; font-weight: 700; padding: 2px 0; }
  .t-qty { min-width: 28px; }
  .t-note { font-size: 11px; font-style: italic; padding-left: 28px; }
  .t-bill { font-size: 12px; font-weight: 700; }
  .t-section { page-break-inside: avoid; }
`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

function stationSectionHtml(title: string, orderNumber: string, tableRef: string, lines: TicketLine[]): string {
  if (lines.length === 0) return '';
  const rows = lines.map((l) => {
    const note = l.notes ? `<div class="t-note">↳ ${escapeHtml(l.notes)}</div>` : '';
    return `<div class="t-line"><span class="t-qty">${l.quantity}×</span><span style="flex:1">${escapeHtml(l.name)}</span></div>${note}`;
  }).join('');
  return `<div class="t-section">
    <div class="t-title">${escapeHtml(title)}</div>
    <div class="t-sub">Order ${escapeHtml(orderNumber)}${tableRef ? ` · ${escapeHtml(tableRef)}` : ''}</div>
    <hr class="t-div"/>
    ${rows}
    <hr class="t-div"/>
  </div>`;
}

function customerBillSectionHtml(orderNumber: string, tableRef: string, lines: TicketLine[], currency: string): string {
  const rows = lines.map((l) => {
    const amt = l.totalPrice ?? (l.unitPrice ?? 0) * l.quantity;
    return `<div class="t-line t-bill"><span style="flex:1">${l.quantity}× ${escapeHtml(l.name)}</span><span>${amt.toFixed(2)}</span></div>`;
  }).join('');
  const total = lines.reduce((s, l) => s + (l.totalPrice ?? (l.unitPrice ?? 0) * l.quantity), 0);
  return `<div class="t-section">
    <div class="t-title">Customer Bill</div>
    <div class="t-sub">Order ${escapeHtml(orderNumber)}${tableRef ? ` · ${escapeHtml(tableRef)}` : ''}</div>
    <hr class="t-div"/>
    ${rows}
    <hr class="t-div"/>
    <div class="t-line t-bill"><span style="flex:1">TOTAL</span><span>${currency} ${total.toFixed(2)}</span></div>
    <hr class="t-div"/>
  </div>`;
}

function openPrintWindow(title: string, bodyHtml: string) {
  if (typeof window === 'undefined') return;
  const win = window.open('', '_blank', 'width=380,height=640');
  if (!win) { window.print(); return; }
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>` +
    `<style>${TICKET_CSS}</style></head><body><div class="t-root">${bodyHtml}</div></body></html>`,
  );
  win.document.close();
  let printed = false;
  const doPrint = () => { if (printed) return; printed = true; win.focus(); win.print(); setTimeout(() => win.close(), 400); };
  win.onload = doPrint;
  setTimeout(doPrint, 600);
}

export interface PrintTicketsOptions {
  orderNumber: string;
  tableRef?: string;
  lines: TicketLine[];
  /** Live KDS stations — drives routing (by category_filter) and the printed station titles. */
  kdsStations?: KDSStation[];
  /** Per-station printer config from OutletSetting.printer_profiles (keyed by station id + 'customer'). */
  stations?: PrinterProfile[];
  /** Include the customer bill section/job (true for dine-in send-to-kitchen). */
  includeCustomerBill?: boolean;
  currency?: string;
  /** Outlet setting auto_print_kitchen — only auto-print station tickets when true. */
  autoPrintKitchen?: boolean;
  /** Outlet setting auto_print_order — only auto-print the customer bill when true. */
  autoPrintBill?: boolean;
  /** Background/auto-print mode: NEVER open a browser print dialog — skip jobs with no real
   *  printer and report them in the result instead. */
  silent?: boolean;
}

export interface PrintTicketsResult {
  /** Number of jobs actually dispatched to a printer (or browser window in non-silent mode). */
  printed: number;
  /** Jobs skipped in silent mode because no real printer was assigned (labels, e.g. 'Kitchen'). */
  skipped: string[];
}

/**
 * Print per-KDS-station tickets according to the outlet's printer setup.
 *  - If any station (or the bill) has an assigned printer → one silent job per station routed to its
 *    printer, honoring each station's paper size + auto_print.
 *  - Otherwise → a single combined 3-in-1 browser job (Bill + each station section).
 * Safe to fire-and-forget.
 */
export async function printKitchenBarTickets(opts: PrintTicketsOptions): Promise<PrintTicketsResult> {
  const {
    orderNumber, tableRef = '', lines, kdsStations = [], stations = [],
    includeCustomerBill = true, currency = 'KES', autoPrintKitchen = false, autoPrintBill = false,
    silent = false,
  } = opts;
  const result: PrintTicketsResult = { printed: 0, skipped: [] };
  if (lines.length === 0) return result;

  // Respect the outlet's auto-print settings. With both off (routing handled by the KDS screens),
  // do NOT pop a browser dialog or fire a silent job — the cashier uses the explicit "Print Bill".
  const printBill = includeCustomerBill && autoPrintBill;
  const printStations = autoPrintKitchen;
  if (!printBill && !printStations) return result;

  // Route lines to the live KDS stations by category_filter (falls back to a single "Kitchen"
  // bucket when no stations are configured, so nothing is lost on a bare outlet).
  const buckets = kdsStations.length
    ? routeLinesToStations(lines, kdsStations)
    : new Map<string, TicketLine[]>([['__kitchen__', lines]]);
  const stationById = new Map(kdsStations.map((s) => [s.id, s]));

  const billHtml = customerBillSectionHtml(orderNumber, tableRef, lines, currency);

  if (anyRealPrinter(stations)) {
    const jobs: Array<Promise<void>> = [];
    const dispatch = (profile: PrinterProfile, label: string, title: string, html: string) => {
      // In silent (background) mode a job with no real printer must not fall back to a browser
      // dialog — record it as skipped so the caller can toast instead.
      if (silent && !hasRealPrinter(profile)) { result.skipped.push(label); return; }
      jobs.push(printProfileHtml(profile, title, html, undefined, { silent }).then((ok) => {
        if (ok) result.printed += 1; else result.skipped.push(label);
      }));
    };
    if (printBill) {
      dispatch(configFor(stations, BILL_PROFILE_ID, 'Customer Bill'), 'Customer Bill', `Bill ${orderNumber}`, `<div class="t-root">${billHtml}</div>`);
    }
    if (printStations) {
      for (const [stationId, stationLines] of buckets) {
        const station = stationById.get(stationId);
        const title = station?.name ?? 'Kitchen';
        const html = stationSectionHtml(`${title} Order`, orderNumber, tableRef, stationLines);
        if (!html) continue;
        const profile = configFor(stations, stationId, title);
        if (profile.auto_print === false) continue; // station auto-print disabled
        dispatch(profile, title, `${title} ${orderNumber}`, `<div class="t-root">${html}</div>`);
      }
    }
    await Promise.all(jobs);
    return result;
  }

  // No assigned printers at all.
  if (silent) {
    // Background job: never pop the combined browser window — report everything as skipped.
    if (printBill) result.skipped.push('Customer Bill');
    if (printStations) {
      for (const [stationId] of buckets) result.skipped.push(stationById.get(stationId)?.name ?? 'Kitchen');
    }
    return result;
  }

  // Manual path → single combined 3-in-1 browser job (only the enabled sections).
  let combined = printBill ? billHtml : '';
  if (printStations) {
    for (const [stationId, stationLines] of buckets) {
      const title = stationById.get(stationId)?.name ?? 'Kitchen';
      combined += stationSectionHtml(`${title} Order`, orderNumber, tableRef, stationLines);
    }
  }
  if (!combined) return result;
  openPrintWindow(`Order ${orderNumber}`, combined);
  result.printed += 1;
  return result;
}
