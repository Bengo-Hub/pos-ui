'use client';

/**
 * Settings → Tax tab.
 *
 * Tax is sourced from TREASURY per item / tax-code — it is NOT a manual flat POS rate. Each
 * inventory item is enriched with its treasury tax code (rate + inclusive flag) and the POS
 * terminal applies THAT per-item tax at checkout. This tab therefore SHOWS the tenant's
 * treasury tax codes/rates read-only (the real source of truth) and demotes the old flat
 * "VAT / Tax Rate" field to a clearly-labelled legacy fallback used only for items that have no
 * treasury tax info yet (and for the receipt VAT line when "Show VAT on receipts" is on).
 */

import { useEffect, useState } from 'react';
import { Loader2, Lock, Save, ShieldCheck, Receipt } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { usePOSSettings, useUpdatePOSSettings } from '@/hooks/usePOSSettings';
import { useTaxCodes } from '@/hooks/usePOS';
import { usePermissions } from '@/hooks/usePermissions';
import { P } from '@/lib/rbac/permissions';
import { Toggle, inputClass, labelClass } from './shared';

export function TaxTab() {
  const { data: settings, isLoading } = usePOSSettings();
  const { data: taxCodes, isLoading: taxCodesLoading } = useTaxCodes();
  const updateSettings = useUpdatePOSSettings();
  const { can } = usePermissions();
  const canEdit = can(P.CONFIG_CHANGE) || can(P.CONFIG_MANAGE);

  const [vatRate, setVatRate] = useState('16');
  const [vatEnabled, setVatEnabled] = useState(true);

  useEffect(() => {
    if (settings) {
      setVatRate(String(settings.vat_rate ?? 16));
      setVatEnabled(settings.vat_enabled ?? true);
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate({
      vat_rate: parseFloat(vatRate) || 0,
      vat_enabled: vatEnabled,
    });
  };

  const codes = taxCodes ?? [];

  return (
    <div className="space-y-4">
      {/* Source-of-truth banner */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Tax is managed in Treasury</span>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Tax codes and rates are the source of truth in Treasury and are applied{' '}
            <span className="font-medium text-foreground">per item</span> — each product carries its
            own rate and inclusive/exclusive flag from its tax code. The POS terminal uses each
            line&apos;s own tax at checkout instead of a single flat rate over the whole cart, so
            tax-inclusive prices are never double-taxed. To change a rate, edit the tax code in
            Treasury or the item&apos;s tax code in Inventory.
          </p>
        </CardContent>
      </Card>

      {/* Treasury tax codes (read-only) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Tax Codes (from Treasury)</span>
          </div>
        </CardHeader>
        <CardContent>
          {taxCodesLoading ? (
            <div className="h-20 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : codes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tax codes configured in Treasury (or Treasury is unreachable). Items with no tax
              code fall back to the legacy rate below.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
                    <th className="py-2 pr-4 font-medium">Code</th>
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium text-right">Rate</th>
                    <th className="py-2 pr-4 font-medium">KRA</th>
                    <th className="py-2 font-medium">Default</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((c) => (
                    <tr key={c.id || c.code} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-4 font-mono">{c.code}</td>
                      <td className="py-2 pr-4">{c.name}</td>
                      <td className="py-2 pr-4 uppercase text-muted-foreground">{c.tax_type || '—'}</td>
                      <td className="py-2 pr-4 text-right tabular-nums font-mono">{c.rate}%</td>
                      <td className="py-2 pr-4 text-muted-foreground">{c.kra_code || '—'}</td>
                      <td className="py-2">
                        {c.is_default ? (
                          <span className="text-xs rounded bg-primary/10 text-primary px-2 py-0.5">Default</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legacy flat fallback + receipt toggle */}
      {isLoading ? (
        <div className="h-24 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">Fallback &amp; Receipt Display</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className={labelClass}>Fallback VAT / Tax Rate (%) — legacy</label>
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
              <p className="text-xs text-muted-foreground">
                Applied <span className="font-medium">only</span> to items that have no Treasury tax
                code yet, and used as the VAT% label on receipts. Items enriched from Treasury ignore
                this value and use their own rate.
              </p>
            </div>
            <div className="flex items-center justify-between pt-1">
              <div>
                <p className="text-sm font-medium">Show VAT on Receipts</p>
                <p className="text-xs text-muted-foreground">Display VAT as a receipt line item</p>
              </div>
              <Toggle checked={vatEnabled} onChange={setVatEnabled} disabled={!canEdit} />
            </div>
          </CardContent>
        </Card>
      )}

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
          {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {updateSettings.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
