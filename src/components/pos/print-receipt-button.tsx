'use client';

import { useState } from 'react';
import { Printer, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/base';
import { apiClient } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useAuthStore } from '@/store/auth';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { resolveBillProfile } from '@/lib/pos/printer-stations';
import { ReceiptPreview, type ReceiptData } from './receipt-preview';

interface PrintReceiptButtonProps {
  orderId: string;
  /** Button label — e.g. "Print Receipt" (default) or "Print Bill" for waiters. */
  label?: string;
  outletName?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  disabled?: boolean;
}

/**
 * PrintReceiptButton fetches the order's receipt (which carries the outlet's configured header,
 * footer, VAT rate, paper width and payment-display info from pos-api) and opens the print preview.
 *
 * Reusable across the order list, order detail, and tables/bill views so cashiers, managers, tenant
 * admins and waiters can (re)print a receipt or paid-bill at any time — not just immediately after payment.
 */
export function PrintReceiptButton({
  orderId,
  label = 'Print Receipt',
  outletName,
  variant = 'outline',
  size = 'sm',
  className,
  disabled,
}: PrintReceiptButtonProps) {
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenant_id ?? '';
  const { tenant } = useTenantBranding();
  const tenantName = tenant?.orgName || tenant?.name || undefined;
  const { data: posSettings } = usePOSSettings();

  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [open, setOpen] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!tenantId || !orderId) return;
    setLoading(true);
    try {
      const data = await apiClient.get<ReceiptData>(
        `/api/v1/${tenantId}/pos/orders/${orderId}/receipt`,
      );
      // "Served by" — trace the receipt to the staff member handling it. Prefer the
      // server name from the API; fall back to the currently logged-in user.
      setReceipt({ ...data, cashier_name: data.cashier_name || user?.fullName || user?.email });
      setOpen(true);
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to load receipt'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={handleClick}
        disabled={disabled || loading || !orderId}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
        {size !== 'icon' && <span className="ml-2">{label}</span>}
      </Button>

      <ReceiptPreview
        receipt={receipt}
        open={open}
        onClose={() => {
          setOpen(false);
          setReceipt(null);
        }}
        outletName={outletName}
        tenantName={tenantName}
        printerProfile={resolveBillProfile((posSettings as { printer_profiles?: Parameters<typeof resolveBillProfile>[0] })?.printer_profiles)}
        tenantId={tenantId}
        orderId={orderId}
      />
    </>
  );
}
