'use client';

import '@/styles/receipt.css';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/base';
import { Printer, Download, X, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { ReceiptPrint } from './receipt-print';
import { printHtmlToPrinter, printProfileHtml, fetchReceiptEscposHex } from '@/lib/pos/printer-discovery';
import { enqueuePrintJob } from '@/lib/pos/print-jobs';
import { hasRealPrinter } from '@/lib/pos/printer-stations';
import { buildReceiptRows } from '@/lib/pos/receipt-rows';
import { buildReceiptDocument, printReceiptDocument } from '@/lib/pos/receipt-html';
import { paperForFormat, resolveReceiptFormat } from '@/lib/pos/receipt-format';
import { apiClient } from '@/lib/api/client';
import type { PrinterProfile } from '@/lib/api/settings';
import { useTenantBranding } from '@/providers/tenant-branding-provider';

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
  /** Additional order costs (packaging/service/shipping) included in total_amount. */
  charges_total?: number;
  /** Named breakdown behind charges_total (packaging/service/shipping…) for itemised rows. */
  charges?: Record<string, number>;
  /** Ceiling round-off added so total_amount is a whole number. */
  round_off?: number;
  total_amount: number;
  payment_method: string;
  /** When the shown payment settled (ISO) — retail prints it beside the method. */
  payment_date?: string;
  amount_paid?: number;
  /** total − paid: positive = still owed (on account), negative = customer credit. */
  balance_due?: number;
  amount_tendered: number;
  change_due: number;
  /** Outlet use case ("retail", "hospitality", …) — content hints only; layout is `layout`. */
  use_case?: string;
  /** Server-resolved receipt layout id (outlet receipt_format setting via pos-api's
   *  printing/layouts registry): thermal_classic | thermal_modern | a4_invoice. Old
   *  offline-cached payloads may lack it — resolveReceiptFormat falls back safely. */
  layout?: string;
  /** Receipt & Printing "show logo" setting (default true). */
  show_logo?: boolean;
  /** Code 128 barcode (data: URI) from pos-api — the eTIMS CU Invoice Number once
   *  fiscalised, else the order number for non-fiscalised retail sales (server
   *  ReceiptView.FiscalBarcodeValue — one decision, every surface). */
  barcode_png?: string;
  /** The human-readable text under the barcode (and the value it encodes) — mirrors barcode_png. */
  barcode_value?: string;
  /** Guest/payer name for identified payments (M-Pesa/card/online), or "Walk-in customer" for cash. */
  bill_to?: string;
  /** Label for bill_to: "Customer" (keyed-in / walk-in) or "Paid by" (online-payment payer). */
  bill_to_label?: string;
  /** Staff display name/email shown as "Served by" — from the pos-api receipt endpoint's `served_by`. */
  served_by?: string;
  /** Platform-owner (Codevertex) advertisement lines from the pos-api receipt endpoint. */
  provider_footer_lead?: string;
  provider_footer_contact?: string;
  currency?: string;
  etims_invoice_number?: string;
  /** KRA verification LINK — never usable as an <img src>; the QR IMAGE is etims_qr_png. */
  etims_qr_code_url?: string;
  /** Server-rendered eTIMS verification QR as a data: URI — the only field renderers should
   *  use as the QR <img src>. Populated whenever etims_qr_code_url is set. */
  etims_qr_png?: string;
  // Full KRA eTIMS fiscal identity (populated by the pos-api receipt endpoint from the order's
  // treasury-backfilled fiscal fields) — a compliant ETR receipt needs the CU invoice no + SCU
  // id + KRA PIN (shown in the header), not just the invoice number + QR. etims_rcpt_sign is
  // deliberately NEVER rendered in plain text (it's already encoded in the QR).
  etims_scu_id?: string;
  etims_cu_inv_no?: string;
  etims_rcpt_sign?: string;
  etims_kra_pin?: string;
  // outlet + configurable receipt settings (populated by the pos-api receipt endpoint from OutletSetting)
  outlet_name?: string;
  outlet_address?: string;
  /** Formatted labeled phones ("AIRTEL +2547… · MTN +2567…") — printed as "Mobile: …". */
  outlet_phones?: string;
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
            // Enqueued only — the on-site agent still has to actually reach the printer, which
            // is where the real failures happen (bad printer name/IP, offline agent). Don't
            // over-claim "printed" for a job we haven't confirmed left the queue.
            toast.success('Receipt queued for printing.');
            return;
          }
        }
        const ok = await printToProfile(true);
        if (ok) {
          toast.success('Receipt sent to the printer.');
          return;
        }
        // Print agent / QZ unreachable or failed — never leave the cashier with nothing to hand
        // the customer. Fall back to the browser print dialog (any locally reachable printer)
        // while the on-site print-agent/hardware issue is diagnosed.
        toast.error('Printer unreachable — opening browser print instead.');
        openBrowserReceiptWindow(node);
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
    // Paper follows the outlet's resolved receipt layout (server `layout`, safe thermal
    // fallback) — thermal by default; the A4 sheet only when a4_invoice is configured.
    printReceiptDocument(buildReceiptDocument(
      `Receipt ${receipt.order_number}`,
      node.innerHTML,
      paperForFormat(resolveReceiptFormat(receipt)),
    ));
  };

  const handlePrint = () => {
    setPrinting(true);
    openReceiptPrintWindow();
    setTimeout(() => setPrinting(false), 1000);
  };

  // Real PDF: when online, download the server-rendered application/pdf (same layouts
  // registry as the printed receipt — fpdf output, not a print-to-PDF approximation).
  // Offline (or on any failure) fall back to the browser print window, whose Save-as-PDF
  // destination still yields a usable PDF — the offline-first path keeps working.
  const handleDownloadPDF = () => {
    if (tenantId && orderId && (typeof navigator === 'undefined' || navigator.onLine)) {
      void apiClient
        .getBlob(`/api/v1/${tenantId}/pos/orders/${orderId}/receipt`, { format: 'pdf' })
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `receipt-${receipt.order_number}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        })
        .catch(() => openBrowserReceiptWindow());
      return;
    }
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

      {/* Modal overlay — ABOVE any hosting modal (SellDetailsModal & friends sit at z-50):
          the preview is always the top-most layer, with its own blurred backdrop so it reads
          as a distinct sheet instead of colliding with the host modal's header. */}
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
        <div
          className="bg-card rounded-2xl border border-border w-full max-w-sm max-h-[92vh] shadow-2xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
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
            {logoUrl && receipt.show_logo !== false && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="logo" className="mx-auto mb-2 max-h-16 object-contain grayscale" />
            )}
            {tenantName && (
              <p className="text-center font-semibold text-sm mb-1">{tenantName}</p>
            )}
            {(() => {
              const outlet = outletName || receipt.outlet_name;
              // Hide the outlet line when it just repeats the tenant name (avoids the duplicate).
              if (!outlet || outlet.trim().toLowerCase() === (tenantName ?? '').trim().toLowerCase()) return null;
              return <p className="text-center text-muted-foreground mb-1">{outlet}</p>;
            })()}
            {/* KRA PIN — always in the header (top), mirroring the KRA-issued paper ETR receipt. */}
            {receipt.etims_kra_pin && (
              <p className="text-center text-muted-foreground mb-1">KRA PIN: {receipt.etims_kra_pin}</p>
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

            {/* Line items + totals + payment + eTIMS + HOW TO PAY + footer — one shared row list
                (buildReceiptRows) so this on-screen card can never drift from the printed receipt. */}
            {buildReceiptRows(receipt).map((row, i) => {
              switch (row.kind) {
                case 'line':
                  return (
                    <div key={i} className="flex justify-between py-0.5">
                      <span className="flex-1 truncate pr-2">
                        {row.name} ×{row.quantity}
                        {row.modifiers ? ` (${row.modifiers})` : ''}
                      </span>
                      <span className="shrink-0">{row.free ? 'Free' : formatCurrency(row.total)}</span>
                    </div>
                  );
                case 'divider':
                  return <div key={i} className="border-t border-dashed border-border my-2" />;
                case 'money':
                  return (
                    <div key={i} className={`flex justify-between py-0.5${row.negative ? ' text-green-600' : ''}`}>
                      <span>{row.label}</span>
                      <span>{row.negative ? '-' : ''}{formatCurrency(row.amount)}</span>
                    </div>
                  );
                case 'total':
                  return (
                    <div key={i} className="flex justify-between py-0.5 font-bold text-sm">
                      <span>{row.label}</span>
                      <span>{formatCurrency(row.amount)}</span>
                    </div>
                  );
                case 'payment':
                  return (
                    <div key={i} className="flex justify-between py-0.5">
                      <span className="capitalize">{row.label}</span>
                      <span>{formatCurrency(row.amount)}</span>
                    </div>
                  );
                case 'change':
                  return (
                    <div key={i} className="flex justify-between py-0.5">
                      <span>Change</span>
                      <span>{formatCurrency(row.amount)}</span>
                    </div>
                  );
                case 'etims':
                  // KRA TIMS Details — adapted from the KRA-issued paper ETR receipt: SCU ID
                  // + CU Inv No, then the QR. PIN is in the header (top); the signature is
                  // never shown in plain text (it's already encoded in the QR).
                  return (
                    <div key={i} className="text-center text-muted-foreground text-[10px] leading-tight">
                      <p className="font-semibold text-foreground">KRA TIMS Details</p>
                      {row.scuId && <p>SCU ID: {row.scuId}</p>}
                      {(row.cuInvNo || row.invoiceNumber) && <p>CU Inv No: {row.cuInvNo || row.invoiceNumber}</p>}
                      {row.qrUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.qrUrl} alt="eTIMS QR" className="mx-auto mt-1 h-16 w-16" />
                      )}
                    </div>
                  );
                case 'how-to-pay-title':
                  return <p key={i} className="text-center font-semibold text-[10px] mb-1">HOW TO PAY</p>;
                case 'payment-method':
                  return (
                    <div key={i} className="flex justify-between py-0.5 text-[10px]">
                      <span>{row.label}</span>
                      <span className="font-semibold">{row.value}</span>
                    </div>
                  );
                case 'payment-account-name':
                  return <p key={i} className="text-center text-muted-foreground text-[10px]">{row.text}</p>;
                case 'served-by':
                  return <p key={i} className="text-center text-muted-foreground mt-2">Served by: {row.name}</p>;
                case 'customer':
                  return (
                    <div key={i} className="flex justify-between py-0.5">
                      <span>{row.label}</span>
                      <span className="font-semibold">{row.name}</span>
                    </div>
                  );
                case 'barcode':
                  return (
                    <div key={i} className="mt-2 text-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={row.src} alt="barcode" className="mx-auto h-10 object-contain" />
                      <p className="text-[10px] tracking-widest">{row.text}</p>
                    </div>
                  );
                case 'footer':
                  return (
                    <p key={i} className="text-center text-muted-foreground mt-2 text-[10px] whitespace-pre-wrap">
                      {row.text}
                    </p>
                  );
                case 'provider': {
                  // The contact string is "website · email · phone" joined; on the narrow card that
                  // single line wraps unevenly. Split it and render each part on its own centered
                  // line so the three pieces stay balanced regardless of width.
                  const contactParts = row.contact
                    .split('·')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  return (
                    <div
                      key={i}
                      className="mt-3 flex flex-col items-center gap-1.5 rounded-xl border border-primary/20 bg-gradient-to-b from-primary/5 to-transparent px-3 py-3"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <Sparkles className="h-3 w-3 shrink-0 text-primary" />
                        <p className="text-center text-[10px] font-bold leading-snug tracking-wide text-foreground whitespace-pre-wrap">
                          {row.lead}
                        </p>
                        <Sparkles className="h-3 w-3 shrink-0 text-primary" />
                      </div>
                      <div className="flex flex-col items-center gap-0.5">
                        {contactParts.map((part, pi) => (
                          <p key={pi} className="text-center text-[9px] leading-tight text-muted-foreground">
                            {part}
                          </p>
                        ))}
                      </div>
                    </div>
                  );
                }
                default:
                  return null;
              }
            })}
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

