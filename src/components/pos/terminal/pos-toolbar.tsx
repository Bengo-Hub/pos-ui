'use client';

/**
 * GoDigital-style POS quick-action toolbar shown across the top of the order terminal.
 * These are the "missing UX buttons" from the GoDigital reference: Recent Transactions, Sell Return,
 * Register Details (Z-report), Calculator, Suspended Sales, Add Expense, Repair. Each links to the
 * existing surface (no duplication) and is use-case / role aware — Repair only for retail & services,
 * Register Details only for roles that handle the drawer.
 */

import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import {
  Calculator, ClipboardList, PauseCircle, Receipt, RotateCcw, Wallet, Wrench,
} from 'lucide-react';
import type { TerminalProfile } from '@/lib/use-case-config';

export interface PosToolbarProps {
  orgSlug: string;
  profile: TerminalProfile;
  /** Show the Register Details (Z-report) action — roles that handle the cash drawer. */
  canRegister?: boolean;
  /** Show the calculator action (retail/pharmacy). */
  showCalculator?: boolean;
  onCalculator: () => void;
  onParkedSales: () => void;
  onAddExpense: () => void;
}

interface ToolbarBtn {
  key: string;
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  show: boolean;
}

export function PosToolbar({
  orgSlug, profile, canRegister = true, showCalculator = false,
  onCalculator, onParkedSales, onAddExpense,
}: PosToolbarProps) {
  const router = useRouter();
  const go = (path: string) => router.push(`/${orgSlug}${path}`);
  const isRetailish = profile === 'retail' || profile === 'pharmacy' || profile === 'services';

  const buttons: ToolbarBtn[] = [
    { key: 'recent',   label: 'Recent Transactions', icon: ClipboardList, onClick: () => go('/orders'), show: true },
    { key: 'return',   label: 'Sell Return',         icon: RotateCcw,     onClick: () => go('/returns'), show: true },
    { key: 'register', label: 'Register Details',    icon: Wallet,        onClick: () => go('/shifts'), show: canRegister },
    { key: 'calc',     label: 'Calculator',          icon: Calculator,    onClick: onCalculator, show: showCalculator },
    { key: 'suspended',label: 'Suspended Sales',     icon: PauseCircle,   onClick: onParkedSales, show: true },
    { key: 'expense',  label: 'Add Expense',         icon: Receipt,       onClick: onAddExpense, show: true },
    { key: 'repair',   label: 'Repair',              icon: Wrench,        onClick: () => go('/repair'), show: isRetailish },
  ];

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide px-4 pt-3 pb-1 shrink-0">
      {buttons.filter((b) => b.show).map((b) => {
        const Icon = b.icon;
        return (
          <button
            key={b.key}
            type="button"
            onClick={b.onClick}
            title={b.label}
            className={cn(
              'flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold',
              'text-muted-foreground hover:text-foreground hover:bg-accent hover:border-primary/40 transition-colors',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-nowrap">{b.label}</span>
          </button>
        );
      })}
    </div>
  );
}
