'use client';

import { useEffect, useState } from 'react';
import { Globe, Loader2, Lock, Palette, Save } from 'lucide-react';
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

  useEffect(() => {
    if (settings) {
      setCurrency(settings.currency || 'KES');
      setVatRate(String(settings.vat_rate ?? 16));
      setVatEnabled(settings.vat_enabled ?? true);
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate({
      currency,
      vat_rate: parseFloat(vatRate) || 16,
      vat_enabled: vatEnabled,
    });
  };

  return (
    <div className="space-y-6">
      {/* Branding (read-only) */}
      {!brandingLoading && tenant && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              <span className="font-bold text-sm">Tenant Branding</span>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Branding is managed in the auth portal. Contact your platform admin to update the logo or colors.
            </p>
            <div className="flex items-center gap-4">
              {tenant.logoUrl && (
                <img src={tenant.logoUrl} alt={tenant.name ?? ''} className="h-10 object-contain" />
              )}
              {tenant.primaryColor && (
                <div className="flex items-center gap-2">
                  <div
                    className="h-8 w-8 rounded-lg border border-border"
                    style={{ backgroundColor: tenant.primaryColor }}
                  />
                  <span className="text-xs font-mono text-muted-foreground">{tenant.primaryColor}</span>
                </div>
              )}
              <div>
                <p className="text-sm font-semibold">{tenant.orgName ?? tenant.name}</p>
                <p className="text-xs text-muted-foreground">{tenant.slug}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Currency & VAT */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Currency & Tax</span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-24 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-accent/10 border border-border">
                <div>
                  <h4 className="text-sm font-bold">Show VAT Breakdown on Receipts</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Display VAT as a separate line item on customer receipts.
                  </p>
                </div>
                <Toggle checked={vatEnabled} onChange={setVatEnabled} disabled={!canEdit} />
              </div>

              <div className="flex items-center justify-end gap-3">
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
