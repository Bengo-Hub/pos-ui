'use client';

import { useEffect, useState } from 'react';
import { Clock, Loader2, Lock } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { usePOSSettings, useUpdateShiftSettings } from '@/hooks/usePOSSettings';
import { usePermissions } from '@/hooks/usePermissions';
import { useModuleAccess } from '@/hooks/use-module-access';
import { P } from '@/lib/rbac/permissions';
import { Toggle } from './shared';

export function ShiftsSettingsTab() {
  const { data: settings, isLoading } = usePOSSettings();
  const updateShifts = useUpdateShiftSettings();
  const { can } = usePermissions();
  const { isSuperUser } = useModuleAccess();
  const canEdit = can(P.CONFIG_MANAGE) || can(P.CONFIG_CHANGE) || isSuperUser;

  const [autoEnd, setAutoEnd] = useState(false);
  const [maxHours, setMaxHours] = useState(12);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setAutoEnd(settings.shift_auto_end_enabled ?? false);
      setMaxHours(settings.shift_max_hours ?? 12);
    }
  }, [settings]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateShifts.mutateAsync({ shift_auto_end_enabled: autoEnd, shift_max_hours: maxHours });
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

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 text-amber-800 dark:text-amber-300 text-sm">
          <Lock className="h-4 w-4 shrink-0" />
          Shift configuration requires admin or manager permissions.
        </div>
      )}

      <Card>
        <CardHeader>
          <h3 className="text-base font-bold flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Shift Duration Limits
          </h3>
          <p className="text-sm text-muted-foreground">
            Automatically end shifts that exceed the maximum duration to prevent forgotten open sessions.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Auto-end shifts</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Close open shift sessions after the configured maximum hours.
              </p>
            </div>
            <Toggle checked={autoEnd} onChange={setAutoEnd} disabled={!canEdit} />
          </div>

          {autoEnd && (
            <div className="flex items-center gap-4 pt-2 border-t border-border">
              <div className="flex-1">
                <label className="text-sm font-semibold block mb-1">Maximum shift length (hours)</label>
                <p className="text-xs text-muted-foreground">
                  Shifts open longer than this will be auto-closed. Range: 1–24 hours.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={!canEdit || maxHours <= 1}
                  onClick={() => setMaxHours((h) => Math.max(1, h - 1))}
                  className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-accent disabled:opacity-40"
                >
                  −
                </button>
                <span className="w-12 text-center font-bold tabular-nums text-sm">{maxHours}h</span>
                <button
                  type="button"
                  disabled={!canEdit || maxHours >= 24}
                  onClick={() => setMaxHours((h) => Math.min(24, h + 1))}
                  className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-accent disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <Button onClick={handleSave} disabled={!canEdit || saving} size="sm">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save shift settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
