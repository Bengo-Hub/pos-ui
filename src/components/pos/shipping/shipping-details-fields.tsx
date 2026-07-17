'use client';

/**
 * ShippingDetailsFields — the ONE reusable shipping form for a sale's fulfillment info.
 *
 * Ownership model: pos-api owns only this lightweight fulfillment ANNOTATION on its own
 * order (metadata keys shipping_status / shipping_address / shipping_details /
 * shipping_amount / tracking_number / delivered_to / delivery_person). Delivery
 * EXECUTION — riders, dispatch tasks, live tracking — is owned by logistics-api; a sale
 * is handed over via pos-api's logistics S2S client (Dispatch to Logistics), and pos
 * keeps only the returned task reference (metadata.logistics_task_id).
 *
 * Consumers: the All-Sales / Shipments "Edit Shipping" modal and the Add Sale page's
 * Shipping Details section — one field set, one metadata contract, no drift.
 */

export interface ShippingFormValue {
  status: string;
  details: string;
  address: string;
  amount: number | string;
  trackingNumber: string;
  deliveredTo: string;
  deliveryPerson: string;
}

export const SHIPPING_STATUS_OPTIONS = [
  { value: 'ordered', label: 'Ordered' },
  { value: 'packed', label: 'Packed' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function emptyShippingForm(): ShippingFormValue {
  return { status: 'ordered', details: '', address: '', amount: 0, trackingNumber: '', deliveredTo: '', deliveryPerson: '' };
}

/** Rehydrate the form from an order's metadata (the keys UpdateShipping/Add Sale write). */
export function shippingFormFromMetadata(meta: Record<string, any> | undefined | null): ShippingFormValue {
  const m = meta ?? {};
  return {
    status: m.shipping_status ?? 'ordered',
    details: m.shipping_details ?? '',
    address: m.shipping_address ?? '',
    amount: Number(m.shipping_amount) || 0,
    trackingNumber: m.tracking_number ?? '',
    deliveredTo: m.delivered_to ?? '',
    deliveryPerson: m.delivery_person ?? '',
  };
}

export function ShippingDetailsFields({ value, onChange, showTracking = true }: {
  value: ShippingFormValue;
  onChange: (next: ShippingFormValue) => void;
  /** Hide the tracking field on create (it usually only exists after dispatch). */
  showTracking?: boolean;
}) {
  const set = <K extends keyof ShippingFormValue>(k: K, v: ShippingFormValue[K]) => onChange({ ...value, [k]: v });
  const inp = 'mt-1 w-full bg-background border border-border rounded-lg py-2 px-3 text-sm font-normal';

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-xs font-semibold text-muted-foreground">Shipping Details
        <input value={value.details} onChange={(e) => set('details', e.target.value)}
          placeholder="e.g. courier, vehicle, instructions" className={inp} />
      </label>
      <label className="block text-xs font-semibold text-muted-foreground">Shipping Address
        <input value={value.address} onChange={(e) => set('address', e.target.value)} className={inp} />
      </label>
      <label className="block text-xs font-semibold text-muted-foreground">Shipping Status
        <select value={value.status} onChange={(e) => set('status', e.target.value)} className={inp}>
          {SHIPPING_STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      <label className="block text-xs font-semibold text-muted-foreground">Shipping Charges
        <input type="number" min="0" value={value.amount}
          onChange={(e) => set('amount', e.target.value)} className={`${inp} tabular-nums`} />
      </label>
      {showTracking && (
        <label className="block text-xs font-semibold text-muted-foreground">Tracking No.
          <input value={value.trackingNumber} onChange={(e) => set('trackingNumber', e.target.value)} className={inp} />
        </label>
      )}
      <label className="block text-xs font-semibold text-muted-foreground">Delivered To
        <input value={value.deliveredTo} onChange={(e) => set('deliveredTo', e.target.value)} className={inp} />
      </label>
      <label className="block text-xs font-semibold text-muted-foreground">Delivery Person
        <input value={value.deliveryPerson} onChange={(e) => set('deliveryPerson', e.target.value)} className={inp} />
      </label>
    </div>
  );
}
