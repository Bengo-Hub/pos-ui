'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { compare as bcryptCompare } from 'bcryptjs';
import {
  ArrowLeft, BedDouble, Building2, ChevronRight, Coffee, ExternalLink,
  Pill, Scissors, Settings, ShoppingBag, Truck, UtensilsCrossed,
  Warehouse, Wine, WifiOff, Zap,
} from 'lucide-react';
import { useOnline } from '@/hooks/use-online';
import { useIdleTimer, getScreensaverTimeoutMs, setScreensaverTimeoutMs } from '@/hooks/use-idle-timer';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { getCachedStaffProfiles, cacheStaffProfile, type CachedStaffProfile } from '@/lib/db/pos-db';
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

interface OutletInfo {
  id: string;
  name: string;
  use_case?: string;
  is_hq?: boolean;
  settings?: {
    pin_login_message?: string;
    screensaver_url?: string;
  };
}

const TIMEOUT_OPTIONS = [
  { label: '15 s',  ms: 15_000 },
  { label: '30 s',  ms: 30_000 },
  { label: '1 min', ms: 60_000 },
  { label: '2 min', ms: 120_000 },
  { label: 'Never', ms: 0 },
];

const USE_CASE_LABELS: Record<string, string> = {
  hospitality:   'Hospitality',
  quick_service: 'Quick Service',
  retail:        'Retail',
  pharmacy:      'Pharmacy',
  services:      'Services',
  cafe:          'Café',
  bar:           'Bar',
  hotel:         'Hotel',
  warehouse:     'Warehouse',
};

const USE_CASE_COLORS: Record<string, { bg: string; text: string; accent: string; glow: string }> = {
  hospitality:   { bg: 'bg-amber-500/20',   text: 'text-amber-300',   accent: '#f59e0b', glow: 'hover:shadow-amber-500/15' },
  quick_service: { bg: 'bg-blue-500/20',    text: 'text-blue-300',    accent: '#3b82f6', glow: 'hover:shadow-blue-500/15' },
  retail:        { bg: 'bg-violet-500/20',  text: 'text-violet-300',  accent: '#8b5cf6', glow: 'hover:shadow-violet-500/15' },
  pharmacy:      { bg: 'bg-emerald-500/20', text: 'text-emerald-300', accent: '#10b981', glow: 'hover:shadow-emerald-500/15' },
  services:      { bg: 'bg-teal-500/20',    text: 'text-teal-300',    accent: '#14b8a6', glow: 'hover:shadow-teal-500/15' },
  cafe:          { bg: 'bg-orange-500/20',  text: 'text-orange-300',  accent: '#f97316', glow: 'hover:shadow-orange-500/15' },
  bar:           { bg: 'bg-purple-500/20',  text: 'text-purple-300',  accent: '#a855f7', glow: 'hover:shadow-purple-500/15' },
  hotel:         { bg: 'bg-sky-500/20',     text: 'text-sky-300',     accent: '#0ea5e9', glow: 'hover:shadow-sky-500/15' },
  warehouse:     { bg: 'bg-slate-500/20',   text: 'text-slate-300',   accent: '#94a3b8', glow: 'hover:shadow-slate-500/15' },
  logistics:     { bg: 'bg-cyan-500/20',    text: 'text-cyan-300',    accent: '#06b6d4', glow: 'hover:shadow-cyan-500/15' },
};

const USE_CASE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  hospitality:   UtensilsCrossed,
  quick_service: Zap,
  retail:        ShoppingBag,
  pharmacy:      Pill,
  services:      Scissors,
  cafe:          Coffee,
  bar:           Wine,
  hotel:         BedDouble,
  warehouse:     Warehouse,
  logistics:     Truck,
};

// Role display config
const ROLE_CONFIG: Record<string, { label: string; accent: string; dot: string; tabOrder: number }> = {
  admin:         { label: 'Admin',      accent: '#ef4444', dot: 'bg-red-400',     tabOrder: 0 },
  pos_admin:     { label: 'Admin',      accent: '#ef4444', dot: 'bg-red-400',     tabOrder: 0 },
  superuser:     { label: 'Superuser',  accent: '#a855f7', dot: 'bg-purple-400',  tabOrder: 0 },
  manager:       { label: 'Manager',    accent: '#f59e0b', dot: 'bg-amber-400',   tabOrder: 1 },
  store_manager: { label: 'Manager',    accent: '#f59e0b', dot: 'bg-amber-400',   tabOrder: 1 },
  cashier:       { label: 'Cashier',    accent: '#3b82f6', dot: 'bg-blue-400',    tabOrder: 2 },
  waiter:        { label: 'Waiter',     accent: '#10b981', dot: 'bg-emerald-400', tabOrder: 3 },
  kitchen:       { label: 'Kitchen',    accent: '#f97316', dot: 'bg-orange-400',  tabOrder: 4 },
  bar:           { label: 'Bar',        accent: '#8b5cf6', dot: 'bg-violet-400',  tabOrder: 5 },
  receptionist:  { label: 'Reception',  accent: '#ec4899', dot: 'bg-pink-400',    tabOrder: 6 },
};

function roleMeta(role?: string) {
  return ROLE_CONFIG[role ?? ''] ?? {
    label: role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Staff',
    accent: '#ffffff',
    dot: 'bg-white/40',
    tabOrder: 99,
  };
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// Ghost keypad shown before staff is selected
function GhostKeypad() {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  return (
    <div className="flex flex-col items-center gap-5 w-full opacity-20 pointer-events-none select-none">
      <div className="flex gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-3.5 w-3.5 rounded-full border-2 border-white/30" />
        ))}
      </div>
      <div className="h-4" />
      <div className="grid grid-cols-3 gap-3 w-full">
        {keys.map((k, i) => (
          <div
            key={i}
            className={cn(
              'h-16 rounded-2xl flex items-center justify-center',
              k === '' ? 'invisible' : 'bg-white/12 border border-white/20 text-white/70 text-2xl font-bold'
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
  const { tenant, isLoading: tenantLoading } = useTenantBranding();
  const setTerminalSession = useAuthStore((s) => s.setTerminalSession);
  const redirectToSSO      = useAuthStore((s) => s.redirectToSSO);
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const tenantUUID = tenant?.id && /^[0-9a-f-]{36}$/.test(tenant.id) ? tenant.id : '';
  const effectiveTenantID  = tenantID || tenantUUID;

  const [selected, setSelected]               = useState<StaffProfile | null>(null);
  const [pinError, setPinError]               = useState<string | null>(null);
  const [offlineProfiles, setOfflineProfiles] = useState<CachedStaffProfile[]>([]);
  const [screensaverActive, setScreensaverActive] = useState(false);
  const [showSettings, setShowSettings]       = useState(false);
  const [timeoutMs, setTimeoutMsState]        = useState<number>(30_000);
  const [activeTab, setActiveTab]             = useState<string>('All');
  const [showOutletModal, setShowOutletModal] = useState(false);
  const [step, setStep]                       = useState<'outlet' | 'pin'>('pin');

  useEffect(() => { setTimeoutMsState(getScreensaverTimeoutMs()); }, []);

  const handleIdle   = useCallback(() => setScreensaverActive(true),  []);
  const handleActive = useCallback(() => setScreensaverActive(false), []);
  useIdleTimer(handleIdle, handleActive, timeoutMs === 0 ? undefined : timeoutMs);

  const handleTimeoutChange = (ms: number) => {
    setTimeoutMsState(ms);
    setScreensaverTimeoutMs(ms === 0 ? 9_999_999_999 : ms);
    setShowSettings(false);
  };

  // ── Outlet info ────────────────────────────────────────────────────────────

  // Read last-selected outlet ID from localStorage (set by SSO outlet selector)
  const storedOutletId = typeof window !== 'undefined'
    ? (localStorage.getItem('pos-selected-outlet-id') ?? '')
    : '';

  const { data: outletInfo } = useQuery<OutletInfo | null>({
    queryKey: ['pos-current-outlet', effectiveTenantID, storedOutletId],
    queryFn: async () => {
      try {
        const params = storedOutletId ? `?outlet_id=${storedOutletId}` : '';
        const res = await apiClient.get<{ data: OutletInfo }>(
          `/api/v1/${effectiveTenantID}/pos/outlets/current${params}`
        );
        return res.data ?? null;
      } catch {
        return null;
      }
    },
    enabled: !!effectiveTenantID && !tenantLoading,
    staleTime: 10 * 60_000,
    retry: false,
  });

  // Fetch all outlets for the tenant (public endpoint, no auth needed)
  const { data: allOutlets = [] } = useQuery<OutletInfo[]>({
    queryKey: ['pos-outlets-list', effectiveTenantID],
    queryFn: async () => {
      try {
        const res = await apiClient.get<OutletInfo[] | { data: OutletInfo[] }>(
          `/api/v1/${effectiveTenantID}/pos/outlets`
        );
        return Array.isArray(res) ? res : (res as { data: OutletInfo[] }).data ?? [];
      } catch {
        return [];
      }
    },
    enabled: !!effectiveTenantID && !tenantLoading,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Show outlet selector if multiple outlets and none previously selected
  useEffect(() => {
    if (tenantLoading || !effectiveTenantID) return;
    const hasStoredOutlet = typeof window !== 'undefined' && !!localStorage.getItem('pos-selected-outlet-id');
    if (!hasStoredOutlet && allOutlets.length > 1) {
      setStep('outlet');
    }
  }, [allOutlets.length, effectiveTenantID, tenantLoading]);

  function selectOutlet(outlet: OutletInfo) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pos-selected-outlet-id', outlet.id);
    }
    setStep('pin');
  }

  // ── Staff profiles ─────────────────────────────────────────────────────────

  const { data: serverProfiles, isLoading } = useQuery<StaffProfile[]>({
    queryKey: ['pos-staff-profiles', effectiveTenantID, outletInfo?.id ?? ''],
    queryFn: async () => {
      const params = outletInfo?.id ? `?outlet_id=${outletInfo.id}` : '';
      const body = await apiClient.get<{ data: StaffProfile[] }>(
        `/api/v1/${effectiveTenantID}/pos/auth/pin/profile${params}`
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
    enabled: isOnline && !!effectiveTenantID && !tenantLoading,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (!isOnline && effectiveTenantID && !tenantLoading) {
      getCachedStaffProfiles(effectiveTenantID).then(setOfflineProfiles);
    }
  }, [isOnline, effectiveTenantID, tenantLoading]);

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

  const roleTabs = useMemo(() => {
    const roles = new Set(profiles.map((p) => p.role ?? 'staff'));
    const sorted = Array.from(roles).sort(
      (a, b) => (ROLE_CONFIG[a]?.tabOrder ?? 99) - (ROLE_CONFIG[b]?.tabOrder ?? 99)
    );
    return ['All', ...sorted];
  }, [profiles]);

  useEffect(() => {
    if (!roleTabs.includes(activeTab)) setActiveTab('All');
  }, [roleTabs]);

  const filteredProfiles = useMemo(() =>
    activeTab === 'All' ? profiles : profiles.filter((p) => (p.role ?? 'staff') === activeTab),
    [profiles, activeTab]
  );

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

    if (!selected.has_pin) {
      setPinError('No PIN set. Ask your manager to set your PIN.');
      return;
    }

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

  const tenantDisplayName = tenant?.orgName ?? tenant?.name ?? orgSlug;
  const outletName = outletInfo?.name ?? tenantDisplayName;
  const useCase = outletInfo?.use_case;
  const pinLoginMessage = outletInfo?.settings?.pin_login_message;
  const useCaseColor = useCase ? USE_CASE_COLORS[useCase] : null;
  const useCaseLabel = useCase ? (USE_CASE_LABELS[useCase] ?? useCase) : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  // Outlet selection step — shown when multiple outlets and none stored
  if (step === 'outlet') {
    const colClass =
      allOutlets.length === 1 ? 'grid-cols-1 max-w-xs mx-auto' :
      allOutlets.length <= 4  ? 'grid-cols-1 sm:grid-cols-2' :
                                'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

    return (
      <div
        className="relative min-h-screen w-screen flex flex-col"
        style={{
          background: 'linear-gradient(160deg, rgb(var(--brand-dark)) 0%, color-mix(in srgb, rgb(var(--brand-dark)) 72%, rgb(var(--brand-emphasis))) 55%, rgb(var(--brand-dark)) 100%)',
        }}
      >
        {/* Ambient blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-64 -left-64 h-175 w-175 rounded-full bg-primary/8 blur-3xl" />
          <div className="absolute top-1/2 -right-48 h-125 w-125 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-48 left-1/3 h-96 w-96 rounded-full bg-primary/6 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col flex-1 items-center px-4 sm:px-6 pt-12 pb-10 overflow-y-auto">

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="flex flex-col items-center gap-5 mb-10 text-center">
            {/* Logo with status dot */}
            <div className="relative">
              {tenant?.logoUrl ? (
                <div className="h-20 w-20 rounded-3xl overflow-hidden ring-2 ring-white/15 shadow-2xl shadow-black/50">
                  <img src={tenant.logoUrl} alt={tenant.orgName} className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="h-20 w-20 rounded-3xl bg-linear-to-br from-primary/35 to-primary/10 border border-primary/30 flex items-center justify-center shadow-2xl shadow-black/50">
                  <span className="text-2xl font-black text-primary">{(tenant?.orgName ?? orgSlug).slice(0, 2).toUpperCase()}</span>
                </div>
              )}
              <div className={cn(
                'absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-[3px]',
                'border-[rgb(var(--brand-dark))]',
                isOnline ? 'bg-emerald-400' : 'bg-amber-400'
              )} />
            </div>

            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-none">
                {tenant?.orgName ?? orgSlug}
              </h1>
              <p className="text-white/40 text-sm font-medium">Select your outlet to continue</p>
            </div>

            {!isOnline && (
              <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold">
                <WifiOff className="h-3 w-3" />
                Offline mode
              </div>
            )}
          </div>

          {/* ── Outlet grid ─────────────────────────────────────────────────── */}
          <div className="w-full max-w-2xl">
            {allOutlets.length === 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-36 rounded-2xl bg-white/5 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
                ))}
              </div>
            ) : (
              <div className={cn('grid gap-3', colClass)}>
                {allOutlets.map((outlet, idx) => {
                  const color = (outlet.use_case ? USE_CASE_COLORS[outlet.use_case] : null) ?? {
                    bg: 'bg-slate-500/20', text: 'text-slate-300', accent: '#94a3b8', glow: 'hover:shadow-slate-500/15',
                  };
                  const label = outlet.use_case ? (USE_CASE_LABELS[outlet.use_case] ?? outlet.use_case) : null;
                  const OutletIcon: React.ComponentType<{ className?: string }> =
                    (outlet.use_case ? USE_CASE_ICONS[outlet.use_case] : undefined) ?? Building2;

                  return (
                    <button
                      key={outlet.id}
                      onClick={() => selectOutlet(outlet)}
                      className={cn(
                        'group relative flex flex-col text-left rounded-2xl border overflow-hidden',
                        'bg-white/4 border-white/10',
                        'hover:bg-white/8 hover:border-white/22',
                        'hover:shadow-2xl', color.glow,
                        'active:scale-[0.97] transition-all duration-200',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60'
                      )}
                      style={{ animationDelay: `${idx * 55}ms` }}
                    >
                      {/* Colored top accent bar */}
                      <div
                        className="absolute top-0 inset-x-0 h-0.5 opacity-70 group-hover:opacity-100 transition-opacity"
                        style={{ background: `linear-gradient(90deg, transparent, ${color.accent}, transparent)` }}
                      />

                      <div className="p-5 flex flex-col gap-4">
                        {/* Icon row */}
                        <div className="flex items-start justify-between">
                          <div
                            className="h-12 w-12 rounded-xl flex items-center justify-center border transition-colors duration-200"
                            style={{
                              background: `${color.accent}18`,
                              borderColor: `${color.accent}30`,
                            }}
                          >
                            <OutletIcon className={cn('h-5 w-5 transition-transform duration-200 group-hover:scale-110', color.text)} />
                          </div>

                          {/* Badges */}
                          <div className="flex flex-col items-end gap-1.5">
                            {outlet.is_hq && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-white/10 text-white/45 uppercase tracking-widest">
                                HQ
                              </span>
                            )}
                            {label && (
                              <span
                                className={cn('px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide', color.text)}
                                style={{ background: `${color.accent}22` }}
                              >
                                {label}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Name + arrow */}
                        <div className="flex items-end justify-between gap-2">
                          <p className="font-bold text-white text-sm sm:text-base leading-snug group-hover:text-white/90 transition-colors">
                            {outlet.name}
                          </p>
                          <ChevronRight
                            className="h-4 w-4 text-white/20 group-hover:text-white/55 group-hover:translate-x-0.5 transition-all shrink-0 mb-0.5"
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── SSO fallback ────────────────────────────────────────────────── */}
          <div className="w-full max-w-xs mt-10 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-[10px] text-white/25 font-medium tracking-widest uppercase">or</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>
            <button
              onClick={() => redirectToSSO(orgSlug, window.location.href)}
              className={cn(
                'w-full flex items-center justify-center gap-2.5 px-5 py-3 rounded-2xl',
                'border border-white/10 bg-white/3',
                'text-sm text-white/40 font-medium',
                'hover:bg-white/8 hover:text-white/70 hover:border-white/20',
                'transition-all duration-200 group'
              )}
            >
              <ExternalLink className="h-4 w-4 group-hover:text-primary transition-colors" />
              Sign in with your account
            </button>
          </div>

        </div>
      </div>
    );
  }

  return (
    <>
      <Screensaver
        active={screensaverActive}
        onDismiss={() => setScreensaverActive(false)}
        screensaverUrl={outletInfo?.settings?.screensaver_url ?? tenant?.posScreensaverUrl}
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
          <div className="absolute -top-48 -left-48 h-125 w-125 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute top-1/3 -right-32 h-96 w-96 rounded-full bg-primary/7 blur-3xl" />
          <div className="absolute -bottom-32 left-1/3 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        </div>

        {/* ── Top nav ── */}
        <div className="relative z-10 shrink-0 px-4 sm:px-6 pt-4 pb-3">
          <div className="flex items-center justify-between gap-3">

            {/* ── Left: Logo + Outlet identity + Switcher ── */}
            <div className="flex items-center gap-3 min-w-0 flex-1">

              {/* Logo — always visible: white backdrop ensures transparency doesn't hide it */}
              <div className="relative shrink-0">
                <div className="h-10 w-10 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center overflow-hidden shadow-lg">
                  {tenant?.logoUrl ? (
                    <img
                      src={tenant.logoUrl}
                      alt={tenantDisplayName}
                      className="h-8 w-8 object-contain"
                      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }}
                    />
                  ) : (
                    <span className="text-xs font-black text-white drop-shadow">
                      {tenantDisplayName.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>

              {/* Outlet name + badge + inline switch button */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-base font-black text-white tracking-tight truncate leading-tight">
                    {outletName}
                  </h1>
                  {useCaseLabel && useCaseColor && (
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase shrink-0',
                      useCaseColor.bg, useCaseColor.text
                    )}>
                      {useCaseLabel}
                    </span>
                  )}
                  {outletInfo?.is_hq && (
                    <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/8 text-white/35 shrink-0">
                      <Building2 className="h-2.5 w-2.5" />HQ
                    </span>
                  )}
                </div>

                {/* Switch outlet button — always visible below outlet name */}
                {allOutlets.length > 1 && (
                  <button
                    onClick={() => setStep('outlet')}
                    className={cn(
                      'mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold transition-all group',
                      useCaseColor ? useCaseColor.text : 'text-primary',
                      'opacity-70 hover:opacity-100'
                    )}
                  >
                    <ChevronRight className="h-3 w-3 rotate-90 group-hover:translate-y-[-1px] transition-transform" />
                    Switch outlet
                  </button>
                )}

                {pinLoginMessage && (
                  <p className="hidden sm:block text-white/35 text-[11px] mt-0.5 truncate max-w-xs leading-tight">
                    {pinLoginMessage}
                  </p>
                )}
              </div>
            </div>

            {/* ── Center: Live clock (desktop only) ── */}
            <div className="hidden md:block shrink-0">
              <LiveClock />
            </div>

            {/* ── Right: Status + Settings ── */}
            <div className="flex items-center gap-1.5 shrink-0">
              {!isOnline && (
                <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-amber-500/12 border border-amber-500/25 text-amber-400 text-[11px] font-semibold">
                  <WifiOff className="h-3 w-3" />
                  <span className="hidden sm:inline">Offline</span>
                </div>
              )}

              <div className="relative">
                <button
                  onClick={() => setShowSettings((v) => !v)}
                  className="h-9 w-9 rounded-xl flex items-center justify-center bg-white/6 hover:bg-white/12 text-white/40 hover:text-white/70 transition-colors"
                  title="Screensaver timeout"
                >
                  <Settings className="h-4 w-4" />
                </button>
                {showSettings && (
                  <div className="absolute right-0 top-11 z-50 w-44 rounded-2xl border border-white/10 bg-black/70 backdrop-blur-xl shadow-2xl p-1.5 space-y-0.5">
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
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="relative z-10 mx-4 sm:mx-6 h-px bg-white/8 shrink-0" />

        {/* ── Main content ── */}
        <div className="relative z-10 flex-1 flex overflow-hidden min-h-0 gap-0">

          {/* ═══ LEFT PANEL: Staff selector ═══ */}
          <div className="flex flex-col w-full md:w-[45%] lg:w-[40%] border-r border-white/8 overflow-hidden">

            <div className="px-6 pt-4 pb-3 shrink-0">
              <h2 className="text-base font-bold text-white tracking-tight">Who&apos;s working?</h2>
              <p className="text-white/35 text-xs mt-0.5">Select your name to enter your PIN</p>
            </div>

            {/* Role tabs */}
            {!isLoading && roleTabs.length > 2 && (
              <div className="px-4 pb-3 shrink-0">
                <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
                  {roleTabs.map((tab) => {
                    const isActive = activeTab === tab;
                    const meta = tab === 'All' ? null : roleMeta(tab);
                    const count = tab === 'All'
                      ? profiles.length
                      : profiles.filter((p) => (p.role ?? 'staff') === tab).length;
                    return (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                          'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 border',
                          isActive
                            ? 'bg-primary border-primary text-primary-foreground shadow-md shadow-primary/25'
                            : 'bg-white/6 border-white/10 text-white/55 hover:text-white hover:bg-white/10 hover:border-white/18'
                        )}
                      >
                        {meta && <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', meta.dot)} />}
                        {tab === 'All' ? 'All' : meta?.label ?? tab}
                        <span className={cn(
                          'text-[10px] rounded-full px-1 min-w-4 text-center font-bold',
                          isActive ? 'bg-white/20 text-white' : 'bg-white/8 text-white/40'
                        )}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Staff list */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 scrollbar-none">
              {isLoading || tenantLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-18 rounded-2xl bg-white/5 animate-pulse" />
                ))
              ) : filteredProfiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center px-4">
                  <p className="text-white/30 text-sm leading-relaxed">
                    {profiles.length === 0
                      ? isOnline
                        ? 'No staff profiles found for this outlet.'
                        : 'No cached profiles. Connect to internet first.'
                      : 'No staff in this role group.'}
                  </p>
                </div>
              ) : (
                filteredProfiles.map((p, idx) => {
                  const rm = roleMeta(p.role);
                  const isSelected = selected?.user_id === p.user_id;
                  return (
                    <button
                      key={p.user_id}
                      onClick={() => {
                        setSelected(isSelected ? null : p);
                        setPinError(null);
                      }}
                      className={cn(
                        'w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl border-2 transition-all duration-150 text-left group',
                        'animate-fade-in touch-manipulation',
                        isSelected
                          ? 'bg-primary/18 border-primary/55 shadow-lg shadow-primary/10'
                          : 'bg-white/5 border-white/8 hover:bg-white/9 hover:border-white/18 active:scale-[0.98]'
                      )}
                      style={{ animationDelay: `${idx * 40}ms` }}
                    >
                      <div
                        className={cn(
                          'h-11 w-11 rounded-xl flex items-center justify-center shrink-0 border-2 transition-all font-bold text-base',
                          isSelected
                            ? 'border-primary/60 text-primary'
                            : 'border-white/10 text-white/70 group-hover:text-white group-hover:border-white/20'
                        )}
                        style={{ background: isSelected ? `${rm.accent}22` : 'rgba(255,255,255,0.06)' }}
                      >
                        {initials(p.name)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          'font-semibold text-sm truncate leading-tight transition-colors',
                          isSelected ? 'text-white' : 'text-white/80 group-hover:text-white'
                        )}>
                          {p.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          {p.role && (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: `${rm.accent}22`, color: rm.accent }}
                            >
                              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: rm.accent }} />
                              {rm.label}
                            </span>
                          )}
                          {!p.has_pin && (
                            <span className="text-[10px] text-white/25 font-medium">No PIN set</span>
                          )}
                        </div>
                      </div>

                      <div className={cn(
                        'h-2 w-2 rounded-full shrink-0 transition-all',
                        isSelected ? 'bg-primary scale-125' : 'bg-white/12 group-hover:bg-white/25'
                      )} />
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ═══ RIGHT PANEL: PIN keypad ═══ */}
          <div className="hidden md:flex flex-col items-center justify-center flex-1 px-10 py-8 gap-6">
            {selected ? (
              <div className="flex flex-col items-center gap-5 w-full max-w-72 animate-scale-in">

                {/* Selected staff header */}
                <div className="flex items-center gap-3 w-full bg-white/5 rounded-2xl px-4 py-3 border border-white/10">
                  <div
                    className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 border-2 font-bold text-base"
                    style={{
                      background: `${roleMeta(selected.role).accent}22`,
                      borderColor: `${roleMeta(selected.role).accent}55`,
                      color: roleMeta(selected.role).accent,
                    }}
                  >
                    {initials(selected.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white text-sm truncate">{selected.name}</p>
                    {selected.role && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5"
                        style={{
                          background: `${roleMeta(selected.role).accent}22`,
                          color: roleMeta(selected.role).accent,
                        }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: roleMeta(selected.role).accent }} />
                        {roleMeta(selected.role).label}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => { setSelected(null); setPinError(null); }}
                    className="h-8 w-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors shrink-0"
                    title="Choose different person"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                </div>

                <p className="text-white/40 text-xs font-medium tracking-wide uppercase">
                  {selected.has_pin ? `Enter your PIN · ${outletName}` : 'No PIN configured — contact your manager'}
                </p>

                <div className="w-full">
                  <PINKeypadLarge
                    onConfirm={handlePIN}
                    loading={loginMutation.isPending}
                    error={pinError}
                    disabled={false}
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 w-full max-w-72">
                <p className="text-white/25 text-sm font-medium text-center">
                  ← Select a staff member to enter your PIN
                </p>
                <GhostKeypad />
              </div>
            )}

            {/* Sign in with account — secondary CTA */}
            <div className="flex flex-col items-center gap-2 w-full max-w-72">
              <div className="flex items-center gap-3 w-full">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[10px] text-white/25 font-medium tracking-wider uppercase">or</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
              <button
                onClick={() => redirectToSSO(orgSlug, window.location.href)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/12 bg-white/4 text-xs text-white/50 hover:bg-white/10 hover:text-white/80 hover:border-white/22 transition-all font-medium group"
              >
                <ExternalLink className="h-3.5 w-3.5 group-hover:text-primary transition-colors" />
                Sign in with your account
              </button>
            </div>
          </div>

          {/* ═══ MOBILE: Full-screen PIN overlay ═══ */}
          {selected && (
            <div
              className="md:hidden absolute inset-0 z-20 flex flex-col animate-slide-up"
              style={{
                background: 'linear-gradient(160deg, rgb(var(--brand-dark)) 0%, color-mix(in srgb, rgb(var(--brand-dark)) 78%, rgb(var(--brand-emphasis))) 100%)',
              }}
            >
              <div className="flex items-center gap-3 px-4 pt-5 pb-4 shrink-0">
                <button
                  onClick={() => { setSelected(null); setPinError(null); }}
                  className="h-10 w-10 rounded-xl bg-white/8 flex items-center justify-center text-white/60 hover:text-white transition-colors shrink-0"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center font-bold border-2 shrink-0"
                  style={{
                    background: `${roleMeta(selected.role).accent}22`,
                    borderColor: `${roleMeta(selected.role).accent}55`,
                    color: roleMeta(selected.role).accent,
                  }}
                >
                  {initials(selected.name)}
                </div>
                <div>
                  <p className="font-bold text-white text-sm">{selected.name}</p>
                  {selected.role && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{
                        background: `${roleMeta(selected.role).accent}22`,
                        color: roleMeta(selected.role).accent,
                      }}
                    >
                      {roleMeta(selected.role).label}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center px-8">
                <div className="w-full max-w-xs flex flex-col gap-5">
                  <PINKeypadLarge
                    onConfirm={handlePIN}
                    loading={loginMutation.isPending}
                    error={pinError}
                    disabled={false}
                  />
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-3 w-full">
                      <div className="flex-1 h-px bg-white/10" />
                      <span className="text-[10px] text-white/25 font-medium tracking-wider uppercase">or</span>
                      <div className="flex-1 h-px bg-white/10" />
                    </div>
                    <button
                      onClick={() => redirectToSSO(orgSlug, window.location.href)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/12 bg-white/4 text-xs text-white/50 hover:bg-white/10 hover:text-white/80 transition-all font-medium"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Sign in with your account
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Bottom bar: clock on mobile only ── */}
        <div className="relative z-10 flex items-center justify-center px-6 pb-3 pt-1 shrink-0 md:hidden">
          <LiveClock />
        </div>
      </div>

      {/* Switch Outlet modal — real outlet list */}
      {showOutletModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/95 shadow-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-base">Switch Outlet</h3>
              <button
                onClick={() => setShowOutletModal(false)}
                className="h-8 w-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors"
              >
                ✕
              </button>
            </div>
            {allOutlets.length > 0 ? (
              <div className="grid gap-2">
                {allOutlets.map((outlet) => {
                  const color = outlet.use_case ? USE_CASE_COLORS[outlet.use_case] : null;
                  const label = outlet.use_case ? (USE_CASE_LABELS[outlet.use_case] ?? outlet.use_case) : null;
                  const isCurrent = outletInfo?.id === outlet.id;
                  return (
                    <button
                      key={outlet.id}
                      onClick={() => {
                        selectOutlet(outlet);
                        setShowOutletModal(false);
                      }}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all',
                        isCurrent
                          ? 'border-primary/50 bg-primary/10'
                          : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
                      )}
                    >
                      <Building2 className={cn('h-4 w-4 shrink-0', isCurrent ? 'text-primary' : 'text-white/40')} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{outlet.name}</p>
                        {label && color && (
                          <span className={cn('text-[10px] font-bold', color.text)}>{label}</span>
                        )}
                      </div>
                      {isCurrent && <span className="text-[10px] text-primary font-bold">Current</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-white/40 text-sm text-center py-4">No outlets available.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Larger PIN keypad variant for the login panel ──────────────────────────────

interface PINKeypadLargeProps {
  onConfirm: (pin: string) => void;
  loading?: boolean;
  error?: string | null;
  disabled?: boolean;
}

function PINKeypadLarge({ onConfirm, loading, error, disabled }: PINKeypadLargeProps) {
  const maxLength = 4;
  const [pin, setPin] = useState('');
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    if (!error) return;
    setShaking(true);
    setPin('');
    const t = setTimeout(() => setShaking(false), 600);
    return () => clearTimeout(t);
  }, [error]);

  const handleKey = useCallback(
    (key: string) => {
      if (loading || shaking || disabled) return;
      if (key === '⌫') { setPin((p) => p.slice(0, -1)); return; }
      if (!key) return;
      const next = pin + key;
      setPin(next);
      if (next.length >= maxLength) {
        onConfirm(next);
        setPin('');
      }
    },
    [loading, shaking, disabled, maxLength, onConfirm, pin]
  );

  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

  return (
    <div className="flex flex-col items-center gap-5 select-none w-full">
      <div className={cn('flex gap-4', shaking && 'animate-shake')}>
        {Array.from({ length: maxLength }).map((_, i) => {
          const filled = i < pin.length;
          return (
            <div
              key={i}
              className={cn(
                'h-4 w-4 rounded-full border-2 transition-all duration-200',
                shaking
                  ? 'border-destructive bg-destructive shadow-[0_0_10px_2px_rgba(239,68,68,0.5)]'
                  : filled
                  ? 'bg-primary border-primary scale-110 shadow-[0_0_12px_2px_rgba(234,128,34,0.45)]'
                  : 'bg-transparent border-white/30'
              )}
              style={filled && !shaking ? { animation: 'dot-fill 0.2s ease-out' } : undefined}
            />
          );
        })}
      </div>

      <p className={cn(
        'text-xs text-center min-h-4 -mt-2 transition-all duration-200',
        error ? 'text-red-400 opacity-100' : 'opacity-0'
      )}>
        {error ?? '​'}
      </p>

      <div className="grid grid-cols-3 gap-3 w-full">
        {KEYS.map((key, idx) => (
          <button
            key={idx}
            onClick={() => handleKey(key)}
            disabled={loading || !key || shaking}
            className={cn(
              'h-16 rounded-2xl text-2xl font-bold transition-all duration-100 touch-manipulation',
              key === ''
                ? 'pointer-events-none invisible'
                : cn(
                    'bg-white/14 border border-white/25 text-white',
                    'shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_3px_8px_rgba(0,0,0,0.4)]',
                    'hover:bg-white/22 hover:border-white/35 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_4px_12px_rgba(0,0,0,0.45)]',
                    'active:scale-90 active:bg-white/30',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                  ),
              key === '⌫' && 'text-lg'
            )}
          >
            {key === '⌫' ? <Delete className="mx-auto h-5 w-5" /> : key}
          </button>
        ))}
      </div>

    </div>
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
    <div className="flex flex-col items-center">
      <span className="text-white/70 text-2xl font-bold tabular-nums font-mono">{time}</span>
      <span className="text-white/30 text-xs font-medium mt-0.5">{date}</span>
    </div>
  );
}
