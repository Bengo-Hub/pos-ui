'use client';

import { useEffect, useState } from 'react';
import { Globe, Loader2, Lock, Palette, RotateCcw, Save } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { usePOSSettings, useUpdatePOSSettings } from '@/hooks/usePOSSettings';
import { usePermissions } from '@/hooks/usePermissions';
import { P } from '@/lib/rbac/permissions';
import { Toggle, inputClass, labelClass } from './shared';

export function GeneralTab() {
  const { tenant, isLoading: brandingLoading } = useTenantBranding();
  const { data: settings, isLoading } = usePOSSettings();
  const updateSettings = useUpdatePOSSettings();
  const { can } = usePermissions();
  const canEdit = can(P.CONFIG_CHANGE) || can(P.CONFIG_MANAGE);

  const [currency, setCurrency] = useState('KES');
  const [vatRate, setVatRate] = useState('16');
  const [vatEnabled, setVatEnabled] = useState(true);
  const [returnWindowDays, setReturnWindowDays] = useState('30');

  useEffect(() => {
    if (settings) {
      setCurrency(settings.currency || 'KES');
      setVatRate(String(settings.vat_rate ?? 16));
      setVatEnabled(settings.vat_enabled ?? true);
      setReturnWindowDays(String(settings.return_window_days ?? 30));
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate({
      currency,
      vat_rate: parseFloat(vatRate) || 16,
      vat_enabled: vatEnabled,
      return_window_days: parseInt(returnWindowDays, 10) || 30,
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
                  <span className="font-bold text-sm">Currency & Tax</span>
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
                <div className="space-y-2">
                  <label className={labelClass}>VAT / Tax Rate (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={vatRate}
                    onChange={(e) => setVatRate(e.target.value)}
                    disabled={!canEdit}
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <p className="text-sm font-medium">Show VAT on Receipts</p>
                    <p className="text-xs text-muted-foreground">Display VAT as a line item</p>
                  </div>
                  <Toggle checked={vatEnabled} onChange={setVatEnabled} disabled={!canEdit} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-primary" />
                  <span className="font-bold text-sm">Returns Policy</span>
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
