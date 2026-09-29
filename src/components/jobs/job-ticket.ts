import { buildReceiptDocument, printReceiptDocument } from '@/lib/pos/receipt-html';
import { resolveMediaUrl } from '@/lib/screensaver';
import { formatCurrency } from '@/lib/utils';
import { jobHeaderOf, stageLabel, type ServiceProfile } from '@/lib/api/service-jobs';

/** The order fields the job ticket reads (a POSOrder from GET /pos/orders/{id}). */
export interface JobTicketOrder {
  order_number: string;
  created_at?: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  total_amount?: number;
  paid_total?: number;
  currency?: string;
  metadata?: Record<string, unknown> | null;
  edges?: {
    lines?: {
      name?: string;
      quantity?: number;
      unit_price?: number;
      total_price?: number;
      metadata?: Record<string, unknown> | null;
    }[];
  };
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';

/**
 * The job ticket reception hands the customer (and pins to the job): what was ordered from the
 * catalog, the spec sheet per item, the instructions and reference media, the due date, and the
 * payment position (total, paid so far, balance to pay at collection).
 */
export function buildJobTicketHtml(order: JobTicketOrder, profile: ServiceProfile | null, businessName?: string): string {
  const job = jobHeaderOf(order) ?? {};
  const currency = order.currency || 'KES';
  const total = order.total_amount ?? 0;
  const paid = order.paid_total ?? 0;
  const balance = Math.max(0, total - paid);
  const specLabels = new Map((profile?.spec_fields ?? []).map((f) => [f.key, f.label]));
  const title = (profile?.job_label || 'Job').toUpperCase();

  const lines = (order.edges?.lines ?? []).map((l) => {
    const specs = (l.metadata?.job_specs ?? {}) as Record<string, string>;
    const specRows = Object.entries(specs)
      .map(([k, v]) => `<div class="small">${esc(specLabels.get(k) ?? k)}: ${esc(v)}</div>`)
      .join('');
    return (
      `<div class="row"><span>${esc(l.quantity ?? 1)} x ${esc(l.name)}</span>` +
      `<span>${esc(formatCurrency(l.total_price ?? (l.unit_price ?? 0) * (l.quantity ?? 1), currency))}</span></div>${specRows}`
    );
  }).join('');

  const attachments = (job.attachments ?? [])
    .map((a) => `<div class="small">${a.kind === 'file' ? 'File' : 'Link'}: ${esc(a.label || '')} ${esc(resolveMediaUrl(a.url))}</div>`)
    .join('');

  return `
    <div class="receipt">
      ${businessName ? `<div class="center bold">${esc(businessName)}</div>` : ''}
      <div class="center bold">${esc(title)} TICKET</div>
      <div class="center">#${esc(order.order_number)}</div>
      <hr/>
      <div class="small">Date: ${esc(fmtDate(order.created_at))}</div>
      ${order.customer_name ? `<div class="small">Customer: ${esc(order.customer_name)}</div>` : ''}
      ${order.customer_phone ? `<div class="small">Phone: ${esc(order.customer_phone)}</div>` : ''}
      ${job.due_at ? `<div class="bold">Ready by: ${esc(fmtDate(job.due_at))}</div>` : ''}
      ${job.stage ? `<div class="small">Stage: ${esc(stageLabel(profile, job.stage))}</div>` : ''}
      <hr/>
      ${lines}
      <hr/>
      ${job.brief ? `<div class="small bold">Instructions</div><div class="small">${esc(job.brief)}</div>` : ''}
      ${job.design_from_scratch ? '<div class="small bold">Design from scratch requested</div>' : ''}
      ${attachments ? `<div class="small bold">Reference media</div>${attachments}` : ''}
      <hr/>
      <div class="row bold"><span>Total</span><span>${esc(formatCurrency(total, currency))}</span></div>
      <div class="row"><span>Paid</span><span>${esc(formatCurrency(paid, currency))}</span></div>
      <div class="row bold"><span>Balance at collection</span><span>${esc(formatCurrency(balance, currency))}</span></div>
      <hr/>
      <div class="center small">Present this ticket when collecting your ${esc((profile?.job_label || 'job').toLowerCase())}.</div>
    </div>
    <style>
      .receipt { font-family: monospace; font-size: 12px; }
      .center { text-align: center; } .bold { font-weight: 700; } .small { font-size: 11px; }
      .row { display: flex; justify-content: space-between; gap: 8px; }
      hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    </style>`;
}

/** Opens the browser print window for the job ticket (thermal width). */
export function printJobTicket(order: JobTicketOrder, profile: ServiceProfile | null, businessName?: string) {
  const html = buildJobTicketHtml(order, profile, businessName);
  printReceiptDocument(buildReceiptDocument(`${profile?.job_label || 'Job'} ${order.order_number}`, html, 'thermal'));
}
