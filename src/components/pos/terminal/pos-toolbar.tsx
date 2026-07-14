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
  Calculator, ClipboardList, Inbox, PackageOpen, PauseCircle, Receipt, RotateCcw, Wallet, Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import type { TerminalProfile } from '@/lib/use-case-config';
import { useCashDrawer } from '@/hooks/useCashDrawer';
import { useHeldItems } from '@/hooks/useHeldItems';
import { GenerateApprovalCodeButton } from '@/components/pos/generate-approval-code-button';

export interface PosToolbarProps {
  orgSlug: string;
  profile: TerminalProfile;
  /** Show the Register Details (Z-report) action — roles that handle the cash drawer. */
  canRegister?: boolean;
  /** Show the calculator action (retail/pharmacy). */
  showCalculator?: boolean;
  onCalculator: () => void;
  onParkedSales: () => void;
  /** Open the hospitality Parked Items (set-aside/upsell) panel. */
  onHeldItems?: () => void;
  onAddExpense: () => void;
  /** Open the Recent Transactions modal (instead of navigating to All Sales). */
  onRecentTransactions: () => void;
  /** Open the Register Details (Z-report) modal. */
  onRegisterDetails: () => void;
  /** Open the Sell Return modal (invoice lookup). */
  onSellReturn: () => void;
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
  onCalculator, onParkedSales, onHeldItems, onAddExpense, onRecentTransactions, onRegisterDetails, onSellReturn,
}: PosToolbarProps) {
  const router = useRouter();
  const go = (path: string) => router.push(`/${orgSlug}${path}`);
  const isRetailish = profile === 'retail' || profile === 'pharmacy' || profile === 'services';
  const isHospitality = profile === 'hospitality' || profile === 'quick_service';
  // Parked (set-aside) item count for the hospitality badge — only fetched where the button shows.
  const { data: heldItems = [] } = useHeldItems('held', isHospitality && !!onHeldItems);

  // Cash drawer manual open — only roles that handle the drawer (same gate as Register Details).
  const { canOpen: canOpenDrawer, openDrawer } = useCashDrawer();
  const handleOpenDrawer = async () => {
    const ok = await openDrawer();
    if (ok) toast.success('Drawer opened.');
    else toast.error('Could not open the drawer. Check the drawer setting and that QZ Tray is running.');
  };

  // Hospitality/QSR run bills off tables + KDS, not the retail back-office surfaces — Sell Return,
  // Suspended Sales, Calculator and Repair are retail/services concepts and are hidden there.
  const buttons: ToolbarBtn[] = [
    { key: 'recent',   label: 'Recent Transactions', icon: ClipboardList, onClick: onRecentTransactions, show: true },
    { key: 'return',   label: 'Sell Return',         icon: RotateCcw,     onClick: onSellReturn, show: isRetailish },
    { key: 'register', label: 'Register Details',    icon: Wallet,        onClick: onRegisterDetails, show: canRegister },
    { key: 'drawer',   label: 'Open Drawer',         icon: Inbox,         onClick: handleOpenDrawer, show: canRegister && canOpenDrawer },
    { key: 'calc',     label: 'Calculator',          icon: Calculator,    onClick: onCalculator, show: showCalculator },
    { key: 'suspended',label: 'Suspended Sales',     icon: PauseCircle,   onClick: onParkedSales, show: isRetailish },
    // Hospitality upsell pool: items set aside on a replace, claimable into any active bill.
    {
      key: 'held',
      label: heldItems.length > 0 ? `Parked Items (${heldItems.length})` : 'Parked Items',
      icon: PackageOpen,
      onClick: () => onHeldItems?.(),
      show: isHospitality && !!onHeldItems,
    },
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
      {/* Manager-only: mint a one-time approval code (discount/price/adjustment/OOS override) to
          share with a cashier — the generate side of the ApprovalDialog "Code" tab. Self-gated. */}
      <GenerateApprovalCodeButton className="flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-lg border border-amber-500/40 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/5 transition-colors whitespace-nowrap" />
    </div>
  );
}
