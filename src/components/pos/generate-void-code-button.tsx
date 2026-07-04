'use client';

import { useState } from 'react';
import { KeyRound, Copy, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useGenerateVoidCode } from '@/hooks/usePOS';
import { usePermissions, P } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/auth';

// Roles that may authorize a void (mirror of the backend override roles). Only these see the
// "Generate void code" action — it's a manager tool for authorizing a void remotely.
const MANAGER_ROLES = ['admin', 'manager', 'pos_admin', 'store_manager', 'owner', 'super_admin', 'superuser'];

interface GenerateVoidCodeButtonProps {
  orderId: string;
  orderNumber: string;
  status: string;
  className?: string;
}

/**
 * Manager tool: generate a one-time code that authorizes voiding THIS bill, to share with a
 * waiter/cashier when you can't be at the terminal to scan a card or type your PIN. Visible only
 * to managers, and only for still-voidable bills.
 */
export function GenerateVoidCodeButton({ orderId, orderNumber, status, className }: GenerateVoidCodeButtonProps) {
  const { can } = usePermissions();
  const role = (useAuthStore((s) => s.user?.roles?.[0]) ?? '') as string;
  const isManager = MANAGER_ROLES.includes(role) || can(P.ORDERS_MANAGE);
  const generate = useGenerateVoidCode();

  const [result, setResult] = useState<{ code: string; expires_in: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const voidable = !['completed', 'paid', 'closed', 'cancelled', 'voided', 'refunded'].includes((status || '').toLowerCase());
  if (!isManager || !voidable) return null;

  async function handleGenerate() {
    try {
      const res = await generate.mutateAsync({ orderId });
      setResult({ code: res.code, expires_in: res.expires_in });
    } catch {
      toast.error('Could not generate a void code. Please try again.');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleGenerate}
        disabled={generate.isPending}
        className={
          className ??
          'flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-500/40 text-amber-600 dark:text-amber-400 text-sm font-semibold hover:bg-amber-500/5 transition-colors disabled:opacity-50'
        }
      >
        {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Void code
      </button>

      {result && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setResult(null)} />
          <div className="relative z-[61] w-full max-w-sm mx-4 bg-card border border-border rounded-2xl shadow-xl p-6 space-y-4 text-center">
            <button onClick={() => setResult(null)} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
            <KeyRound className="h-10 w-10 text-amber-500 mx-auto" />
            <div>
              <p className="text-sm font-semibold">Void authorization code</p>
              <p className="text-xs text-muted-foreground mt-0.5">for bill #{orderNumber}</p>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-3xl font-mono font-bold tracking-[0.3em] text-foreground">{result.code}</span>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(result.code).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
                className="p-2 rounded-lg border border-border hover:bg-accent transition-colors"
                title="Copy"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Share this code with the waiter/cashier. They enter it under “Manager approval → Code”
              to void the bill. Expires in {Math.round(result.expires_in / 60)} min · single use.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
