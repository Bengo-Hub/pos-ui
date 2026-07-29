'use client';

import { useState } from 'react';
import { Gift, Copy, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useGenerateComplimentaryCode } from '@/hooks/usePOS';
import { usePermissions, P } from '@/hooks/usePermissions';

interface GenerateComplimentaryCodeButtonProps {
  orderId: string;
  orderNumber: string;
  status: string;
  className?: string;
}

/**
 * Manager tool: generate a one-time code that authorizes closing THIS bill via the
 * Complimentary/no-charge tender, to share with a waiter/cashier when you can't be at the
 * terminal to scan a card or type your PIN. Visible only to managers, and only for bills that
 * haven't already been settled/voided (mirrors GenerateVoidCodeButton).
 */
export function GenerateComplimentaryCodeButton({ orderId, orderNumber, status, className }: GenerateComplimentaryCodeButtonProps) {
  const { can } = usePermissions();
  const isManager = can(P.ORDERS_VOID_SELF) || can(P.ORDERS_MANAGE);
  const generate = useGenerateComplimentaryCode();

  const [result, setResult] = useState<{ code: string; expires_in: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const eligible = !['completed', 'paid', 'closed', 'cancelled', 'voided', 'refunded'].includes((status || '').toLowerCase());
  if (!isManager || !eligible) return null;

  async function handleGenerate() {
    try {
      const res = await generate.mutateAsync({ orderId });
      setResult({ code: res.code, expires_in: res.expires_in });
    } catch {
      toast.error('Could not generate a complimentary code. Please try again.');
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
          'flex items-center gap-2 px-4 py-2 rounded-xl border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/5 transition-colors disabled:opacity-50'
        }
      >
        {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
        Complimentary code
      </button>

      {result && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setResult(null)} />
          <div className="relative z-[61] w-full max-w-sm mx-4 bg-card border border-border rounded-2xl shadow-xl p-6 space-y-4 text-center">
            <button onClick={() => setResult(null)} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
            <Gift className="h-10 w-10 text-primary mx-auto" />
            <div>
              <p className="text-sm font-semibold">Complimentary authorization code</p>
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
              Share this code with the waiter/cashier. They enter it under &ldquo;Manager approval → Code&rdquo;
              to close the bill as complimentary. Expires in {Math.round(result.expires_in / 60)} min · single use.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
