'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useNotifySale } from '@/hooks/usePOS';
import { toast } from 'sonner';

type Channel = 'sms' | 'email' | 'whatsapp';

const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:ring-1 focus:ring-ring focus:outline-none';
const selectCls = inputCls;

/**
 * ReceiptShareDialog — the "Send Notification" action: sends the customer their receipt via
 * notifications-service (SMS, email, or the WhatsApp Business API), each carrying a durable
 * public download link. Prefills the contact from the order's own phone/email, but the cashier
 * can always type a different one (e.g. the sale has no email on file, or the customer wants it
 * sent to someone else). Distinct from the "Share via WhatsApp" wa.me quick action, which opens
 * the cashier's own WhatsApp app instead of sending server-side.
 */
export function ReceiptShareDialog({
  open, onOpenChange, orderId, defaultPhone, defaultEmail,
  forcedChannel, onManualSend, title,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  defaultPhone?: string;
  defaultEmail?: string;
  /** Locks the channel selector to one value and hides it (e.g. the "Share via WhatsApp" quick
   * action only ever wants a phone number, never a channel choice). */
  forcedChannel?: Channel;
  /** When set, "Send" calls this with the entered phone/email instead of dispatching through
   * notifications-service — reuses this dialog's UI/validation for a purely client-side flow
   * (e.g. building a wa.me deep link) rather than a bespoke prompt. */
  onManualSend?: (value: string) => void;
  title?: string;
}) {
  const [channel, setChannel] = useState<Channel>(forcedChannel ?? (defaultPhone ? 'sms' : 'email'));
  const [phone, setPhone] = useState(defaultPhone ?? '');
  const [email, setEmail] = useState(defaultEmail ?? '');
  const notify = useNotifySale();

  const needsPhone = channel === 'sms' || channel === 'whatsapp';
  const canSend = needsPhone ? phone.trim().length > 0 : email.trim().length > 0;

  function handleSend() {
    if (!canSend) return;
    if (onManualSend) {
      onManualSend((needsPhone ? phone : email).trim());
      onOpenChange(false);
      return;
    }
    notify.mutate(
      { orderId, phone: phone || undefined, email: email || undefined, channel },
      {
        onSuccess: () => {
          toast.success('Receipt notification queued');
          onOpenChange(false);
        },
        onError: (e: any) => toast.error(e?.response?.data?.error || 'Could not send notification'),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title ?? 'Send Receipt Notification'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!forcedChannel && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Channel</label>
                <select className={selectCls} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>
            )}
            {needsPhone ? (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone number</label>
                <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0712345678" autoFocus />
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Email address</label>
                <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" autoFocus />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!canSend || notify.isPending}>
              {notify.isPending ? 'Sending…' : onManualSend ? 'Continue' : 'Send'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
