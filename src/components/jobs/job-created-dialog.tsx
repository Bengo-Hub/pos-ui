'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Printer, Wallet } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { printJobTicket, type JobTicketOrder } from '@/components/jobs/job-ticket';
import { POSPaymentModal } from '@/components/pos/payment-modal';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiClient } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { suggestedDeposit, type ServiceProfile } from '@/lib/api/service-jobs';
import { formatCurrency } from '@/lib/utils';
import { useTenantBranding } from '@/providers/tenant-branding-provider';

/**
 * Shown right after reception creates a job order. The job is already on the production board;
 * here the cashier collects the deposit (the outlet's default percent, editable) and prints the
 * job ticket for the customer. The balance is paid when the customer collects.
 */
export function JobCreatedDialog({
  open,
  onClose,
  orderId,
  orderNumber,
  total,
  depositPercent,
  profile,
  tenantId,
  tenantSlug,
  currency = 'KES',
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  total: number;
  depositPercent: number;
  profile: ServiceProfile | null;
  tenantId: string;
  tenantSlug: string;
  currency?: string;
}) {
  const qc = useQueryClient();
  const { tenant } = useTenantBranding();
  const [deposit, setDeposit] = useState('');
  const [paid, setPaid] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const label = profile?.job_label ?? 'Job';

  useEffect(() => {
    if (open) {
      setDeposit(String(suggestedDeposit(total, depositPercent) || ''));
      setPaid(0);
    }
  }, [open, total, depositPercent]);

  const depositAmount = Math.min(Math.max(0, parseFloat(deposit) || 0), Math.max(0, total - paid));
  const balance = Math.max(0, total - paid);

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const order = await apiClient.get<JobTicketOrder>(`/api/v1/${tenantId}/pos/orders/${orderId}`);
      printJobTicket(order, profile, tenant?.orgName || tenant?.name);
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Could not load the job to print'));
    } finally {
      setPrinting(false);
    }
  };

  return (
    <>
      <Dialog open={open && !payOpen} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" /> {label} #{orderNumber} created
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              It is on the production board. Take a deposit now if the customer is paying one; the balance is paid at collection.
            </p>
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-border p-3 text-center">
              <div><p className="text-[11px] text-muted-foreground">Total</p><p className="font-bold tabular-nums">{formatCurrency(total, currency)}</p></div>
              <div><p className="text-[11px] text-muted-foreground">Paid</p><p className="font-bold tabular-nums text-green-600">{formatCurrency(paid, currency)}</p></div>
              <div><p className="text-[11px] text-muted-foreground">Balance</p><p className="font-bold tabular-nums">{formatCurrency(balance, currency)}</p></div>
            </div>
            {balance > 0 && (
              <label className="block space-y-1">
                <span className="text-xs font-semibold">
                  Deposit {depositPercent > 0 && <span className="text-muted-foreground">(default {depositPercent}%)</span>}
                </span>
                <input
                  type="number"
                  min={0}
                  max={balance}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                />
              </label>
            )}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={handlePrint} disabled={printing} className="gap-2">
              {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Print {label.toLowerCase()} ticket
            </Button>
            {balance > 0 && (
              <Button onClick={() => setPayOpen(true)} disabled={depositAmount <= 0} className="gap-2">
                <Wallet className="h-4 w-4" /> Take {formatCurrency(depositAmount, currency)}
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {payOpen && (
        <POSPaymentModal
          open={payOpen}
          onClose={() => setPayOpen(false)}
          orderId={orderId}
          orderNumber={`${orderNumber} deposit`}
          total={depositAmount}
          tenantSlug={tenantSlug}
          onPaymentConfirmed={() => {
            setPaid((p) => p + depositAmount);
            setPayOpen(false);
            qc.invalidateQueries({ queryKey: ['pos-orders'] });
            qc.invalidateQueries({ queryKey: ['kds-tickets'] });
            toast.success(`Deposit of ${formatCurrency(depositAmount, currency)} recorded`);
          }}
        />
      )}
    </>
  );
}
