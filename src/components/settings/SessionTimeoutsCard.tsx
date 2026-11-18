'use client';

import { useEffect, useState } from 'react';
import { Loader2, Timer } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { usePOSSettings, useUpdateSessionTimeouts } from '@/hooks/usePOSSettings';
import { usePermissions } from '@/hooks/usePermissions';
import { useModuleAccess } from '@/hooks/use-module-access';
import { P } from '@/lib/rbac/permissions';
import { cn } from '@/lib/utils';
import { inputClass } from './shared';

const ROLES: Array<{ code: string; label: string }> = [
  { code: 'admin', label: 'Admin' },
  { code: 'manager', label: 'Manager' },
  { code: 'cashier', label: 'Cashier' },
  { code: 'waiter', label: 'Waiter' },
  { code: 'kitchen', label: 'Kitchen' },
  { code: 'bar', label: 'Bar' },
  { code: 'barista', label: 'Barista' },
  { code: 'receptionist', label: 'Receptionist' },
];

const MAX_MINUTES = 1440;
const fieldClass = cn(inputClass, 'w-28 text-right');

/** Seconds to the minutes field text. Undefined stays blank (inherits the default). */
function toMinutes(seconds: number | undefined): string {
  if (typeof seconds !== 'number') return '';
  return seconds === 0 ? '0' : String(Math.max(1, Math.round(seconds / 60)));
}

/** Minutes field text to seconds; null when blank or invalid. */
function toSeconds(text: string): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(Math.min(n, MAX_MINUTES) * 60);
}

/**
 * Session timeouts per role for PIN terminal sessions at this outlet. Saved through
 * PATCH /pos/settings/session-timeouts (pos.config.manage).
 */
export function SessionTimeoutsCard() {
  const { data: settings } = usePOSSettings();
  const update = useUpdateSessionTimeouts();
  const { can } = usePermissions();
  const { isSuperUser } = useModuleAccess();
  const canEdit = can(P.CONFIG_MANAGE) || isSuperUser;

  const [byRole, setByRole] = useState<Record<string, string>>({});
  const [defaultMin, setDefaultMin] = useState('');
  const [countdown, setCountdown] = useState('30');

  useEffect(() => {
    if (!settings) return;
    const map = settings.idle_timeout_by_role ?? {};
    setByRole(Object.fromEntries(ROLES.map((r) => [r.code, toMinutes(map[r.code])])));
    setDefaultMin(settings.screensaver_timeout_seconds ? toMinutes(settings.screensaver_timeout_seconds) : '');
    setCountdown(String(settings.idle_countdown_seconds ?? 30));
  }, [settings]);

  const save = () => {
    const roleSeconds: Record<string, number> = {};
    for (const r of ROLES) {
      const s = toSeconds(byRole[r.code] ?? '');
      if (s !== null) roleSeconds[r.code] = s;
    }
    const def = toSeconds(defaultMin);
    const cd = Math.min(300, Math.max(5, Number(countdown) || 30));
    update.mutate({
      idle_timeout_by_role: roleSeconds,
      // 0 clears the default; the API accepts 30..86400 otherwise.
      idle_timeout_default_seconds: def === null || def === 0 ? 0 : Math.max(30, def),
      idle_countdown_seconds: cd,
    });
  };

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-bold flex items-center gap-2">
          <Timer className="h-4 w-4 text-primary" />
          Session timeouts
        </h3>
        <p className="text-sm text-muted-foreground">
          Minutes of inactivity before a PIN session asks &quot;Still there?&quot; and signs out. Leave a role
          blank to use the default. 0 means never.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ROLES.map((r) => (
            <label key={r.code} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">{r.label}</span>
              <input
                type="number"
                min={0}
                max={MAX_MINUTES}
                inputMode="numeric"
                placeholder="Default"
                disabled={!canEdit}
                value={byRole[r.code] ?? ''}
                onChange={(e) => setByRole((m) => ({ ...m, [r.code]: e.target.value }))}
                className={fieldClass}
              />
            </label>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-border">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold">Default (minutes)</span>
            <input
              type="number"
              min={0}
              max={MAX_MINUTES}
              inputMode="numeric"
              placeholder="5"
              disabled={!canEdit}
              value={defaultMin}
              onChange={(e) => setDefaultMin(e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold">Countdown (seconds)</span>
            <input
              type="number"
              min={5}
              max={300}
              inputMode="numeric"
              disabled={!canEdit}
              value={countdown}
              onChange={(e) => setCountdown(e.target.value)}
              className={fieldClass}
            />
          </label>
        </div>

        <div className="pt-2 flex justify-end">
          <Button onClick={save} disabled={!canEdit || update.isPending} size="sm">
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save session timeouts
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
