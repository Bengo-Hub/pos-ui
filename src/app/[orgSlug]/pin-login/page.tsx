'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { compare as bcryptCompare } from 'bcryptjs';
import { ChevronLeft, ExternalLink, Settings, User, WifiOff } from 'lucide-react';
import { useOnline } from '@/hooks/use-online';
import { useIdleTimer, getScreensaverTimeoutMs, setScreensaverTimeoutMs } from '@/hooks/use-idle-timer';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { getCachedStaffProfiles, cacheStaffProfile, type CachedStaffProfile } from '@/lib/db/pos-db';
import { PINKeypad } from '@/components/pos/pin-keypad';
import { Screensaver } from '@/components/pos/screensaver';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

interface StaffProfile {
  user_id: string;
  name: string;
  tenant_id: string;
  outlet_id: string;
  has_pin: boolean;
}

interface PINLoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: {
    user_id: string;
    name: string;
    tenant_id: string;
    outlet_id: string;
  };
}

const TIMEOUT_OPTIONS = [
  { label: '15 seconds', ms: 15_000 },
  { label: '30 seconds', ms: 30_000 },
  { label: '1 minute',   ms: 60_000 },
  { label: '2 minutes',  ms: 120_000 },
  { label: 'Never',      ms: 0 },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PINLoginPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const isOnline = useOnline();
  const { tenant } = useTenantBranding();
  const setTerminalSession = useAuthStore((s) => s.setTerminalSession);
  const redirectToSSO      = useAuthStore((s) => s.redirectToSSO);
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  // Fallback: read tenant_id from URL slug when not yet in store
  const effectiveTenantID = tenantID || (tenant?.id ?? '');

  const [selected, setSelected]       = useState<StaffProfile | null>(null);
  const [pinError, setPinError]       = useState<string | null>(null);
  const [offlineProfiles, setOfflineProfiles] = useState<CachedStaffProfile[]>([]);
  const [screensaverActive, setScreensaverActive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [timeoutMs, setTimeoutMsState] = useState<number>(30_000);

  useEffect(() => {
    setTimeoutMsState(getScreensaverTimeoutMs());
  }, []);

  const handleIdle   = useCallback(() => setScreensaverActive(true),  []);
  const handleActive = useCallback(() => setScreensaverActive(false), []);

  // Never idle when timeout = 0 (disabled)
  useIdleTimer(handleIdle, handleActive, timeoutMs === 0 ? undefined : timeoutMs);

  const handleTimeoutChange = (ms: number) => {
    setTimeoutMsState(ms);
    setScreensaverTimeoutMs(ms === 0 ? 9_999_999_999 : ms);
    setShowSettings(false);
  };

  // ── Staff profiles ────────────────────────────────────────────────────────

  const { data: serverProfiles } = useQuery<StaffProfile[]>({
    queryKey: ['pos-staff-profiles', effectiveTenantID],
    queryFn: async () => {
      const body = await apiClient.get<{ data: StaffProfile[] }>(
        `/api/v1/${effectiveTenantID}/pos/auth/pin/profile`
      );
      const list: StaffProfile[] = body.data ?? [];
      for (const p of list) {
        await cacheStaffProfile({
          user_id:     p.user_id,
          tenant_id:   p.tenant_id,
          name:        p.name,
          email:       '',
          roles:       [],
          permissions: [],
          cached_at:   new Date().toISOString(),
        });
      }
      return list;
    },
    enabled: isOnline && !!effectiveTenantID,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!isOnline && effectiveTenantID) {
      getCachedStaffProfiles(effectiveTenantID).then(setOfflineProfiles);
    }
  }, [isOnline, effectiveTenantID]);

  const profiles: StaffProfile[] = isOnline
    ? (serverProfiles ?? [])
    : offlineProfiles.map((p) => ({
        user_id:   p.user_id,
        name:      p.name,
        tenant_id: p.tenant_id,
        outlet_id: '',
        has_pin:   !!p.pin_hash,
      }));

  // ── PIN login (online) ────────────────────────────────────────────────────

  const loginMutation = useMutation({
    mutationFn: (vars: { userId: string; pin: string }) =>
      apiClient.post<PINLoginResponse>(
        `/api/v1/${effectiveTenantID}/pos/auth/pin`,
        { user_id: vars.userId, pin: vars.pin }
      ),
    onSuccess: (data) => {
      setTerminalSession(data.access_token, {
        id:              data.user.user_id,
        email:           '',
        fullName:        data.user.name,
        roles:           [],
        permissions:     [],
        tenant_id:       data.user.tenant_id,
        tenant_slug:     orgSlug,
        isPlatformOwner: false,
        isSuperUser:     false,
      });
      router.push(`/${orgSlug}/order`);
    },
    onError: () => setPinError('Incorrect PIN. Please try again.'),
  });

  const handlePIN = async (pin: string) => {
    if (!selected) return;
    setPinError(null);

    if (isOnline) {
      loginMutation.mutate({ userId: selected.user_id, pin });
      return;
    }

    // ── Offline: validate cached bcrypt hash ──
    const cached = offlineProfiles.find((p) => p.user_id === selected.user_id);
    if (!cached?.pin_hash) {
      setPinError('PIN not available offline. Connect to internet to log in.');
      return;
    }
    const valid = await bcryptCompare(pin, cached.pin_hash);
    if (!valid) {
      setPinError('Incorrect PIN. Please try again.');
      return;
    }
    // Offline terminal session — no server JWT, use a local marker
    setTerminalSession('offline-terminal-session', {
      id:              cached.user_id,
      email:           cached.email,
      fullName:        cached.name,
      roles:           cached.roles,
      permissions:     cached.permissions,
      tenant_id:       cached.tenant_id,
      tenant_slug:     orgSlug,
      isPlatformOwner: false,
      isSuperUser:     false,
    });
    router.push(`/${orgSlug}/order`);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Screensaver overlay */}
      <Screensaver
        active={screensaverActive}
        onDismiss={() => setScreensaverActive(false)}
        screensaverUrl={tenant?.posScreensaverUrl}
        tenantName={tenant?.orgName ?? tenant?.name}
        tenantLogoUrl={tenant?.logoUrl}
      />

      <div className="min-h-screen bg-background flex flex-col">
        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-6 py-4">
          {/* Tenant branding */}
          <div className="flex items-center gap-3">
            {tenant?.logoUrl && (
              <img src={tenant.logoUrl} alt={tenant.orgName} className="h-8 object-contain" />
            )}
            <span className="font-semibold text-sm text-muted-foreground">
              {tenant?.orgName ?? orgSlug}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Offline indicator */}
            {!isOnline && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 text-xs">
                <WifiOff className="h-3 w-3" />
                Offline
              </div>
            )}

            {/* Screensaver timeout setting */}
            <div className="relative">
              <button
                onClick={() => setShowSettings((v) => !v)}
                className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-accent text-muted-foreground transition-colors"
                title="Screensaver settings"
              >
                <Settings className="h-4 w-4" />
              </button>
              {showSettings && (
                <div className="absolute right-0 top-10 z-50 w-52 rounded-xl border border-border bg-card shadow-xl p-2 space-y-0.5">
                  <p className="px-3 py-1 text-xs font-semibold text-muted-foreground">
                    Screensaver timeout
                  </p>
                  {TIMEOUT_OPTIONS.map((opt) => (
                    <button
                      key={opt.ms}
                      onClick={() => handleTimeoutChange(opt.ms)}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                        (opt.ms === timeoutMs || (opt.ms === 0 && timeoutMs === 0))
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-accent'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Admin SSO login */}
            <button
              onClick={() => redirectToSSO(orgSlug, window.location.href)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Admin Login
            </button>
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8">
          {!selected ? (
            <>
              <div className="text-center">
                <h1 className="text-2xl font-bold">Who&apos;s working?</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Select your name to enter your PIN
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 w-full max-w-2xl">
                {profiles.map((p) => (
                  <button
                    key={p.user_id}
                    onClick={() => { if (p.has_pin) { setSelected(p); setPinError(null); } }}
                    disabled={!p.has_pin}
                    className={cn(
                      'flex flex-col items-center gap-3 p-5 rounded-2xl border bg-card transition-all',
                      p.has_pin
                        ? 'hover:border-primary hover:bg-primary/5 active:scale-95 cursor-pointer'
                        : 'opacity-40 cursor-not-allowed'
                    )}
                  >
                    <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-7 w-7 text-primary" />
                    </div>
                    <span className="text-sm font-medium text-center leading-tight">{p.name}</span>
                    {!p.has_pin && (
                      <span className="text-[10px] text-muted-foreground">No PIN set</span>
                    )}
                  </button>
                ))}

                {profiles.length === 0 && (
                  <p className="col-span-full text-center text-muted-foreground text-sm py-12">
                    {isOnline
                      ? 'Loading staff…'
                      : 'No cached profiles. Connect to internet first.'}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="text-center">
                <h1 className="text-2xl font-bold">Hello, {selected.name}</h1>
                <p className="text-sm text-muted-foreground mt-1">Enter your PIN to continue</p>
              </div>

              <PINKeypad
                onConfirm={handlePIN}
                loading={loginMutation.isPending}
                error={pinError}
              />

              <button
                onClick={() => { setSelected(null); setPinError(null); }}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
