'use client';

import { useState } from 'react';
import { ScanLine, ShieldAlert, X } from 'lucide-react';
import { PINKeypad } from '@/components/pos/pin-keypad';
import { BarcodeScannerInput } from '@/components/pos/barcode-scanner-input';
import { rbacApi } from '@/lib/api/rbac';
import { useAuthStore } from '@/store/auth';

interface ManagerPinDialogProps {
  open: boolean;
  /** Dotted action code the approval is for, e.g. "order.void", "order.line_remove". */
  action: string;
  /** Human label shown in the prompt, e.g. "void this order". */
  label?: string;
  onApproved: (approvalToken: string) => void;
  onClose: () => void;
}

/**
 * ManagerPinDialog requires a manager to re-enter their PIN to authorize a
 * sensitive action (void, line removal, discount/price override, large refund).
 * It calls the step-up endpoint and hands the resulting short-lived
 * approval_token back to the caller, which passes it to the action API.
 *
 * Reuses the shared PINKeypad component.
 */
export function ManagerPinDialog({ open, action, label, onApproved, onClose }: ManagerPinDialogProps) {
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenant_id ?? '';
  const selectedOutletId = useAuthStore((s) => s.selectedOutletId);
  const outlet = useAuthStore((s) => s.outlet);
  const outletId = selectedOutletId || outlet?.id || '';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Default to scan mode — faster and avoids PIN shoulder-surfing.
  const [mode, setMode] = useState<'scan' | 'pin'>('scan');

  if (!open) return null;

  async function handleConfirm(pin: string) {
    if (!outletId) {
      setError('No outlet selected');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await rbacApi.stepUp(tenantId, action, pin, outletId);
      onApproved(res.approval_token);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'PIN not authorized for this action');
    } finally {
      setLoading(false);
    }
  }

  async function handleScan(cardToken: string) {
    if (!outletId) {
      setError('No outlet selected');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await rbacApi.stepUpCard(tenantId, action, cardToken, outletId);
      onApproved(res.approval_token);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Card not authorized for this action');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-[61] w-full max-w-sm mx-4 bg-card border border-border rounded-2xl shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-500" /> Manager approval
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          A manager must approve to {label ?? 'authorize this action'}.
        </p>

        {/* Scan | PIN toggle — scanning a manager's QR card avoids typing the PIN. */}
        <div className="flex gap-1 bg-accent/10 p-1 rounded-lg">
          <button
            onClick={() => { setMode('scan'); setError(null); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${mode === 'scan' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
          >
            <ScanLine className="h-3.5 w-3.5" /> Scan card
          </button>
          <button
            onClick={() => { setMode('pin'); setError(null); }}
            className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${mode === 'pin' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
          >
            Enter PIN
          </button>
        </div>

        {mode === 'scan' ? (
          <div className="space-y-2">
            <BarcodeScannerInput
              autoFocus
              placeholder="Scan manager card…"
              disabled={loading}
              onScan={handleScan}
            />
            <p className="text-[11px] text-muted-foreground text-center">
              Scan the manager&apos;s QR staff card to approve instantly.
            </p>
            {error && <p className="text-xs text-destructive text-center">{error}</p>}
          </div>
        ) : (
          <PINKeypad onConfirm={handleConfirm} loading={loading} error={error} />
        )}
      </div>
    </div>
  );
}
