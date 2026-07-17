'use client';

import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/base';
import { useUpdateShipping } from '@/hooks/usePOS';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { usePermissions, P } from '@/hooks/usePermissions';
import { apiErrorMessage } from '@/lib/api/error-message';
import { ModalFrame } from './sales-shared';
import {
  ShippingDetailsFields, shippingFormFromMetadata, type ShippingFormValue,
} from '@/components/pos/shipping/shipping-details-fields';

/** Edit Shipping (All-Sales / Shipments action) — shipping details live in order metadata
 * (the Shipping-Status list filter reads metadata.shipping_status), edited through the ONE
 * shared ShippingDetailsFields form. "Dispatch to Logistics" hands the sale to logistics-api
 * (the delivery-execution source of truth) — a delivery task is created there and pos keeps
 * only the task reference; rider assignment/tracking continue in the logistics dispatch UI. */
export function EditShippingModal({ order, onClose }: { order: any; onClose: () => void }) {
  const update = useUpdateShipping();
  const qc = useQueryClient();
  const tenantId = useAuthStore((s) => s.user?.tenant_id ?? '');
  const { canAny } = usePermissions();
  const canDispatch = canAny([P.ORDERS_CHANGE, P.ORDERS_MANAGE]);

  const [form, setForm] = useState<ShippingFormValue>(shippingFormFromMetadata(order.metadata));
  const [dispatching, setDispatching] = useState(false);
  const taskId: string = order.metadata?.logistics_task_id ?? '';

  const save = () => {
    update.mutate(
      {
        orderId: order.id,
        shipping_status: form.status,
        shipping_address: form.address,
        shipping_details: form.details,
        shipping_amount: Number(form.amount) || 0,
        tracking_number: form.trackingNumber,
        delivered_to: form.deliveredTo,
        delivery_person: form.deliveryPerson,
      },
      { onSuccess: () => { toast.success('Shipping updated'); onClose(); }, onError: () => toast.error('Update failed') },
    );
  };

  const dispatchToLogistics = async () => {
    if (!form.address) { toast.error('Add a shipping address first, then dispatch.'); return; }
    setDispatching(true);
    try {
      const res: any = await apiClient.post(`/api/v1/${tenantId}/pos/orders/${order.id}/dispatch-delivery`, {});
      toast.success(res?.status === 'already_dispatched'
        ? 'Already dispatched — task exists in logistics'
        : `Dispatched to logistics${res?.tracking_code ? ` · tracking ${res.tracking_code}` : ''}`);
      qc.invalidateQueries({ queryKey: ['pos-orders'] });
      onClose();
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Dispatch failed'));
    } finally {
      setDispatching(false);
    }
  };

  return (
    <ModalFrame title={`Edit Shipping — ${order.order_number}`} onClose={onClose}>
      <div className="space-y-4">
        <ShippingDetailsFields value={form} onChange={setForm} />
        <div className="flex flex-col sm:flex-row gap-2">
          <Button className="flex-1" onClick={save} disabled={update.isPending}>
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Shipping'}
          </Button>
          {canDispatch && (
            <Button variant="outline" className="flex-1 gap-2" onClick={dispatchToLogistics} disabled={dispatching || !!taskId}>
              {dispatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {taskId ? 'Dispatched to Logistics ✓' : 'Dispatch to Logistics'}
            </Button>
          )}
        </div>
        {taskId && (
          <p className="text-[11px] text-muted-foreground">
            Logistics task <span className="font-mono">{taskId.slice(0, 8)}…</span> — assign a rider and track it in the Logistics dispatch board.
          </p>
        )}
      </div>
    </ModalFrame>
  );
}
