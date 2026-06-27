'use client';

import { useEffect, useState } from 'react';
import { Loader2, MonitorPlay } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import {
  usePlatformConfigs,
  useUpsertPlatformConfig,
  SCREENSAVER_TIMEOUT_KEY,
} from '@/hooks/usePlatformConfig';
import { inputClass } from './shared';

const DEFAULT_TIMEOUT = 300; // 5 minutes
const MIN_TIMEOUT = 5;
const MAX_TIMEOUT = 3600;

export function PlatformTab() {
  const { data: configs, isLoading } = usePlatformConfigs();
  const upsert = useUpsertPlatformConfig();

  const [timeout, setTimeoutValue] = useState<number>(DEFAULT_TIMEOUT);

  // Hydrate the input from the current platform value once it loads.
  useEffect(() => {
    if (!configs) return;
    const entry = configs.find((c) => c.config_key === SCREENSAVER_TIMEOUT_KEY);
    const parsed = entry ? parseInt(entry.config_value, 10) : NaN;
    setTimeoutValue(Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT);
  }, [configs]);

  const clamped = Math.min(MAX_TIMEOUT, Math.max(MIN_TIMEOUT, timeout || DEFAULT_TIMEOUT));

  const handleSave = () => {
    upsert.mutate({
      key: SCREENSAVER_TIMEOUT_KEY,
      body: {
        config_value: String(clamped),
        config_type: 'int',
        description: 'Idle time (seconds) before the POS terminal screensaver shows',
      },
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h3 className="text-base font-bold flex items-center gap-2">
            <MonitorPlay className="h-4 w-4 text-primary" />
            POS Terminal · Screensaver
          </h3>
          <p className="text-sm text-muted-foreground">
            Platform default applied to all tenant terminals. A tenant or device can override
            this locally.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-sm font-semibold block mb-1">Idle timeout (seconds)</label>
                <p className="text-xs text-muted-foreground">
                  Idle time before the terminal screensaver shows.
                </p>
              </div>
              <input
                type="number"
                min={MIN_TIMEOUT}
                max={MAX_TIMEOUT}
                value={timeout}
                onChange={(e) => setTimeoutValue(Number(e.target.value))}
                className={`${inputClass} w-28 shrink-0`}
              />
            </div>
          )}

          <div className="pt-5 flex justify-end">
            <Button onClick={handleSave} disabled={isLoading || upsert.isPending} size="sm">
              {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
