'use client';

/**
 * Terminal left-panel header band — GoDigital quick-action toolbar, search/scan box, category nav +
 * display-mode toggle, the add-to-bill banner and the optional hardware scale. Extracted verbatim
 * from the monolith order page; all gating reads from useTerminal()/cfg so behaviour is unchanged.
 */

import { PosToolbar } from '@/components/pos/terminal/pos-toolbar';
import { CategoryNav } from '@/components/pos/category-nav';
import { ScaleDisplay } from '@/components/retail/ScaleDisplay';
import { useTerminal } from '@/components/pos/terminal/terminal-context';
import { cn } from '@/lib/utils';
import { Grid3x3, Image as ImageIcon, LayoutList, Search, X } from 'lucide-react';

export function TerminalHeader() {
  const t = useTerminal();
  const { cfg } = t;

  return (
    <>
      {/* GoDigital-style quick-action toolbar (use-case + role aware) */}
      <PosToolbar
        orgSlug={t.orgSlug}
        profile={cfg.profile}
        canRegister={t.can('pos.sessions.view') || t.can('pos.sessions.add') || t.can('pos.payments.add')}
        showCalculator={cfg.showCalculator}
        onCalculator={() => t.setCalcOpen(true)}
        onParkedSales={() => t.setParkedOpen(true)}
        onAddExpense={() => t.setExpenseOpen(true)}
        onRecentTransactions={() => t.setRecentOpen(true)}
        onRegisterDetails={() => t.setRegisterOpen(true)}
        onSellReturn={() => t.setSellReturnOpen(true)}
      />

      {/* Search bar — full width at very top */}
      <div className="px-4 pt-1 pb-2 shrink-0">
        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            ref={t.scanInputRef}
            placeholder="Search items or scan barcode..."
            className="w-full bg-card border border-border rounded-2xl py-3.5 pl-11 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all min-h-13 font-medium placeholder:text-muted-foreground/60"
            value={t.searchQuery}
            onChange={(e) => t.handleSearchChange(e.target.value)}
            onKeyDown={t.handleSearchKeyDown}
          />
          {t.searchQuery && (
            <button
              onClick={() => t.handleSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Category nav (icon + label) + display mode toggle */}
      <div className="px-4 pb-3 flex items-center gap-3 shrink-0">
        {/* Modern icon + label category navigation (CategoryNav owns the All tab) */}
        <CategoryNav
          categories={t.categories}
          active={t.activeCategory}
          onSelect={t.handleCategoryChange}
          className="flex-1"
        />
        {/* Display mode toggle */}
        <div className="flex gap-0.5 shrink-0 border border-border rounded-xl p-1 bg-card">
          <button
            onClick={() => t.setDisplayMode('card')}
            className={cn(
              'p-2 rounded-lg transition-colors',
              t.displayMode === 'card' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            title="Card grid"
          >
            <Grid3x3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => t.setDisplayMode('list')}
            className={cn(
              'p-2 rounded-lg transition-colors',
              t.displayMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            title="List view"
          >
            <LayoutList className="h-4 w-4" />
          </button>
          <button
            onClick={() => t.setDisplayMode('image_grid')}
            className={cn(
              'p-2 rounded-lg transition-colors',
              t.displayMode === 'image_grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            title="Image grid"
          >
            <ImageIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Add-to-bill banner */}
      {t.isAddToBill && (
        <div className="mx-4 mb-3 px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 shrink-0 flex items-center gap-2">
          <span className="text-blue-600 dark:text-blue-400 font-bold text-sm">Current bill:</span>
          <span className="text-sm text-blue-700 dark:text-blue-300">
            KSh {t.billOrderTotal.toLocaleString()}
          </span>
        </div>
      )}

      {/* Hardware scale — retail/pharmacy only, when a scale device is configured */}
      {cfg.showScale && t.scaleDeviceId && (
        <div className="px-4 pb-3 shrink-0">
          <ScaleDisplay
            tenantSlug={t.user?.tenant_slug ?? t.orgSlug}
            deviceId={t.scaleDeviceId}
            onAddToCart={t.handleScaleAddToCart}
          />
        </div>
      )}
    </>
  );
}
