'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, Printer, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/base';
import { staffApi } from '@/lib/api/staff';
import type { StaffMember } from '@/lib/api/staff';
import { useAuthStore } from '@/store/auth';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';

/**
 * StaffCardModal renders a printable staff approval card whose QR encodes a
 * signed manager-card token (NOT the raw PIN). A manager scans this card to
 * approve sensitive actions without typing their PIN — fast and shoulder-surf
 * resistant. Only override-role staff can actually approve with their card.
 */
export function StaffCardModal({ staff, open, onClose }: { staff: StaffMember | null; open: boolean; onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenant_id ?? '';
  const [qr, setQr] = useState<string | null>(null);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !staff) return;
    let cancelled = false;
    setLoading(true);
    setQr(null);
    staffApi
      .cardToken(tenantId, staff.user_id)
      .then(async (res) => {
        const dataUrl = await QRCode.toDataURL(res.card_token, { width: 320, margin: 1, errorCorrectionLevel: 'M' });
        if (!cancelled) {
          setQr(dataUrl);
          setCanApprove(res.can_approve);
        }
      })
      .catch(async (e) => { if (!cancelled) toast.error(await apiErrorMessage(e, 'Failed to generate card')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, staff, tenantId]);

  if (!open || !staff) return null;

  function handlePrint() {
    const win = window.open('', '_blank', 'width=480,height=640');
    if (!win || !qr) return;
    win.document.write(`
      <html><head><title>Staff Card — ${staff!.name}</title>
      <style>
        body { font-family: system-ui, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
        .card { width:320px; border:2px solid #111; border-radius:16px; padding:24px; text-align:center; }
        .name { font-size:20px; font-weight:800; margin:8px 0 2px; }
        .role { font-size:13px; color:#555; text-transform:capitalize; margin-bottom:16px; }
        img { width:240px; height:240px; }
        .hint { font-size:11px; color:#777; margin-top:12px; }
      </style></head>
      <body><div class="card">
        <div class="name">${staff!.name}</div>
        <div class="role">${staff!.role}</div>
        <img src="${qr}" alt="staff card qr" />
        <div class="hint">Scan to approve manager actions</div>
      </div></body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-[61] w-full max-w-sm mx-4 bg-card border border-border rounded-2xl shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">Staff Approval Card</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="rounded-2xl border-2 border-border p-5 text-center">
          <p className="text-lg font-black">{staff.name}</p>
          <p className="text-xs text-muted-foreground capitalize mb-3">{staff.role}</p>
          <div className="flex justify-center min-h-[200px] items-center">
            {loading || !qr ? (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            ) : (
              <img src={qr} alt="staff card QR" className="w-48 h-48" />
            )}
          </div>
        </div>

        {!canApprove && !loading && (
          <p className="text-[11px] text-amber-600 text-center">
            This staff member&apos;s role cannot approve manager actions — the card is informational only.
          </p>
        )}
        {canApprove && (
          <p className="text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-green-600" /> Scan at the terminal to approve voids, overrides &amp; refunds.
          </p>
        )}

        <Button className="w-full" onClick={handlePrint} disabled={!qr}>
          <Printer className="h-4 w-4 mr-1" /> Print card
        </Button>
      </div>
    </div>
  );
}
