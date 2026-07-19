'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/base';
import { apiClient } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useAuthStore } from '@/store/auth';

interface DownloadReceiptButtonProps {
  orderId: string;
  orderNumber?: string;
  label?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

/**
 * Direct PDF download — no print-agent queue, no preview modal, no printer resolution at all.
 * Fetches the same server-rendered `?format=pdf` (real fpdf, printing/layouts registry) that
 * ReceiptPreview's Save PDF uses, but as a one-click action from the sale details view — a
 * reliable "just get me the file" path when the print pipeline itself is the thing that's broken.
 */
export function DownloadReceiptButton({ orderId, orderNumber, label = 'Download PDF', variant = 'outline', size = 'sm', className }: DownloadReceiptButtonProps) {
  const tenantId = useAuthStore((s) => s.user?.tenant_id ?? '');
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!tenantId || !orderId) return;
    setLoading(true);
    try {
      const blob = await apiClient.getBlob(`/api/v1/${tenantId}/pos/orders/${orderId}/receipt`, { format: 'pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${orderNumber ?? orderId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to download the receipt PDF'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant={variant} size={size} className={className} onClick={handleClick} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {size !== 'icon' && <span className="ml-2">{label}</span>}
    </Button>
  );
}
