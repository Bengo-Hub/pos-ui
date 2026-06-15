'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { compare as bcryptCompare } from 'bcryptjs';
import {
  BedDouble, Building2, ChevronRight, Coffee, Delete, ExternalLink,
  Fingerprint, Pill, Scissors, Settings, ShoppingBag, Truck, UtensilsCrossed,
  Warehouse, Wine, WifiOff, Zap,
} from 'lucide-react';
import { useOnline } from '@/hooks/use-online';
import { useIdleTimer, getScreensaverTimeoutMs, setScreensaverTimeoutMs } from '@/hooks/use-idle-timer';
import { useBiometric } from '@/hooks/use-biometric';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { getCachedStaffProfiles, getCachedStaffProfile, cacheStaffProfile, type CachedStaffProfile } from '@/lib/db/pos-db';
import { Screensaver } from '@/components/pos/screensaver';
import { LiveClock } from '@/components/pos/live-clock';
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
    outlet_use_case?: string;
    is_hq_user?: boolean;
    pin_hash?: string; // returned only to this device, cached for offline PIN re-login
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

// Use cases that support POS terminals — logistics/warehouse do not.
const POS_OUTLET_USE_CASES = ['hospitality', 'quick_service', 'retail', 'pharmacy', 'services'];

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

// Demo PINs — shown only on codevertex-demo tenant, filtered to the selected outlet's use_case.
// Pin assignments mirror the seeded demo staff roles in auth-api/cmd/seed/seed_users.go.
const DEMO_HINTS_ALL = [
  { pin: '0000', role: 'Admin',      accent: '#ef4444', useCases: ['hospitality', 'quick_service', 'retail', 'pharmacy', 'services'] },
  { pin: '1111', role: 'Manager',    accent: '#f97316', useCases: ['hospitality', 'quick_service', 'retail', 'pharmacy', 'services'] },
  { pin: '2222', role: 'Cashier',    accent: '#3b82f6', useCases: ['hospitality', 'quick_service', 'retail', 'pharmacy', 'services'] },
  { pin: '3333', role: 'Waiter',     accent: '#10b981', useCases: ['hospitality'] },
  { pin: '4444', role: 'Kitchen',    accent: '#f59e0b', useCases: ['hospitality', 'quick_service'] },
  { pin: '5555', role: 'Bar',        accent: '#a855f7', useCases: ['hospitality'] },
  { pin: '6666', role: 'Reception',  accent: '#ec4899', useCases: ['hospitality', 'services'] },
  { pin: '7777', role: 'Pharmacist', accent: '#14b8a6', useCases: ['pharmacy'] },
  { pin: '8888', role: 'Stylist',    accent: '#8b5cf6', useCases: ['services'] },
  { pin: '9999', role: 'Therapist',  accent: '#06b6d4', useCases: ['services'] },
];

function getDemoHints(useCase: string | undefined | null) {
  if (!useCase) return DEMO_HINTS_ALL.slice(0, 2); // no outlet yet — show Admin + Manager
  return DEMO_HINTS_ALL.filter((h) => h.useCases.includes(useCase));
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PINLoginPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const isOnline = useOnline();
  const { tenant, isLoading: tenantLoading } = useTenantBranding();
  const setTerminalSession = useAuthStore((s) => s.setTerminalSession);
  const setOutlet          = useAuthStore((s) => s.setOutlet);
  const redirectToSSO      = useAuthStore((s) => s.redirectToSSO);
  const authStatus         = useAuthStore((s) => s.status);
  const hasSession         = useAuthStore((s) => !!s.session);
  const isTerminalSession  = useAuthStore((s) => s.isTerminalSession);
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const tenantUUID = tenant?.id && /^[0-9a-f-]{36}$/.test(tenant.id) ? tenant.id : '';
  const effectiveTenantID  = tenantID || tenantUUID;

  const [pinDigits, setPinDigits]   = useState<string[]>([]);
  const [pinError, setPinError]     = useState<string | null>(null);
  const [isShaking, setIsShaking]   = useState(false);
  const [offlineProfiles, setOfflineProfiles] = useState<CachedStaffProfile[]>([]);
  const [screensaverActive, setScreensaverActive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [timeoutMs, setTimeoutMsState]  = useState<number>(30_000);
  const [step, setStep]             = useState<'outlet' | 'pin'>('pin');
  const [storedEmail, setStoredEmail] = useState<string | null>(null);

  useEffect(() => { setTimeoutMsState(getScreensaverTimeoutMs()); }, []);
  useEffect(() => {
    if (typeof window !== 'undefined') setStoredEmail(localStorage.getItem('sso_last_email'));
  }, []);

  // Forward an already-authenticated SSO (non-terminal) session off the kiosk.
  // Tenant/platform admins who complete "Sign in with your account" land back here
  // (the SSO returnTo and the org root both point at pin-login, and this kiosk page
  // never advances an SSO session on its own). Without this they'd be stuck staring
  // at the PIN keypad despite a valid session. Terminal PIN sessions stay put.
  useEffect(() => {
    if (authStatus === 'authenticated' && hasSession && !isTerminalSession) {
      router.replace(`/${orgSlug}/dashboard`);
    }
  }, [authStatus, hasSession, isTerminalSession, orgSlug, router]);

  const hydrateFromWebAuthn = useAuthStore((s) => s.hydrateFromWebAuthn);
  const {
    authenticate: biometricAuth,
    isSupported: biometricSupported,
    hasRegisteredCredential,
    isLoading: biometricLoading,
    error: biometricError,
  } = useBiometric({
    onAuthSuccess: (tokens) => {
      hydrateFromWebAuthn({
        accessToken:  tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt:    new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
      });
    },
  });

  const handleIdle   = useCallback(() => setScreensaverActive(true),  []);
  const handleActive = useCallback(() => setScreensaverActive(false), []);
  useIdleTimer(handleIdle, handleActive, timeoutMs === 0 ? undefined : timeoutMs);

  const handleTimeoutChange = (ms: number) => {
    setTimeoutMsState(ms);
    setScreensaverTimeoutMs(ms === 0 ? 9_999_999_999 : ms);
    setShowSettings(false);
  };

  // ── Outlet info ──────────────────────────────────────────────────────────────

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

  const { data: allOutlets = [], isLoading: outletsLoading } = useQuery<OutletInfo[]>({
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

  const posOutlets = allOutlets.filter(
    (o) => !o.use_case || POS_OUTLET_USE_CASES.includes(o.use_case)
  );

  // Show outlet selector when multiple outlets and none previously selected.
  useEffect(() => {
    if (tenantLoading || !effectiveTenantID) return;
    const hasStoredOutlet = typeof window !== 'undefined' && !!localStorage.getItem('pos-selected-outlet-id');
    if (!hasStoredOutlet && posOutlets.length > 1) {
      setStep('outlet');
    }
  }, [posOutlets.length, effectiveTenantID, tenantLoading]);

  function selectOutlet(outlet: OutletInfo) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pos-selected-outlet-id', outlet.id);
    }
    apiClient.setOutletID(outlet.id);
    setStep('pin');
  }

  // ── Staff profiles (for IndexedDB offline cache) ─────────────────────────────

  const { } = useQuery<StaffProfile[]>({
    queryKey: ['pos-staff-profiles', effectiveTenantID, outletInfo?.id ?? ''],
    queryFn: async () => {
      const params = outletInfo?.id ? `?outlet_id=${outletInfo.id}` : '';
      const body = await apiClient.get<{ data: StaffProfile[] }>(
        `/api/v1/${effectiveTenantID}/pos/auth/pin/profile${params}`
      );
      const list: StaffProfile[] = body.data ?? [];
      for (const p of list) {
        // Preserve a pin_hash already cached at login — the public list never carries it,
        // and we must not wipe a staff member's offline re-login capability.
        const existing = await getCachedStaffProfile(p.user_id);
        await cacheStaffProfile({
          user_id:     p.user_id,
          tenant_id:   p.tenant_id,
          name:        p.name,
          email:       existing?.email ?? '',
          roles:       p.role ? [p.role] : existing?.roles ?? [],
          permissions: existing?.permissions ?? [],
          pin_hash:    existing?.pin_hash,
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

  // ── PIN login mutation (online) ──────────────────────────────────────────────

  function handleLoginSuccess(data: PINLoginResponse) {
    // Cache this user's profile WITH their pin_hash so they can re-login offline (e.g. after
    // a mid-outage reload/logout). Only users who have signed in on this device are cacheable.
    if (data.user.pin_hash) {
      void cacheStaffProfile({
        user_id:     data.user.user_id,
        tenant_id:   data.user.tenant_id,
        name:        data.user.name,
        email:       '',
        roles:       data.user.role ? [data.user.role] : [],
        permissions: data.user.permissions ?? [],
        pin_hash:    data.user.pin_hash,
        cached_at:   new Date().toISOString(),
      });
    }
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
    const sessionOutlet = outletInfo ?? (data.user.outlet_id ? {
      id:       data.user.outlet_id,
      name:     data.user.outlet_id,
      use_case: data.user.outlet_use_case,
      is_hq:    data.user.is_hq_user ?? false,
    } : null);
    if (sessionOutlet) {
      setOutlet({
        id:       sessionOutlet.id,
        code:     (sessionOutlet as OutletInfo & { code?: string }).code ?? '',
        name:     sessionOutlet.name,
        use_case: data.user.outlet_use_case ?? sessionOutlet.use_case,
        is_hq:    data.user.is_hq_user ?? sessionOutlet.is_hq ?? false,
        status:   'active',
      });
      apiClient.setOutletID(sessionOutlet.id);
    }
    router.push(`/${orgSlug}/dashboard`);
  }

  const loginMutation = useMutation({
    mutationFn: (pin: string) => {
      const outletId = outletInfo?.id ?? storedOutletId;
      return apiClient.post<PINLoginResponse>(
        `/api/v1/${effectiveTenantID}/pos/auth/pin/identify`,
        { pin, outlet_id: outletId }
      );
    },
    onSuccess: handleLoginSuccess,
    onError: (err: any) => {
      const msg = err?.status === 429
        ? 'Too many attempts. Please wait.'
        : 'Incorrect PIN. Please try again.';
      triggerPinError(msg);
    },
  });

  function triggerPinError(msg: string) {
    setPinError(msg);
    setIsShaking(true);
    setTimeout(() => {
      setIsShaking(false);
      setPinDigits([]);
    }, 600);
  }

  // ── PIN input handling ───────────────────────────────────────────────────────

  async function handleDigit(digit: string) {
    if (loginMutation.isPending) return;
    const next = [...pinDigits, digit];
    setPinDigits(next);
    setPinError(null);

    if (next.length === 4) {
      const pin = next.join('');
      if (isOnline) {
        loginMutation.mutate(pin);
        return;
      }
      // Offline: scan all cached profiles for a bcrypt match
      let matched: CachedStaffProfile | null = null;
      for (const cached of offlineProfiles) {
        if (cached.pin_hash && await bcryptCompare(pin, cached.pin_hash)) {
          matched = cached;
          break;
        }
      }
      if (!matched) {
        triggerPinError('Incorrect PIN. Please try again.');
        return;
      }
      // Restore outlet context from the last selection so offline orders carry the right
      // outlet_id (and the API client sends X-Outlet-ID once back online).
      const offlineOutletId = outletInfo?.id ?? storedOutletId;
      setTerminalSession('offline-terminal-session', {
        id:              matched.user_id,
        email:           matched.email,
        fullName:        matched.name,
        roles:           matched.roles,
        permissions:     matched.permissions,
        tenant_id:       matched.tenant_id,
        tenant_slug:     orgSlug,
        isPlatformOwner: false,
        isSuperUser:     false,
        ...(offlineOutletId ? { outlet_id: offlineOutletId } : {}),
      } as Parameters<typeof setTerminalSession>[1]);
      if (offlineOutletId) {
        setOutlet({
          id:       offlineOutletId,
          code:     '',
          name:     outletInfo?.name ?? offlineOutletId,
          use_case: outletInfo?.use_case ?? '',
          is_hq:    outletInfo?.is_hq ?? false,
          status:   'active',
        });
        apiClient.setOutletID(offlineOutletId);
      }
      router.push(`/${orgSlug}/dashboard`);
    }
  }

  function handleBackspace() {
    if (loginMutation.isPending) return;
    setPinDigits((d) => d.slice(0, -1));
    setPinError(null);
  }

  const tenantDisplayName = tenant?.orgName ?? tenant?.name ?? orgSlug;
  const outletName = outletInfo?.name ?? tenantDisplayName;
  const useCase = outletInfo?.use_case;
  const pinLoginMessage = outletInfo?.settings?.pin_login_message;
  const useCaseColor = useCase ? USE_CASE_COLORS[useCase] : null;
  const useCaseLabel = useCase ? (USE_CASE_LABELS[useCase] ?? useCase) : null;
  const isDemoTenant = orgSlug === 'codevertex-demo';

  // ── Outlet selection step ────────────────────────────────────────────────────

  if (step === 'outlet') {
    const colClass =
      posOutlets.length === 1 ? 'grid-cols-1 max-w-xs mx-auto' :
      posOutlets.length <= 4  ? 'grid-cols-1 sm:grid-cols-2' :
                                'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

    return (
      <div
        className="relative min-h-screen w-screen flex flex-col"
        style={{
          background: 'linear-gradient(160deg, rgb(var(--brand-dark)) 0%, color-mix(in srgb, rgb(var(--brand-dark)) 72%, rgb(var(--brand-emphasis))) 55%, rgb(var(--brand-dark)) 100%)',
        }}
      >
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.032]" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <filter id="grain-outlet"><feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="4" stitchTiles="stitch"/></filter>
          <rect width="100%" height="100%" filter="url(#grain-outlet)"/>
        </svg>
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-64 -left-64 h-[700px] w-[700px] rounded-full blur-3xl animate-breathe"
               style={{ background: 'hsl(var(--primary) / 0.1)' }} />
          <div className="absolute top-1/2 -right-48 h-[500px] w-[500px] rounded-full blur-3xl animate-breathe-slow"
               style={{ background: 'hsl(var(--primary) / 0.06)' }} />
          <div className="absolute -bottom-48 left-1/3 h-96 w-96 rounded-full blur-3xl"
               style={{ background: 'hsl(var(--primary) / 0.07)' }} />
        </div>

        <div className="relative z-10 flex flex-col flex-1 items-center px-4 sm:px-6 pt-12 pb-10 overflow-y-auto">
          <div className="flex flex-col items-center gap-5 mb-10 text-center">
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

          <div className="w-full max-w-2xl">
            {posOutlets.length === 0 && (outletsLoading || tenantLoading) ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-36 rounded-2xl bg-white/5 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
                ))}
              </div>
            ) : posOutlets.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
                <Building2 className="mx-auto mb-3 h-10 w-10 text-white/30" />
                <p className="text-white/80 font-medium">No POS outlets available</p>
                <p className="mt-1 text-sm text-white/50">No point-of-sale outlets are configured for this business yet. Ask an administrator to create an outlet in the admin console.</p>
              </div>
            ) : (
              <div className={cn('grid gap-3', colClass)}>
                {posOutlets.map((outlet, idx) => {
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
                      <div
                        className="absolute top-0 inset-x-0 h-0.5 opacity-70 group-hover:opacity-100 transition-opacity"
                        style={{ background: `linear-gradient(90deg, transparent, ${color.accent}, transparent)` }}
                      />
                      <div className="p-5 flex flex-col gap-4">
                        <div className="flex items-start justify-between">
                          <div
                            className="h-12 w-12 rounded-xl flex items-center justify-center border transition-colors duration-200"
                            style={{ background: `${color.accent}18`, borderColor: `${color.accent}30` }}
                          >
                            <OutletIcon className={cn('h-5 w-5 transition-transform duration-200 group-hover:scale-110', color.text)} />
                          </div>
                          <div className="flex flex-col items-end gap-1.5">
                            {outlet.is_hq && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-white/10 text-white/45 uppercase tracking-widest">HQ</span>
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
                        <div className="flex items-end justify-between gap-2">
                          <p className="font-bold text-white text-sm sm:text-base leading-snug group-hover:text-white/90 transition-colors">
                            {outlet.name}
                          </p>
                          <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-white/55 group-hover:translate-x-0.5 transition-all shrink-0 mb-0.5" />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="w-full max-w-xs mt-10 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-[10px] text-white/25 font-medium tracking-widest uppercase">or</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>
            <button
              onClick={() => redirectToSSO(orgSlug, `/${orgSlug}/dashboard`)}
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
            {biometricSupported && hasRegisteredCredential && storedEmail && (
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => biometricAuth(storedEmail, orgSlug)}
                  disabled={biometricLoading}
                  className={cn(
                    'w-full flex items-center justify-center gap-2.5 px-5 py-3 rounded-2xl',
                    'border border-primary/30 bg-primary/10',
                    'text-sm text-primary font-medium',
                    'hover:bg-primary/20 hover:border-primary/50',
                    'disabled:opacity-60 transition-all duration-200'
                  )}
                >
                  <Fingerprint className="h-4 w-4" />
                  {biometricLoading ? 'Verifying…' : 'Sign in with fingerprint'}
                </button>
                {biometricError && <p className="text-center text-xs text-red-400">{biometricError}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── PIN entry step (full-screen, PIN-first) ───────────────────────────────────

  const PIN_LENGTH = 4;
  const keypadKeys = ['1','2','3','4','5','6','7','8','9','','0','del'];

  return (
    <>
      <Screensaver
        active={screensaverActive}
        onDismiss={() => setScreensaverActive(false)}
        screensaverUrl={outletInfo?.settings?.screensaver_url ?? tenant?.posScreensaverUrl}
        tenantName={tenant?.orgName ?? tenant?.name}
        tenantLogoUrl={tenant?.logoUrl}
        outletName={outletName !== (tenant?.orgName ?? tenant?.name ?? orgSlug) ? outletName : undefined}
      />

      <div
        className="relative h-screen w-screen overflow-hidden flex flex-col"
        style={{
          background: 'linear-gradient(135deg, rgb(var(--brand-dark)) 0%, color-mix(in srgb, rgb(var(--brand-dark)) 80%, rgb(var(--brand-emphasis))) 50%, rgb(var(--brand-dark)) 100%)',
        }}
      >
        {/* Grain texture */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.032]" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <filter id="grain-pin"><feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="4" stitchTiles="stitch"/></filter>
          <rect width="100%" height="100%" filter="url(#grain-pin)"/>
        </svg>
        {/* Ambient blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-48 -left-48 h-[500px] w-[500px] rounded-full blur-3xl animate-breathe"
               style={{ background: 'hsl(var(--primary) / 0.12)' }} />
          <div className="absolute top-1/3 -right-32 h-96 w-96 rounded-full blur-3xl animate-breathe-slow"
               style={{ background: 'hsl(var(--primary) / 0.08)' }} />
          <div className="absolute -bottom-32 left-1/3 h-80 w-80 rounded-full blur-3xl"
               style={{ background: 'hsl(var(--primary) / 0.06)' }} />
        </div>

        {/* ── Top nav (same as before — logo, outlet, clock, settings) ── */}
        <div className="relative z-20 shrink-0 px-4 sm:px-6 pt-4 pb-3">
          <div className="flex items-center justify-between gap-3">

            {/* Left: Logo + Outlet identity */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
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
                {posOutlets.length > 1 && (
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

            {/* Center: Live clock (desktop only) */}
            <div className="hidden md:block shrink-0">
              <LiveClock />
            </div>

            {/* Right: Status + Settings */}
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

        {/* ── Main: Centered PIN entry ── */}
        <div className="relative z-10 flex-1 flex items-center justify-center overflow-hidden">
          <div className="flex flex-col items-center gap-6 w-full max-w-xs px-6">

            {/* Prompt */}
            <div className="text-center space-y-1">
              <p className="text-white/50 text-xs font-semibold tracking-[0.2em] uppercase">
                Enter your PIN
              </p>
            </div>

            {/* PIN dots */}
            <div
              className={cn(
                'flex items-center gap-4',
                isShaking && 'animate-shake'
              )}
            >
              {Array.from({ length: PIN_LENGTH }).map((_, i) => {
                const filled = i < pinDigits.length;
                return (
                  <div
                    key={i}
                    className={cn(
                      'h-5 w-5 rounded-full border-2 transition-all duration-150',
                      filled
                        ? pinError
                          ? 'bg-red-400 border-red-400 scale-110'
                          : 'border-white/0 scale-110'
                        : 'bg-transparent border-white/30'
                    )}
                    style={filled && !pinError ? {
                      background: 'hsl(var(--primary))',
                      borderColor: 'hsl(var(--primary))',
                      boxShadow: '0 0 8px hsl(var(--primary) / 0.5)',
                    } : {}}
                  />
                );
              })}
            </div>

            {/* Error message */}
            <div className="h-4 flex items-center justify-center">
              {pinError && (
                <p className="text-red-400 text-xs font-medium animate-fade-in text-center">
                  {pinError}
                </p>
              )}
            </div>

            {/* Numeric keypad */}
            <div className="grid grid-cols-3 gap-3 w-full">
              {keypadKeys.map((key, i) => {
                if (key === '') {
                  return <div key={i} />;
                }
                if (key === 'del') {
                  return (
                    <button
                      key={i}
                      onClick={handleBackspace}
                      disabled={loginMutation.isPending || pinDigits.length === 0}
                      className={cn(
                        'h-[68px] rounded-2xl flex items-center justify-center transition-all duration-100 touch-manipulation',
                        'bg-white/8 border border-white/10 text-white/55',
                        'hover:bg-white/14 hover:text-white/80 active:scale-95',
                        'disabled:opacity-30'
                      )}
                      aria-label="Delete"
                    >
                      <Delete className="h-5 w-5" />
                    </button>
                  );
                }
                return (
                  <button
                    key={i}
                    onClick={() => handleDigit(key)}
                    disabled={loginMutation.isPending || pinDigits.length >= PIN_LENGTH}
                    className={cn(
                      'h-[68px] rounded-2xl flex items-center justify-center transition-all duration-100 touch-manipulation',
                      'bg-white/10 border border-white/12 text-white text-2xl font-bold',
                      'hover:bg-white/18 hover:border-white/22',
                      'active:scale-95 active:bg-white/22',
                      'shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_4px_14px_rgba(0,0,0,0.35)]',
                      'disabled:opacity-40 disabled:cursor-not-allowed'
                    )}
                  >
                    {loginMutation.isPending && pinDigits.length === PIN_LENGTH ? (
                      <span className="h-2 w-2 rounded-full bg-white/60 animate-pulse" />
                    ) : key}
                  </button>
                );
              })}
            </div>

            {/* SSO + biometric fallback */}
            <div className="flex flex-col items-center gap-2 w-full mt-2">
              <div className="flex items-center gap-3 w-full">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[10px] text-white/22 font-medium tracking-wider uppercase">or</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
              <button
                onClick={() => redirectToSSO(orgSlug, `/${orgSlug}/dashboard`)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-white/4 text-xs text-white/45 hover:bg-white/9 hover:text-white/75 hover:border-white/20 transition-all font-medium group"
              >
                <ExternalLink className="h-3.5 w-3.5 group-hover:text-primary transition-colors" />
                Sign in with your account
              </button>
              {biometricSupported && hasRegisteredCredential && storedEmail && (
                <button
                  onClick={() => biometricAuth(storedEmail, orgSlug)}
                  disabled={biometricLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-primary/25 bg-primary/8 text-xs text-primary hover:bg-primary/18 hover:border-primary/45 transition-all font-medium disabled:opacity-50"
                >
                  <Fingerprint className="h-3.5 w-3.5" />
                  {biometricLoading ? 'Verifying…' : 'Sign in with fingerprint'}
                </button>
              )}
              {biometricError && <p className="text-center text-xs text-red-400">{biometricError}</p>}
            </div>
          </div>
        </div>

        {/* ── Bottom bar: clock (mobile) ── */}
        <div className="relative z-10 flex items-center justify-center px-6 pb-3 pt-1 shrink-0 md:hidden">
          <LiveClock />
        </div>

        {/* ── Demo hints (codevertex-demo only) — floating bottom-right ── */}
        {isDemoTenant && (
          <div className="absolute bottom-4 right-4 z-30 hidden sm:block">
            <div className="rounded-2xl border border-white/10 bg-black/55 backdrop-blur-xl shadow-2xl p-3 max-w-[220px]">
              <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">
                Demo PINs
              </p>
              {useCase && (
                <p className="text-[8px] text-white/20 uppercase tracking-wider mb-2">
                  {USE_CASE_LABELS[useCase] ?? useCase}
                </p>
              )}
              <div className="grid grid-cols-2 gap-1">
                {getDemoHints(useCase).map(({ pin, role, accent }) => (
                  <div
                    key={pin}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                    style={{ background: `${accent}14` }}
                  >
                    <span
                      className="font-mono text-[11px] font-black"
                      style={{ color: accent }}
                    >
                      {pin}
                    </span>
                    <span className="text-[10px] text-white/40 truncate">{role}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
