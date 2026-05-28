'use client';

import { apiClient } from '@/lib/api/client';
import { useKDSStations } from '@/hooks/useKDS';
import { CheckCircle2, Loader2, Printer } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface OrderPlacedDialogProps {
  open: boolean;
  orderNumber: string;
  orderId: string;
  tenantId: string;
  orgSlug: string;
  onClose?: () => void;
}

export function OrderPlacedDialog({ open, orderNumber, orderId, tenantId, orgSlug, onClose }: OrderPlacedDialogProps) {
  const router = useRouter();
  const { data: stationsData } = useKDSStations();
  const [printing, setPrinting] = useState(false);

  if (!open) return null;

  const stations = stationsData?.data ?? [];
  const kdsDestination = stations.length > 0
    ? stations.filter((s) => s.is_active !== false).map((s) => s.name).join(', ')
    : 'Kitchen';

  const handleLogout = () => {
    onClose?.();
    router.replace(`/${orgSlug}/pin-login`);
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const html = await apiClient.get<string>(`/api/v1/${tenantId}/pos/orders/${orderId}/receipt/html`);
      const win = window.open('', '_blank', 'width=400,height=600');
      if (win) {
        win.document.write(html as string);
        win.document.close();
        win.focus();
        win.print();
        win.addEventListener('afterprint', () => win.close());
      }
    } catch {
      // Print failed silently — still log out
    } finally {
      setPrinting(false);
      handleLogout();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card rounded-3xl border border-border shadow-2xl w-80 p-8 flex flex-col items-center gap-5">
        {/* Success icon */}
        <CheckCircle2 className="h-14 w-14 text-emerald-500" strokeWidth={1.5} />

        {/* Heading */}
        <div className="text-center">
          <p className="text-xl font-bold font-display">Order Placed!</p>
          <p className="text-sm text-muted-foreground mt-1">
            {orderNumber} → {kdsDestination}
          </p>
        </div>

        {/* Auto-logout notice */}
        <div className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <span className="text-base">🔒</span>
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Auto-logout. Shift stays active.</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 w-full">
          <button
            onClick={handlePrint}
            disabled={printing}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-border text-sm font-semibold hover:bg-accent/30 transition-colors disabled:opacity-50"
          >
            {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Print Bill
          </button>
          <button
            onClick={handleLogout}
            className="flex-1 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
