'use client';

/**
 * Shared "turn a fetched ReceiptData into printable HTML" pipeline — the single place every
 * browser-HTML print path renders through, so the modal's Print/Save-PDF, OrderPlacedDialog's
 * auto/manual bill print, and the split-bill guest receipt can never diverge from each other or
 * from `ReceiptPrint`, the one component that knows how a receipt is laid out.
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ReceiptPrint } from '@/components/pos/receipt-print';
import type { ReceiptData } from '@/components/pos/receipt-preview';

// Thermal-receipt styles for the dedicated print window (mirrors src/styles/receipt.css, which
// covers the in-app hidden #receipt-print-root instead).
export const RECEIPT_PRINT_CSS = `
  /* Zero @page margin suppresses the browser's own header/footer chrome (the about:blank +
     date/URL lines that ruined printed receipts); the margin is inner padding instead. */
  @page { size: 80mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  /* Thermal/non-colour printers render gray & brand colours faint — force pure-black bold ink on
     white for every node, keep colours exact, and only the logo image keeps its pixels (dithered). */
  .receipt-root, .receipt-root * { color: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .receipt-root { font-family: 'Courier New', Courier, 'DejaVu Sans Mono', monospace; font-size: 13px; font-weight: bold; line-height: 1.45; color: #000; background: #fff; width: 72mm; padding: 4mm 3mm; margin: 0 auto; }
  /* thermal_modern variant — bold sans (mirrors pos-api layouts.ThermalModern). */
  .receipt-root.receipt-modern { font-family: 'Helvetica Neue', Helvetica, Arial, 'Segoe UI', sans-serif; font-weight: 700; }
  .receipt-logo { display: block; margin: 0 auto 4px; max-width: 48mm; max-height: 20mm; object-fit: contain; filter: grayscale(1) contrast(1.2); }
  .receipt-center { text-align: center; }
  .receipt-bold { font-weight: bold; }
  .receipt-divider { border: none; border-top: 1px dashed #000; margin: 3px 0; }
  .receipt-row { display: flex; justify-content: space-between; align-items: baseline; padding: 1px 0; }
  /* Long item/payment/bank names WRAP onto a second line instead of being ellipsis-clipped. */
  .receipt-row-name { flex: 1; min-width: 0; padding-right: 6px; white-space: normal; word-break: break-word; }
  .receipt-row-value { flex-shrink: 0; white-space: nowrap; }
  .receipt-total-row { font-weight: bold; font-size: 15px; border-top: 1px solid #000; margin-top: 2px; padding-top: 2px; }
  .receipt-small { font-size: 11px; color: #000; }
  .receipt-qr { display: block; margin: 5px auto; width: 25mm; height: 25mm; object-fit: contain; }
  /* thermal_grid variant — bordered tables for the customer/date meta and item list. */
  .grid-box { border: 2px solid #000; padding: 4px 6px; text-align: center; margin-bottom: 3px; }
  .grid-table { width: 100%; border-collapse: collapse; margin: 4px 0; }
  .grid-table th, .grid-table td { border: 2px solid #000; padding: 2px 4px; font-size: 10px; word-break: break-word; }
  .grid-table th { font-weight: 700; text-align: left; }
  .grid-table th.c, .grid-table td.c { text-align: center; }
  .grid-table th.r, .grid-table td.r { text-align: right; }
  .grid-served { display: flex; justify-content: space-between; border-bottom: 1.5px solid #000; padding: 2px 1px; font-size: 10px; margin-bottom: 3px; }
`;

export interface ReceiptBranding {
  outletName?: string;
  tenantName?: string;
  tenantAddress?: string;
  tenantPhone?: string;
  tenantPin?: string;
  logoUrl?: string;
}

/**
 * Renders <ReceiptPrint> off-screen and returns its inner HTML. This is how the receipt fragment
 * is produced for every path that doesn't already have the component mounted in the visible tree
 * (OrderPlacedDialog, split-bill guest receipts) — same component, same output, no server-side HTML
 * string builder involved.
 */
export async function renderReceiptHtml(receipt: ReceiptData, branding: ReceiptBranding = {}): Promise<string> {
  if (typeof document === 'undefined') return '';
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await new Promise<void>((resolve) => {
      root.render(createElement(ReceiptPrint, { receipt, paymentMethods: receipt.payment_methods, ...branding }));
      // Two rAFs give React time to commit the render and paint before we read innerHTML.
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    return container.innerHTML;
  } finally {
    root.unmount();
    container.remove();
  }
}

// A4 page rules for the boxed invoice template (its own styles are inline on the markup —
// only the page geometry and ink handling need to come from the document shell). Zero @page
// margin (suppresses browser print headers) with the sheet margin as body padding instead.
export const RECEIPT_PRINT_CSS_A4 = `
  @page { size: A4 portrait; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { padding: 12mm; }
`;

/** Wraps a receipt HTML fragment (from renderReceiptHtml, or an already-mounted node's innerHTML)
 *  in the standalone print-window document shell. `paper` picks the page geometry: the default
 *  80mm thermal styles, or A4 for the retail boxed template (whose look is inline-styled). */
export function buildReceiptDocument(title: string, bodyHtml: string, paper: 'thermal' | 'a4' = 'thermal'): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8"/>` +
    `<title>${title}</title>` +
    `<style>${paper === 'a4' ? RECEIPT_PRINT_CSS_A4 : RECEIPT_PRINT_CSS}</style></head>` +
    `<body>${bodyHtml}</body></html>`
  );
}

/**
 * Opens a dedicated print window for a full HTML document, waits for it to load, prints, and
 * closes — the one popup/print/close routine shared by every browser-print call site (a dedicated
 * window is used, rather than window.print() on the current page, so the app's own chrome never
 * wins the print context).
 */
export function printReceiptDocument(doc: string, opts: { width?: number; height?: number } = {}): void {
  if (typeof window === 'undefined') return;
  const win = window.open('', '_blank', `width=${opts.width ?? 380},height=${opts.height ?? 640}`);
  if (!win) {
    window.print(); // popup blocked — fall back to in-page print
    return;
  }
  win.document.open();
  win.document.write(doc);
  win.document.close();

  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    win.focus();
    win.print();
    win.addEventListener('afterprint', () => win.close());
    setTimeout(() => { try { win.close(); } catch { /* already closed */ } }, 1000);
  };
  win.onload = doPrint;
  // Fallback: document.write can complete before onload binds in some browsers.
  setTimeout(doPrint, 700);
}
