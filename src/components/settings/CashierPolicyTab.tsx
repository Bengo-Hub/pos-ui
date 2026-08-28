'use client';

import { useEffect, useState } from 'react';
import { Loader2, Lock, Eye, LogOut, LayoutGrid, FileX } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { usePOSSettings, useUpdatePOSSettings } from '@/hooks/usePOSSettings';
import { usePermissions } from '@/hooks/usePermissions';
import { useModuleAccess } from '@/hooks/use-module-access';
import { P } from '@/lib/rbac/permissions';
import { inputClass } from './shared';

// Tri-state select value: '' means "inherit the per-use-case default"; any other value is an
// explicit override. The backend maps '' → clear-override, a value → set-override.
type TriString = '';

function OverriddenBadge({ overridden }: { overridden: boolean }) {
  return overridden ? (
    <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary">
      Overridden
    </span>
  ) : (
    <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
      Default
    </span>
  );
}

export function CashierPolicyTab() {
  const { data: settings, isLoading } = usePOSSettings();
  const update = useUpdatePOSSettings();
  const { can } = usePermissions();
  const { isSuperUser } = useModuleAccess();
  const canEdit = can(P.CONFIG_MANAGE) || can(P.CONFIG_CHANGE) || isSuperUser;

  // '' = use default; otherwise the explicit override.
  const [salesVisibility, setSalesVisibility] = useState<'own' | 'outlet' | TriString>('');
  const [autoLogout, setAutoLogout] = useState<'on' | 'off' | TriString>('');
  const [terminalSurface, setTerminalSurface] = useState<'full_till' | 'bills_only' | TriString>('');
  // Quick config: plain booleans, no per-use-case default to reset to (unlike the three above).
  const [hideDraftDelete, setHideDraftDelete] = useState(false);
  const [hideDraftResume, setHideDraftResume] = useState(false);
  const [saving, setSaving] = useState(false);

  const overrides = settings?.cashier_policy_overrides ?? {};

  // Initialize each control from the stored override (if any); otherwise leave at '' = use default.
  useEffect(() => {
    if (!settings) return;
    setSalesVisibility(overrides['cashier_sales_visibility'] ? settings.cashier_sales_visibility : '');
    setAutoLogout(overrides['auto_logout_after_sale'] ? (settings.auto_logout_after_sale ? 'on' : 'off') : '');
    setTerminalSurface(overrides['cashier_terminal_surface'] ? settings.cashier_terminal_surface : '');
    setHideDraftDelete(!!settings.hide_draft_delete_for_cashier);
    setHideDraftResume(!!settings.hide_draft_resume_for_cashier);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  async function handleSave() {
    setSaving(true);
    try {
      // Send all three every save: '' clears the override (reset to default), a value sets it.
      await update.mutateAsync({
        cashier_sales_visibility: salesVisibility === '' ? 'default' : salesVisibility,
        auto_logout_after_sale: autoLogout === '' ? 'default' : autoLogout,
        cashier_terminal_surface: terminalSurface === '' ? 'default' : terminalSurface,
        hide_draft_delete_for_cashier: hideDraftDelete,
        hide_draft_resume_for_cashier: hideDraftResume,
      });
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="h-40 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const resolvedVisibility = settings?.cashier_sales_visibility ?? 'own';
  const resolvedAutoLogout = settings?.auto_logout_after_sale ?? false;
  const resolvedSurface = settings?.cashier_terminal_surface ?? 'full_till';

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 text-amber-800 dark:text-amber-300 text-sm">
          <Lock className="h-4 w-4 shrink-0" />
          Cashier &amp; terminal policy requires admin or manager permissions.
        </div>
      )}

      <div className="text-sm text-muted-foreground -mt-2">
        These settings apply to the <span className="font-medium text-foreground">currently selected outlet</span>. Each
        knob inherits a sensible per-use-case default until you override it here — switch outlets to configure another.
      </div>

      {/* Sales visibility */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" /> Cashier sales visibility
            </h3>
            <OverriddenBadge overridden={!!overrides['cashier_sales_visibility']} />
          </div>
          <p className="text-sm text-muted-foreground">
            How far a cashier/waiter (who can only see their own sales) can look. <span className="font-medium">Own</span>{' '}
            shows only their sales (&quot;My Sales&quot;); <span className="font-medium">All outlet sales</span> shows every
            sale at this outlet (supermarket/retail default). Managers always see all. Resolved:{' '}
            <span className="font-medium text-foreground">{resolvedVisibility === 'outlet' ? 'All outlet sales' : 'Own sales only'}</span>.
          </p>
        </CardHeader>
        <CardContent>
          <select
            value={salesVisibility}
            onChange={(e) => setSalesVisibility(e.target.value as typeof salesVisibility)}
            disabled={!canEdit}
            className={inputClass + ' max-w-sm'}
          >
            <option value="">Use default ({resolvedVisibility === 'outlet' ? 'All outlet sales' : 'Own sales only'})</option>
            <option value="own">Own sales only (My Sales)</option>
            <option value="outlet">All outlet sales</option>
          </select>
        </CardContent>
      </Card>

      {/* Auto-logout after sale */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold flex items-center gap-2">
              <LogOut className="h-4 w-4 text-primary" /> Auto-logout after a sale
            </h3>
            <OverriddenBadge overridden={!!overrides['auto_logout_after_sale']} />
          </div>
          <p className="text-sm text-muted-foreground">
            On a <span className="font-medium">shared terminal</span> (hospitality/quick-service default), log the
            waiter/cashier out after each completed sale so the next operator signs in. On a dedicated retail till this
            is off. Managers/admins are never logged out. Resolved:{' '}
            <span className="font-medium text-foreground">{resolvedAutoLogout ? 'On' : 'Off'}</span>.
          </p>
        </CardHeader>
        <CardContent>
          <select
            value={autoLogout}
            onChange={(e) => setAutoLogout(e.target.value as typeof autoLogout)}
            disabled={!canEdit}
            className={inputClass + ' max-w-sm'}
          >
            <option value="">Use default ({resolvedAutoLogout ? 'On' : 'Off'})</option>
            <option value="on">On — log out after each sale</option>
            <option value="off">Off — stay signed in</option>
          </select>
        </CardContent>
      </Card>

      {/* Terminal surface (hospitality cashier) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-primary" /> Hospitality cashier menu
            </h3>
            <OverriddenBadge overridden={!!overrides['cashier_terminal_surface']} />
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">Full till</span> lets a hospitality cashier ring sales at the POS Terminal AND
            settle bills (Terminal + Add Sale + Tables shown). <span className="font-medium">Bills only</span> hides the
            fast terminal so they settle from the Orders/Tables list. Resolved:{' '}
            <span className="font-medium text-foreground">{resolvedSurface === 'bills_only' ? 'Bills only' : 'Full till'}</span>.
          </p>
        </CardHeader>
        <CardContent>
          <select
            value={terminalSurface}
            onChange={(e) => setTerminalSurface(e.target.value as typeof terminalSurface)}
            disabled={!canEdit}
            className={inputClass + ' max-w-sm'}
          >
            <option value="">Use default ({resolvedSurface === 'bills_only' ? 'Bills only' : 'Full till'})</option>
            <option value="full_till">Full till (terminal + add sale + tables)</option>
            <option value="bills_only">Bills only (settle from Orders/Tables)</option>
          </select>
        </CardContent>
      </Card>

      {/* Drafts page quick config (2026-08-28) — a shortcut over the full Roles & Permissions
          matrix for the common "hide these two buttons for cashiers" ask. Applies to any
          non-manager-tier user (managers/admins always keep both buttons); AND's with whatever
          the matrix already grants (pos.orders.delete_own / pos.orders.resume_draft), so a
          cashier's Delete/Resume still won't show even if the matrix grants it while this is on. */}
      <Card>
        <CardHeader>
          <h3 className="text-base font-bold flex items-center gap-2">
            <FileX className="h-4 w-4 text-primary" /> Drafts page — cashier buttons
          </h3>
          <p className="text-sm text-muted-foreground">
            Quick blanket switches for the Drafts page, instead of editing each role in Roles &amp; Permissions.
            Managers/admins are never affected.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hideDraftDelete} disabled={!canEdit}
              onChange={(e) => setHideDraftDelete(e.target.checked)} />
            Hide the <span className="font-medium">Delete</span> button for cashiers
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hideDraftResume} disabled={!canEdit}
              onChange={(e) => setHideDraftResume(e.target.checked)} />
            Hide the <span className="font-medium">Resume</span> button for cashiers
          </label>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!canEdit || saving} size="sm">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save cashier policy
        </Button>
      </div>
    </div>
  );
}
