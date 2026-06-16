/**
 * Kitchen/Bar ticket printing for the POS.
 *
 * "Send to kitchen" routes order lines to a kitchen ticket and a bar ticket. How they print depends
 * on the outlet's printer configuration (OutletSetting.printer_profiles):
 *   - SINGLE printer (no extra profiles): one combined "3-in-1" job is printed on the one thermal
 *     printer — Customer Bill section, then Kitchen Order section, then Bar Order section.
 *   - MULTIPLE printers (one profile per station, each with `categories`): separate jobs are sent so
 *     the kitchen printer prints food and the bar printer prints drinks, while the customer bill
 *     prints on the POS/receipt printer.
 *
 * Routing mirrors the pos-api KDS rule: coffee/tea & food → kitchen; alcohol & cold drinks → bar.
 * Printing uses isolated browser print windows (same approach as the receipt preview) — no native
 * driver. The operator selects the physical printer per window when multiple printers are configured.
 */

import { printHtmlToPrinter } from './printer-discovery';
import { stationConfigMap, coffeeStationActive, hasRealPrinter, type PrintStation } from './printer-stations';
import type { PrinterProfile } from '@/lib/api/settings';

export interface TicketLine {
  name: string;
  quantity: number;
  category?: string;
  notes?: string;
  unitPrice?: number;
  totalPrice?: number;
}

export type Station = 'kitchen' | 'bar' | 'coffee';

const HOT_BEVERAGES = [
  'coffee', 'tea', 'espresso', 'cappuccino', 'latte', 'americano', 'macchiato',
  'mocha', 'hot chocolate', 'chai', 'flat white', 'cortado', 'affogato', 'hot beverage', 'hot drink',
];

const BAR_KEYWORDS = [
  'beer', 'wine', 'spirit', 'whisky', 'whiskey', 'vodka', 'gin', 'rum', 'tequila', 'brandy',
  'cocktail', 'lager', 'cider', 'liqueur', 'champagne', 'shooter', 'shot',
  'soda', 'soft drink', 'juice', 'water', 'mineral water', 'cold beverage', 'cold drink',
  'iced', 'smoothie', 'milkshake', 'mocktail', 'energy drink', 'bar',
];

function matches(hay: string, needles: string[]): boolean {
  const h = hay.toLowerCase();
  return needles.some((n) => h.includes(n));
}

/** Decide which station a line belongs to. Hot beverages → coffee; alcohol & cold drinks → bar;
 *  everything else → kitchen. When no dedicated coffee printer is configured the caller folds the
 *  coffee bucket back into the kitchen (so "coffee & tea go to the kitchen" by default). */
export function stationForLine(line: TicketLine): Station {
  const hay = `${line.name} ${line.category ?? ''}`;
  // Iced coffee/tea are cold drinks → bar, even though they contain coffee/tea.
  if (matches(hay, ['iced coffee', 'iced tea', 'ice coffee', 'ice tea'])) return 'bar';
  if (matches(hay, HOT_BEVERAGES)) return 'coffee';
  if (matches(hay, BAR_KEYWORDS)) return 'bar';
  return 'kitchen';
}

/** Split lines into kitchen/bar/coffee buckets. When `coffeeActive` is false the coffee bucket is
 *  merged into kitchen. */
export function splitByStation(lines: TicketLine[], coffeeActive = false): { kitchen: TicketLine[]; bar: TicketLine[]; coffee: TicketLine[] } {
  const kitchen: TicketLine[] = [];
  const bar: TicketLine[] = [];
  const coffee: TicketLine[] = [];
  for (const l of lines) {
    const st = stationForLine(l);
    if (st === 'bar') bar.push(l);
    else if (st === 'coffee') (coffeeActive ? coffee : kitchen).push(l);
    else kitchen.push(l);
  }
  return { kitchen, bar, coffee };
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
  /** Per-station printer config from OutletSetting.printer_profiles. */
  stations?: PrinterProfile[];
  /** Include the customer bill section/job (true for dine-in send-to-kitchen). */
  includeCustomerBill?: boolean;
  currency?: string;
  /** Outlet setting auto_print_kitchen — only auto-print kitchen/bar/coffee tickets when true. */
  autoPrintKitchen?: boolean;
  /** Outlet setting auto_print_order — only auto-print the customer bill when true. */
  autoPrintBill?: boolean;
}

function hasAssignedPrinter(profiles?: PrinterProfile[] | null): boolean {
  return (profiles ?? []).some((p) => hasRealPrinter(p));
}

/**
 * Print kitchen/bar/coffee tickets according to the outlet's printer setup.
 *  - If any station has an assigned (QZ Tray) printer → one silent job per station routed to its
 *    printer (Bill, Kitchen, Bar, Coffee), honoring each station's paper size + auto_print.
 *  - Otherwise (no bridge / all browser) → a single combined 3-in-1 browser job (Bill + Kitchen + Bar
 *    + Coffee), matching the "one thermal printer prints 3-in-1" requirement.
 * Returns a promise but is safe to fire-and-forget.
 */
export async function printKitchenBarTickets(opts: PrintTicketsOptions): Promise<void> {
  const {
    orderNumber, tableRef = '', lines, stations = [], includeCustomerBill = true, currency = 'KES',
    autoPrintKitchen = false, autoPrintBill = false,
  } = opts;
  if (lines.length === 0) return;

  // Respect the outlet's auto-print settings. With both off (and routing handled by the KDS),
  // do NOT pop a browser print dialog or fire a silent job — the cashier uses the explicit
  // "Print Bill" action instead. This is the gate that stops the print dialog from auto-opening.
  const printBill = includeCustomerBill && autoPrintBill;
  const printStations = autoPrintKitchen;
  if (!printBill && !printStations) return;

  const cfg = stationConfigMap(stations);
  const coffeeActive = coffeeStationActive(stations);
  const { kitchen, bar, coffee } = splitByStation(lines, coffeeActive);

  const billHtml = customerBillSectionHtml(orderNumber, tableRef, lines, currency);
  const kitchenHtml = stationSectionHtml('Kitchen Order', orderNumber, tableRef, kitchen);
  const barHtml = stationSectionHtml('Bar Order', orderNumber, tableRef, bar);
  const coffeeHtml = stationSectionHtml('Coffee Order', orderNumber, tableRef, coffee);

  if (hasAssignedPrinter(stations)) {
    // Separate silent jobs per station (QZ Tray), each to its assigned printer + paper size.
    const jobs: Array<Promise<void>> = [];
    const send = (s: PrintStation, title: string, html: string, force = false) => {
      if (!html) return;
      const c = cfg[s];
      if (!force && c.auto_print === false) return; // station auto-print disabled
      jobs.push(printHtmlToPrinter(c.printer_name, title, `<div class="t-root">${html}</div>`, c.paper_width ?? '80mm'));
    };
    if (printBill) send('bill', `Bill ${orderNumber}`, billHtml, true);
    if (printStations) {
      send('kitchen', `Kitchen ${orderNumber}`, kitchenHtml);
      send('bar', `Bar ${orderNumber}`, barHtml);
      send('coffee', `Coffee ${orderNumber}`, coffeeHtml);
    }
    await Promise.all(jobs);
    return;
  }

  // No assigned printers → single combined 3-in-1 browser job (only the enabled sections).
  const combined =
    (printBill ? billHtml : '') + (printStations ? kitchenHtml + barHtml + coffeeHtml : '');
  if (!combined) return;
  openPrintWindow(`Order ${orderNumber}`, combined);
}
