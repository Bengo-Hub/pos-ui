'use client';

/**
 * FaceliftShell — the restaurant-POS layout for the hospitality + QSR use cases.
 *
 * It is a pure RESTYLE over the same useTerminal() controller the shared TerminalShell uses, so
 * every workflow is preserved: order-type (dine-in/takeaway/delivery) + table assign/release,
 * per-item courses + Fire Courses, send-to-kitchen (KDS), gated checkout / payment_timing (via the
 * shared InlinePaymentBar + TerminalModals), loyalty, the quick-action toolbar (calculator/parked/
 * expense/recent/register/return) and all tenders. Only the presentation changed to match the
 * reference: left icon nav rail, top bar, center category chips + product cards, right order-bill.
 *
 * All colours are semantic / tenant-branding tokens — never hardcoded.
 */

import { useRouter } from 'next/navigation';
import { useTerminal } from '@/components/pos/terminal/terminal-context';
import { FaceliftNavRail } from '@/components/pos/terminal/facelift/facelift-nav-rail';
import { FaceliftTopBar } from '@/components/pos/terminal/facelift/facelift-topbar';
import { FaceliftProductCards } from '@/components/pos/terminal/facelift/facelift-product-cards';
import { FaceliftOrderBill } from '@/components/pos/terminal/facelift/facelift-order-bill';
import { CategoryNav } from '@/components/pos/category-nav';
import { OrderTypeSelector } from '@/components/pos/order-type-selector';
import { PosToolbar } from '@/components/pos/terminal/pos-toolbar';
import { LoyaltyPanel } from '@/components/retail/LoyaltyPanel';
import { TerminalModals } from '@/components/pos/terminal/parts/terminal-modals';

export function FaceliftShell() {
  const t = useTerminal();
  const { cfg } = t;
  const router = useRouter();

  return (
    <div className="flex bg-background" style={{ height: 'calc(100vh - 80px)' }}>
      {/* LEFT — icon nav rail */}
      <FaceliftNavRail />

      {/* CENTER + RIGHT */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <FaceliftTopBar onAddItem={() => router.push(`/${t.orgSlug}/sell/add`)} />

        {/* Quick-action toolbar strip (calculator / parked / expense / recent / register / return) —
            kept so no terminal capability is lost in the facelift. */}
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-1.5 border-b border-border bg-card/60">
          {/* Order-type + table (hospitality/QSR) and loyalty where applicable */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {cfg.showOrderType && (
              <div className="min-w-0 max-w-md flex-1">
                <OrderTypeSelector
                  value={t.orderSubtype}
                  onChange={t.setOrderSubtype}
                  tableName={t.tableName || undefined}
                  onSelectTable={() => router.push(`/${t.orgSlug}/tables`)}
                  useCase={t.outlet?.use_case}
                />
              </div>
            )}
          </div>
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
        </div>

        {/* Body: center menu + right bill */}
        <div className="flex-1 flex flex-col lg:grid lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] min-h-0 overflow-hidden">
          {/* CENTER */}
          <div className="flex flex-col min-h-0 overflow-hidden">
            <div className="shrink-0 px-4 pt-3 pb-2 space-y-2">
              {/* Loyalty / customer link where the profile uses pricing or loyalty (hospitality keeps
                  walk-in semantics so this only renders if showPricingProfile is on — preserved). */}
              {cfg.showPricingProfile && <LoyaltyPanel onStateChange={t.setLoyaltyState} />}
              <h2 className="text-sm font-extrabold tracking-tight">Choose Category</h2>
              <CategoryNav
                categories={t.pickerMode === 'brand' ? t.brands : t.categories}
                active={t.pickerMode === 'brand' ? t.activeBrand : t.activeCategory}
                onSelect={t.pickerMode === 'brand' ? t.handleBrandChange : t.handleCategoryChange}
              />
            </div>
            <div className="flex-1 min-h-0 overflow-hidden px-3">
              <FaceliftProductCards />
            </div>
          </div>

          {/* RIGHT — order bill */}
          <div className="min-h-0 overflow-hidden border-t lg:border-t-0 lg:border-l border-border">
            <FaceliftOrderBill />
          </div>
        </div>
      </div>

      <TerminalModals />
    </div>
  );
}
