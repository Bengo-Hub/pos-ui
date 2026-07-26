'use client';

import { Button } from '@/components/ui/button';
import { useReceiptShareLink } from '@/hooks/usePOS';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { Mail, MessageCircle } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
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
  const [waPromptOpen, setWaPromptOpen] = useState(false);
  const { tenant } = useTenantBranding();
  // Holds the blank tab opened synchronously in the click handler (before the async share-link
  // fetch resolves) so it can be navigated later without a second window.open() call — a browser
  // only allows window.open() during the original user-gesture call stack; opening it AFTER an
  // await/mutation callback is what got silently blocked (the "Pop-ups blocked" banner).
  const pendingWinRef = useRef<Window | null>(null);
  const pendingDownloadLinkRef = useRef<string | undefined>(undefined);
  // Tracks whether the "no phone on file" prompt was actually submitted (vs. cancelled/dismissed),
  // so the dialog's onOpenChange cleanup (below) doesn't re-fire the empty-phone cleanup path a
  // second time after a real submission already navigated the pending window.
  const waSubmittedRef = useRef(false);

  const buildMessage = useCallback((downloadLink?: string) => {
    const store = tenant?.name?.trim();
    const greeting = store ? `Thank you for shopping with ${store}!` : 'Thank you for your purchase!';
    const orderLine = order?.order_number ? ` Order ${order.order_number}.` : '';
    const linkLine = downloadLink ? ` Download your receipt: ${downloadLink}` : '';
    return `${greeting}${orderLine}${linkLine}`;
  }, [tenant?.name, order?.order_number]);

  const openWhatsApp = useCallback((phone: string, downloadLink?: string) => {
    const trimmed = phone.trim();
    if (!trimmed) {
      pendingWinRef.current?.close();
      pendingWinRef.current = null;
      return;
    }
    const url = `https://wa.me/${waPhone(trimmed)}?text=${encodeURIComponent(buildMessage(downloadLink))}`;
    const win = pendingWinRef.current;
    pendingWinRef.current = null;
    if (win && !win.closed) {
      win.location.href = url;
    } else {
      // The pre-opened tab is gone (already closed) or was itself blocked — try once more
      // directly (still inside this click/dialog-submit user gesture) before falling back.
      const retry = window.open(url, '_blank');
      if (!retry) {
        toast.error('Pop-up blocked — tap the link to open WhatsApp', {
          action: { label: 'Open', onClick: () => window.open(url, '_blank') },
        });
      }
    }
  }, [buildMessage]);

  const shareViaWhatsApp = useCallback(() => {
    if (!order?.id) return;
    // Open the tab synchronously, still inside the click handler's user-gesture — filled in (or
    // closed) once the share-link fetch resolves below.
    pendingWinRef.current = window.open('', '_blank');
    shareLink.mutate(order.id, {
      onSuccess: (res: { download_link?: string; customer_phone?: string }) => {
        pendingDownloadLinkRef.current = res.download_link;
        if (res.customer_phone) {
          openWhatsApp(res.customer_phone, res.download_link);
        } else {
          // No phone on file — ask via the same modal the other notification actions use,
          // instead of a raw window.prompt().
          pendingWinRef.current?.close();
          pendingWinRef.current = null;
          waSubmittedRef.current = false;
          setWaPromptOpen(true);
        }
      },
      onError: (e: any) => {
        pendingWinRef.current?.close();
        pendingWinRef.current = null;
        toast.error(e?.response?.data?.error || 'Could not build the receipt link');
      },
    });
  }, [order?.id, shareLink, openWhatsApp]);

  const openShareDialog = useCallback(() => setShareOpen(true), []);

  return {
    shareViaWhatsApp,
    openShareDialog,
    shareOpen,
    setShareOpen,
    waPromptOpen,
    setWaPromptOpen,
    onManualWhatsAppPhone: (phone: string) => {
      waSubmittedRef.current = true;
      openWhatsApp(phone, pendingDownloadLinkRef.current);
    },
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
  const {
    shareViaWhatsApp, openShareDialog, shareOpen, setShareOpen,
    waPromptOpen, setWaPromptOpen, onManualWhatsAppPhone, shareLink,
  } = useOrderShareActions(order);

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
      {/* No phone on file for the wa.me quick-share — ask via the same modal as the other
          notification actions, instead of a raw window.prompt(). */}
      <ReceiptShareDialog
        open={waPromptOpen}
        onOpenChange={(v) => {
          // Only treat closing as a cancellation (and tear down the pending window) when the
          // dialog wasn't already closed by a real submission via onManualWhatsAppPhone above —
          // otherwise this would immediately re-run with an empty phone right after a successful
          // Continue click and close the tab that was just navigated to WhatsApp.
          if (!v && !waSubmittedRef.current) onManualWhatsAppPhone('');
          setWaPromptOpen(v);
        }}
        orderId={order.id}
        title="Share via WhatsApp"
        forcedChannel="whatsapp"
        onManualSend={onManualWhatsAppPhone}
      />
    </div>
  );
}
