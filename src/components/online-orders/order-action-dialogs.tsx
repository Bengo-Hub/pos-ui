'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/lib/api/error-message';
import { cn, formatCurrency } from '@/lib/utils';
import {
  amountDue,
  isDeliveryOrder,
  isOnlineOrder,
  isOrderPaid,
  needsCollectionCode,
  type PickupOrder,
} from '@/lib/api/online-orders';
import { useOnlineOrderActions } from '@/hooks/useOnlineOrders';

const MPESA_CODE = /^[A-Z0-9]{10}$/;
const COLLECTION_CODE = /^\d{6}$/;
const cleanCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);

interface DialogProps {
  order: PickupOrder | null;
  currency: string;
  onClose: () => void;
}

/**
 * HandoverDialog closes an order at the counter: the customer collects it, or (for an online delivery
 * the outlet delivers with its own staff) it was delivered. For an order that is not paid yet the
 * cashier records how the money was taken (cash or M-Pesa with its code) before it is released.
 */
export function HandoverDialog({ order, currency, onClose }: DialogProps) {
  const { markCollected } = useOnlineOrderActions();
  const [method, setMethod] = useState<'cash' | 'mpesa'>('cash');
  const [code, setCode] = useState('');
  const [collectionCode, setCollectionCode] = useState('');
  const [noCode, setNoCode] = useState(false);
  const [noCodeReason, setNoCodeReason] = useState('');
  if (!order) return null;

  const online = isOnlineOrder(order);
  const paid = isOrderPaid(order);
  const collect = online && !paid;
  const delivery = isDeliveryOrder(order);
  const askCode = needsCollectionCode(order);
  const due = amountDue(order);
  const codeOk = !askCode || (noCode ? noCodeReason.trim().length >= 3 : COLLECTION_CODE.test(collectionCode));
  const canSubmit = codeOk && (!collect || method === 'cash' || MPESA_CODE.test(code));

  const submit = () => {
    const handover = askCode
      ? noCode
        ? { no_code_reason: noCodeReason.trim() }
        : { collection_code: collectionCode }
      : {};
    markCollected.mutate(
      {
        orderID: order.id,
        body: {
          ...handover,
          ...(collect ? { cash_collected: true, payment_method: method, reference: method === 'mpesa' ? code : undefined } : {}),
        },
      },
      {
        onSuccess: () => {
          toast.success(delivery ? `${order.order_number} delivered` : `${order.order_number} handed over`);
          onClose();
        },
        onError: async (e) => toast.error(await apiErrorMessage(e, 'Could not complete the handover')),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{delivery ? `Delivered ${order.order_number}` : `Hand over ${order.order_number}`}</DialogTitle>
          <DialogDescription>
            {collect
              ? `Collect ${formatCurrency(due, currency)} before releasing the order.`
              : delivery
                ? 'Confirm your delivery staff handed the order to the customer.'
                : askCode
                  ? 'Ask the customer for the collection code on their order page or message.'
                  : 'Confirm the customer has collected the order. Check the name or order number first.'}
          </DialogDescription>
        </DialogHeader>

        {askCode && (
          <div className="space-y-2">
            {!noCode ? (
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Collection code</label>
                <input
                  value={collectionCode}
                  onChange={(e) => setCollectionCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoFocus
                  placeholder="6 digits"
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-center text-lg font-bold tracking-[0.4em]"
                />
              </div>
            ) : (
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">How did you check the customer?</label>
                <input
                  value={noCodeReason}
                  onChange={(e) => setNoCodeReason(e.target.value.slice(0, 200))}
                  autoFocus
                  placeholder="e.g. phone dead, checked name and phone number"
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">This is saved on the order.</p>
              </div>
            )}
            <button
              type="button"
              onClick={() => setNoCode((v) => !v)}
              className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
            >
              {noCode ? 'Customer has the code' : 'Customer does not have the code'}
            </button>
          </div>
        )}

        {collect && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(['cash', 'mpesa'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cn(
                    'min-h-11 rounded-lg border-2 text-sm font-semibold transition-colors',
                    method === m ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent',
                  )}
                >
                  {m === 'cash' ? 'Cash' : 'M-Pesa'}
                </button>
              ))}
            </div>
            {method === 'mpesa' && (
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">M-Pesa code</label>
                <input
                  value={code}
                  onChange={(e) => setCode(cleanCode(e.target.value))}
                  placeholder="e.g. SGH7K2L9QP"
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-semibold tracking-wider"
                />
                <p className="mt-1 text-xs text-muted-foreground">Match it with the M-Pesa message the business received.</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter showCloseButton>
          <Button onClick={submit} disabled={!canSubmit || markCollected.isPending}>
            {markCollected.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {collect ? `Received ${formatCurrency(due, currency)}` : delivery ? 'Mark delivered' : 'Handed over'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * VerifyPaymentDialog confirms a manual M-Pesa payment: the customer paid the business Till/Paybill
 * and typed the code at checkout; the cashier matches it with the M-Pesa message before the order
 * is handed over. A code that cannot be found should be rejected instead.
 */
export function VerifyPaymentDialog({ order, currency, onClose, onReject }: DialogProps & { onReject: (o: PickupOrder) => void }) {
  const { verifyPayment } = useOnlineOrderActions();
  const [code, setCode] = useState(String(order?.metadata?.mpesa_code ?? ''));
  if (!order) return null;

  const submit = () => {
    verifyPayment.mutate(
      { orderID: order.id, reference: code },
      {
        onSuccess: () => {
          toast.success(`Payment for ${order.order_number} confirmed`);
          onClose();
        },
        onError: async (e) => toast.error(await apiErrorMessage(e, 'Could not confirm the payment')),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm M-Pesa payment</DialogTitle>
          <DialogDescription>
            {`${order.customer_name || 'The customer'} says they paid ${formatCurrency(amountDue(order), currency)} to your M-Pesa. Find this code in your M-Pesa messages and check the amount before confirming.`}
          </DialogDescription>
        </DialogHeader>
        <div>
          <label className="text-xs font-semibold uppercase text-muted-foreground">M-Pesa code</label>
          <input
            value={code}
            onChange={(e) => setCode(cleanCode(e.target.value))}
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-base font-bold tracking-widest"
          />
        </div>
        <DialogFooter showCloseButton>
          <Button variant="outline" onClick={() => { onClose(); onReject(order); }}>
            Not received
          </Button>
          <Button onClick={submit} disabled={!MPESA_CODE.test(code) || verifyPayment.isPending}>
            {verifyPayment.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Payment received
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const REJECT_REASONS = [
  'An item is out of stock',
  'We are closing / closed',
  'Too busy to prepare it in time',
  'Payment was not received',
  'We do not deliver to this address',
];

/**
 * RejectDialog cancels an online order the outlet cannot fulfil. The reason is sent to the
 * customer; a prepaid order is refunded by the ordering service.
 */
export function RejectDialog({ order, onClose }: Omit<DialogProps, 'currency'>) {
  const { reject } = useOnlineOrderActions();
  const [reason, setReason] = useState('');
  if (!order) return null;

  const submit = () => {
    reject.mutate(
      { orderID: order.id, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(`${order.order_number} rejected; the customer has been told`);
          onClose();
        },
        onError: async (e) => toast.error(await apiErrorMessage(e, 'Could not reject the order')),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject {order.order_number}?</DialogTitle>
          <DialogDescription>
            The customer is notified with your reason. If they already paid online, the payment is refunded.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {REJECT_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                reason === r ? 'border-destructive bg-destructive/10 text-destructive' : 'border-border hover:bg-accent',
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Reason shown to the customer"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
        <DialogFooter showCloseButton>
          <Button variant="destructive" onClick={submit} disabled={!reason.trim() || reject.isPending}>
            {reject.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Reject order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
