'use client';

import { useState } from 'react';
import { KeyRound, ScanLine, ShieldAlert, X } from 'lucide-react';
import { PINKeypad } from '@/components/pos/pin-keypad';
import { BarcodeScannerInput } from '@/components/pos/barcode-scanner-input';
import { rbacApi } from '@/lib/api/rbac';
import { useAuthStore } from '@/store/auth';

export interface ApprovalResult {
  approvalToken?: string;
  code?: string;
}

interface ApprovalDialogProps {
  open: boolean;
  /** The step-up action string this approval authorizes (e.g. 'order.void', 'order.complimentary')
   *  — must match the action pos-api's step-up/approval-code verification expects. */
  action: string;
  description: string;
  confirmLabel?: string;
  onApproved: (approval: ApprovalResult) => void;
  onClose: () => void;
}

/**
 * Generic manager-approval dialog for sensitive POS actions, in THREE ways:
 *  1. Scan the manager's QR staff card (live step-up → approval token).
 *  2. Enter the manager's PIN at the terminal (live step-up → approval token).
 *  3. Enter a one-time authorization CODE the manager generated remotely and shared — for when
 *     the manager isn't physically present.
 * Originally built for Void; generalized so any action (Complimentary, etc.) reuses this same
 * three-tab flow by passing its own `action` — never duplicate this per feature.
 */
export function ApprovalDialog({ open, action, description, confirmLabel = 'Authorize', onApproved, onClose }: ApprovalDialogProps) {
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenant_id ?? '';
  const selectedOutletId = useAuthStore((s) => s.selectedOutletId);
  const outlet = useAuthStore((s) => s.outlet);
  const outletId = selectedOutletId || outlet?.id || '';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'scan' | 'pin' | 'code'>('scan');
  const [code, setCode] = useState('');

  if (!open) return null;

  async function handlePin(pin: string) {
    if (!outletId) { setError('No outlet selected'); return; }
    setLoading(true); setError(null);
    try {
      const res = await rbacApi.stepUp(tenantId, action, pin, outletId);
      onApproved({ approvalToken: res.approval_token });
    } catch (e) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'PIN not authorized');
    } finally { setLoading(false); }
  }

  async function handleScan(cardToken: string) {
    if (!outletId) { setError('No outlet selected'); return; }
    setLoading(true); setError(null);
    try {
      const res = await rbacApi.stepUpCard(tenantId, action, cardToken, outletId);
      onApproved({ approvalToken: res.approval_token });
    } catch (e) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Card not authorized');
    } finally { setLoading(false); }
  }

  function handleCode() {
    const c = code.trim();
    if (c.length < 4) { setError('Enter the authorization code the manager gave you'); return; }
    onApproved({ code: c });
  }

  const tab = (id: typeof mode, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => { setMode(id); setError(null); }}
      className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-semibold rounded-md transition-colors ${mode === id ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
    >
      {icon} {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-[61] w-full max-w-sm mx-4 bg-card border border-border rounded-2xl shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-500" /> Manager approval
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground text-center">{description}</p>

        <div className="flex gap-1 bg-accent/10 p-1 rounded-lg">
          {tab('scan', 'Scan card', <ScanLine className="h-3.5 w-3.5" />)}
          {tab('pin', 'PIN', <KeyRound className="h-3.5 w-3.5" />)}
          {tab('code', 'Code', <ShieldAlert className="h-3.5 w-3.5" />)}
        </div>

        {mode === 'scan' && (
          <div className="space-y-2">
            <BarcodeScannerInput autoFocus placeholder="Scan manager card…" disabled={loading} onScan={handleScan} />
            <p className="text-[11px] text-muted-foreground text-center">Scan the manager&apos;s QR staff card to approve instantly.</p>
          </div>
        )}
        {mode === 'pin' && <PINKeypad onConfirm={handlePin} loading={loading} error={null} />}
        {mode === 'code' && (
          <div className="space-y-2">
            <input
              autoFocus
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCode(); }}
              placeholder="Authorization code"
              className="w-full text-center tracking-[0.4em] font-mono text-lg rounded-lg border border-border bg-background px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <p className="text-[11px] text-muted-foreground text-center">
              Enter the one-time code the manager generated and shared with you.
            </p>
            <button
              onClick={handleCode}
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {confirmLabel}
            </button>
          </div>
        )}

        {error && <p className="text-xs text-destructive text-center">{error}</p>}
      </div>
    </div>
  );
}
