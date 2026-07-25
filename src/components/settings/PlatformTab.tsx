'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, MonitorPlay, Megaphone, X } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import {
  usePlatformConfigs,
  useUpsertPlatformConfig,
  useTenantOverrides,
  useUpsertTenantOverride,
  useDeleteTenantOverride,
  SCREENSAVER_TIMEOUT_KEY,
  PROVIDER_FOOTER_KEY,
} from '@/hooks/usePlatformConfig';
import { usePlatformTenants } from '@/hooks/use-platform-tenants';
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

      <ProviderFooterCard />
    </div>
  );
}

// Platform default + per-tenant override for the "Developed & maintained by CodeVertex"
// advertisement footer printed on receipts/reports. Platform-owner-only — never a tenant
// self-service setting (that's what distinguishes /admin/tenants/{id}/config from the tenant's
// own /settings route).
function ProviderFooterCard() {
  const { data: configs, isLoading } = usePlatformConfigs();
  const upsertPlatform = useUpsertPlatformConfig();
  const platformEntry = configs?.find((c) => c.config_key === PROVIDER_FOOTER_KEY);
  const platformEnabled = platformEntry ? platformEntry.config_value === 'true' : true;

  const { data: tenants } = usePlatformTenants();
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const { data: overrides, isLoading: overridesLoading } = useTenantOverrides(selectedTenantId || undefined);
  const upsertOverride = useUpsertTenantOverride();
  const deleteOverride = useDeleteTenantOverride();

  const overrideEntry = overrides?.find((c) => c.config_key === PROVIDER_FOOTER_KEY);
  const selectedTenant = useMemo(
    () => tenants?.find((t) => t.id === selectedTenantId),
    [tenants, selectedTenantId],
  );

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-bold flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-primary" />
          Provider Footer
        </h3>
        <p className="text-sm text-muted-foreground">
          The &quot;Developed &amp; maintained by CodeVertex&quot; line printed on receipts, invoices,
          purchase orders and reports. Shows by default unless turned off — platform-wide or for
          one specific tenant.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="text-sm font-semibold block mb-1">Platform default</label>
            <p className="text-xs text-muted-foreground">Applies to every tenant with no override.</p>
          </div>
          <Button
            size="sm"
            variant={platformEnabled ? 'outline' : 'primary'}
            disabled={isLoading || upsertPlatform.isPending}
            onClick={() =>
              upsertPlatform.mutate({
                key: PROVIDER_FOOTER_KEY,
                body: {
                  config_value: platformEnabled ? 'false' : 'true',
                  config_type: 'bool',
                  description: 'Show the CodeVertex platform advertisement footer on generated documents',
                },
              })
            }
          >
            {platformEnabled ? 'Shown — click to hide' : 'Hidden — click to show'}
          </Button>
        </div>

        <div className="border-t border-border pt-5 space-y-3">
          <div>
            <label className="text-sm font-semibold block mb-1">Tenant exception</label>
            <p className="text-xs text-muted-foreground">
              Grant one tenant an override that differs from the platform default.
            </p>
          </div>
          <select
            className={inputClass}
            value={selectedTenantId}
            onChange={(e) => setSelectedTenantId(e.target.value)}
          >
            <option value="">Select a tenant…</option>
            {(tenants ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.slug})
              </option>
            ))}
          </select>

          {selectedTenantId && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              {overridesLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading override…
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {selectedTenant?.name}:{' '}
                    {overrideEntry
                      ? `override — footer ${overrideEntry.config_value === 'true' ? 'shown' : 'hidden'}`
                      : `no override — inherits platform default (${platformEnabled ? 'shown' : 'hidden'})`}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={upsertOverride.isPending}
                      onClick={() =>
                        upsertOverride.mutate({
                          tenantID: selectedTenantId,
                          key: PROVIDER_FOOTER_KEY,
                          body: { config_value: 'true', config_type: 'bool' },
                        })
                      }
                    >
                      Show for this tenant
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={upsertOverride.isPending}
                      onClick={() =>
                        upsertOverride.mutate({
                          tenantID: selectedTenantId,
                          key: PROVIDER_FOOTER_KEY,
                          body: { config_value: 'false', config_type: 'bool' },
                        })
                      }
                    >
                      Hide for this tenant
                    </Button>
                    {overrideEntry && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={deleteOverride.isPending}
                        onClick={() => deleteOverride.mutate({ tenantID: selectedTenantId, key: PROVIDER_FOOTER_KEY })}
                      >
                        <X className="h-3.5 w-3.5 mr-1" /> Clear override
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
