'use client';

import { useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/base';
import { useMoveOrderDate } from '@/hooks/usePOS';
import { ModalFrame } from './sales-shared';

/**
 * MoveOrderDateModal — admin/platform-owner corrective tool for a sale that landed in the
 * system on the wrong day (e.g. rung up offline or blocked by a missing recipe, then added
 * and settled the next day). Moves which calendar day the sale REPORTS under, without
 * touching created_at (the real audit timestamp), amounts, payments, or stock. Server-side
 * this is gated one tier above pos.orders.manage — only the tenant's admin/owner role.
 */
export function MoveOrderDateModal({ order, onClose }: { order: any; onClose: () => void }) {
  const currentDate = (order.business_date ?? order.created_at ?? '').slice(0, 10);
  const [newDate, setNewDate] = useState(currentDate);
  const [reason, setReason] = useState('');
  const moveDate = useMoveOrderDate();

  const save = () => {
    if (!newDate) { toast.error('Pick a date'); return; }
    if (!reason.trim()) { toast.error('A reason is required'); return; }
    moveDate.mutate(
      { orderId: order.id, newDate, reason: reason.trim() },
      {
        onSuccess: () => { toast.success('Sale date moved'); onClose(); },
        onError: (e: any) => toast.error(e?.response?.data?.error || 'Could not move sale date'),
      },
    );
  };

  return (
    <ModalFrame title={`Move Sale Date — ${order.order_number}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Currently reports under <span className="font-semibold text-foreground">{currentDate}</span>.
          Moving it only changes which day&apos;s sales records/reports this sale counts toward — it does
          not change amounts, payments, or the original creation timestamp.
        </p>
        <label className="text-[11px] font-semibold text-muted-foreground block">Move to date
          <input
            type="date"
            className="w-full bg-background border border-border rounded-md py-1.5 px-2 text-sm mt-1"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
          />
        </label>
        <label className="text-[11px] font-semibold text-muted-foreground block">Reason (required)
          <input
            className="w-full bg-background border border-border rounded-md py-1.5 px-2 text-sm mt-1"
            placeholder="e.g. synced a day late — missing recipe blocked checkout on the original day"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="gap-1" disabled={moveDate.isPending} onClick={save}>
            {moveDate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Move Date
          </Button>
        </div>
        <div className="text-xs text-muted-foreground pt-1 border-t border-border">
          This move is written to the audit log with the before/after date and your reason.
        </div>
      </div>
    </ModalFrame>
  );
}
