'use client';

import { useEffect, useState } from 'react';
import { CreditCard, Loader2, Lock, Save } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { usePOSSettings, useUpdatePOSSettings } from '@/hooks/usePOSSettings';
import { usePermissions } from '@/hooks/usePermissions';
import { P } from '@/lib/rbac/permissions';
import { Toggle, inputClass, labelClass } from './shared';

export function PaymentDisplayTab() {
  const { data: settings, isLoading } = usePOSSettings();
  const updateSettings = useUpdatePOSSettings();
  const { can } = usePermissions();
  const canEdit = can(P.CONFIG_CHANGE) || can(P.CONFIG_MANAGE);

  const [form, setForm] = useState({
    mpesaPaybill: '',
    mpesaAccountRef: '',
    mpesaTill: '',
    mpesaPochi: '',
    bankName: '',
    bankAccountNumber: '',
    bankAccountName: '',
    showOnReceipt: false,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        mpesaPaybill:       settings.mpesa_paybill ?? '',
        mpesaAccountRef:    settings.mpesa_account_reference ?? '',
        mpesaTill:          settings.mpesa_till ?? '',
        mpesaPochi:         settings.mpesa_pochi ?? '',
        bankName:           settings.bank_name ?? '',
        bankAccountNumber:  settings.bank_account_number ?? '',
        bankAccountName:    settings.bank_account_name ?? '',
        showOnReceipt:      settings.show_payment_info_on_receipt ?? false,
      });
    }
  }, [settings]);

  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    updateSettings.mutate({
      mpesa_paybill:             form.mpesaPaybill   || null,
      mpesa_account_reference:   form.mpesaAccountRef || null,
      mpesa_till:                form.mpesaTill       || null,
      mpesa_pochi:               form.mpesaPochi      || null,
      bank_name:                 form.bankName        || null,
      bank_account_number:       form.bankAccountNumber || null,
      bank_account_name:         form.bankAccountName  || null,
      show_payment_info_on_receipt: form.showOnReceipt,
    });
  };

  if (isLoading) {
    return (
      <div className="h-40 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">M-PESA</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Paybill Number</label>
              <input
                className={inputClass}
                value={form.mpesaPaybill}
                onChange={(e) => set('mpesaPaybill', e.target.value)}
                placeholder="e.g. 522533"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className={labelClass}>Account Number</label>
              <input
                className={inputClass}
                value={form.mpesaAccountRef}
                onChange={(e) => set('mpesaAccountRef', e.target.value)}
                placeholder="e.g. 79319044"
                disabled={!canEdit}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Shown in M-PESA prompt as the account reference
              </p>
            </div>
            <div>
              <label className={labelClass}>Till Number</label>
              <input
                className={inputClass}
                value={form.mpesaTill}
                onChange={(e) => set('mpesaTill', e.target.value)}
                placeholder="e.g. 123456"
                disabled={!canEdit}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Buy Goods (Till) number
              </p>
            </div>
            <div>
              <label className={labelClass}>Pochi Number</label>
              <input
                className={inputClass}
                value={form.mpesaPochi}
                onChange={(e) => set('mpesaPochi', e.target.value)}
                placeholder="e.g. 0712345678"
                disabled={!canEdit}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Pochi la Biashara number
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Bank Transfer</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Bank Name</label>
              <input
                className={inputClass}
                value={form.bankName}
                onChange={(e) => set('bankName', e.target.value)}
                placeholder="e.g. KCB"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className={labelClass}>Account Number</label>
              <input
                className={inputClass}
                value={form.bankAccountNumber}
                onChange={(e) => set('bankAccountNumber', e.target.value)}
                placeholder="Bank account number"
                disabled={!canEdit}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Account Name</label>
            <input
              className={inputClass}
              value={form.bankAccountName}
              onChange={(e) => set('bankAccountName', e.target.value)}
              placeholder="e.g. THE URBAN LOFT CAFE LIMITED"
              disabled={!canEdit}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between p-4 rounded-xl bg-accent/10 border border-border gap-4">
            <div className="min-w-0">
              <h4 className="text-sm font-bold">Show on Receipt</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Print payment methods at the bottom of customer receipts.
              </p>
            </div>
            <Toggle
              checked={form.showOnReceipt}
              onChange={(v) => set('showOnReceipt', v)}
              disabled={!canEdit}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between pt-1">
        {!canEdit && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Lock className="h-3 w-3" /> View only
          </p>
        )}
        <div className="ml-auto">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!canEdit || updateSettings.isPending}
          >
            {updateSettings.isPending
              ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
              : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
