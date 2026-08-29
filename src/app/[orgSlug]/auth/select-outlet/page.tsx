'use client';

/**
 * Post-login outlet selection — service-level flow (mirrors TruLoad's select-station pattern).
 *
 * Outlets are synced from auth-service to pos-api via NATS during tenant sync.
 * This page fetches the tenant outlet list from pos-api (not auth-api) and lets the user pick.
 *
 * Behaviour:
 * - Single outlet: auto-selects without showing UI.
 * - Multiple outlets: shows card selector with last-used outlet highlighted at top.
 * - Stores selection in localStorage ('pos-selected-outlet-id') and as X-Outlet-ID in apiClient.
 * - Repeat users who already have a stored outlet are redirected past this page by the callback.
 */

import { apiClient } from '@/lib/api/client';
import { getStoredOutletId, setStoredOutletId } from '@/lib/auth/outlet-storage';
import { canAccessAllOutlets } from '@/lib/auth/outlet-access';
import { useAuthStore, type OutletInfo } from '@/store/auth';
import { Building2, CheckCircle2, ChevronRight, Crown, MapPin } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';

const USE_CASE_LABELS: Record<string, string> = {
  hospitality: 'Hospitality',
  quick_service: 'Quick Service',
  retail: 'Retail',
  services: 'Services',
};

const USE_CASE_COLORS: Record<string, string> = {
  hospitality: 'bg-blue-500/20 text-blue-300',
  quick_service: 'bg-orange-500/20 text-orange-300',
  retail: 'bg-green-500/20 text-green-300',
  services: 'bg-yellow-500/20 text-yellow-300',
};

function getLastSelectedOutletId(): string | null {
  // Slug-scoped (URL path slug): never surfaces an outlet persisted under another tenant.
  return getStoredOutletId() || null;
}

function SelectOutletContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const orgSlug = params?.orgSlug as string;
  const returnTo = searchParams?.get('returnTo') ?? `/${orgSlug}`;

  const { user, status, setOutlet } = useAuthStore();
  const tenantID = user?.tenant_id ?? '';

  // HQ users (admin/manager) get the full outlet picker; other roles auto-select.
  const isHQUser = canAccessAllOutlets(user);

  const [outlets, setOutlets] = useState<OutletInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  // Last-used outlet from a previous session (TruLoad: preselectedStationCode)
  const lastOutletId = useMemo(() => getLastSelectedOutletId(), []);

  const redirect = useCallback((path: string) => router.replace(path), [router]);

  useEffect(() => {
    if (status === 'idle') {
      useAuthStore.getState().redirectToSSO(orgSlug, window.location.href);
    }
  }, [status, orgSlug]);

  const handleSelect = useCallback(
    (outlet: OutletInfo) => {
      setSelecting(outlet.id);
      setOutlet(outlet);
      // setOutlet already persists slug-scoped and sets apiClient, but be explicit here
      setStoredOutletId(outlet.id, orgSlug);
      apiClient.setOutletID(outlet.id);
      redirect(returnTo);
    },
    [setOutlet, redirect, returnTo, orgSlug]
  );

  useEffect(() => {
    if (!tenantID) return;

    async function loadOutlets() {
      try {
        const res = await apiClient.get<{ data: OutletInfo[] }>(
          `/api/v1/${tenantID}/pos/outlets`
        );
        const list: OutletInfo[] = Array.isArray(res) ? res : (res as any).data ?? [];
        const active = list.filter((o) => o.status !== 'archived');
        setOutlets(active);

        if (active.length === 0) {
          redirect(returnTo);
          return;
        }

        // Non-HQ users (cashier, waiter, kitchen, bar, pharmacist, etc.) are locked
        // to their assigned outlet. Auto-select the last-used outlet or the first one
        // without showing the picker UI.
        if (!isHQUser) {
          const preferred = lastOutletId ? active.find((o) => o.id === lastOutletId) : null;
          handleSelect(preferred ?? active[0]);
          return;
        }

        if (active.length === 1) {
          // Single outlet — auto-select even for HQ users, no need to show picker
          handleSelect(active[0]);
          return;
        }
      } catch {
        setError('Could not load outlets. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    loadOutlets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantID, isHQUser]);

  // Bring last-used outlet to the top (TruLoad pattern: orderedStations)
  const orderedOutlets = useMemo(() => {
    if (!lastOutletId || outlets.length <= 1) return outlets;
    const idx = outlets.findIndex((o) => o.id === lastOutletId);
    if (idx <= 0) return outlets;
    const copy = [...outlets];
    const [last] = copy.splice(idx, 1);
    return [last, ...copy];
  }, [outlets, lastOutletId]);

  if (loading || status === 'loading' || status === 'syncing') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-dark">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-white/50">Loading outlets...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-dark p-4">
        <div className="w-full max-w-sm rounded-xl border border-white/10 bg-white/5 p-6 text-center">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-dark px-4 py-8">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-white">Select Outlet</h1>
          <p className="mt-1 text-sm text-white/50">
            Choose the outlet you&apos;re working at today
          </p>
        </div>

        {/* Outlet cards */}
        <div className="space-y-3">
          {orderedOutlets.map((outlet) => {
            const isLastUsed = outlet.id === lastOutletId;
            const isSelecting = selecting === outlet.id;
            const useCase = outlet.use_case ?? '';
            const useCaseLabel = USE_CASE_LABELS[useCase] ?? useCase;
            const useCaseColor = USE_CASE_COLORS[useCase] ?? 'bg-white/10 text-white/60';

            return (
              <button
                key={outlet.id}
                type="button"
                disabled={!!selecting}
                onClick={() => handleSelect(outlet)}
                className={[
                  'group flex w-full items-center justify-between rounded-xl border px-5 py-4 text-left transition-all duration-150 disabled:opacity-60',
                  isLastUsed
                    ? 'border-primary/50 bg-primary/10 hover:bg-primary/15'
                    : 'border-white/8 bg-white/5 hover:border-primary/40 hover:bg-primary/10',
                ].join(' ')}
              >
                <div className="flex items-center gap-4">
                  <div className={[
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
                    isLastUsed ? 'bg-primary/20' : 'bg-white/10 group-hover:bg-primary/20',
                  ].join(' ')}>
                    <MapPin className={[
                      'h-5 w-5 transition-colors',
                      isLastUsed ? 'text-primary' : 'text-white/60 group-hover:text-primary',
                    ].join(' ')} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">{outlet.name}</span>
                      {outlet.is_hq && (
                        <span className="flex items-center gap-1 rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs font-medium text-yellow-300">
                          <Crown className="h-3 w-3" /> HQ
                        </span>
                      )}
                      {isLastUsed && (
                        <span className="rounded-full bg-primary/30 px-2 py-0.5 text-xs font-medium text-primary">
                          Last used
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-white/40">{outlet.code}</span>
                      {useCaseLabel && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${useCaseColor}`}>
                          {useCaseLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 pl-2">
                  {isSelecting ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  ) : isLastUsed ? (
                    <ChevronRight className="h-5 w-5 text-primary" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-white/20 transition-colors group-hover:text-primary" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Skip link for users who don't need outlet context */}
        <p className="text-center text-xs text-white/30">
          Not sure?{' '}
          <button
            type="button"
            onClick={() => redirect(returnTo)}
            className="text-white/50 underline hover:text-white/70"
          >
            Skip for now
          </button>
        </p>
      </div>
    </div>
  );
}

export default function SelectOutletPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-brand-dark">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <SelectOutletContent />
    </Suspense>
  );
}
