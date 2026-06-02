'use client';

import { Clock, Key, Loader2 } from 'lucide-react';
import { useSubscription } from '@/hooks/use-subscription';
import { Badge, Card, CardContent, CardHeader } from '@/components/ui/base';

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
                    href="https://pricing.codevertexitsolutions.com/plans?service=pos"
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
    </div>
  );
}
