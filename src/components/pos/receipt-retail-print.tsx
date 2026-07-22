'use client';

/**
 * RetailReceiptPrint — the boxed invoice-style receipt for `retail` outlets (BOI/GoDigital
 * design), mirroring pos-api's generateRetailReceiptHTML: boxed business header, a
 * Customer | INVOICE.NO | DATE table, SERVED BY line, bordered items table, totals block
 * (counts, discount/tax/charges breakdown, payment method with settle date, AMOUNT PAID,
 * balance due), the Code 128 barcode of the order number, the configurable footer text and
 * a deliberately smaller provider advertisement.
 *
 * Styles are INLINE so the markup prints identically from the hidden #receipt-print-root
 * and from the standalone print window (which only carries the thermal CSS).
 */

import type { CSSProperties } from 'react';
import type { ReceiptData } from './receipt-preview';
import { buildReceiptRows } from '@/lib/pos/receipt-rows';

interface RetailReceiptPrintProps {
  receipt: ReceiptData;
  tenantName?: string;
  outletName?: string;
  logoUrl?: string;
}

const money = (currency: string | undefined, v: number) => {
  const unit = !currency || currency.toUpperCase() === 'KES' ? 'KSh' : currency;
  const opts = Number.isInteger(v) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  const abs = Math.abs(v).toLocaleString('en-KE', opts);
  return `${unit} ${v < 0 ? '-' : ''}${abs}`;
};
const amt = (v: number) =>
  v.toLocaleString('en-KE', Number.isInteger(v) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ddmmyyyy = (iso: string, withTime = false) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB').replace(/\//g, '-');
  if (!withTime) return date;
  return `${date} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

// Typography mirrors pos-api generateRetailReceiptHTML: Helvetica Neue sans stack, >=13px,
// medium (500) baseline — thin 12px Times strokes printed almost invisibly on low-quality
// office printers (the "barely visible receipt" complaint).
const RETAIL_FONT_STACK = "'Helvetica Neue', Helvetica, Arial, 'Segoe UI', sans-serif";
const cellBorder = '2px solid #000';
const th: CSSProperties = { border: cellBorder, padding: '3px 7px', fontWeight: 700, textAlign: 'left', fontSize: 13 };
const td: CSSProperties = { border: cellBorder, padding: '3px 7px', fontSize: 13, fontWeight: 500 };
const trowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '1px 2px', fontSize: 13 };

export function RetailReceiptPrint({ receipt, tenantName, outletName, logoUrl }: RetailReceiptPrintProps) {
  const currency = receipt.currency || 'KES';
  const bizName = (outletName || receipt.outlet_name || tenantName || 'RECEIPT').toUpperCase();
  const billLabel = receipt.bill_to_label || 'Customer';
  const totalQty = receipt.lines.reduce((s, l) => s + l.quantity, 0);
  const methodLabel = (() => {
    const m = (receipt.payment_method || '').replace(/_/g, ' ').trim();
    if (!m) return '';
    const cap = m.charAt(0).toUpperCase() + m.slice(1);
    return receipt.payment_date ? `${cap} (${ddmmyyyy(receipt.payment_date)})` : cap;
  })();
  const chargeEntries = Object.entries(receipt.charges ?? {}).filter(([, v]) => v > 0).sort(([a], [b]) => a.localeCompare(b));

  const trow = (label: string, value: string, bold = false, key?: string) => (
    <div key={key ?? label} style={{ ...trowStyle, fontWeight: bold ? 700 : 500 }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <div style={{ fontFamily: RETAIL_FONT_STACK, color: '#000', background: '#fff', fontSize: 13, fontWeight: 500, maxWidth: '186mm', margin: '0 auto' }}>
      {/* Boxed business header */}
      <div style={{ border: cellBorder, padding: '5px 10px', textAlign: 'center' }}>
        {logoUrl && receipt.show_logo !== false && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="logo" style={{ display: 'block', margin: '2px auto', maxHeight: '20mm', maxWidth: '55mm', objectFit: 'contain' }} />
        )}
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 0.5 }}>{bizName}</div>
        {receipt.outlet_address && <div style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{receipt.outlet_address.toUpperCase()}</div>}
        {receipt.outlet_phones && (
          <div style={{ fontSize: 12 }}><b>Mobile:</b> {receipt.outlet_phones}</div>
        )}
        {receipt.outlet_email && (
          <div style={{ fontSize: 12 }}><b>Email:</b> {receipt.outlet_email}</div>
        )}
        {/* KRA PIN — always in the header (top), mirroring the KRA-issued paper ETR receipt. */}
        {receipt.etims_kra_pin && (
          <div style={{ fontSize: 12, fontWeight: 700 }}>KRA PIN: {receipt.etims_kra_pin}</div>
        )}
        {receipt.receipt_header && <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'pre-wrap' }}>{receipt.receipt_header}</div>}
      </div>

      {/* Customer | INVOICE.NO | DATE */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 5 }}>
        <tbody>
          <tr>
            <th style={{ ...th, width: '45%' }}>{billLabel}</th>
            <th style={{ ...th, width: '22%', textAlign: 'center' }}>INVOICE.NO</th>
            <th style={{ ...th, textAlign: 'center' }}>DATE</th>
          </tr>
          <tr>
            <td style={{ ...td, fontWeight: 700 }}>{(receipt.bill_to || 'Walk-in customer').toUpperCase()}</td>
            <td style={{ ...td, textAlign: 'center' }}>{receipt.order_number}</td>
            <td style={{ ...td, textAlign: 'center' }}>{ddmmyyyy(receipt.issued_at, true)}</td>
          </tr>
        </tbody>
      </table>

      {/* SERVED BY */}
      {receipt.served_by && (
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1.5px solid #000', padding: '4px 2px', fontSize: 12, marginTop: 3 }}>
          <b>SERVED BY</b>
          <span>{receipt.served_by}</span>
        </div>
      )}

      {/* Items */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 5 }}>
        <tbody>
          <tr>
            <th style={th}>Item Name</th>
            <th style={{ ...th, width: '13%', textAlign: 'center' }}>Qty</th>
            <th style={{ ...th, width: '18%', textAlign: 'right' }}>Price</th>
            <th style={{ ...th, width: '20%', textAlign: 'right' }}>Subtotal</th>
          </tr>
          {receipt.lines.map((l, i) => (
            <tr key={i}>
              <td style={td}>{(l.name || l.sku).toUpperCase()}{l.modifiers ? ` (${l.modifiers})` : ''}</td>
              <td style={{ ...td, textAlign: 'center' }}>{l.quantity}</td>
              <td style={{ ...td, textAlign: 'right' }}>{l.total_price === 0 ? 'FREE' : amt(l.unit_price)}</td>
              <td style={{ ...td, textAlign: 'right' }}>{l.total_price === 0 ? 'FREE' : amt(l.total_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals block */}
      <div style={{ marginTop: 7 }}>
        {trow('Total Quantity', String(totalQty))}
        {trow('TOTAL ITEMS', String(receipt.lines.length))}
        {trow('Subtotal:', money(currency, receipt.subtotal), true)}
        {receipt.discount_amount > 0 && trow('Discount(-):', `-${money(currency, receipt.discount_amount)}`)}
        {(receipt.vat_enabled !== false && receipt.tax_amount > 0) &&
          trow(`VAT ${receipt.vat_rate ?? 16}%(+):`, money(currency, receipt.tax_amount))}
        {chargeEntries.map(([k, v]) => trow(`${k.charAt(0).toUpperCase()}${k.slice(1)}(+):`, money(currency, v), false, `charge-${k}`))}
        {chargeEntries.length === 0 && (receipt.charges_total ?? 0) > 0 && trow('Charges(+):', money(currency, receipt.charges_total ?? 0))}
        {(receipt.round_off ?? 0) > 0 && trow('Round Off:', money(currency, receipt.round_off ?? 0))}
        {trow('TOTAL:', money(currency, receipt.total_amount), true)}
        {methodLabel && (receipt.amount_paid ?? receipt.amount_tendered) > 0 &&
          trow(methodLabel, money(currency, receipt.amount_paid ?? receipt.amount_tendered))}
        {trow('AMOUNT PAID', money(currency, receipt.amount_paid ?? receipt.amount_tendered))}
        {receipt.change_due > 0 && trow('Change', money(currency, receipt.change_due))}
        {Math.abs(receipt.balance_due ?? 0) >= 0.005 && trow('Total Due with Current', money(currency, receipt.balance_due ?? 0))}
        {receipt.customer_account_balance != null &&
          trow(receipt.customer_account_balance_label ?? 'Account Balance', money(currency, receipt.customer_account_balance))}
      </div>

      {/* HOW TO PAY + KRA TIMS Details + fiscal barcode — driven by the SAME shared row
          builder every other layout uses (buildReceiptRows), so this A4 template can never
          drift out of sync on content: it previously carried NO eTIMS/HOW-TO-PAY section at
          all. Only these three row kinds are handled here — items/totals/payment above are
          already rendered by this template's own boxed tables. */}
      {buildReceiptRows(receipt).map((row, i) => {
        switch (row.kind) {
          case 'how-to-pay-title':
            return (
              <p key={i} style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, margin: '10px 0 3px' }}>
                HOW TO PAY
              </p>
            );
          case 'payment-method':
            return (
              <div key={i} style={{ ...trowStyle, fontWeight: 500 }}>
                <span>{row.label}</span>
                <span style={{ fontWeight: 700 }}>{row.value}</span>
              </div>
            );
          case 'payment-account-name':
            return <p key={i} style={{ textAlign: 'center', fontSize: 12 }}>{row.text}</p>;
          case 'etims':
            // KRA TIMS Details — adapted from the KRA-issued paper ETR receipt (see the
            // Jazaribu Retail reference): SCU ID + CU Inv No, then the QR. The KRA PIN is in
            // the header (above); the signature is never shown in plain text.
            return (
              <div key={i} style={{ textAlign: 'center', marginTop: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>KRA TIMS Details</div>
                {row.scuId && <div style={{ fontSize: 12 }}><b>SCU ID:</b> {row.scuId}</div>}
                <div style={{ fontSize: 12 }}><b>CU_Inv No.:</b> {row.cuInvNo || row.invoiceNumber}</div>
                {row.qrUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.qrUrl} alt="eTIMS QR" style={{ height: '32mm', marginTop: 4 }} />
                )}
              </div>
            );
          case 'barcode':
            return (
              <div key={i} style={{ textAlign: 'center', margin: '12px 0 4px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={row.src} alt="barcode" style={{ height: '13mm' }} />
                <div style={{ fontSize: 12, letterSpacing: 2, marginTop: 1 }}>{row.text}</div>
              </div>
            );
          default:
            return null;
        }
      })}

      {/* Configurable footer text — flows below the barcode ("IN GOD WE TRUST" position). */}
      <div style={{ fontSize: 13, margin: '10px 0 4px', whiteSpace: 'pre-wrap' }}>
        {(receipt.receipt_footer || 'Thank you for your business!').toUpperCase()}
      </div>

      {/* Provider advertisement — smaller than everything above, but never sub-9px
          (that vanishes on low-quality printers). */}
      <div style={{ fontSize: 10, textAlign: 'center', marginTop: 8, lineHeight: 1.4 }}>
        <b>{receipt.provider_footer_lead || 'Developed & maintained by Codevertex Africa Limited'}</b>
        <br />
        {receipt.provider_footer_contact || 'www.codevertexitsolutions.com · info@codevertexitsolutions.com · +254 742 201 368'}
      </div>
    </div>
  );
}
