'use client';

import { useEffect, useState } from 'react';
import { Globe, Loader2, Lock, Palette, Percent, RotateCcw, Save, Tag } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { usePOSSettings, useUpdatePOSSettings } from '@/hooks/usePOSSettings';
import { usePermissions } from '@/hooks/usePermissions';
import { useModuleAccess } from '@/hooks/use-module-access';
import { P } from '@/lib/rbac/permissions';
import { SUPPORTED_CURRENCIES, CURRENCY_META } from '@/lib/utils';
import { convertCurrency } from '@/lib/api/currency';
import { useAuthStore } from '@/store/auth';
import { CurrencyChangeConfirmModal } from '@bengo-hub/shared-ui-lib';
import { inputClass, labelClass } from './shared';

export function GeneralTab() {
  const { tenant, isLoading: brandingLoading } = useTenantBranding();
  const { data: settings, isLoading } = usePOSSettings();
  const updateSettings = useUpdatePOSSettings();
  const { can } = usePermissions();
  const { isRetail, isPharmacy } = useModuleAccess();
  const canEdit = can(P.CONFIG_CHANGE) || can(P.CONFIG_MANAGE);
  // Goods returns only apply to retail/pharmacy — a hospitality or quick-service outlet doesn't
  // accept returns of consumed food/drinks, so the return-window field is irrelevant there.
  const showReturnWindow = isRetail || isPharmacy;

  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const [currency, setCurrency] = useState('KES');
  // Currency-change confirmation: selecting a new currency never applies immediately — it stages
  // the pick, fetches the live rate from treasury (via pos-api's currency proxy), and only commits
  // (setCurrency + an immediate partial save) once the client explicitly confirms the modal.
  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const [returnWindowDays, setReturnWindowDays] = useState('30');
  // Discount limit: ONE active mode at a time (percent XOR amount, never both) — the
  // inactive field is always saved at its no-limit sentinel (100% / 0).
  const [discountLimitType, setDiscountLimitType] = useState<'percent' | 'amount'>('percent');
  const [discountLimitValue, setDiscountLimitValue] = useState('100');
  const [allowPriceAboveBase, setAllowPriceAboveBase] = useState(true);
  const [requireApprovalBelowBase, setRequireApprovalBelowBase] = useState(true);
  const [restrictCreditSaleRefund, setRestrictCreditSaleRefund] = useState(true);

  useEffect(() => {
    if (settings) {
      setCurrency(settings.currency || 'KES');
      setReturnWindowDays(String(settings.return_window_days ?? 30));
      const mode = settings.discount_limit_type ?? 'percent';
      setDiscountLimitType(mode);
      setDiscountLimitValue(String(mode === 'amount' ? (settings.max_discount_amount ?? 0) : (settings.max_discount_percent ?? 100)));
      setAllowPriceAboveBase(settings.allow_price_above_base ?? true);
      setRequireApprovalBelowBase(settings.require_approval_below_base ?? true);
      setRestrictCreditSaleRefund(settings.restrict_credit_sale_refund_to_offset ?? true);
    }
  }, [settings]);

  const handleCurrencySelect = (next: string) => {
    if (!next || next === currency) return;
    setPendingCurrency(next);
    setRate(null);
    setRateError(null);
    setRateLoading(true);
    convertCurrency(tenantID, currency, next, 1)
      .then((res) => {
        const parsed = parseFloat(res.converted);
        setRate(Number.isFinite(parsed) ? parsed : null);
      })
      .catch(() => setRateError('No exchange rate is available for this pair yet.'))
      .finally(() => setRateLoading(false));
  };

  const handleConfirmCurrencyChange = () => {
    if (!pendingCurrency) return;
    setCurrency(pendingCurrency);
    // Commit immediately (not gated behind the general Save button below) — per the "confirm to
    // store" requirement, the client's confirmation IS the save action for a currency change.
    updateSettings.mutate({ currency: pendingCurrency });
    setPendingCurrency(null);
  };

  const handleSave = () => {
    const value = parseFloat(discountLimitValue) || 0;
    // VAT/tax now lives in the Tax tab (sourced from treasury per item) — only currency + returns
    // are edited here. We omit vat_* so saving currency never clobbers the tax settings.
    updateSettings.mutate({
      currency,
      return_window_days: parseInt(returnWindowDays, 10) || 30,
      discount_limit_type: discountLimitType,
      // Whichever mode is NOT active is sent at its no-op sentinel so the two fields never
      // disagree with the selected mode (server enforcement still checks both with OR).
      max_discount_percent: discountLimitType === 'percent' ? value : 100,
      max_discount_amount: discountLimitType === 'amount' ? value : 0,
      allow_price_above_base: allowPriceAboveBase,
      require_approval_below_base: requireApprovalBelowBase,
      restrict_credit_sale_refund_to_offset: restrictCreditSaleRefund,
    });
  };

  return (
    <div className="space-y-4">
      {/* Branding strip */}
      {!brandingLoading && tenant && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              <span className="font-bold text-sm">Tenant Branding</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 flex-wrap">
              {tenant.logoUrl && (
                <img src={tenant.logoUrl} alt={tenant.name ?? ''} className="h-10 object-contain rounded" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{tenant.orgName ?? tenant.name}</p>
                <p className="text-xs text-muted-foreground">{tenant.slug}</p>
              </div>
              {tenant.primaryColor && (
                <div className="flex items-center gap-2 shrink-0">
                  <div
                    className="h-7 w-7 rounded-lg border border-border"
                    style={{ backgroundColor: tenant.primaryColor }}
                  />
                  <span className="text-xs font-mono text-muted-foreground">{tenant.primaryColor}</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                Manage in auth portal
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="h-40 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          {/* 4 evenly-weighted cards, 2x2 — split by topic (currency / discount limits /
              cashier price edits / returns) instead of the old lopsided Currency-vs-everything-
              else split, so the left and right columns carry roughly the same amount of content. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  <span className="font-bold text-sm">Currency</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className={labelClass}>Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => handleCurrencySelect(e.target.value)}
                    disabled={!canEdit}
                    className={inputClass}
                  >
                    {SUPPORTED_CURRENCIES.map((code) => (
                      <option key={code} value={code}>
                        {code} — {CURRENCY_META[code]?.name ?? code}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Changing currency shows a confirmation with the live exchange rate before it applies.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground pt-1">
                  Tax rates are managed in the <span className="font-medium text-foreground">Tax</span> tab
                  (sourced from Treasury, applied per item).
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Percent className="h-4 w-4 text-primary" />
                  <span className="font-bold text-sm">Discount Limits</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <label className={labelClass}>Max discount without approval</label>
                <div className="flex rounded-lg border border-border p-0.5 w-fit">
                  {(['percent', 'amount'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => {
                        setDiscountLimitType(mode);
                        // Reset to that mode's no-limit sentinel when switching, so the
                        // input doesn't carry over a value that meant something in the
                        // other mode (e.g. a percent of "20" showing up as "20" currency).
                        setDiscountLimitValue(mode === 'amount' ? '0' : '100');
                      }}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                        discountLimitType === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {mode === 'percent' ? 'Percentage' : 'Fixed Amount'}
                    </button>
                  ))}
                </div>
                <div className="max-w-50 space-y-1">
                  <input
                    type="number"
                    min={0}
                    max={discountLimitType === 'percent' ? 100 : undefined}
                    step={1}
                    value={discountLimitValue}
                    onChange={(e) => setDiscountLimitValue(e.target.value)}
                    disabled={!canEdit}
                    placeholder={discountLimitType === 'percent' ? '100' : '0'}
                    className={`${inputClass} font-mono`}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {discountLimitType === 'percent'
                      ? '% of order (100 = no limit)'
                      : `amount in ${currency} (0 = no limit)`}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  A cashier discount above this limit requires manager approval (PIN or QR card) — the approval
                  dialog triggers on the terminal and in back-office Add Sale.
                </p>
              </CardContent>
            </Card>

            {/* Pricing policy — cashier line-price rules (server-enforced on order create). */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-primary" />
                  <span className="font-bold text-sm">Cashier Price Edits</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowPriceAboveBase}
                    onChange={(e) => setAllowPriceAboveBase(e.target.checked)}
                    disabled={!canEdit}
                    className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                  />
                  <span className="text-xs">
                    <span className="font-medium text-foreground">Allow selling above the catalog price.</span>{' '}
                    <span className="text-muted-foreground">Cashiers may raise a line&apos;s price above the base (negotiated up-sell) without approval.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireApprovalBelowBase}
                    onChange={(e) => setRequireApprovalBelowBase(e.target.checked)}
                    disabled={!canEdit}
                    className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                  />
                  <span className="text-xs">
                    <span className="font-medium text-foreground">Require manager approval below the catalog price.</span>{' '}
                    <span className="text-muted-foreground">Selling under the base price (markdown or price-lowering discount) prompts the manager approval dialog at checkout.</span>
                  </span>
                </label>
              </CardContent>
            </Card>

            {showReturnWindow && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <RotateCcw className="h-4 w-4 text-primary" />
                    <span className="font-bold text-sm">Returns & Refunds</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className={labelClass}>Return Window (days)</label>
                    <input
                      type="number"
                      min={0}
                      max={365}
                      step={1}
                      value={returnWindowDays}
                      onChange={(e) => setReturnWindowDays(e.target.value)}
                      disabled={!canEdit}
                      placeholder="30"
                      className={`${inputClass} font-mono`}
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum days after purchase to accept a return. Set 0 for no limit.
                    </p>
                  </div>
                  <div className="space-y-3 pt-2 border-t border-border">
                    <label className={labelClass}>Sell-return refund method</label>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={restrictCreditSaleRefund}
                        onChange={(e) => setRestrictCreditSaleRefund(e.target.checked)}
                        disabled={!canEdit}
                        className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                      />
                      <span className="text-xs">
                        <span className="font-medium text-foreground">Restrict returns on unpaid credit sales to &ldquo;Reduce customer credit&rdquo;.</span>{' '}
                        <span className="text-muted-foreground">
                          Recommended — prevents a return against a sale you were never paid for from handing out cash or store
                          credit (which would strand a credit balance on top of the still-open debt). Turn off to let cashiers
                          choose any refund method for these returns at their own discretion.
                        </span>
                      </span>
                    </label>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            {!canEdit && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Lock className="h-3 w-3" /> View only
              </p>
            )}
            <Button
              onClick={handleSave}
              disabled={!canEdit || updateSettings.isPending}
              className="gap-2 px-8 shadow-lg shadow-primary/10"
            >
              {updateSettings.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Save className="h-4 w-4" />}
              {updateSettings.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </>
      )}
      {pendingCurrency && (
        <CurrencyChangeConfirmModal
          open={!!pendingCurrency}
          fromCurrency={currency}
          toCurrency={pendingCurrency}
          rate={rate}
          rateSource={rateLoading ? undefined : rate != null ? 'Live rate (treasury)' : undefined}
          error={rateError}
          loading={rateLoading || updateSettings.isPending}
          exampleAmounts={[{ label: 'Example amount', originalAmount: 1000 }]}
          onConfirm={handleConfirmCurrencyChange}
          onCancel={() => { setPendingCurrency(null); setRate(null); setRateError(null); }}
        />
      )}
    </div>
  );
}
