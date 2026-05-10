'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { compare as bcryptCompare } from 'bcryptjs';
import { ExternalLink, Settings, WifiOff } from 'lucide-react';
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
  role?: string;
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
    role?: string;
    permissions?: string[];
    tenant_id: string;
    outlet_id: string;
  };
}

const TIMEOUT_OPTIONS = [
  { label: '15 s',  ms: 15_000 },
  { label: '30 s',  ms: 30_000 },
  { label: '1 min', ms: 60_000 },
  { label: '2 min', ms: 120_000 },
  { label: 'Never', ms: 0 },
];

const ROLE_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  cashier:      { label: 'Cashier',    color: 'bg-blue-500/20 text-blue-300',    dot: 'bg-blue-400' },
  waiter:       { label: 'Waiter',     color: 'bg-emerald-500/20 text-emerald-300', dot: 'bg-emerald-400' },
  kitchen:      { label: 'Kitchen',    color: 'bg-orange-500/20 text-orange-300', dot: 'bg-orange-400' },
  bar:          { label: 'Bar',        color: 'bg-violet-500/20 text-violet-300', dot: 'bg-violet-400' },
  receptionist: { label: 'Reception',  color: 'bg-pink-500/20 text-pink-300',    dot: 'bg-pink-400' },
  store_manager:{ label: 'Manager',    color: 'bg-amber-500/20 text-amber-300',  dot: 'bg-amber-400' },
  pos_admin:    { label: 'Admin',      color: 'bg-red-500/20 text-red-300',      dot: 'bg-red-400' },
};

function roleMeta(role?: string) {
  return ROLE_CONFIG[role ?? ''] ?? { label: role ?? 'Staff', color: 'bg-white/10 text-white/60', dot: 'bg-white/40' };
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PINLoginPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const isOnline = useOnline();
  const { tenant } = useTenantBranding();
  const setTerminalSession = useAuthStore((s) => s.setTerminalSession);
  const redirectToSSO      = useAuthStore((s) => s.redirectToSSO);
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const effectiveTenantID  = tenantID || (tenant?.id ?? '');

  const [selected, setSelected]               = useState<StaffProfile | null>(null);
  const [pinError, setPinError]               = useState<string | null>(null);
  const [offlineProfiles, setOfflineProfiles] = useState<CachedStaffProfile[]>([]);
  const [screensaverActive, setScreensaverActive] = useState(false);
  const [showSettings, setShowSettings]       = useState(false);
  const [timeoutMs, setTimeoutMsState]        = useState<number>(30_000);

  useEffect(() => { setTimeoutMsState(getScreensaverTimeoutMs()); }, []);

  const handleIdle   = useCallback(() => setScreensaverActive(true),  []);
  const handleActive = useCallback(() => setScreensaverActive(false), []);
  useIdleTimer(handleIdle, handleActive, timeoutMs === 0 ? undefined : timeoutMs);

  const handleTimeoutChange = (ms: number) => {
    setTimeoutMsState(ms);
    setScreensaverTimeoutMs(ms === 0 ? 9_999_999_999 : ms);
    setShowSettings(false);
  };

  // ── Staff profiles ─────────────────────────────────────────────────────────

  const { data: serverProfiles, isLoading } = useQuery<StaffProfile[]>({
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
          roles:       p.role ? [p.role] : [],
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
        role:      p.roles?.[0],
        tenant_id: p.tenant_id,
        outlet_id: '',
        has_pin:   !!p.pin_hash,
      }));

  // ── PIN login ──────────────────────────────────────────────────────────────

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
        roles:           data.user.role ? [data.user.role] : [],
        permissions:     data.user.permissions ?? [],
        tenant_id:       data.user.tenant_id,
        tenant_slug:     orgSlug,
        isPlatformOwner: false,
        isSuperUser:     false,
      });
      router.push(`/${orgSlug}/dashboard`);
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

    const cached = offlineProfiles.find((p) => p.user_id === selected.user_id);
    if (!cached?.pin_hash) {
      setPinError('PIN not available offline. Connect to log in.');
      return;
    }
    const valid = await bcryptCompare(pin, cached.pin_hash);
    if (!valid) {
      setPinError('Incorrect PIN. Please try again.');
      return;
    }
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
    router.push(`/${orgSlug}/dashboard`);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <Screensaver
        active={screensaverActive}
        onDismiss={() => setScreensaverActive(false)}
        screensaverUrl={tenant?.posScreensaverUrl}
        tenantName={tenant?.orgName ?? tenant?.name}
        tenantLogoUrl={tenant?.logoUrl}
      />

      {/* Full-screen gradient using tenant CSS vars */}
      <div
        className="relative h-screen w-screen overflow-hidden flex flex-col"
        style={{
          background: 'linear-gradient(135deg, rgb(var(--brand-dark)) 0%, color-mix(in srgb, rgb(var(--brand-dark)) 82%, rgb(var(--brand-emphasis))) 45%, rgb(var(--brand-dark)) 100%)',
        }}
      >
        {/* Ambient glow blobs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-32 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute top-1/3 -right-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-20 left-1/3 h-64 w-64 rounded-full bg-primary/8 blur-3xl" />
        </div>

        {/* ── Top bar ── */}
        <div className="relative z-10 flex items-center justify-between px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            {tenant?.logoUrl ? (
              <img src={tenant.logoUrl} alt={tenant.orgName ?? orgSlug} className="h-8 object-contain" />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <span className="text-xs font-bold text-primary">
                  {(tenant?.orgName ?? orgSlug).slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            <span className="font-semibold text-sm text-white/80">{tenant?.orgName ?? orgSlug}</span>
          </div>

          <div className="flex items-center gap-2">
            {!isOnline && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
                <WifiOff className="h-3 w-3" />
                Offline
              </div>
            )}
            <div className="relative">
              <button
                onClick={() => setShowSettings((v) => !v)}
                className="h-9 w-9 rounded-xl flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
                title="Screensaver settings"
              >
                <Settings className="h-4 w-4" />
              </button>
              {showSettings && (
                <div className="absolute right-0 top-11 z-50 w-44 rounded-2xl border border-white/10 bg-brand-dark/95 backdrop-blur-xl shadow-2xl p-2 space-y-0.5 animate-scale-in">
                  <p className="px-3 py-1.5 text-[10px] font-semibold text-white/35 uppercase tracking-wider">Screensaver</p>
                  {TIMEOUT_OPTIONS.map((opt) => (
                    <button
                      key={opt.ms}
                      onClick={() => handleTimeoutChange(opt.ms)}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-xl text-sm transition-colors',
                        timeoutMs === opt.ms
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'text-white/70 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => redirectToSSO(orgSlug, window.location.href)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 text-xs text-white/60 hover:bg-white/10 hover:text-white hover:border-white/25 transition-all"
            >
              <ExternalLink className="h-3 w-3" />
              Admin Login
            </button>
          </div>
        </div>

        {/* ── Main content — split layout ── */}
        <div className="relative z-10 flex-1 flex overflow-hidden">

          {/* LEFT: Staff selector */}
          <div className="flex flex-col w-full md:w-2/5 md:border-r border-white/8 overflow-hidden">
            <div className="px-5 pt-2 pb-3 shrink-0">
              <h1 className="text-xl font-bold text-white">Who&apos;s working?</h1>
              <p className="text-white/45 text-sm mt-0.5">Select your name, then enter your PIN</p>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4 scrollbar-hide">
              {isLoading ? (
                <div className="grid grid-cols-2 gap-3">
                  {[1,2,3,4].map((i) => (
                    <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />
                  ))}
                </div>
              ) : profiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <p className="text-white/40 text-sm">
                    {isOnline ? 'No staff profiles found.' : 'No cached profiles. Connect to internet first.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {profiles.map((p, idx) => {
                    const rm = roleMeta(p.role);
                    const isSelected = selected?.user_id === p.user_id;
                    return (
                      <button
                        key={p.user_id}
                        onClick={() => {
                          if (!p.has_pin) return;
                          setSelected(isSelected ? null : p);
                          setPinError(null);
                        }}
                        disabled={!p.has_pin}
                        className={cn(
                          'relative flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all duration-200 animate-fade-in',
                          isSelected
                            ? 'bg-primary/25 border-primary/60 shadow-lg shadow-primary/15'
                            : p.has_pin
                            ? 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-primary/30 active:scale-95'
                            : 'bg-white/3 border-white/5 opacity-40 cursor-not-allowed'
                        )}
                        style={{ animationDelay: `${idx * 40}ms` }}
                      >
                        {/* Selected indicator */}
                        {isSelected && (
                          <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
                        )}
                        {/* Avatar */}
                        <div className={cn(
                          'h-12 w-12 rounded-xl flex items-center justify-center border transition-colors',
                          isSelected
                            ? 'bg-primary/30 border-primary/50'
                            : 'bg-primary/15 border-primary/20'
                        )}>
                          <span className="text-base font-bold text-primary">{initials(p.name)}</span>
                        </div>
                        {/* Name */}
                        <span className="text-xs font-semibold text-white text-center leading-tight line-clamp-2">
                          {p.name}
                        </span>
                        {/* Role badge */}
                        {p.role ? (
                          <span className={cn('text-[9px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1', rm.color)}>
                            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', rm.dot)} />
                            {rm.label}
                          </span>
                        ) : !p.has_pin ? (
                          <span className="text-[9px] text-white/30">No PIN set</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: PIN keypad — always visible */}
          <div className="hidden md:flex flex-col items-center justify-center w-3/5 px-6 py-4">
            {selected ? (
              <div className="flex flex-col items-center gap-5 w-full max-w-xs animate-scale-in">
                {/* Selected staff header */}
                <div className="flex flex-col items-center gap-2">
                  <div className="h-16 w-16 rounded-2xl bg-primary/20 border-2 border-primary/40 flex items-center justify-center shadow-lg shadow-primary/15">
                    <span className="text-xl font-bold text-primary">{initials(selected.name)}</span>
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-white text-lg">{selected.name}</p>
                    {selected.role && (
                      <span className={cn('text-xs font-medium px-2.5 py-0.5 rounded-full inline-block mt-1', roleMeta(selected.role).color)}>
                        {roleMeta(selected.role).label}
                      </span>
                    )}
                  </div>
                </div>

                {/* Frosted PIN panel */}
                <div className="w-full rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 shadow-2xl">
                  <p className="text-center text-white/50 text-sm mb-4">Enter your PIN</p>
                  <PINKeypad
                    onConfirm={handlePIN}
                    loading={loginMutation.isPending}
                    error={pinError}
                  />
                </div>

                <button
                  onClick={() => { setSelected(null); setPinError(null); }}
                  className="text-sm text-white/35 hover:text-white/60 transition-colors"
                >
                  ← Choose different person
                </button>
              </div>
            ) : (
              /* Placeholder when no staff selected */
              <div className="flex flex-col items-center gap-5 w-full max-w-xs">
                <div className="w-full rounded-3xl border border-white/8 bg-white/3 p-5 opacity-50">
                  {/* Ghost PIN dots */}
                  <div className="flex justify-center gap-4 mb-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-4 w-4 rounded-full border-2 border-white/20" />
                    ))}
                  </div>
                  {/* Ghost keypad */}
                  <div className="grid grid-cols-3 gap-3">
                    {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
                      <div
                        key={i}
                        className={cn(
                          'h-14.5 rounded-2xl',
                          k === '' ? 'invisible' : 'bg-white/8 border border-white/10'
                        )}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-white/30 text-sm text-center">
                  ← Select a staff member to enter your PIN
                </p>
              </div>
            )}
          </div>

          {/* MOBILE: PIN pad shown below staff list when staff selected */}
          {selected && (
            <div className="md:hidden absolute inset-0 z-20 flex flex-col animate-slide-up"
              style={{
                background: 'linear-gradient(135deg, rgb(var(--brand-dark)) 0%, color-mix(in srgb, rgb(var(--brand-dark)) 82%, rgb(var(--brand-emphasis))) 100%)',
              }}
            >
              <div className="flex items-center gap-3 px-5 pt-5 pb-3">
                <button
                  onClick={() => { setSelected(null); setPinError(null); }}
                  className="h-8 w-8 rounded-lg bg-white/8 flex items-center justify-center text-white/60 hover:text-white"
                >
                  ←
                </button>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">{initials(selected.name)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{selected.name}</p>
                    {selected.role && (
                      <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded-full', roleMeta(selected.role).color)}>
                        {roleMeta(selected.role).label}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center px-5">
                <div className="w-full max-w-xs rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-5">
                  <p className="text-center text-white/50 text-sm mb-4">Enter your PIN</p>
                  <PINKeypad
                    onConfirm={handlePIN}
                    loading={loginMutation.isPending}
                    error={pinError}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Bottom bar ── */}
        <div className="relative z-10 flex items-center justify-center pb-4 shrink-0">
          <LiveClock />
        </div>
      </div>
    </>
  );
}

function LiveClock() {
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setDate(d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-2 text-white/20 text-xs font-mono">
      <span className="tabular-nums">{time}</span>
      <span className="text-white/10">·</span>
      <span>{date}</span>
    </div>
  );
}
