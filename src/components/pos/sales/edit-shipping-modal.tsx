'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/base';
import { useUpdateShipping } from '@/hooks/usePOS';
import { ModalFrame, SHIPPING_STATUSES } from './sales-shared';

/** Edit Shipping (All-Sales action) — shipping details live in order metadata; the
 * Shipping-Status list filter reads metadata.shipping_status. */
export function EditShippingModal({ order, onClose }: { order: any; onClose: () => void }) {
  const update = useUpdateShipping();
  const [form, setForm] = useState({
    shipping_status: order.metadata?.shipping_status ?? 'ordered',
    shipping_address: order.metadata?.shipping_address ?? '',
    shipping_amount: order.metadata?.shipping_amount ?? 0,
    tracking_number: order.metadata?.tracking_number ?? '',
    delivery_person: order.metadata?.delivery_person ?? '',
  });
  const save = () => {
    update.mutate(
      { orderId: order.id, ...form, shipping_amount: Number(form.shipping_amount) },
      { onSuccess: () => { toast.success('Shipping updated'); onClose(); }, onError: () => toast.error('Update failed') },
    );
  };
  const inp = 'w-full bg-background border border-border rounded-lg py-2 px-3 text-sm';
  return (
    <ModalFrame title={`Edit Shipping — ${order.order_number}`} onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-muted-foreground">Shipping Status
          <select className={inp} value={form.shipping_status} onChange={(e) => setForm({ ...form, shipping_status: e.target.value })}>
            {SHIPPING_STATUSES.filter((s) => s.value).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-muted-foreground">Address
          <input className={inp} value={form.shipping_address} onChange={(e) => setForm({ ...form, shipping_address: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-muted-foreground">Shipping Charges
            <input type="number" className={inp} value={form.shipping_amount} onChange={(e) => setForm({ ...form, shipping_amount: e.target.value as any })} />
          </label>
          <label className="block text-xs font-semibold text-muted-foreground">Tracking No.
            <input className={inp} value={form.tracking_number} onChange={(e) => setForm({ ...form, tracking_number: e.target.value })} />
          </label>
        </div>
        <label className="block text-xs font-semibold text-muted-foreground">Delivery Person
          <input className={inp} value={form.delivery_person} onChange={(e) => setForm({ ...form, delivery_person: e.target.value })} />
        </label>
        <Button className="w-full" onClick={save} disabled={update.isPending}>
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Shipping'}
        </Button>
      </div>
    </ModalFrame>
  );
}
