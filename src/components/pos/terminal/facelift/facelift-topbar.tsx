'use client';

/**
 * FaceliftTopBar — top bar of the hospitality/QSR facelift: brand wordmark, large search
 * ("Search Categories or Menu..."), scan/QR button, notifications bell, "+ Add New Item" button
 * and the order header ("Order #123 · Opened 8:00am").
 *
 * Behaviour-preserving: the search input is wired to the SAME scanInputRef + handleSearchChange /
 * handleSearchKeyDown the shared terminal uses (so barcode-on-Enter still works); the scan button
 * focuses that field; "+ Add New Item" opens the existing Add-Expense/quick surface via the toolbar
 * — here it links to the back-office Add-Sale page only when relevant, otherwise focuses search.
 */

import { useRouter } from 'next/navigation';
import { useTerminal } from '@/components/pos/terminal/terminal-context';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { searchPlaceholderFor } from '@/lib/use-case-config';
import { cn } from '@/lib/utils';
import { Bell, Plus, ScanLine, Search, X } from 'lucide-react';

export function FaceliftTopBar({ onAddItem }: { onAddItem: () => void }) {
  const t = useTerminal();
  const { cfg } = t;
  const router = useRouter();
  const { tenant } = useTenantBranding();

  const orderLabel = t.currentOrderNumber
    ? `Order #${t.currentOrderNumber}`
    : t.isAddToBill
      ? 'Adding to bill'
      : 'New order';
  const openedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card">
      {/* Brand wordmark */}
      <div className="hidden md:flex items-center gap-2 shrink-0 min-w-0">
        {tenant?.logoUrl ? (
          <img src={tenant.logoUrl} alt={tenant?.orgName ?? ''} className="h-7 w-auto max-w-[120px] object-contain" />
        ) : (
          <span className="text-base font-extrabold tracking-tight truncate max-w-[160px]">
            {tenant?.orgName ?? t.orgSlug}
          </span>
        )}
      </div>

      {/* Search */}
      <div className="relative group flex-1 min-w-0 max-w-2xl">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary" />
        <input
          ref={t.scanInputRef}
          placeholder={cfg.profile === 'hospitality' || cfg.profile === 'quick_service' ? 'Search Categories or Menu…' : searchPlaceholderFor(cfg.profile)}
          className="w-full bg-background border border-border rounded-full py-2.5 pl-10 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
          value={t.searchQuery}
          onChange={(e) => t.handleSearchChange(e.target.value)}
          onKeyDown={t.handleSearchKeyDown}
        />
        {t.searchQuery && (
          <button
            onClick={() => t.handleSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/10 hover:text-destructive"
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Scan / QR */}
      <button
        type="button"
        onClick={() => t.scanInputRef.current?.focus()}
        title="Scan / QR"
        className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
      >
        <ScanLine className="h-4.5 w-4.5" />
      </button>

      {/* Notifications */}
      <button
        type="button"
        onClick={() => router.push(`/${t.orgSlug}/orders`)}
        title="Orders & notifications"
        className="relative hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
      >
        <Bell className="h-4.5 w-4.5" />
      </button>

      {/* + Add New Item */}
      <button
        type="button"
        onClick={onAddItem}
        className={cn(
          'shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold',
          'bg-primary text-primary-foreground hover:brightness-95 active:scale-95 transition-all',
        )}
      >
        <Plus className="h-4 w-4" />
        <span className="hidden lg:inline">Add New Item</span>
      </button>

      {/* Order header */}
      <div className="hidden xl:flex flex-col items-end shrink-0 pl-2 border-l border-border">
        <span className="text-sm font-bold leading-tight">{orderLabel}</span>
        <span className="text-[11px] text-muted-foreground leading-tight">Opened {openedAt}</span>
      </div>
    </div>
  );
}
