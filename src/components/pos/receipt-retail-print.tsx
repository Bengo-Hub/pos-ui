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

const cellBorder = '1.5px solid #000';
const th: CSSProperties = { border: cellBorder, padding: '3px 7px', fontWeight: 700, textAlign: 'left', fontSize: 12 };
const td: CSSProperties = { border: cellBorder, padding: '3px 7px', fontSize: 12 };
const trowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '1px 2px', fontSize: 12 };

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
    <div key={key ?? label} style={{ ...trowStyle, fontWeight: bold ? 700 : 400 }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Times New Roman', Georgia, serif", color: '#000', background: '#fff', fontSize: 12, maxWidth: '186mm', margin: '0 auto' }}>
      {/* Boxed business header */}
      <div style={{ border: cellBorder, padding: '5px 10px', textAlign: 'center' }}>
        {logoUrl && receipt.show_logo !== false && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="logo" style={{ display: 'block', margin: '2px auto', maxHeight: '20mm', maxWidth: '55mm', objectFit: 'contain' }} />
        )}
        <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: 0.5 }}>{bizName}</div>
        {receipt.outlet_address && <div style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{receipt.outlet_address.toUpperCase()}</div>}
        {receipt.receipt_header && <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'pre-wrap' }}>{receipt.receipt_header}</div>}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #000', padding: '4px 2px', fontSize: 11, marginTop: 3 }}>
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
      </div>

      {/* Barcode */}
      {receipt.barcode_png && (
        <div style={{ textAlign: 'center', margin: '12px 0 4px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={receipt.barcode_png} alt="barcode" style={{ height: '13mm' }} />
          <div style={{ fontSize: 11, letterSpacing: 2, marginTop: 1 }}>{receipt.order_number}</div>
        </div>
      )}

      {/* Configurable footer text — flows below the barcode ("IN GOD WE TRUST" position). */}
      <div style={{ fontSize: 12, margin: '10px 0 4px', whiteSpace: 'pre-wrap' }}>
        {(receipt.receipt_footer || 'Thank you for your business!').toUpperCase()}
      </div>

      {/* Provider advertisement — deliberately smaller than everything above. */}
      <div style={{ fontSize: 8, textAlign: 'center', marginTop: 8, lineHeight: 1.4 }}>
        <b>{receipt.provider_footer_lead || 'Developed & maintained by Codevertex Africa Limited'}</b>
        <br />
        {receipt.provider_footer_contact || 'www.codevertexitsolutions.com · info@codevertexitsolutions.com · +254 742 201 368'}
      </div>
    </div>
  );
}
