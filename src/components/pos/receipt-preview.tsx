'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/base';
import { Printer, Download, X } from 'lucide-react';

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
  etims_invoice_number?: string;
  etims_qr_code_url?: string;
}

interface ReceiptPreviewProps {
  receipt: ReceiptData | null;
  open: boolean;
  onClose: () => void;
  outletName?: string;
  tenantName?: string;
}

export function ReceiptPreview({ receipt, open, onClose, outletName, tenantName }: ReceiptPreviewProps) {
  const [printing, setPrinting] = useState(false);

  if (!receipt || !open) return null;

  const handlePrint = () => {
    setPrinting(true);
    window.print();
    setTimeout(() => setPrinting(false), 1000);
  };

  const handleDownloadPDF = async () => {
    // Calls pos-api GET /{tenant}/pos/orders/{orderID}/receipt?format=pdf
    try {
      const link = document.createElement('a');
      link.href = `${window.location.origin}/api/receipt/${receipt.order_number}?format=pdf`;
      link.download = `receipt-${receipt.order_number}.html`;
      link.click();
    } catch {
      // If API download fails, fall back to print
      handlePrint();
    }
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
      {/* Print-specific styles injected via a style tag */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #receipt-print-content { display: block !important; position: fixed; top: 0; left: 0; width: 100%; }
        }
        #receipt-print-content { display: none; }
      `}</style>

      {/* Hidden printable version */}
      <div id="receipt-print-content">
        <PrintableReceipt receipt={receipt} outletName={outletName} tenantName={tenantName} />
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
            {tenantName && (
              <p className="text-center font-semibold text-sm mb-1">{tenantName}</p>
            )}
            {outletName && (
              <p className="text-center text-muted-foreground mb-1">{outletName}</p>
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
                <span className="shrink-0">{formatCurrency(line.total_price)}</span>
              </div>
            ))}

            <div className="border-t border-dashed border-border my-2" />

            <div className="flex justify-between py-0.5">
              <span>Subtotal</span>
              <span>{formatCurrency(receipt.subtotal)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span>Tax (16%)</span>
              <span>{formatCurrency(receipt.tax_amount)}</span>
            </div>
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
              <span className="capitalize">{receipt.payment_method.replace(/_/g, ' ')}</span>
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

            {receipt.cashier_name && (
              <p className="text-center text-muted-foreground mt-2">
                Served by: {receipt.cashier_name}
              </p>
            )}
            <p className="text-center text-muted-foreground mt-2 text-[10px]">
              Thank you for your business!
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

// PrintableReceipt renders a clean monospace receipt for window.print()
function PrintableReceipt({
  receipt,
  outletName,
  tenantName,
}: {
  receipt: ReceiptData;
  outletName?: string;
  tenantName?: string;
}) {
  const formatCurrency = (amount: number) => `KES ${amount.toFixed(2)}`;
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString('en-KE');

  return (
    <div style={{ fontFamily: 'monospace', fontSize: 12, maxWidth: 300, margin: '0 auto', padding: 8 }}>
      {tenantName && (
        <p style={{ textAlign: 'center', fontWeight: 'bold', margin: '0 0 4px' }}>{tenantName}</p>
      )}
      {outletName && (
        <p style={{ textAlign: 'center', margin: '0 0 4px' }}>{outletName}</p>
      )}
      <p style={{ textAlign: 'center', margin: '0 0 8px' }}>{formatDate(receipt.issued_at)}</p>
      <hr style={{ border: 'none', borderTop: '1px dashed #000', margin: '4px 0' }} />
      <p style={{ textAlign: 'center' }}>Order: {receipt.order_number}</p>
      <hr style={{ border: 'none', borderTop: '1px dashed #000', margin: '4px 0' }} />
      {receipt.lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>
            {l.name} ×{l.quantity}
          </span>
          <span>{formatCurrency(l.total_price)}</span>
        </div>
      ))}
      <hr style={{ border: 'none', borderTop: '1px dashed #000', margin: '4px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Subtotal</span>
        <span>{formatCurrency(receipt.subtotal)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Tax</span>
        <span>{formatCurrency(receipt.tax_amount)}</span>
      </div>
      <hr style={{ border: 'none', borderTop: '1px dashed #000', margin: '4px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
        <span>TOTAL</span>
        <span>{formatCurrency(receipt.total_amount)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{receipt.payment_method}</span>
        <span>{formatCurrency(receipt.amount_tendered)}</span>
      </div>
      {receipt.change_due > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Change</span>
          <span>{formatCurrency(receipt.change_due)}</span>
        </div>
      )}
      {receipt.etims_invoice_number && (
        <>
          <hr style={{ border: 'none', borderTop: '1px dashed #000', margin: '4px 0' }} />
          <p style={{ textAlign: 'center', fontSize: 10 }}>eTIMS: {receipt.etims_invoice_number}</p>
        </>
      )}
      <p style={{ textAlign: 'center', marginTop: 8, fontSize: 10 }}>Thank you!</p>
    </div>
  );
}
