'use client';

import { useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/base';
import { useUpdateSaleInfo } from '@/hooks/usePOS';
import { useStaffList } from '@/hooks/useStaff';
import { useAuthStore } from '@/store/auth';
import { CustomerSearch, WALK_IN_CUSTOMER, type SelectedCustomer } from '@/components/pos/customer-search';
import { ModalFrame } from './sales-shared';

/**
 * EditSaleInfoModal — admin/manager (pos.orders.manage) correction tool for WHO served a sale
 * and the customer on file. Works on a draft, an open bill, OR a completed sale (the backend
 * rejects only voided/cancelled/refunded orders). Deliberately narrow: never touches totals,
 * line items, discounts, tax, or payments — those stay immutable once completed.
 *
 * Reuses the platform's ONE centralized customer search-or-create widget (CustomerSearch —
 * the same component the terminal, Add Sale, pharmacy checkout, returns, and layaway all use)
 * rather than a bespoke input, so "search existing or add missing" behaves identically here.
 */
export function EditSaleInfoModal({ order, onClose }: { order: any; onClose: () => void }) {
  const tenantId = useAuthStore((s) => s.user?.tenant_id ?? '');
  const { data: staffResp } = useStaffList(tenantId, order.outlet_id);
  const staff = staffResp?.data ?? [];

  const [servedByUserId, setServedByUserId] = useState(order.served_by_user_id || order.user_id || '');
  const [customer, setCustomer] = useState<SelectedCustomer>(
    order.customer_name || order.customer_phone
      ? { name: order.customer_name ?? '', phone: order.customer_phone ?? '', isWalkIn: !order.customer_phone }
      : WALK_IN_CUSTOMER,
  );
  const [reason, setReason] = useState('');
  const updateSaleInfo = useUpdateSaleInfo();

  const save = () => {
    if (!reason.trim()) { toast.error('A reason is required'); return; }
    updateSaleInfo.mutate(
      {
        orderId: order.id,
        servedByUserId: servedByUserId || undefined,
        customerName: customer.isWalkIn ? '' : (customer.name || ''),
        customerPhone: customer.isWalkIn ? '' : (customer.phone || ''),
        reason: reason.trim(),
      },
      {
        onSuccess: () => { toast.success('Sale info updated'); onClose(); },
        onError: (e: any) => toast.error(e?.response?.data?.error || 'Could not update sale info'),
      },
    );
  };

  return (
    <ModalFrame title={`Edit Sale Info — ${order.order_number}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Corrects who served this sale and the customer on file only — amounts, line items,
          discounts, tax, and payments are never touched.
        </p>

        <label className="text-[11px] font-semibold text-muted-foreground block">Served by
          <select
            value={servedByUserId}
            onChange={(e) => setServedByUserId(e.target.value)}
            className="w-full bg-background border border-border rounded-md py-1.5 px-2 text-sm mt-1"
          >
            <option value={servedByUserId}>
              {staff.find((s) => s.user_id === servedByUserId)?.name || order.served_by_name || order.cashier_name || '— Select staff —'}
            </option>
            {staff.filter((s) => s.user_id !== servedByUserId).map((s) => (
              <option key={s.user_id} value={s.user_id}>{s.name}{s.role ? ` · ${s.role}` : ''}</option>
            ))}
          </select>
        </label>

        <div>
          <label className="text-[11px] font-semibold text-muted-foreground block mb-1">Customer</label>
          <CustomerSearch value={customer} onChange={setCustomer} />
        </div>

        <label className="text-[11px] font-semibold text-muted-foreground block">Reason (required)
          <input
            className="w-full bg-background border border-border rounded-md py-1.5 px-2 text-sm mt-1"
            placeholder="e.g. cashier forgot to log in as themselves before ringing up this sale"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="gap-1" disabled={updateSaleInfo.isPending} onClick={save}>
            {updateSaleInfo.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
          </Button>
        </div>
        <div className="text-xs text-muted-foreground pt-1 border-t border-border">
          This change is written to the audit log with the before/after values and your reason.
        </div>
      </div>
    </ModalFrame>
  );
}
