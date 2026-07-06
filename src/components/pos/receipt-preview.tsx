'use client';

import '@/styles/receipt.css';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/base';
import { Printer, Download, X } from 'lucide-react';
import { toast } from 'sonner';
import { ReceiptPrint } from './receipt-print';
import { printHtmlToPrinter, printProfileHtml, fetchReceiptEscposHex } from '@/lib/pos/printer-discovery';
import { enqueuePrintJob } from '@/lib/pos/print-jobs';
import { hasRealPrinter } from '@/lib/pos/printer-stations';
import type { PrinterProfile } from '@/lib/api/settings';
import { useTenantBranding } from '@/providers/tenant-branding-provider';

// Thermal-receipt styles inlined into the dedicated print window (mirrors src/styles/receipt.css).
const RECEIPT_PRINT_CSS = `
  @page { size: 80mm auto; margin: 3mm 4mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  /* Thermal/non-colour printers render gray & brand colours faint — force pure-black bold ink on
     white for every node, keep colours exact, and only the logo image keeps its pixels (dithered). */
  .receipt-root, .receipt-root * { color: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .receipt-root { font-family: 'Courier New', Courier, 'DejaVu Sans Mono', monospace; font-size: 12px; font-weight: bold; line-height: 1.45; color: #000; background: #fff; width: 72mm; padding: 4mm 0; margin: 0 auto; }
  .receipt-logo { display: block; margin: 0 auto 4px; max-width: 48mm; max-height: 20mm; object-fit: contain; filter: grayscale(1) contrast(1.2); }
  .receipt-center { text-align: center; }
  .receipt-bold { font-weight: bold; }
  .receipt-divider { border: none; border-top: 1px dashed #000; margin: 3px 0; }
  .receipt-row { display: flex; justify-content: space-between; align-items: baseline; padding: 1px 0; }
  .receipt-row-name { flex: 1; padding-right: 6px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .receipt-row-value { flex-shrink: 0; white-space: nowrap; }
  .receipt-total-row { font-weight: bold; font-size: 13px; border-top: 1px solid #000; margin-top: 2px; padding-top: 2px; }
  .receipt-small { font-size: 10px; color: #000; }
  .receipt-qr { display: block; margin: 4px auto; width: 20mm; height: 20mm; object-fit: contain; }
`;

export interface ReceiptLine {
  sku: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  modifiers?: string;
}

export interface ReceiptData {
  receipt_number: string;
  order_number: string;
  outlet_id: string;
  issued_at: string;
  lines: ReceiptLine[];
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  payment_method: string;
  amount_tendered: number;
  change_due: number;
  cashier_name?: string;
  currency?: string;
  etims_invoice_number?: string;
  etims_qr_code_url?: string;
  // outlet + configurable receipt settings (populated by the pos-api receipt endpoint from OutletSetting)
  outlet_name?: string;
  outlet_address?: string;
  receipt_header?: string;
  receipt_footer?: string;
  vat_enabled?: boolean;
  vat_rate?: number;
  paper_width?: string; // '58mm' | '80mm'
  // payment display (populated from OutletSetting when show_payment_info_on_receipt=true)
  payment_methods?: {
    mpesa_paybill?: string;
    mpesa_account_reference?: string;
    mpesa_till?: string;
    mpesa_pochi?: string;
    bank_name?: string;
    bank_account_number?: string;
    bank_account_name?: string;
  } | null;
}

interface ReceiptPreviewProps {
  receipt: ReceiptData | null;
  open: boolean;
  onClose: () => void;
  outletName?: string;
  tenantName?: string;
  /** @deprecated pass `printerProfile` instead — a name can't address network (IP) printers. */
  printerName?: string;
  /** Resolved bill printer profile — supports OS/USB/BT names AND network IP printers. */
  printerProfile?: PrinterProfile;
  /** Tenant UUID + order id — needed to build ESC/POS bytes for silent network printing. */
  tenantId?: string;
  orderId?: string;
  /** Outlet auto_print_order: silently print once on open (never a browser dialog). */
  autoPrint?: boolean;
}

export function ReceiptPreview({
  receipt, open, onClose, outletName, tenantName, printerName, printerProfile, tenantId, orderId, autoPrint,
}: ReceiptPreviewProps) {
  const [printing, setPrinting] = useState(false);
  // Logo only — brand colours are intentionally omitted (they print faint on thermal printers).
  const { tenant } = useTenantBranding();
  const logoUrl = tenant?.logoUrl || '';
  // One-shot per open, and only after the hidden print root has rendered (hence effect, not render).
  const autoFiredRef = useRef(false);

  const realProfile = hasRealPrinter(printerProfile) ? printerProfile : undefined;

  // Silent print to the resolved profile. Returns false when nothing printed (silent mode + no bridge).
  // Server-built ESC/POS bytes serve BOTH network (ip:port) and USB/OS (spooler-name) agent printing.
  const printToProfile = async (silent: boolean): Promise<boolean> => {
    const node = typeof document !== 'undefined' ? document.getElementById('receipt-print-root') : null;
    if (!node || !realProfile || !receipt) return false;
    const escposHex = tenantId && orderId
      ? await fetchReceiptEscposHex(tenantId, orderId, 'customer', realProfile.id)
      : null;
    return printProfileHtml(realProfile, `Receipt ${receipt.order_number}`, node.innerHTML, escposHex ?? undefined, { silent });
  };

  // Auto-print on payment completion: fire once per open, silently — skip with a toast when no real
  // printer is configured. The preview stays on screen either way (manual Print still available).
  useEffect(() => {
    if (!open) { autoFiredRef.current = false; return; }
    if (!autoPrint || autoFiredRef.current || !receipt) return;
    autoFiredRef.current = true;
    if (!realProfile) {
      toast.info('Auto-print skipped — no receipt printer configured (Settings → Receipt).');
      return;
    }
    void printToProfile(true).then((ok) => {
      if (!ok) toast.error('Receipt did not print — check the printer connection (QZ Tray / print agent).');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoPrint, receipt]);

  if (!receipt || !open) return null;

  // Print the receipt via a dedicated window so the modal/app chrome never wins the print context
  // (the previous window.print() printed a blank page). The window contains ONLY the receipt markup
  // plus the inlined thermal styles; the browser's "Save as PDF" destination yields a real PDF.
  const openReceiptPrintWindow = () => {
    const node = typeof document !== 'undefined' ? document.getElementById('receipt-print-root') : null;
    if (!node) {
      window.print();
      return;
    }
    // A real configured printer (incl. network by IP and USB by name) → background job: server
    // print queue first (on-site agent spooler), else the client silent transports. NEVER a
    // surprise browser dialog when hardware is configured — failures toast instead.
    if (realProfile) {
      void (async () => {
        if (tenantId && orderId) {
          const res = await enqueuePrintJob(tenantId, { job_type: 'receipt', order_id: orderId, profile_id: realProfile.id });
          if (res.agent_online && res.jobs.length > 0) {
            toast.success('Receipt sent to the printer.');
            return;
          }
        }
        const ok = await printToProfile(true);
        if (ok) toast.success('Receipt sent to the printer.');
        else toast.error('Receipt did not print — check the printer connection (print agent / QZ Tray).');
      })();
      return;
    }
    // Legacy name-only routing (older call sites) — QZ when reachable, else browser window.
    if (printerName && printerName.toLowerCase() !== 'browser') {
      void printHtmlToPrinter(printerName, `Receipt ${receipt.order_number}`, node.innerHTML, receipt.paper_width ?? '80mm');
      return;
    }
    openBrowserReceiptWindow(node);
  };

  // Explicit browser print window — the ONLY path that opens a dialog. Used when no real printer
  // is configured, and by "Save PDF" (the window's Save-as-PDF destination yields a real PDF).
  const openBrowserReceiptWindow = (nodeParam?: HTMLElement | null) => {
    const node = nodeParam ?? (typeof document !== 'undefined' ? document.getElementById('receipt-print-root') : null);
    if (!node || !receipt) {
      window.print();
      return;
    }
    const win = window.open('', '_blank', 'width=380,height=640');
    if (!win) {
      window.print(); // popup blocked — fall back to in-page print
      return;
    }
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8"/>` +
        `<title>Receipt ${receipt.order_number}</title>` +
        `<style>${RECEIPT_PRINT_CSS}</style></head>` +
        `<body>${node.innerHTML}</body></html>`,
    );
    win.document.close();

    let printed = false;
    const doPrint = () => {
      if (printed) return;
      printed = true;
      win.focus();
      win.print();
      setTimeout(() => win.close(), 400);
    };
    win.onload = doPrint;
    // Fallback: document.write can complete before onload binds in some browsers.
    setTimeout(doPrint, 600);
  };

  const handlePrint = () => {
    setPrinting(true);
    openReceiptPrintWindow();
    setTimeout(() => setPrinting(false), 1000);
  };

  // Real PDF: ALWAYS the browser window — its "Save as PDF" destination produces a proper PDF with
  // the 80mm thermal layout, regardless of any configured hardware printer. (The pos-api endpoint
  // GET /{tenant}/pos/orders/{orderID}/receipt?format=pdf also returns a real application/pdf.)
  const handleDownloadPDF = () => {
    openBrowserReceiptWindow();
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <>
      {/* Hidden printable version — isolated by #receipt-print-root in receipt.css.
          paper-58 narrows the print width for 58mm thermal rolls (default is 80mm). */}
      <div
        id="receipt-print-root"
        className={receipt.paper_width === '58mm' ? 'paper-58' : undefined}
        style={{ display: 'none' }}
      >
        <ReceiptPrint
          receipt={receipt}
          outletName={outletName}
          tenantName={tenantName}
          logoUrl={logoUrl}
          paymentMethods={receipt.payment_methods}
        />
      </div>

      {/* Modal overlay */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-card rounded-2xl border border-border w-full max-w-sm shadow-xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 pt-4 pb-3 border-b border-border flex items-center justify-between">
            <h3 className="text-base font-semibold">Receipt</h3>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-accent transition-colors"
              aria-label="Close receipt"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Receipt content */}
          <div className="px-4 py-3 font-mono text-xs overflow-y-auto max-h-[60vh]">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="logo" className="mx-auto mb-2 max-h-16 object-contain grayscale" />
            )}
            {tenantName && (
              <p className="text-center font-semibold text-sm mb-1">{tenantName}</p>
            )}
            {(outletName || receipt.outlet_name) && (
              <p className="text-center text-muted-foreground mb-1">{outletName || receipt.outlet_name}</p>
            )}
            {receipt.receipt_header && (
              <p className="text-center text-muted-foreground text-[10px] whitespace-pre-wrap mb-1">{receipt.receipt_header}</p>
            )}
            <p className="text-center text-muted-foreground mb-3">{formatDate(receipt.issued_at)}</p>

            <div className="border-t border-dashed border-border my-2" />
            <p className="text-center mb-2">
              Order: <span className="font-semibold">{receipt.order_number}</span>
            </p>
            <div className="border-t border-dashed border-border my-2" />

            {/* Line items */}
            {receipt.lines.map((line, i) => (
              <div key={i} className="flex justify-between py-0.5">
                <span className="flex-1 truncate pr-2">
                  {line.name} ×{line.quantity}
                </span>
                <span className="shrink-0">{line.total_price === 0 ? 'Free' : formatCurrency(line.total_price)}</span>
              </div>
            ))}

            <div className="border-t border-dashed border-border my-2" />

            <div className="flex justify-between py-0.5">
              <span>Subtotal</span>
              <span>{formatCurrency(receipt.subtotal)}</span>
            </div>
            {receipt.vat_enabled !== false && receipt.tax_amount > 0 && (
              <div className="flex justify-between py-0.5">
                <span>VAT ({receipt.vat_rate ?? 16}%)</span>
                <span>{formatCurrency(receipt.tax_amount)}</span>
              </div>
            )}
            {receipt.discount_amount > 0 && (
              <div className="flex justify-between py-0.5 text-green-600">
                <span>Discount</span>
                <span>-{formatCurrency(receipt.discount_amount)}</span>
              </div>
            )}

            <div className="border-t border-dashed border-border my-2" />

            <div className="flex justify-between py-0.5 font-bold text-sm">
              <span>TOTAL</span>
              <span>{formatCurrency(receipt.total_amount)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="capitalize">{(receipt.payment_method ?? 'cash').replace(/_/g, ' ')}</span>
              <span>{formatCurrency(receipt.amount_tendered)}</span>
            </div>
            {receipt.change_due > 0 && (
              <div className="flex justify-between py-0.5">
                <span>Change</span>
                <span>{formatCurrency(receipt.change_due)}</span>
              </div>
            )}

            {receipt.etims_invoice_number && (
              <>
                <div className="border-t border-dashed border-border my-2" />
                <p className="text-center text-muted-foreground text-[10px]">
                  eTIMS: {receipt.etims_invoice_number}
                </p>
                {receipt.etims_qr_code_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={receipt.etims_qr_code_url}
                    alt="eTIMS QR"
                    className="mx-auto mt-1 h-16 w-16"
                  />
                )}
              </>
            )}

            {receipt.payment_methods && Object.values(receipt.payment_methods).some(Boolean) && (
              <>
                <div className="border-t border-dashed border-border my-2" />
                <p className="text-center font-semibold text-[10px] mb-1">HOW TO PAY</p>
                {receipt.payment_methods.mpesa_paybill && (
                  <div className="flex justify-between py-0.5 text-[10px]">
                    <span>M-PESA Paybill</span>
                    <span className="font-semibold">{receipt.payment_methods.mpesa_paybill}</span>
                  </div>
                )}
                {receipt.payment_methods.mpesa_account_reference && (
                  <div className="flex justify-between py-0.5 text-[10px]">
                    <span>Account No.</span>
                    <span className="font-semibold">{receipt.payment_methods.mpesa_account_reference}</span>
                  </div>
                )}
                {receipt.payment_methods.mpesa_till && (
                  <div className="flex justify-between py-0.5 text-[10px]">
                    <span>M-PESA Till</span>
                    <span className="font-semibold">{receipt.payment_methods.mpesa_till}</span>
                  </div>
                )}
                {receipt.payment_methods.mpesa_pochi && (
                  <div className="flex justify-between py-0.5 text-[10px]">
                    <span>M-PESA Pochi</span>
                    <span className="font-semibold">{receipt.payment_methods.mpesa_pochi}</span>
                  </div>
                )}
                {receipt.payment_methods.bank_account_number && (
                  <div className="flex justify-between py-0.5 text-[10px]">
                    <span>{receipt.payment_methods.bank_name || 'Bank'}</span>
                    <span className="font-semibold">{receipt.payment_methods.bank_account_number}</span>
                  </div>
                )}
                {receipt.payment_methods.bank_account_name && (
                  <p className="text-center text-muted-foreground text-[10px]">
                    {receipt.payment_methods.bank_account_name}
                  </p>
                )}
              </>
            )}

            {receipt.cashier_name && (
              <p className="text-center text-muted-foreground mt-2">
                Served by: {receipt.cashier_name}
              </p>
            )}
            <p className="text-center text-muted-foreground mt-2 text-[10px] whitespace-pre-wrap">
              {receipt.receipt_footer || 'Thank you for your business!'}
            </p>
          </div>

          {/* Action buttons */}
          <div className="px-4 pb-4 pt-2 border-t border-border flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handlePrint}
              disabled={printing}
            >
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleDownloadPDF}
            >
              <Download className="h-4 w-4 mr-2" />
              Save PDF
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

