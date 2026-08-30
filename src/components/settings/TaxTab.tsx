'use client';

/**
 * Settings → Tax tab.
 *
 * Tax is sourced from TREASURY per item / tax-code — it is NOT a manual flat POS rate. Each
 * inventory item is enriched with its treasury tax code (rate + inclusive flag) and the POS
 * terminal applies THAT per-item tax at checkout. This tab lets the tenant pick which of
 * Treasury's tax codes is the FALLBACK/default one — used only for items that have no
 * treasury tax code of their own yet, and as the VAT% label on receipts.
 */

import { useEffect, useState } from 'react';
import { Loader2, Lock, Save, ShieldCheck } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { SearchableCombobox, type ComboboxOption } from '@bengo-hub/shared-ui-lib/combobox';
import { usePOSSettings, useUpdatePOSSettings } from '@/hooks/usePOSSettings';
import { useTaxCodes, type TaxCode } from '@/hooks/usePOS';
import { usePermissions } from '@/hooks/usePermissions';
import { P } from '@/lib/rbac/permissions';
import { Toggle, labelClass } from './shared';

/** "Non-VAT" has no single universal tax_type across tenants' treasury seed data (seen live:
 *  non_vat, exempt, zero_rated, and plain "custom" all used for a tenant's own 0%/KRA-D code)
 *  — so match the explicit type first, else fall back to any zero-rate code. */
function findNonVatCode(codes: TaxCode[]): TaxCode | undefined {
  return codes.find((c) => c.tax_type === 'non_vat') ?? codes.find((c) => c.rate === 0);
}

function findVatCode(codes: TaxCode[]): TaxCode | undefined {
  return (
    codes.find((c) => c.is_default && c.rate > 0) ??
    codes.find((c) => c.tax_type === 'vat' && c.rate > 0)
  );
}

export function TaxTab() {
  const { data: settings, isLoading } = usePOSSettings();
  const { data: taxCodes, isLoading: taxCodesLoading } = useTaxCodes();
  const updateSettings = useUpdatePOSSettings();
  const { can } = usePermissions();
  const canEdit = can(P.CONFIG_CHANGE) || can(P.CONFIG_MANAGE);

  const [vatRate, setVatRate] = useState('0');
  const [vatEnabled, setVatEnabled] = useState(false);
  const [selectedCode, setSelectedCode] = useState('');

  const codes = taxCodes ?? [];

  useEffect(() => {
    if (settings) {
      setVatRate(String(settings.vat_rate ?? 0));
      setVatEnabled(settings.vat_enabled ?? false);
    }
  }, [settings]);

  // Preselect a code once the tax-code list has loaded and nothing is selected yet: prefer
  // whatever rate is already saved (so a reload reflects the real stored config), else fall
  // back to the non-VAT code (tenant not VAT-enabled) or the default VAT code (enabled).
  useEffect(() => {
    if (taxCodesLoading || codes.length === 0 || selectedCode || !settings) return;
    const savedRate = settings.vat_rate;
    const byRate = typeof savedRate === 'number' ? codes.find((c) => c.rate === savedRate) : undefined;
    const preset = byRate ?? (vatEnabled ? findVatCode(codes) : findNonVatCode(codes));
    if (preset) setSelectedCode(preset.code);
  }, [codes, taxCodesLoading, selectedCode, settings, vatEnabled]);

  const codeOptions: ComboboxOption[] = codes.map((c) => ({
    value: c.code,
    label: `${c.name} (${c.rate}%)`,
    hint: c.kra_code ? `KRA ${c.kra_code}` : undefined,
  }));

  const handleSelectCode = (value: string) => {
    setSelectedCode(value);
    const code = codes.find((c) => c.code === value);
    if (code) setVatRate(String(code.rate));
  };

  // Flipping the master switch re-derives which code applies (non-VAT ↔ default VAT); the
  // combobox still lets the tenant override the pick afterward before saving.
  const handleToggleVat = (checked: boolean) => {
    setVatEnabled(checked);
    const preset = checked ? findVatCode(codes) : findNonVatCode(codes);
    if (preset) {
      setSelectedCode(preset.code);
      setVatRate(String(preset.rate));
    }
  };

  const handleSave = () => {
    updateSettings.mutate({
      vat_rate: parseFloat(vatRate) || 0,
      vat_enabled: vatEnabled,
    });
  };

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

      {/* Default tax code + receipt toggle */}
      {isLoading ? (
        <div className="h-24 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">Default Tax Code &amp; Receipt Display</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className={labelClass}>Default Tax Code</label>
              <SearchableCombobox
                options={codeOptions}
                value={selectedCode}
                onChange={handleSelectCode}
                loading={taxCodesLoading}
                disabled={!canEdit || codes.length === 0}
                clearable={false}
                placeholder={codes.length === 0 ? 'No tax codes configured in Treasury' : 'Select a tax code…'}
                searchPlaceholder="Search tax codes…"
                emptyText="No tax codes match"
              />
              <p className="text-xs text-muted-foreground">
                Pulled live from Treasury. Applied <span className="font-medium">only</span> to items
                that have no Treasury tax code of their own yet, and used as the VAT% label on
                receipts. Items enriched from Treasury ignore this and use their own rate.
              </p>
            </div>
            <div className="flex items-center justify-between pt-1">
              <div>
                <p className="text-sm font-medium">Show VAT on Receipts</p>
                <p className="text-xs text-muted-foreground">
                  Display the VAT line on receipts and charge the default tax code above on items
                  with no tax code of their own. Off hides tax entirely, everywhere.
                </p>
              </div>
              <Toggle checked={vatEnabled} onChange={handleToggleVat} disabled={!canEdit} />
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
