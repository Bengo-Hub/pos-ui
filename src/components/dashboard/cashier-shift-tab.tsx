'use client';

import { useCurrentShift, useShiftSummary, useCloseShift, useOpenShift } from '@/hooks/usePOS';
import { useAuthStore } from '@/store/auth';
import { fmt } from './widgets';
import { Clock, Loader2, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

function useElapsed(openedAt?: string) {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (!openedAt) { setElapsed(''); return; }
    const update = () => {
      const mins = Math.floor((Date.now() - new Date(openedAt).getTime()) / 60_000);
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      setElapsed(h > 0 ? `${h}h ${m}m` : `${m}m`);
    };
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [openedAt]);
  return elapsed;
}

export function CashierShiftTab({ orgSlug }: { orgSlug: string }) {
  const { data: shift, isLoading } = useCurrentShift();
  const { data: summary } = useShiftSummary();
  const closeShift = useCloseShift();
  const openShift = useOpenShift();
  const logout = useAuthStore((s) => s.logout);
  const elapsed = useElapsed(shift?.opened_at);

  const isOpen = shift?.session_status === 'open' || shift?.status === 'open';

  const handleClose = () => {
    if (!confirm('Close this shift? You will be logged out.')) return;
    closeShift.mutate(
      { endingCash: 0 },
      {
        onSuccess: () => {
          toast.success('Shift closed');
          logout();
        },
        onError: () => toast.error('Failed to close shift'),
      },
    );
  };

  const handleOpen = () => {
    openShift.mutate(
      { floatAmount: 0 },
      {
        onSuccess: () => toast.success('Shift opened'),
        onError: () => toast.error('Failed to open shift'),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isOpen) {
    return (
      <div className="text-center py-12 space-y-4">
        <Clock className="h-10 w-10 mx-auto text-muted-foreground opacity-30" />
        <p className="text-sm text-muted-foreground">No active shift</p>
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={handleOpen}
            disabled={openShift.isPending}
            className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 flex items-center gap-2"
          >
            {openShift.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Open Shift
          </button>
          <Link href={`/${orgSlug}/drawer`} className="text-xs text-primary hover:underline">
            Open cash drawer instead
          </Link>
        </div>
      </div>
    );
  }

  const tenders = [
    { label: 'Cash', value: summary?.cash_in_total ?? 0 },
    { label: 'Card', value: summary?.card_total ?? 0 },
    { label: 'M-Pesa', value: summary?.mpesa_total ?? 0 },
  ];

  return (
    <div className="space-y-5">
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Clock className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <p className="font-semibold text-sm">Shift Active</p>
            <p className="text-xs text-muted-foreground">{elapsed} elapsed</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-accent/30 rounded-xl p-3">
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Opening Float</p>
            <p className="text-lg font-bold">{fmt(shift?.float_amount ?? 0)}</p>
          </div>
          <div className="bg-accent/30 rounded-xl p-3">
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Shift Revenue</p>
            <p className="text-lg font-bold">{fmt(summary?.total_revenue ?? 0)}</p>
          </div>
        </div>
      </div>

      {tenders.some((t) => t.value > 0) && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <p className="text-sm font-bold">Tender Breakdown</p>
          </div>
          <div className="divide-y divide-border">
            {tenders.map((t) => (
              <div key={t.label} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-muted-foreground">{t.label}</span>
                <span className="text-sm font-semibold">{fmt(t.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Link
          href={`/${orgSlug}/drawer`}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-background text-sm font-semibold hover:bg-accent transition-colors"
        >
          <Wallet className="h-4 w-4" />
          Cash Drawer
        </Link>
        <button
          type="button"
          onClick={handleClose}
          disabled={closeShift.isPending}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 text-sm font-semibold hover:bg-destructive/20 transition-colors disabled:opacity-40"
        >
          {closeShift.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          End Shift &amp; Sign Out
        </button>
      </div>
    </div>
  );
}
