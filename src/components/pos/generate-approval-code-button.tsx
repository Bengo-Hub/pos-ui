'use client';

import { useState } from 'react';
import { KeyRound, Copy, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { rbacApi } from '@/lib/api/rbac';
import { usePermissions, P } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/auth';

// Same manager (override) roles the backend gates on for minting an approval code.
const MANAGER_ROLES = ['admin', 'manager', 'pos_admin', 'store_manager', 'owner', 'super_admin', 'superuser'];

// Pre-order actions a manager can pre-authorize with a shareable one-time code — the counterpart to
// the ApprovalDialog "Code" tab a cashier uses. Reuses the same OTP mechanism as void/complimentary.
const ACTIONS = [
  { id: 'order.discount_override', label: 'Over-limit discount' },
  { id: 'price.override', label: 'Price override' },
  { id: 'order.adjustment', label: 'Order tax / charges' },
  { id: 'catalog.oos_override', label: 'Out-of-stock override' },
] as const;

interface GenerateApprovalCodeButtonProps {
  className?: string;
}

/**
 * Manager tool: generate a one-time approval CODE for a pre-order action (over-limit discount,
 * price override, order adjustment, out-of-stock override) to share with a cashier who then enters
 * it under "Manager approval → Code". For when the manager can't be at the terminal to scan/PIN.
 * Manager-only; the backend re-checks the override role.
 */
export function GenerateApprovalCodeButton({ className }: GenerateApprovalCodeButtonProps) {
  const { can } = usePermissions();
  const tenantId = useAuthStore((s) => s.user?.tenant_id ?? '');
  const outletId = useAuthStore((s) => s.selectedOutletId || s.outlet?.id || '');
  const role = (useAuthStore((s) => s.user?.roles?.[0]) ?? '') as string;
  const isManager = MANAGER_ROLES.includes(role) || can(P.ORDERS_MANAGE);

  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<string>(ACTIONS[0].id);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ code: string; expires_in: number; label: string } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isManager) return null;

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await rbacApi.generateApprovalCode(tenantId, action, outletId);
      const label = ACTIONS.find((a) => a.id === action)?.label ?? action;
      setResult({ code: res.code, expires_in: res.expires_in, label });
    } catch {
      toast.error('Could not generate an approval code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setResult(null); setOpen(true); }}
        className={className ?? 'flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-500/40 text-amber-600 dark:text-amber-400 text-sm font-semibold hover:bg-amber-500/5 transition-colors'}
      >
        <KeyRound className="h-4 w-4" /> Approval code
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative z-[61] w-full max-w-sm mx-4 bg-card border border-border rounded-2xl shadow-xl p-6 space-y-4">
            <button onClick={() => setOpen(false)} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>

            {!result ? (
              <>
                <div className="text-center">
                  <KeyRound className="h-10 w-10 text-amber-500 mx-auto" />
                  <p className="text-sm font-semibold mt-2">Generate approval code</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Share it with a cashier to authorize a sensitive action remotely.</p>
                </div>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground">Action</span>
                  <select
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                    className="w-full bg-accent/10 border border-border rounded-xl py-2 px-3 text-sm focus:ring-1 focus:ring-primary outline-none"
                  >
                    {ACTIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Generate code
                </button>
              </>
            ) : (
              <div className="space-y-4 text-center">
                <KeyRound className="h-10 w-10 text-amber-500 mx-auto" />
                <div>
                  <p className="text-sm font-semibold">{result.label} code</p>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-3xl font-mono font-bold tracking-[0.3em] text-foreground">{result.code}</span>
                  <button
                    onClick={() => navigator.clipboard?.writeText(result.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
                    className="p-2 rounded-lg border border-border hover:bg-accent transition-colors"
                    title="Copy"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The cashier enters this under “Manager approval → Code”. Expires in {Math.round(result.expires_in / 60)} min · single use.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
