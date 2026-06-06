'use client';

import '@/styles/receipt.css';
import type { ReceiptData } from './receipt-preview';

interface ReceiptPrintProps {
  receipt: ReceiptData;
  outletName?: string;
  tenantName?: string;
  tenantAddress?: string;
  tenantPhone?: string;
  tenantPin?: string; // KRA PIN for eTIMS
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
  paymentMethods,
}: ReceiptPrintProps) {
  const currency = receipt.currency || 'KES';
  const fmt = (n: number) => `${currency} ${n.toFixed(2)}`;
  const resolvedOutlet = outletName || receipt.outlet_name;
  const vatRate = receipt.vat_rate ?? 16;
  const showVat = receipt.vat_enabled !== false && receipt.tax_amount > 0;
  const footerText = receipt.receipt_footer || 'Thank you for your business!';
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
      {/* Header / branding */}
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
      {(tenantAddress || receipt.outlet_address) && (
        <p className="receipt-center receipt-small">{tenantAddress || receipt.outlet_address}</p>
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
      {receipt.cashier_name && (
        <p className="receipt-center receipt-small">Served by: {receipt.cashier_name}</p>
      )}

      <hr className="receipt-divider" />

      {/* Line items */}
      {receipt.lines.map((line, i) => (
        <div key={i}>
          <div className="receipt-row">
            <span className="receipt-row-name">
              {line.name}{line.modifiers ? ` (${line.modifiers})` : ''}
            </span>
            <span className="receipt-row-value">{fmt(line.total_price)}</span>
          </div>
          {line.quantity !== 1 && (
            <div className="receipt-small" style={{ paddingLeft: 8 }}>
              {line.quantity} × {fmt(line.unit_price)}
            </div>
          )}
        </div>
      ))}

      <hr className="receipt-divider" />

      {/* Totals */}
      <div className="receipt-row">
        <span className="receipt-row-name">Subtotal</span>
        <span className="receipt-row-value">{fmt(receipt.subtotal)}</span>
      </div>
      {showVat && (
        <div className="receipt-row">
          <span className="receipt-row-name">VAT ({vatRate}%)</span>
          <span className="receipt-row-value">{fmt(receipt.tax_amount)}</span>
        </div>
      )}
      {receipt.discount_amount > 0 && (
        <div className="receipt-row">
          <span className="receipt-row-name">Discount</span>
          <span className="receipt-row-value">-{fmt(receipt.discount_amount)}</span>
        </div>
      )}

      <div className="receipt-row receipt-total-row">
        <span className="receipt-row-name">TOTAL</span>
        <span className="receipt-row-value">{fmt(receipt.total_amount)}</span>
      </div>

      <hr className="receipt-divider" style={{ marginTop: 4 }} />

      {/* Payment */}
      <div className="receipt-row">
        <span className="receipt-row-name" style={{ textTransform: 'capitalize' }}>
          {(receipt.payment_method ?? 'cash').replace(/_/g, ' ')}
        </span>
        <span className="receipt-row-value">{fmt(receipt.amount_tendered)}</span>
      </div>
      {receipt.change_due > 0 && (
        <div className="receipt-row">
          <span className="receipt-row-name">Change</span>
          <span className="receipt-row-value">{fmt(receipt.change_due)}</span>
        </div>
      )}

      {/* eTIMS compliance section */}
      {receipt.etims_invoice_number && (
        <>
          <hr className="receipt-divider" style={{ marginTop: 6 }} />
          <p className="receipt-center receipt-small" style={{ marginBottom: 2 }}>
            KRA eTIMS Invoice
          </p>
          <p className="receipt-center receipt-small">
            CU#: {receipt.etims_invoice_number}
          </p>
          {receipt.etims_qr_code_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={receipt.etims_qr_code_url}
              alt="eTIMS QR Code"
              className="receipt-qr"
            />
          )}
        </>
      )}

      {/* Payment methods HOW TO PAY section */}
      {paymentMethods && Object.values(paymentMethods).some(Boolean) && (
        <>
          <hr className="receipt-divider" style={{ marginTop: 6 }} />
          <p className="receipt-center receipt-bold" style={{ fontSize: 10, marginBottom: 3 }}>
            HOW TO PAY
          </p>
          {paymentMethods.mpesa_paybill && (
            <div className="receipt-row" style={{ fontSize: 10 }}>
              <span className="receipt-row-name">M-PESA Paybill</span>
              <span className="receipt-row-value receipt-bold">{paymentMethods.mpesa_paybill}</span>
            </div>
          )}
          {paymentMethods.mpesa_account_reference && (
            <div className="receipt-row" style={{ fontSize: 10 }}>
              <span className="receipt-row-name">Account No.</span>
              <span className="receipt-row-value receipt-bold">{paymentMethods.mpesa_account_reference}</span>
            </div>
          )}
          {paymentMethods.airtel_money_number && (
            <div className="receipt-row" style={{ fontSize: 10 }}>
              <span className="receipt-row-name">Airtel Money</span>
              <span className="receipt-row-value receipt-bold">{paymentMethods.airtel_money_number}</span>
            </div>
          )}
          {paymentMethods.bank_account_number && (
            <div className="receipt-row" style={{ fontSize: 10 }}>
              <span className="receipt-row-name">{paymentMethods.bank_name || 'Bank'}</span>
              <span className="receipt-row-value receipt-bold">{paymentMethods.bank_account_number}</span>
            </div>
          )}
          {paymentMethods.bank_account_name && (
            <p className="receipt-center receipt-small">{paymentMethods.bank_account_name}</p>
          )}
        </>
      )}

      <hr className="receipt-divider" style={{ marginTop: 6 }} />
      <p className="receipt-center" style={{ marginTop: 4, marginBottom: 2, fontSize: 10, whiteSpace: 'pre-wrap' }}>
        {footerText}
      </p>
    </div>
  );
}
