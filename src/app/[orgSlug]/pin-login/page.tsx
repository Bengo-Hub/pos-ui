'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { compare as bcryptCompare } from 'bcryptjs';
import { ArrowLeft, ExternalLink, Settings, WifiOff } from 'lucide-react';
import { useOnline } from '@/hooks/use-online';
import { useIdleTimer, getScreensaverTimeoutMs, setScreensaverTimeoutMs } from '@/hooks/use-idle-timer';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { getCachedStaffProfiles, cacheStaffProfile, type CachedStaffProfile } from '@/lib/db/pos-db';
import { PINKeypad } from '@/components/pos/pin-keypad';
import { Screensaver } from '@/components/pos/screensaver';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { cn } from '@/lib/utils';
import { Delete } from 'lucide-react';

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
  cashier:      { label: 'Cashier',    color: 'bg-blue-500/20 text-blue-300',       dot: 'bg-blue-400' },
  waiter:       { label: 'Waiter',     color: 'bg-emerald-500/20 text-emerald-300', dot: 'bg-emerald-400' },
  kitchen:      { label: 'Kitchen',    color: 'bg-orange-500/20 text-orange-300',   dot: 'bg-orange-400' },
  bar:          { label: 'Bar',        color: 'bg-violet-500/20 text-violet-300',   dot: 'bg-violet-400' },
  receptionist: { label: 'Reception',  color: 'bg-pink-500/20 text-pink-300',       dot: 'bg-pink-400' },
  manager:      { label: 'Manager',    color: 'bg-amber-500/20 text-amber-300',     dot: 'bg-amber-400' },
  store_manager:{ label: 'Manager',    color: 'bg-amber-500/20 text-amber-300',     dot: 'bg-amber-400' },
  admin:        { label: 'Admin',      color: 'bg-red-500/20 text-red-300',         dot: 'bg-red-400' },
  pos_admin:    { label: 'Admin',      color: 'bg-red-500/20 text-red-300',         dot: 'bg-red-400' },
  superuser:    { label: 'Superuser',  color: 'bg-purple-500/20 text-purple-300',   dot: 'bg-purple-400' },
};

function roleMeta(role?: string) {
  return ROLE_CONFIG[role ?? ''] ?? { label: role ?? 'Staff', color: 'bg-white/10 text-white/60', dot: 'bg-white/40' };
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// Ghost keypad — always rendered on right, shows faint numbers when no staff selected
function GhostKeypad() {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  return (
    <div className="flex flex-col items-center gap-5 w-full opacity-30 pointer-events-none select-none">
      {/* Ghost dots */}
      <div className="flex gap-3.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-3.5 w-3.5 rounded-full border-2 border-white/30" />
        ))}
      </div>
      <div className="min-h-4" />
      {/* Ghost keypad WITH numbers */}
      <div className="grid grid-cols-3 gap-2.5 w-full">
        {keys.map((k, i) => (
          <div
            key={i}
            className={cn(
              'h-14 rounded-2xl flex items-center justify-center',
              k === '' ? 'invisible' : 'bg-white/10 border border-white/18 text-white/60 text-2xl font-bold'
            )}
          >
            {k === '⌫' ? <Delete className="h-5 w-5" /> : k}
          </div>
        ))}
      </div>
    </div>
  );
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

  const displayName = tenant?.orgName ?? tenant?.name ?? orgSlug;

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

      <div
        className="relative h-screen w-screen overflow-hidden flex flex-col"
        style={{
          background: 'linear-gradient(135deg, rgb(var(--brand-dark)) 0%, color-mix(in srgb, rgb(var(--brand-dark)) 80%, rgb(var(--brand-emphasis))) 50%, rgb(var(--brand-dark)) 100%)',
        }}
      >
        {/* Ambient blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-primary/12 blur-3xl" />
          <div className="absolute top-1/2 -right-24 h-80 w-80 rounded-full bg-primary/8 blur-3xl" />
          <div className="absolute -bottom-24 left-1/2 h-72 w-72 rounded-full bg-primary/6 blur-3xl" />
        </div>

        {/* ── Top bar ── */}
        <div className="relative z-10 flex items-center justify-between px-5 py-3.5 shrink-0">
          {/* Tenant brand */}
          <div className="flex items-center gap-3">
            {tenant?.logoUrl ? (
              <img src={tenant.logoUrl} alt={displayName} className="h-8 object-contain" />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <span className="text-xs font-bold text-primary">
                  {displayName.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            <span className="font-semibold text-sm text-white/75">{displayName}</span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {!isOnline && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs">
                <WifiOff className="h-3 w-3" />
                Offline
              </div>
            )}

            {/* Screensaver settings */}
            <div className="relative">
              <button
                onClick={() => setShowSettings((v) => !v)}
                className="h-8 w-8 rounded-xl flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors"
                title="Screensaver settings"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
              {showSettings && (
                <div className="absolute right-0 top-10 z-50 w-44 rounded-2xl border border-white/10 bg-brand-dark/95 backdrop-blur-xl shadow-2xl p-1.5 space-y-0.5 animate-scale-in">
                  <p className="px-3 py-1.5 text-[9px] font-bold text-white/30 uppercase tracking-wider">Screensaver</p>
                  {TIMEOUT_OPTIONS.map((opt) => (
                    <button
                      key={opt.ms}
                      onClick={() => handleTimeoutChange(opt.ms)}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-xl text-sm transition-colors',
                        timeoutMs === opt.ms
                          ? 'bg-primary text-primary-foreground font-semibold'
                          : 'text-white/65 hover:bg-white/10 hover:text-white'
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/12 bg-white/4 text-xs text-white/55 hover:bg-white/10 hover:text-white hover:border-white/22 transition-all"
            >
              <ExternalLink className="h-3 w-3" />
              Admin Login
            </button>
          </div>
        </div>

        {/* ── Split content ── */}
        <div className="relative z-10 flex-1 flex overflow-hidden min-h-0">

          {/* LEFT: Staff list — 40% on desktop */}
          <div className="flex flex-col w-full md:w-2/5 md:border-r border-white/8 overflow-hidden">
            <div className="px-5 pt-1 pb-3 shrink-0">
              <h1 className="text-lg font-bold text-white font-display">Who&apos;s working?</h1>
              <p className="text-white/40 text-xs mt-0.5">Select your name to enter your PIN</p>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-hide space-y-1.5">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />
                ))
              ) : profiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center px-4">
                  <p className="text-white/35 text-sm">
                    {isOnline ? 'No staff profiles found for this outlet.' : 'No cached profiles. Connect to internet first.'}
                  </p>
                </div>
              ) : (
                profiles.map((p, idx) => {
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
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-200 animate-fade-in',
                        isSelected
                          ? 'bg-primary/20 border-primary/50 shadow-md shadow-primary/10'
                          : p.has_pin
                          ? 'bg-white/4 border-white/8 hover:bg-white/9 hover:border-primary/25 active:scale-[0.98]'
                          : 'bg-white/2 border-white/5 opacity-40 cursor-not-allowed'
                      )}
                      style={{ animationDelay: `${idx * 35}ms` }}
                    >
                      {/* Avatar */}
                      <div className={cn(
                        'h-9 w-9 rounded-lg flex items-center justify-center shrink-0 border transition-colors',
                        isSelected
                          ? 'bg-primary/30 border-primary/50'
                          : 'bg-primary/14 border-primary/18'
                      )}>
                        <span className={cn('text-sm font-bold', isSelected ? 'text-primary' : 'text-primary/80')}>
                          {initials(p.name)}
                        </span>
                      </div>

                      {/* Name + role */}
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-semibold text-white truncate leading-tight">{p.name}</p>
                        {p.role ? (
                          <span className={cn('text-[9px] font-semibold flex items-center gap-1 mt-0.5', rm.color)}>
                            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', rm.dot)} />
                            {rm.label}
                          </span>
                        ) : !p.has_pin ? (
                          <span className="text-[9px] text-white/25 mt-0.5 block">No PIN set</span>
                        ) : null}
                      </div>

                      {/* Selected indicator */}
                      {isSelected && (
                        <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT: PIN pad — always visible on desktop */}
          <div className="hidden md:flex flex-col items-center justify-center flex-1 px-8 py-6">
            {selected ? (
              <div className="flex flex-col items-center gap-4 w-full max-w-68 animate-scale-in">
                {/* Selected staff row */}
                <div className="flex items-center gap-3 w-full">
                  <div className="h-10 w-10 rounded-xl bg-primary/25 border border-primary/40 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-primary">{initials(selected.name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{selected.name}</p>
                    {selected.role && (
                      <span className={cn('text-[9px] font-semibold flex items-center gap-1 mt-0.5', roleMeta(selected.role).color)}>
                        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', roleMeta(selected.role).dot)} />
                        {roleMeta(selected.role).label}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => { setSelected(null); setPinError(null); }}
                    className="h-7 w-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/8 transition-colors"
                    title="Choose different person"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Divider */}
                <div className="w-full h-px bg-white/8" />

                {/* PIN keypad — no extra wrapper panel, sits directly on gradient */}
                <PINKeypad
                  onConfirm={handlePIN}
                  loading={loginMutation.isPending}
                  error={pinError}
                />
              </div>
            ) : (
              /* Ghost state — faint keypad with visible numbers */
              <div className="flex flex-col items-center gap-3 w-full max-w-68">
                <p className="text-white/25 text-xs text-center mb-1">
                  ← Select a staff member to enter your PIN
                </p>
                <GhostKeypad />
              </div>
            )}
          </div>

          {/* MOBILE: Full-screen PIN overlay when staff selected */}
          {selected && (
            <div
              className="md:hidden absolute inset-0 z-20 flex flex-col animate-slide-up"
              style={{
                background: 'linear-gradient(160deg, rgb(var(--brand-dark)) 0%, color-mix(in srgb, rgb(var(--brand-dark)) 80%, rgb(var(--brand-emphasis))) 100%)',
              }}
            >
              {/* Mobile header */}
              <div className="flex items-center gap-3 px-4 pt-4 pb-3 shrink-0">
                <button
                  onClick={() => { setSelected(null); setPinError(null); }}
                  className="h-9 w-9 rounded-xl bg-white/8 flex items-center justify-center text-white/60 hover:text-white transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-primary/20 border border-primary/35 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">{initials(selected.name)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{selected.name}</p>
                    {selected.role && (
                      <span className={cn('text-[9px] font-semibold flex items-center gap-1', roleMeta(selected.role).color)}>
                        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', roleMeta(selected.role).dot)} />
                        {roleMeta(selected.role).label}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center px-6">
                <div className="w-full max-w-xs">
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

        {/* ── Bottom clock ── */}
        <div className="relative z-10 flex justify-center pb-3 shrink-0">
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
    <div className="flex items-center gap-2 text-white/18 text-xs font-mono tabular-nums">
      <span>{time}</span>
      <span className="text-white/10">·</span>
      <span>{date}</span>
    </div>
  );
}
