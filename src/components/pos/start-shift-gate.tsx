'use client';

import { useCurrentShift, useOpenShift } from '@/hooks/useShifts';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { Loader2, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'sonner';

// Roles that always require an explicit shift start (with or without float)
// Admin and manager are exempt — they can access the app without opening a shift.
const SHIFT_ROLES = ['cashier', 'waiter', 'receptionist'];
// Roles that get the opening float input (cashier manages cash)
const FLOAT_ROLES = ['cashier'];
// Roles that auto-open a shift immediately on login (no gate UI)
const AUTO_SHIFT_ROLES = ['kitchen', 'bar'];

interface StartShiftGateProps {
  children: React.ReactNode;
}

export function StartShiftGate({ children }: StartShiftGateProps) {
  const user = useAuthStore((s) => s.user);
  const outlet = useAuthStore((s) => s.outlet);
  const isTerminalSession = useAuthStore((s) => s.isTerminalSession);
  const router = useRouter();
  const params = useParams();
  const orgSlug = params?.orgSlug as string | undefined;

  const role = user?.roles?.[0] ?? '';
  const outletUseCase = (outlet?.use_case ?? (user as any)?.outlet_use_case ?? '').toLowerCase();
  const isCashierHospOrQSR = role === 'cashier' && ['hospitality', 'quick_service'].includes(outletUseCase);

  const needsShiftGate = SHIFT_ROLES.includes(role);
  const needsFloat = FLOAT_ROLES.includes(role);
  const isAutoShift = AUTO_SHIFT_ROLES.includes(role);

  const { data: currentShift, isLoading, error } = useCurrentShift();
  const openShift = useOpenShift();

  const [float, setFloat] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // noShift = query settled with no active session (404 = no open session exists)
  const noShift = !isLoading && !currentShift && (error as any)?.response?.status === 404;
  const showGate = isTerminalSession && needsShiftGate && noShift && !submitted;

  // Auto-open shift for kitchen/bar without showing the gate UI
  useEffect(() => {
    if (isTerminalSession && isAutoShift && noShift && !submitted && !openShift.isPending) {
      openShift.mutate(0);
      setSubmitted(true);
    }
  }, [isTerminalSession, isAutoShift, noShift, submitted, openShift.isPending]);

  async function handleBeginShift() {
    const opening = needsFloat ? (parseFloat(float) || 0) : 0;
    try {
      await openShift.mutateAsync(opening);
      setSubmitted(true);
      toast.success('Shift started');
      // Cashiers in hospitality/quick_service go straight to the Orders page
      // (their only workflow is clearing bills, not taking new orders).
      if (isCashierHospOrQSR && orgSlug) {
        router.push(`/${orgSlug}/orders`);
      }
    } catch {
      toast.error('Failed to open shift');
    }
  }

  if (!showGate) return <>{children}</>;

  return (
    <>
      {children}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-3xl border border-border bg-card shadow-2xl p-8 flex flex-col gap-6">

          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Play className="h-8 w-8 text-primary fill-primary/30" />
            </div>
            <div>
              <h2 className="text-xl font-black text-foreground">Begin Your Shift</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {needsFloat
                  ? 'Enter the opening float (cash in drawer) to start your shift.'
                  : 'Confirm to start your shift and begin serving.'}
              </p>
            </div>
          </div>

          {needsFloat && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Opening Float (KES)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">KES</span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  placeholder="0.00"
                  value={float}
                  onChange={(e) => setFloat(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleBeginShift()}
                  className="w-full pl-12 pr-4 py-3 rounded-xl border border-border bg-background text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Leave as 0 if starting without float.</p>
            </div>
          )}

          <button
            onClick={handleBeginShift}
            disabled={openShift.isPending}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl',
              'bg-primary text-primary-foreground font-bold text-sm',
              'hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60 transition-all',
              'shadow-lg shadow-primary/25'
            )}
          >
            {openShift.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {openShift.isPending ? 'Starting shift…' : 'Start Shift →'}
          </button>
        </div>
      </div>
    </>
  );
}
