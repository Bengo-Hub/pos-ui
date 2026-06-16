'use client';

import { useEffect, useState } from 'react';
import { DatabaseBackup, Loader2, Lock } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { useBackupSettings, useUpdateBackupSettings } from '@/hooks/useBackupSettings';
import { usePermissions } from '@/hooks/usePermissions';
import { useModuleAccess } from '@/hooks/use-module-access';
import { P } from '@/lib/rbac/permissions';
import { inputClass, Toggle } from './shared';

// Label the service-local hour (0-23) as a friendly 12-hour clock, e.g. 2 -> "2:00 AM".
function hourLabel(h: number): string {
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${period}`;
}

const DEFAULTS = { auto_enabled: false, schedule_hour: 2, retention_days: 4 };

export function BackupsTab() {
  const { data: settings, isLoading } = useBackupSettings();
  const updateSettings = useUpdateBackupSettings();
  const { can } = usePermissions();
  const { isSuperUser } = useModuleAccess();
  const canEdit = can(P.CONFIG_MANAGE) || can(P.CONFIG_CHANGE) || isSuperUser;

  const [autoEnabled, setAutoEnabled] = useState(DEFAULTS.auto_enabled);
  const [scheduleHour, setScheduleHour] = useState(DEFAULTS.schedule_hour);
  const [retentionDays, setRetentionDays] = useState(DEFAULTS.retention_days);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setAutoEnabled(settings.auto_enabled ?? false);
      setScheduleHour(settings.schedule_hour ?? DEFAULTS.schedule_hour);
      setRetentionDays(settings.retention_days ?? DEFAULTS.retention_days);
    }
  }, [settings]);

  const dirty =
    !!settings &&
    (autoEnabled !== (settings.auto_enabled ?? false) ||
      scheduleHour !== (settings.schedule_hour ?? DEFAULTS.schedule_hour) ||
      retentionDays !== (settings.retention_days ?? DEFAULTS.retention_days));

  async function handleSave() {
    setSaving(true);
    try {
      await updateSettings.mutateAsync({
        auto_enabled: autoEnabled,
        schedule_hour: scheduleHour,
        retention_days: Math.max(1, retentionDays || 1),
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

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 text-amber-800 dark:text-amber-300 text-sm">
          <Lock className="h-4 w-4 shrink-0" />
          Backup configuration requires admin or manager permissions.
        </div>
      )}

      <Card>
        <CardHeader>
          <h3 className="text-base font-bold flex items-center gap-2">
            <DatabaseBackup className="h-4 w-4 text-primary" />
            Automatic backups
          </h3>
          <p className="text-sm text-muted-foreground">
            Opt in to a daily backup of this outlet&apos;s data. Backups are off until you turn
            them on here — older backups are pruned automatically.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Enable automatic daily backups</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                When on, a backup runs once per day at the scheduled hour.
              </p>
            </div>
            <Toggle checked={autoEnabled} onChange={setAutoEnabled} disabled={!canEdit} />
          </div>

          <div className="flex items-center gap-4 pt-2 border-t border-border">
            <div className="flex-1">
              <label className="text-sm font-semibold block mb-1">Backup time</label>
              <p className="text-xs text-muted-foreground">
                Service-local hour the daily backup runs.
              </p>
            </div>
            <select
              value={scheduleHour}
              disabled={!canEdit || !autoEnabled}
              onChange={(e) => setScheduleHour(Number(e.target.value))}
              className={`${inputClass} w-36 shrink-0`}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4 pt-2 border-t border-border">
            <div className="flex-1">
              <label className="text-sm font-semibold block mb-1">Retention (days)</label>
              <p className="text-xs text-muted-foreground">
                Backups older than this are deleted. Minimum 1 day.
              </p>
            </div>
            <input
              type="number"
              min={1}
              value={retentionDays}
              disabled={!canEdit || !autoEnabled}
              onChange={(e) => setRetentionDays(Number(e.target.value))}
              className={`${inputClass} w-24 shrink-0`}
            />
          </div>

          <div className="pt-2 flex justify-end">
            <Button onClick={handleSave} disabled={!canEdit || saving || !dirty} size="sm">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save backup settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
