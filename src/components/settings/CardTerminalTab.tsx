'use client';

import { useEffect, useState } from 'react';
import { CreditCard, Info, Loader2, Lock, Save, ShieldCheck } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { usePOSSettings, useUpdatePOSSettings } from '@/hooks/usePOSSettings';
import { usePermissions } from '@/hooks/usePermissions';
import { useModuleAccess } from '@/hooks/use-module-access';
import { useAuthStore } from '@/store/auth';
import { P } from '@/lib/rbac/permissions';
import { Toggle, inputClass, labelClass } from './shared';

// Integrated card-terminal provider options. Provider API credentials are PLATFORM-level config
// (treasury GatewayConfig, gateway_type=card_terminal) — never per-tenant secrets. The tenant only
// selects which provider applies and supplies the physical terminal id (TID/serial) for the outlet.
const TERMINAL_PROVIDERS = [
  { value: '', label: 'Not selected' },
  { value: 'pesapal', label: 'Pesapal (Sabi)' },
  { value: 'flutterwave', label: 'Flutterwave Terminal' },
  { value: 'paystack_terminal', label: 'Paystack Terminal' },
];

/**
 * CardTerminalTab configures how card payments are taken at this outlet:
 *  - MANUAL (default): cashier runs the card on a standalone PDQ machine and records the approval
 *    reference. Works fully offline; settles immediately. A toggle requires the approval code.
 *  - INTEGRATED (scaffold): the POS pushes the amount to a cloud/ECR-connected terminal via the
 *    treasury card_terminal gateway. Provider API creds are platform-level; the tenant supplies the
 *    terminal id (TID). Until a provider is configured platform-side, the manual flow is used.
 */
export function CardTerminalTab() {
  const { data: settings, isLoading } = usePOSSettings();
  const updateSettings = useUpdatePOSSettings();
  const { can } = usePermissions();
  const { isSuperUser } = useModuleAccess();
  const user = useAuthStore((s) => s.user);
  const isPlatformOwner = isSuperUser || user?.isPlatformOwner || user?.isSuperUser;
  const canEdit = can(P.CONFIG_CHANGE) || can(P.CONFIG_MANAGE);

  const [form, setForm] = useState({
    mode: 'manual',
    requireRef: false,
    provider: '',
    tid: '',
  });

  useEffect(() => {
    if (settings) {
      setForm({
        mode: settings.card_terminal_mode || 'manual',
        requireRef: settings.card_terminal_require_ref ?? false,
        provider: settings.card_terminal_provider ?? '',
        tid: settings.card_terminal_tid ?? '',
      });
    }
  }, [settings]);

  const set = (k: keyof typeof form, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    updateSettings.mutate({
      card_terminal_mode: form.mode,
      card_terminal_require_ref: form.requireRef,
      card_terminal_provider: form.provider || null,
      card_terminal_tid: form.tid || null,
    });
  };

  if (isLoading) {
    return (
      <div className="h-40 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const integrated = form.mode === 'integrated';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Card Terminal Mode</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Choose how the cashier takes card payments at the point of sale.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { value: 'manual', title: 'Manual PDQ', desc: 'Run the card on a standalone PDQ machine and record the approval reference. Works offline.' },
              { value: 'integrated', title: 'Integrated Terminal', desc: 'Push the amount to a connected cloud/ECR terminal and await approval. Requires platform setup.' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={!canEdit}
                onClick={() => set('mode', opt.value)}
                className={`text-left rounded-xl border-2 p-4 transition-all disabled:opacity-60 ${
                  form.mode === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                }`}
              >
                <p className="text-sm font-bold">{opt.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>

          {!integrated && (
            <div className="flex items-center justify-between p-4 rounded-xl bg-accent/10 border border-border gap-4">
              <div className="min-w-0">
                <h4 className="text-sm font-bold">Require Approval Code</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Force the cashier to enter the PDQ approval/reference code before confirming a card sale.
                </p>
              </div>
              <Toggle checked={form.requireRef} onChange={(v) => set('requireRef', v)} disabled={!canEdit} />
            </div>
          )}
        </CardContent>
      </Card>

      {integrated && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <span className="font-bold text-sm">Integrated Terminal</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className={labelClass}>Provider</label>
                <select
                  value={form.provider}
                  onChange={(e) => set('provider', e.target.value)}
                  disabled={!canEdit}
                  className={inputClass}
                >
                  {TERMINAL_PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Terminal ID (TID / Serial)</label>
                <input
                  value={form.tid}
                  onChange={(e) => set('tid', e.target.value)}
                  disabled={!canEdit}
                  placeholder="e.g. 0420****"
                  className={`${inputClass} font-mono`}
                />
                <p className="text-[11px] text-muted-foreground">The serial/TID of the physical terminal assigned to this outlet.</p>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2.5">
              <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Integrated terminals require the provider&apos;s API credentials configured at the
                platform level (Treasury → Payment Gateways → Card Terminal). Until that is set up,
                card payments fall back to the manual PDQ flow automatically — no sale is blocked.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isPlatformOwner && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span className="font-bold text-sm">Platform — Provider Credentials</span>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Card-terminal provider API keys/secrets are platform-level payment-gateway config and are
              managed in the Treasury admin (gateway type <code className="font-mono text-xs bg-accent/30 px-1 py-0.5 rounded">card_terminal</code>),
              alongside M-Pesa and Paystack. They are never stored per tenant. Each tenant then selects
              the provider above and supplies their own terminal id (TID).
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-end gap-3">
        {!canEdit && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Lock className="h-3 w-3" /> View only
          </p>
        )}
        <Button onClick={handleSave} disabled={!canEdit || updateSettings.isPending} className="gap-2 px-8 shadow-lg shadow-primary/10">
          {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {updateSettings.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
