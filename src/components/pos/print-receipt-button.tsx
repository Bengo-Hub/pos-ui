'use client';

import { useState } from 'react';
import { Printer, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/base';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
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
      setReceipt(data);
      setOpen(true);
    } catch {
      toast.error('Failed to load receipt');
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
      />
    </>
  );
}
