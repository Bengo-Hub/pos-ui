'use client';

import '@/styles/receipt.css';
import type { ReceiptData } from './receipt-preview';
import { RetailReceiptPrint } from './receipt-retail-print';
import { buildReceiptRows } from '@/lib/pos/receipt-rows';

interface ReceiptPrintProps {
  receipt: ReceiptData;
  outletName?: string;
  tenantName?: string;
  tenantAddress?: string;
  tenantPhone?: string;
  tenantPin?: string; // KRA PIN for eTIMS
  /** Tenant logo shown at the top of the receipt. Brand COLOURS are deliberately not used (faint on
   *  thermal printers); the logo is grayscaled via .receipt-logo so it prints crisp. */
  logoUrl?: string;
  paymentMethods?: ReceiptData['payment_methods'];
}

/**
 * Standalone thermal receipt component.
 *
 * Mount it invisible at root level; window.print() will isolate it via
 * #receipt-print-root in receipt.css (@media print).
 *
 * Usage:
 *   <div id="receipt-print-root" style={{ display: 'none' }}>
 *     <ReceiptPrint receipt={receiptData} tenantName="Urban Loft" />
 *   </div>
 */
export function ReceiptPrint({
  receipt,
  outletName,
  tenantName,
  tenantAddress,
  tenantPhone,
  tenantPin,
  logoUrl,
  paymentMethods,
}: ReceiptPrintProps) {
  // Retail outlets print the boxed invoice-style template (BOI/GoDigital design) — one branch
  // here covers every client print path (preview root, print window, OrderPlacedDialog, splits).
  if (receipt.use_case === 'retail') {
    return (
      <RetailReceiptPrint
        receipt={{ ...receipt, payment_methods: paymentMethods ?? receipt.payment_methods }}
        tenantName={tenantName}
        outletName={outletName}
        logoUrl={logoUrl}
      />
    );
  }
  const currency = receipt.currency || 'KES';
  const fmt = (n: number) => `${currency} ${n.toFixed(2)}`;
  const norm = (s?: string) => (s ?? '').trim().toLowerCase();
  const resolvedOutletRaw = outletName || receipt.outlet_name;
  // De-duplicate the branding block: hide the outlet line when it repeats the tenant name, and the
  // address when it repeats either (fixes the same name printing 2-3 times).
  const resolvedOutlet = norm(resolvedOutletRaw) === norm(tenantName) ? undefined : resolvedOutletRaw;
  const resolvedAddressRaw = tenantAddress || receipt.outlet_address;
  const resolvedAddress =
    norm(resolvedAddressRaw) === norm(resolvedOutletRaw) || norm(resolvedAddressRaw) === norm(tenantName)
      ? undefined
      : resolvedAddressRaw;
  const fmtDate = (s: string) =>
    new Date(s).toLocaleString('en-KE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="receipt-root">
      {/* Header / branding — logo only (and only when the receipt "show logo" setting allows) */}
      {logoUrl && receipt.show_logo !== false && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="logo" className="receipt-logo" />
      )}
      {tenantName && (
        <p className="receipt-center receipt-bold" style={{ fontSize: 13, marginBottom: 2 }}>
          {tenantName}
        </p>
      )}
      {resolvedOutlet && (
        <p className="receipt-center" style={{ marginBottom: 1 }}>
          {resolvedOutlet}
        </p>
      )}
      {resolvedAddress && (
        <p className="receipt-center receipt-small">{resolvedAddress}</p>
      )}
      {tenantPhone && (
        <p className="receipt-center receipt-small">Tel: {tenantPhone}</p>
      )}
      {tenantPin && (
        <p className="receipt-center receipt-small">PIN: {tenantPin}</p>
      )}
      {/* Configurable header text from POS settings (slogan, extra address lines…) */}
      {receipt.receipt_header && (
        <p className="receipt-center receipt-small" style={{ whiteSpace: 'pre-wrap', marginTop: 2 }}>
          {receipt.receipt_header}
        </p>
      )}

      <hr className="receipt-divider" style={{ marginTop: 6 }} />

      <p className="receipt-center" style={{ marginBottom: 1 }}>
        <span className="receipt-bold">Receipt #{receipt.receipt_number}</span>
      </p>
      <p className="receipt-center receipt-small">{fmtDate(receipt.issued_at)}</p>

      <hr className="receipt-divider" />

      {/* Line items + totals + payment + eTIMS + HOW TO PAY + served-by + footer — one shared row
          list (buildReceiptRows) so this print output can never drift from the on-screen preview. */}
      {buildReceiptRows({ ...receipt, payment_methods: paymentMethods ?? receipt.payment_methods }).map((row, i) => {
        switch (row.kind) {
          case 'line':
            return (
              <div key={i}>
                <div className="receipt-row">
                  <span className="receipt-row-name">
                    {row.name}{row.modifiers ? ` (${row.modifiers})` : ''}
                  </span>
                  <span className="receipt-row-value">{row.free ? 'FREE' : fmt(row.total)}</span>
                </div>
                {row.quantity !== 1 && (
                  <div className="receipt-small" style={{ paddingLeft: 8 }}>
                    {row.quantity} × {fmt(row.unitPrice)}
                  </div>
                )}
              </div>
            );
          case 'divider':
            return <hr key={i} className="receipt-divider" />;
          case 'money':
            return (
              <div key={i} className="receipt-row">
                <span className="receipt-row-name">{row.label}</span>
                <span className="receipt-row-value">{row.negative ? '-' : ''}{fmt(row.amount)}</span>
              </div>
            );
          case 'total':
            return (
              <div key={i} className="receipt-row receipt-total-row">
                <span className="receipt-row-name">{row.label}</span>
                <span className="receipt-row-value">{fmt(row.amount)}</span>
              </div>
            );
          case 'payment':
            return (
              <div key={i} className="receipt-row">
                <span className="receipt-row-name" style={{ textTransform: 'capitalize' }}>{row.label}</span>
                <span className="receipt-row-value">{fmt(row.amount)}</span>
              </div>
            );
          case 'change':
            return (
              <div key={i} className="receipt-row">
                <span className="receipt-row-name">Change</span>
                <span className="receipt-row-value">{fmt(row.amount)}</span>
              </div>
            );
          case 'etims':
            return (
              <div key={i}>
                <p className="receipt-center receipt-small" style={{ marginBottom: 2 }}>KRA eTIMS Invoice</p>
                <p className="receipt-center receipt-small">CU#: {row.invoiceNumber}</p>
                {row.qrUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.qrUrl} alt="eTIMS QR Code" className="receipt-qr" />
                )}
              </div>
            );
          case 'how-to-pay-title':
            return (
              <p key={i} className="receipt-center receipt-bold" style={{ fontSize: 10, marginBottom: 3 }}>
                HOW TO PAY
              </p>
            );
          case 'payment-method':
            return (
              <div key={i} className="receipt-row" style={{ fontSize: 10 }}>
                <span className="receipt-row-name">{row.label}</span>
                <span className="receipt-row-value receipt-bold">{row.value}</span>
              </div>
            );
          case 'payment-account-name':
            return <p key={i} className="receipt-center receipt-small">{row.text}</p>;
          case 'served-by':
            return <p key={i} className="receipt-center receipt-small">Served by: {row.name}</p>;
          case 'customer':
            return (
              <div key={i} className="receipt-row">
                <span className="receipt-row-name">{row.label}</span>
                <span className="receipt-row-value">{row.name}</span>
              </div>
            );
          case 'barcode':
            return (
              <div key={i} className="receipt-center" style={{ marginTop: 4 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={row.src} alt="barcode" style={{ display: 'block', margin: '0 auto', height: '10mm', maxWidth: '90%' }} />
                <p className="receipt-small" style={{ letterSpacing: 2 }}>{row.text}</p>
              </div>
            );
          case 'footer':
            return (
              <p key={i} className="receipt-center" style={{ marginTop: 4, marginBottom: 2, fontSize: 10, whiteSpace: 'pre-wrap' }}>
                {row.text}
              </p>
            );
          case 'provider':
            return (
              <div key={i} style={{ marginTop: 2 }}>
                <hr className="receipt-divider" />
                <p
                  className="receipt-center receipt-bold"
                  style={{ fontSize: 10.5, letterSpacing: 0.3, marginTop: 2, marginBottom: 1, whiteSpace: 'pre-wrap' }}
                >
                  ★ {row.lead} ★
                </p>
                <p className="receipt-center receipt-small" style={{ fontSize: 8.5, whiteSpace: 'pre-wrap' }}>{row.contact}</p>
                <hr className="receipt-divider" style={{ marginTop: 4 }} />
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
