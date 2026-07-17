'use client';

import { useMemo, useRef, useState } from 'react';
import { Download, FileUp, Loader2, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/base';
import { useAuthStore } from '@/store/auth';
import { useFullCatalog } from '@/hooks/usePOS';
import { usePermissions, P } from '@/hooks/usePermissions';
import { apiClient } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';

/**
 * Sell → Import Sales — bulk-import HISTORICAL sales from a CSV (migration from another
 * POS or spreadsheet records). One CSV row per sale LINE; rows sharing an invoice_no are
 * grouped into one sale. SKUs are resolved against the cached full catalog client-side so
 * unmatched items are visible BEFORE importing. The import is idempotent on invoice_no —
 * re-uploading the same file skips already-imported sales. Imported sales do NOT deduct
 * stock, earn loyalty, or post to treasury (the old system already accounted for them).
 */

interface CsvLine {
  invoiceNo: string;
  date: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: string;
  discount: number;
  note: string;
  sku: string;
  quantity: number;
  unitPrice: number;
}

interface GroupedSale {
  external_ref: string;
  date?: string;
  customer_name?: string;
  customer_phone?: string;
  payment_method?: string;
  discount?: number;
  note?: string;
  lines: { catalog_item_id?: string; sku: string; name: string; quantity: number; unit_price: number; matched: boolean }[];
}

const TEMPLATE_HEADERS = [
  'invoice_no', 'date', 'customer_name', 'customer_phone', 'payment_method',
  'discount', 'note', 'sku', 'quantity', 'unit_price',
];

const TEMPLATE_SAMPLE = [
  ['INV-0001', '2026-06-30', 'John Doe', '0712345678', 'cash', '0', '', 'SKU-001', '2', '500'],
  ['INV-0001', '2026-06-30', 'John Doe', '0712345678', 'cash', '0', '', 'SKU-002', '1', '1200'],
  ['INV-0002', '2026-07-01', '', '', 'mpesa', '100', 'migrated', 'SKU-001', '1', '500'],
];

/** Minimal CSV parser — handles quoted fields with commas and doubled quotes. */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

export default function ImportSalesPage() {
  const outlet = useAuthStore((s) => s.outlet);
  const tenantId = useAuthStore((s) => s.user?.tenant_id ?? '');
  const { can } = usePermissions();
  const canImport = can(P.ORDERS_MANAGE);

  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<CsvLine[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; failed: number; results: any[] } | null>(null);

  const { data: fullCatalog } = useFullCatalog();
  const itemBySku = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const i of fullCatalog ?? []) if (i.sku) m.set(i.sku.toLowerCase(), { id: i.id, name: i.name });
    return m;
  }, [fullCatalog]);

  const sales: GroupedSale[] = useMemo(() => {
    const bySale = new Map<string, GroupedSale>();
    for (const l of parsed) {
      let g = bySale.get(l.invoiceNo);
      if (!g) {
        g = {
          external_ref: l.invoiceNo, date: l.date || undefined,
          customer_name: l.customerName || undefined, customer_phone: l.customerPhone || undefined,
          payment_method: l.paymentMethod || undefined, discount: l.discount || undefined,
          note: l.note || undefined, lines: [],
        };
        bySale.set(l.invoiceNo, g);
      }
      const match = itemBySku.get(l.sku.toLowerCase());
      g.lines.push({
        catalog_item_id: match?.id, sku: l.sku, name: match?.name ?? l.sku,
        quantity: l.quantity, unit_price: l.unitPrice, matched: !!match,
      });
    }
    return [...bySale.values()];
  }, [parsed, itemBySku]);

  const unmatchedCount = sales.reduce((n, s) => n + s.lines.filter((l) => !l.matched).length, 0);

  function downloadTemplate() {
    const csv = [TEMPLATE_HEADERS, ...TEMPLATE_SAMPLE].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sales-import-template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setResult(null);
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length < 2) { setParseErrors(['The file has no data rows.']); setParsed([]); return; }

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (name: string) => header.indexOf(name);
    const required = ['invoice_no', 'sku', 'quantity', 'unit_price'];
    const missing = required.filter((c) => col(c) < 0);
    if (missing.length > 0) {
      setParseErrors([`Missing required column(s): ${missing.join(', ')} — download the template for the expected format.`]);
      setParsed([]);
      return;
    }

    const errs: string[] = [];
    const lines: CsvLine[] = [];
    rows.slice(1).forEach((r, idx) => {
      const get = (name: string) => (col(name) >= 0 ? (r[col(name)] ?? '').trim() : '');
      const invoiceNo = get('invoice_no');
      const sku = get('sku');
      const quantity = parseFloat(get('quantity'));
      const unitPrice = parseFloat(get('unit_price'));
      if (!invoiceNo || !sku) { errs.push(`Row ${idx + 2}: invoice_no and sku are required.`); return; }
      if (!(quantity > 0)) { errs.push(`Row ${idx + 2}: quantity must be a positive number.`); return; }
      if (!(unitPrice >= 0)) { errs.push(`Row ${idx + 2}: unit_price must be a number.`); return; }
      lines.push({
        invoiceNo, sku, quantity, unitPrice,
        date: get('date'), customerName: get('customer_name'), customerPhone: get('customer_phone'),
        paymentMethod: get('payment_method').toLowerCase(), discount: parseFloat(get('discount')) || 0,
        note: get('note'),
      });
    });
    setParseErrors(errs);
    setParsed(lines);
  }

  async function runImport() {
    if (sales.length === 0 || !tenantId) return;
    setImporting(true);
    try {
      const payload = {
        outlet_id: outlet?.id ?? '',
        rows: sales.map((s) => ({
          external_ref: s.external_ref,
          date: s.date,
          customer_name: s.customer_name,
          customer_phone: s.customer_phone,
          payment_method: s.payment_method,
          discount: s.discount,
          note: s.note,
          lines: s.lines.map(({ matched: _m, ...l }) => l),
        })),
      };
      const res = await apiClient.post<{ imported: number; skipped: number; failed: number; results: any[] }>(
        `/api/v1/${tenantId}/pos/sales/import`, payload,
      );
      setResult(res as any);
      const r: any = res;
      if (r.failed > 0) toast.warning(`${r.imported} imported, ${r.skipped} skipped, ${r.failed} failed`);
      else toast.success(`${r.imported} imported, ${r.skipped} already existed`);
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Import failed'));
    } finally {
      setImporting(false);
    }
  }

  if (!canImport) {
    return <div className="p-12 text-center text-muted-foreground">Importing sales requires manager access.</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Import Sales</h1>
            <p className="text-sm text-muted-foreground">
              Migrate historical sales from a CSV — safe to re-run (already-imported invoices are skipped).
            </p>
          </div>
        </div>
        <button onClick={downloadTemplate}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-input text-sm font-medium hover:bg-muted">
          <Download className="h-4 w-4" /> Download template
        </button>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div
            className="rounded-2xl border-2 border-dashed border-border p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/5 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f); }}
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">{fileName || 'Drop a CSV here, or click to choose'}</p>
            <p className="text-xs text-muted-foreground mt-1">
              One row per sale line — rows sharing an invoice_no become one sale. Importing to outlet:{' '}
              <b className="text-foreground">{outlet?.name ?? '—'}</b>
            </p>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }} />
          </div>

          {parseErrors.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs space-y-1">
              <p className="font-semibold text-amber-700 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> {parseErrors.length} row issue{parseErrors.length === 1 ? '' : 's'} (these rows are excluded):</p>
              {parseErrors.slice(0, 8).map((e, i) => <p key={i} className="text-amber-700">{e}</p>)}
              {parseErrors.length > 8 && <p className="text-amber-700">…and {parseErrors.length - 8} more.</p>}
            </div>
          )}

          {sales.length > 0 && !result && (
            <>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-semibold">{sales.length} sale{sales.length === 1 ? '' : 's'}</span>
                <span className="text-muted-foreground">{parsed.length} lines</span>
                {unmatchedCount > 0 && (
                  <span className="text-amber-600 font-medium">
                    {unmatchedCount} line{unmatchedCount === 1 ? '' : 's'} with SKUs not in your catalog (imported with the SKU as the name)
                  </span>
                )}
              </div>
              <div className="overflow-x-auto rounded-xl border border-border max-h-96 overflow-y-auto">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border text-muted-foreground uppercase tracking-wider text-left">
                      <th className="px-3 py-2 font-semibold">Invoice</th>
                      <th className="px-3 py-2 font-semibold">Date</th>
                      <th className="px-3 py-2 font-semibold">Customer</th>
                      <th className="px-3 py-2 font-semibold">Payment</th>
                      <th className="px-3 py-2 font-semibold">Lines</th>
                      <th className="px-3 py-2 font-semibold text-right">Total (pre-tax/disc)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sales.map((s) => (
                      <tr key={s.external_ref} className={s.lines.some((l) => !l.matched) ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}>
                        <td className="px-3 py-2 font-mono">{s.external_ref}</td>
                        <td className="px-3 py-2">{s.date || '—'}</td>
                        <td className="px-3 py-2">{s.customer_name || 'Walk-In'}</td>
                        <td className="px-3 py-2 capitalize">{s.payment_method || 'due'}</td>
                        <td className="px-3 py-2">
                          {s.lines.map((l) => `${l.quantity}× ${l.name}${l.matched ? '' : ' ⚠'}`).join(', ')}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {s.lines.reduce((t, l) => t + l.quantity * l.unit_price, 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={runImport} disabled={importing || !outlet?.id}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50">
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                {importing ? 'Importing…' : `Import ${sales.length} sale${sales.length === 1 ? '' : 's'}`}
              </button>
              {!outlet?.id && <p className="text-xs text-destructive">Select an outlet first (the import needs an outlet context).</p>}
            </>
          )}

          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="inline-flex items-center gap-1.5 text-emerald-600 font-semibold">
                  <CheckCircle2 className="h-4 w-4" /> {result.imported} imported
                </span>
                <span className="text-muted-foreground">{result.skipped} skipped (already imported)</span>
                {result.failed > 0 && <span className="text-destructive font-semibold">{result.failed} failed</span>}
              </div>
              {result.failed > 0 && (
                <div className="overflow-x-auto rounded-xl border border-border max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-border text-left text-muted-foreground">
                      <th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Error</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {result.results.filter((r: any) => r.status === 'failed').map((r: any) => (
                        <tr key={r.external_ref}>
                          <td className="px-3 py-2 font-mono">{r.external_ref}</td>
                          <td className="px-3 py-2 text-destructive">{r.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button onClick={() => { setParsed([]); setResult(null); setFileName(''); setParseErrors([]); }}
                className="px-4 py-2 rounded-xl border border-input text-sm font-medium hover:bg-muted">
                Import another file
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Imported sales are tagged with source &quot;Import&quot; in All Sales, report on their original sale
        date, and never re-deduct stock or re-post to your books — they are historical records.
      </p>
    </div>
  );
}
