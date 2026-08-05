'use client';

import { useEffect, useState } from 'react';
import { Clock, Gauge, Key, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSubscription } from '@/hooks/use-subscription';
import { useAuthStore } from '@/store/auth';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { fetchOverageStatus, setOverageEnabled, type OverageStatus } from '@/lib/auth/subscription';
import { Badge, Card, CardContent, CardHeader } from '@/components/ui/base';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';

/**
 * SubscriptionTab is a READ-ONLY view of the outlet's POS subscription licence.
 *
 * It is rendered both on the platform-admin page (as "Licenses") and on the tenant
 * settings page so a tenant admin/manager can see their current plan, renewal date,
 * limits, and included features — without being able to edit them. Plan changes are a
 * platform/billing concern, surfaced here only for visibility.
 */
export function SubscriptionTab() {
  const { info, status, plan, isActive, isPastDue, isExpired, isLoading, daysUntilExpiry } = useSubscription();
  const statusVariant = isActive ? 'success' : isPastDue ? 'warning' : isExpired ? 'error' : 'outline';
  const statusLabel = isActive ? (status === 'trial' ? 'Trial' : 'Active') : status ?? 'None';

  return (
    <div className="space-y-6 w-full">
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 py-4">
          <Key className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm uppercase tracking-tight">POS Subscription License</h3>
          <Badge variant="outline" className="ml-auto">View only</Badge>
        </CardHeader>
        <CardContent className="space-y-5">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border bg-accent/10">
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Plan</p>
                  <p className="text-xl font-bold">{info?.planName || plan || 'No active plan'}</p>
                  {info?.planCode && <p className="text-xs font-mono text-muted-foreground">{info.planCode}</p>}
                </div>
                <Badge variant={statusVariant}>{statusLabel}</Badge>
              </div>

              {info?.currentPeriodEnd && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>
                    {isExpired ? 'Expired' : 'Renews'} on {new Date(info.currentPeriodEnd).toLocaleDateString()}
                    {!isExpired && daysUntilExpiry != null && daysUntilExpiry < 30 && (
                      <span className="ml-2 text-amber-500 font-medium">({daysUntilExpiry} days left)</span>
                    )}
                  </span>
                </div>
              )}

              {info?.limits && Object.keys(info.limits).length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Plan Limits</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {Object.entries(info.limits).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card text-sm">
                        <span className="text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</span>
                        <span className="font-bold">{v === -1 || v === Infinity ? '∞' : String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {info?.features && info.features.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Included Features</p>
                  <div className="flex flex-wrap gap-2">
                    {info.features.map((f) => (
                      <span key={f} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium capitalize">
                        {f.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {!isActive && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700">
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    No active POS subscription. Contact your account administrator to subscribe and unlock device
                    limits and premium features.
                  </p>
                  <a
                    href="https://pricing.codevertexafrica.com/plans?service=pos"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-2 text-sm font-medium text-amber-700 dark:text-amber-400 underline"
                  >
                    View POS Plans →
                  </a>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <ExtraUsageCard />
    </div>
  );
}

/**
 * ExtraUsageCard lets a tenant admin view/manage the pay-as-you-go extra-usage opt-in
 * (allow_overage) and see overage accrued this period. Hidden for exempt users (platform
 * owners / demo) who never accrue overage.
 */
function ExtraUsageCard() {
  const { isPlatformOwner, isDemo, isServiceCharge } = useSubscription();
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenant_id as string | undefined;
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';
  const fmtKes = (n: number) => formatCurrency(n, currency);
  const [data, setData] = useState<OverageStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantId || isPlatformOwner || isDemo) {
      setLoading(false);
      return;
    }
    let active = true;
    fetchOverageStatus(tenantId).then((d) => {
      if (active) {
        setData(d);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [tenantId, isPlatformOwner, isDemo]);

  if (isPlatformOwner || isDemo || isServiceCharge) return null;

  const toggle = async (enabled: boolean) => {
    if (!tenantId) return;
    setSaving(true);
    const ok = await setOverageEnabled(tenantId, enabled);
    setSaving(false);
    if (ok) {
      setData((d) => (d ? { ...d, allowOverage: enabled } : { allowOverage: enabled, pendingTotalKes: 0, breakdown: [] }));
      toast.success(enabled ? 'Extra usage enabled' : 'Extra usage disabled');
    } else {
      toast.error('Could not update extra usage');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 py-4">
        <Gauge className="h-4 w-4 text-primary" />
        <h3 className="font-bold text-sm uppercase tracking-tight">Extra Usage</h3>
        {data?.allowOverage && <Badge variant="success" className="ml-auto">On</Badge>}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              When enabled, metered limits (orders, transactions, etc.) can be exceeded and the extra
              usage is billed on your next renewal. Structural limits (devices, outlets, tables) still
              require a plan upgrade.
            </p>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
              <div>
                <p className="text-sm font-medium">Pay-as-you-go extra usage</p>
                <p className="text-xs text-muted-foreground">
                  {data?.allowOverage ? 'Enabled — overage allowed' : 'Disabled — limits hard-block'}
                </p>
              </div>
              <Button
                variant={data?.allowOverage ? 'outline' : 'default'}
                size="sm"
                disabled={saving}
                onClick={() => toggle(!data?.allowOverage)}
              >
                {saving ? '…' : data?.allowOverage ? 'Turn off' : 'Turn on'}
              </Button>
            </div>
            {data && data.pendingTotalKes > 0 && (
              <div className="flex items-center justify-between p-3 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10 text-sm">
                <span className="text-amber-800 dark:text-amber-300">Overage accrued this period</span>
                <span className="font-bold text-amber-800 dark:text-amber-300">{fmtKes(data.pendingTotalKes)}</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
