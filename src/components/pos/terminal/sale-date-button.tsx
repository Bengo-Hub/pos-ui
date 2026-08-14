'use client';

import { useState } from 'react';
import { CalendarClock, X } from 'lucide-react';
import { usePermissions, P } from '@/hooks/usePermissions';
import { useTerminal } from './terminal-context';

/**
 * Admin/manager backdate-at-entry control for the POS terminal — lets a privileged user ring up
 * a sale as if it happened on an earlier day (a missed sale, an offline recovery) instead of
 * using the separate retroactive "move sale date" tool on All Sales afterward. Self-gated on
 * pos.orders.manage (renders nothing for a cashier); the server re-checks the same permission
 * and additionally bounds the date (not future, not absurdly far in the past). Reads/writes
 * `saleDate` directly on TerminalProvider so it flows into whichever creation path the cashier
 * uses next (Draft/Quotation, Place Order/Send to Kitchen, or a tender).
 */
export function SaleDateButton({ className }: { className?: string }) {
  const { can } = usePermissions();
  const { saleDate, setSaleDate } = useTerminal();
  const [open, setOpen] = useState(false);

  if (!can(P.ORDERS_MANAGE)) return null;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Backdate this sale (admin/manager only)"
        className={
          className ??
          `flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
            saleDate
              ? 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/5'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent hover:border-primary/40'
          }`
        }
      >
        <CalendarClock className="h-3.5 w-3.5 shrink-0" />
        <span className="whitespace-nowrap">{saleDate || 'Sale Date'}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-card border border-border rounded-xl shadow-xl p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Report this sale under an earlier date instead of today. Admin/manager only.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                autoFocus
                value={saleDate}
                max={today}
                onChange={(e) => setSaleDate(e.target.value)}
                className="flex-1 min-w-0 bg-background border border-border rounded-md py-1.5 px-2 text-sm"
              />
              {saleDate && (
                <button
                  type="button"
                  onClick={() => setSaleDate('')}
                  title="Clear — use today"
                  className="p-1.5 rounded-md border border-border hover:bg-accent transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
