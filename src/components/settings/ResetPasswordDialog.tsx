'use client';

import { useState } from 'react';
import { Loader2, Mail, KeyRound, X } from 'lucide-react';
import { Button } from '@/components/ui/base';
import { adminResetPassword, adminSendPasswordResetEmail } from '@/lib/auth/admin-actions';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { inputClass } from './shared';

type Mode = 'choose' | 'set';

/**
 * Team-page password reset for a staff member's SSO login. Two paths, mirroring the
 * platform Users page's own admin actions (auth-api's AdminResetPassword /
 * AdminSendPasswordResetEmail, now also reachable by a tenant admin, not just a
 * platform admin): send the standard reset-password email, or set a new password
 * directly and hand it to the admin once.
 */
export function ResetPasswordDialog({
  staff,
  open,
  onClose,
  accessToken,
}: {
  staff: { user_id: string; name: string } | null;
  open: boolean;
  onClose: () => void;
  accessToken: string | null | undefined;
}) {
  const [mode, setMode] = useState<Mode>('choose');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  if (!open || !staff) return null;

  function reset() {
    setMode('choose');
    setPassword('');
    setConfirmPassword('');
    setTempPassword(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSendEmail() {
    setSending(true);
    try {
      await adminSendPasswordResetEmail(accessToken, staff!.user_id);
      toast.success(`Reset email sent to ${staff!.name}`);
      handleClose();
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to send reset email'));
    } finally {
      setSending(false);
    }
  }

  async function handleSetPassword() {
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setSending(true);
    try {
      await adminResetPassword(accessToken, staff!.user_id, password);
      toast.success(`Password updated for ${staff!.name}`);
      handleClose();
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to set password'));
    } finally {
      setSending(false);
    }
  }

  async function handleGenerate() {
    setSending(true);
    try {
      const res = await adminResetPassword(accessToken, staff!.user_id);
      setTempPassword(res.temp_password ?? null);
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to generate password'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative z-[61] w-full max-w-sm mx-4 bg-card border border-border rounded-2xl shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">Reset password — {staff.name}</h3>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {tempPassword ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Share this temporary password with {staff.name} — it won&apos;t be shown again. They&apos;ll be asked to change it at next login.
            </p>
            <div className="rounded-lg border border-border bg-accent/10 px-3 py-2 font-mono text-sm text-center select-all">
              {tempPassword}
            </div>
            <Button className="w-full" onClick={handleClose}>Done</Button>
          </div>
        ) : mode === 'choose' ? (
          <div className="space-y-2">
            <button
              onClick={handleSendEmail}
              disabled={sending}
              className="w-full flex items-center gap-3 rounded-lg border border-border p-3 text-left hover:bg-accent/10 transition-colors disabled:opacity-50"
            >
              <Mail className="h-4 w-4 text-primary shrink-0" />
              <span>
                <span className="block text-sm font-semibold">Send reset email</span>
                <span className="block text-xs text-muted-foreground">They&apos;ll get a link to choose their own new password.</span>
              </span>
              {sending && <Loader2 className="h-3.5 w-3.5 animate-spin ml-auto" />}
            </button>
            <button
              onClick={() => setMode('set')}
              disabled={sending}
              className="w-full flex items-center gap-3 rounded-lg border border-border p-3 text-left hover:bg-accent/10 transition-colors disabled:opacity-50"
            >
              <KeyRound className="h-4 w-4 text-primary shrink-0" />
              <span>
                <span className="block text-sm font-semibold">Set a new password</span>
                <span className="block text-xs text-muted-foreground">Choose it yourself, or generate a one-time temporary password.</span>
              </span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">New password</label>
              <input
                type="password"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Confirm password</label>
              <input
                type="password"
                className={inputClass}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => setMode('choose')} disabled={sending}>
                Back
              </Button>
              <Button size="sm" className="flex-1" onClick={handleSetPassword} disabled={sending}>
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Set password'}
              </Button>
            </div>
            <button
              onClick={handleGenerate}
              disabled={sending}
              className="w-full text-center text-xs text-primary hover:underline disabled:opacity-50"
            >
              Or generate a random temporary password instead
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
