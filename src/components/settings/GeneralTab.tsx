'use client';

import { useEffect, useState } from 'react';
import { Globe, Loader2, Lock, Palette, RotateCcw, Save } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { usePOSSettings, useUpdatePOSSettings } from '@/hooks/usePOSSettings';
import { usePermissions } from '@/hooks/usePermissions';
import { useModuleAccess } from '@/hooks/use-module-access';
import { P } from '@/lib/rbac/permissions';
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

  const [currency, setCurrency] = useState('KES');
  const [returnWindowDays, setReturnWindowDays] = useState('30');
  const [maxDiscountPercent, setMaxDiscountPercent] = useState('100');
  const [allowPriceAboveBase, setAllowPriceAboveBase] = useState(true);
  const [requireApprovalBelowBase, setRequireApprovalBelowBase] = useState(true);

  useEffect(() => {
    if (settings) {
      setCurrency(settings.currency || 'KES');
      setReturnWindowDays(String(settings.return_window_days ?? 30));
      setMaxDiscountPercent(String(settings.max_discount_percent ?? 100));
      setAllowPriceAboveBase(settings.allow_price_above_base ?? true);
      setRequireApprovalBelowBase(settings.require_approval_below_base ?? true);
    }
  }, [settings]);

  const handleSave = () => {
    // VAT/tax now lives in the Tax tab (sourced from treasury per item) — only currency + returns
    // are edited here. We omit vat_* so saving currency never clobbers the tax settings.
    updateSettings.mutate({
      currency,
      return_window_days: parseInt(returnWindowDays, 10) || 30,
      max_discount_percent: parseFloat(maxDiscountPercent) || 100,
      allow_price_above_base: allowPriceAboveBase,
      require_approval_below_base: requireApprovalBelowBase,
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
          {/* Currency & VAT + Returns side-by-side */}
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
                    onChange={(e) => setCurrency(e.target.value)}
                    disabled={!canEdit}
                    className={inputClass}
                  >
                    <option value="KES">KES — Kenyan Shilling</option>
                    <option value="USD">USD — US Dollar</option>
                    <option value="TZS">TZS — Tanzanian Shilling</option>
                    <option value="UGX">UGX — Ugandan Shilling</option>
                    <option value="ZAR">ZAR — South African Rand</option>
                    <option value="NGN">NGN — Nigerian Naira</option>
                    <option value="GHS">GHS — Ghanaian Cedi</option>
                  </select>
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
                  <RotateCcw className="h-4 w-4 text-primary" />
                  <span className="font-bold text-sm">{showReturnWindow ? 'Returns & Discounts' : 'Discounts'}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {showReturnWindow && (
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
                )}
                <div className="space-y-2">
                  <label className={labelClass}>Max discount without approval (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={maxDiscountPercent}
                    onChange={(e) => setMaxDiscountPercent(e.target.value)}
                    disabled={!canEdit}
                    placeholder="100"
                    className={`${inputClass} font-mono`}
                  />
                  <p className="text-xs text-muted-foreground">
                    A cashier discount above this % of the order requires a manager approval (PIN or QR card). Set 100 for no limit.
                  </p>
                </div>
                {/* Pricing policy — cashier line-price rules (server-enforced on order create). */}
                <div className="space-y-3 pt-2 border-t border-border">
                  <label className={labelClass}>Cashier price edits</label>
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
                </div>
              </CardContent>
            </Card>
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
    </div>
  );
}
