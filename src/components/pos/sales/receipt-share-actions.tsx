'use client';

import { Button } from '@/components/ui/button';
import { useReceiptShareLink } from '@/hooks/usePOS';
import { Mail, MessageCircle } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { ReceiptShareDialog } from './receipt-share-dialog';

interface ShareOrderLike {
  id: string;
  order_number?: string;
  customer_phone?: string | null;
  customer_email?: string | null;
}

function waPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
}

export function useOrderShareActions(order: ShareOrderLike | null | undefined) {
  const shareLink = useReceiptShareLink();
  const [shareOpen, setShareOpen] = useState(false);

  const shareViaWhatsApp = useCallback(() => {
    if (!order?.id) return;
    shareLink.mutate(order.id, {
      onSuccess: (res: { download_link?: string; customer_phone?: string }) => {
        const phone = res.customer_phone || window.prompt('Customer WhatsApp number:') || '';
        if (!phone.trim()) return;
        const message = `Thank you for your purchase! Order ${order.order_number ?? ''}.${res.download_link ? ` Download your receipt: ${res.download_link}` : ''}`;
        window.open(`https://wa.me/${waPhone(phone)}?text=${encodeURIComponent(message)}`, '_blank');
      },
      onError: (e: any) => toast.error(e?.response?.data?.error || 'Could not build the receipt link'),
    });
  }, [order?.id, order?.order_number, shareLink]);

  const openShareDialog = useCallback(() => setShareOpen(true), []);

  return {
    shareViaWhatsApp,
    openShareDialog,
    shareOpen,
    setShareOpen,
    shareLink,
  };
}

export function ReceiptShareButtons({
  order,
  className,
  compact = false,
  buttonClassName,
}: {
  order: ShareOrderLike | null | undefined;
  className?: string;
  compact?: boolean;
  buttonClassName?: string;
}) {
  const { shareViaWhatsApp, openShareDialog, shareOpen, setShareOpen, shareLink } = useOrderShareActions(order);

  if (!order) return null;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={compact ? 'ghost' : 'outline'}
          size={compact ? 'sm' : 'default'}
          className={buttonClassName}
          onClick={shareViaWhatsApp}
          disabled={shareLink.isPending}
        >
          <MessageCircle className="mr-2 h-4 w-4" /> Share via WhatsApp
        </Button>
        <Button
          type="button"
          variant={compact ? 'ghost' : 'outline'}
          size={compact ? 'sm' : 'default'}
          className={buttonClassName}
          onClick={openShareDialog}
        >
          <Mail className="mr-2 h-4 w-4" /> Send Notification
        </Button>
      </div>
      <ReceiptShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        orderId={order.id}
        defaultPhone={order.customer_phone ?? ''}
        defaultEmail={order.customer_email ?? ''}
      />
    </div>
  );
}
