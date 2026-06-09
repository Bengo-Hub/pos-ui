'use client';

/**
 * Add Sale — back-office full sale entry (distinct from the fast POS terminal at /order).
 * A store manager records a wholesaler/credit/delivery sale here with full line control, customer,
 * order discount, tax and payment, while front-store cashiers keep ringing up at the terminal.
 * Reuses the existing order + catalog + client hooks and SplitPaymentModal — no new sale logic.
 */

import { useState, useMemo, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Loader2, Minus, Plus, Search, ShoppingCart, Trash2, UserPlus, X } from 'lucide-react';
import { useMenuItems, useCreateOrder, type CatalogItem } from '@/hooks/usePOS';
import { useClientSearch } from '@/hooks/useClients';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { SplitPaymentModal } from '@/components/pos/split-payment-modal';
import { useAuthStore } from '@/store/auth';
import { apiClient } from '@/lib/api/client';
import { Button } from '@/components/ui/base';
import { toast } from 'sonner';

interface SaleLine {
  item: CatalogItem;
  quantity: number;
  unitPrice: number;
}

const fmt = (n: number) => `KES ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function AddSalePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const outlet = useAuthStore((s) => s.outlet);
  const outletId = outlet?.id ?? '';
  const tenantId = useAuthStore((s) => s.user?.tenant_id ?? '');
  const { data: posSettings } = usePOSSettings();
  const taxRate = (posSettings?.vat_rate ?? 16) / 100;

  // ── Customer ──
  const [custPhone, setCustPhone] = useState('');
  const [custName, setCustName] = useState('');
  const { data: matches } = useClientSearch(custPhone.length >= 4 ? custPhone : undefined, undefined);

  // ── Line items ──
  const [search, setSearch] = useState('');
  const { data: catalog, isFetching } = useMenuItems({ search: search || undefined, limit: 25 });
  const results: CatalogItem[] = catalog?.data ?? [];
  const [lines, setLines] = useState<SaleLine[]>([]);

  // ── Order-level ──
  const [discount, setDiscount] = useState(0);
  // Credit Sale entry point (sidebar /sell/add?credit=1) pre-selects on-account; the On-Account
  // tender in the payment modal posts the total to the customer's AR (treasury enforces the limit).
  const [creditSale, setCreditSale] = useState(searchParams.get('credit') === '1');
  const [notes, setNotes] = useState('');
  const [quotationSaving, setQuotationSaving] = useState(false);

  const createOrder = useCreateOrder();
  const [payOrder, setPayOrder] = useState<{ id: string; number: string; total: number } | null>(null);

  const addLine = useCallback((item: CatalogItem) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.item.id === item.id);
      if (idx >= 0) return prev.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { item, quantity: 1, unitPrice: item.price ?? 0 }];
    });
  }, []);
  const setQty = (i: number, q: number) =>
    q <= 0 ? setLines((p) => p.filter((_, x) => x !== i)) : setLines((p) => p.map((l, x) => (x === i ? { ...l, quantity: q } : l)));
  const setPrice = (i: number, v: number) => setLines((p) => p.map((l, x) => (x === i ? { ...l, unitPrice: Math.max(0, v) } : l)));

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0), [lines]);
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * taxRate;
  const total = taxable + tax;

  function buildPayload(subtype: 'retail' | 'draft') {
    return {
      outletId,
      orderSubtype: subtype === 'draft' ? ('draft' as any) : ('retail' as const),
      discountAmount: discount || undefined,
      customerPhone: custPhone || undefined,
      customerName: custName || undefined,
      lines: lines.map((l) => ({
        catalog_item_id: l.item.id,
        sku: l.item.sku,
        name: l.item.name,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        total_price: l.unitPrice * l.quantity,
        metadata: notes ? { notes } : undefined,
      })),
    };
  }

  function save(mode: 'pay' | 'draft') {
    if (lines.length === 0) return;
    if (creditSale && !custPhone) {
      toast.error('A customer is required for a credit sale.');
      return;
    }
    createOrder.mutate(buildPayload(mode === 'draft' ? 'draft' : 'retail'), {
      onSuccess: (o: any) => {
        const id = o.id || o.order_id || '';
        if (mode === 'draft') {
          toast.success('Saved as draft');
          reset();
        } else {
          setPayOrder({ id, number: o.order_number || id, total });
        }
      },
      onError: () => toast.error('Failed to create sale. Please try again.'),
    });
  }
  function reset() {
    setLines([]); setDiscount(0); setNotes(''); setCustPhone(''); setCustName(''); setCreditSale(false);
  }

  // Save as Quotation: forward the cart to treasury via the pos-api proxy (treasury owns quotations;
  // pos persists nothing). pos-ui → pos-api → treasury S2S.
  async function saveQuotation() {
    if (lines.length === 0) return;
    setQuotationSaving(true);
    try {
      await apiClient.post(`/api/v1/${tenantId}/pos/quotations`, {
        customer_name: custName || undefined,
        customer_phone: custPhone || undefined,
        notes: notes || undefined,
        lines: lines.map((l) => ({ name: l.item.name, sku: l.item.sku, quantity: l.quantity, unit_price: l.unitPrice })),
      });
      toast.success('Quotation saved to Treasury');
      reset();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save quotation');
    } finally {
      setQuotationSaving(false);
    }
  }

  if (payOrder) {
    return (
      <SplitPaymentModal
        open
        onClose={() => { setPayOrder(null); reset(); }}
        onPaymentConfirmed={() => { setPayOrder(null); reset(); toast.success('Sale completed'); }}
        orderId={payOrder.id}
        orderNumber={payOrder.number}
        total={payOrder.total}
        tenantSlug={orgSlug}
      />
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <ShoppingCart className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">{creditSale ? 'Credit Sale' : 'Add Sale'}</h1>
        <span className="text-sm text-muted-foreground">{creditSale ? 'Sell on account — posts to customer AR' : 'Back-office sale entry'}</span>
      </div>

      {/* Customer */}
      <div className="bg-card border border-border rounded-2xl p-5 grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Customer phone</label>
          <div className="relative mt-1">
            <input value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="Walk-in (optional)"
              className="w-full bg-background border border-border rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            {(matches?.accounts?.length ?? 0) > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-xl shadow-lg max-h-44 overflow-y-auto">
                {matches!.accounts!.map((c: any) => (
                  <button key={c.id} type="button" onClick={() => { setCustPhone(c.customer_phone); setCustName(c.customer_name); }}
                    className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-center gap-2">
                    <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{c.customer_name}</span>
                    <span className="text-muted-foreground text-xs">{c.customer_phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Customer name</label>
          <input value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="Walk-in Customer"
            className="w-full mt-1 bg-background border border-border rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Item search + lines */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product name / SKU to add…"
              className="w-full bg-card border border-border rounded-xl py-3 pl-11 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            {isFetching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          {search && (
            <div className="bg-card border border-border rounded-xl divide-y divide-border max-h-56 overflow-y-auto">
              {results.length === 0 ? <div className="p-4 text-center text-sm text-muted-foreground">No products</div> :
                results.map((it) => (
                  <button key={it.id} type="button" onClick={() => { addLine(it); }}
                    className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-accent transition-colors">
                    <Plus className="h-4 w-4 text-primary" />
                    <span className="flex-1 text-sm font-medium truncate">{it.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{it.sku}</span>
                    <span className="text-sm font-bold text-primary">{fmt(it.price ?? 0)}</span>
                  </button>
                ))}
            </div>
          )}

          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/30 text-muted-foreground">
                <th className="text-left px-4 py-2.5 font-medium">Product</th>
                <th className="text-center px-2 py-2.5 font-medium">Qty</th>
                <th className="text-right px-3 py-2.5 font-medium">Unit price</th>
                <th className="text-right px-4 py-2.5 font-medium">Total</th>
                <th></th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {lines.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Search and add products to the sale</td></tr>}
                {lines.map((l, i) => (
                  <tr key={l.item.id}>
                    <td className="px-4 py-3"><div className="font-medium">{l.item.name}</div><div className="text-xs text-muted-foreground font-mono">{l.item.sku}</div></td>
                    <td className="px-2 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setQty(i, l.quantity - 1)} className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-accent"><Minus className="h-3 w-3" /></button>
                        <input value={l.quantity} onChange={(e) => setQty(i, parseInt(e.target.value) || 0)} className="w-10 text-center bg-background border border-border rounded py-1 text-sm" />
                        <button onClick={() => setQty(i, l.quantity + 1)} className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-accent"><Plus className="h-3 w-3" /></button>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <input value={l.unitPrice} onChange={(e) => setPrice(i, parseFloat(e.target.value) || 0)} className="w-24 text-right bg-background border border-border rounded py-1 px-2 text-sm tabular-nums" />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmt(l.unitPrice * l.quantity)}</td>
                    <td className="px-2"><button onClick={() => setQty(i, 0)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary + save */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums font-medium">{fmt(subtotal)}</span></div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Order discount</span>
              <input value={discount} onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))} className="w-24 text-right bg-background border border-border rounded py-1 px-2 text-sm tabular-nums" />
            </div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">VAT ({Math.round(taxRate * 100)}%)</span><span className="tabular-nums font-medium">{fmt(tax)}</span></div>
            <div className="flex justify-between pt-2 border-t border-border"><span className="font-bold">Total</span><span className="font-bold text-primary tabular-nums">{fmt(total)}</span></div>
          </div>

          <label className="flex items-center gap-2 text-sm px-1">
            <input type="checkbox" checked={creditSale} onChange={(e) => setCreditSale(e.target.checked)} className="rounded" />
            <span>Credit sale (on account → AR)</span>
          </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sale note (optional)" rows={2}
            className="w-full bg-card border border-border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />

          <div className="space-y-2">
            <Button onClick={() => save('pay')} disabled={lines.length === 0 || createOrder.isPending} className="w-full min-h-12 font-bold rounded-xl gap-2">
              {createOrder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
              {creditSale ? 'Save — On Account' : 'Save & Pay'} · {fmt(total)}
            </Button>
            <Button variant="outline" onClick={() => save('draft')} disabled={lines.length === 0 || createOrder.isPending} className="w-full rounded-xl">
              Save as Draft
            </Button>
            <Button variant="outline" onClick={saveQuotation} disabled={lines.length === 0 || quotationSaving} className="w-full rounded-xl">
              {quotationSaving ? 'Saving…' : 'Save as Quotation'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
