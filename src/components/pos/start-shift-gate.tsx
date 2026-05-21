'use client';

import { useCurrentShift, useOpenShift } from '@/hooks/useShifts';
import { useAuthStore } from '@/store/auth';
import { useModuleAccess } from '@/hooks/use-module-access';
import { cn } from '@/lib/utils';
import { Loader2, Play } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const CASHIER_ROLES = ['cashier', 'waiter', 'kitchen', 'bar', 'receptionist'];

interface StartShiftGateProps {
  children: React.ReactNode;
}

export function StartShiftGate({ children }: StartShiftGateProps) {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const { hasModule } = useModuleAccess();

  const isTerminalSession = status === 'authenticated' && !!user;
  const shiftsEnabled = hasModule('shifts');
  const role = user?.roles?.[0] ?? '';
  const isCashierRole = CASHIER_ROLES.includes(role);

  const { data: currentShift, isLoading, error } = useCurrentShift();
  const openShift = useOpenShift();

  const [float, setFloat] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const noShift = !isLoading && !currentShift && (error as any)?.status === 404;
  const showGate = isTerminalSession && shiftsEnabled && isCashierRole && noShift && !submitted;

  async function handleBeginShift() {
    const opening = parseFloat(float) || 0;
    try {
      await openShift.mutateAsync(opening);
      setSubmitted(true);
      toast.success('Shift started');
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
                Enter the opening float (cash in drawer) to start your shift.
              </p>
            </div>
          </div>

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
            {openShift.isPending ? 'Starting shift…' : 'Begin Shift'}
          </button>
        </div>
      </div>
    </>
  );
}
