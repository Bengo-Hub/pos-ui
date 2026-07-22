'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { compare as bcryptCompare } from 'bcryptjs';
import {
  Building2, Fingerprint, KeyRound, LayoutDashboard, Settings, Store,
} from 'lucide-react';
import {
  PinLoginLayout, PinLoginHeader, PinLoginBrandPanel, PasscodeField, PinKeypad, QwertyKeyboard,
  OutletCard, DemoHints, USE_CASE_COLORS, USE_CASE_LABELS, PinLoginSSOButton, type PinLoginOutlet,
} from '@bengo-hub/shared-ui-lib/pin-login';
import { useEffectiveOnline } from '@/lib/connectivity';
import { useIdleTimer, getScreensaverTimeoutMs, setScreensaverTimeoutMs, resolveScreensaverTimeoutMs } from '@/hooks/use-idle-timer';
import { useBiometric } from '@/hooks/use-biometric';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { getCachedStaffProfiles, cacheStaffProfile, type CachedStaffProfile } from '@/lib/db/pos-db';
import { Screensaver } from '@/components/pos/screensaver';
import { buildScreensaverMedia } from '@/lib/screensaver';
import { LiveClock } from '@/components/pos/live-clock';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { getStoredOutletId, setStoredOutletId } from '@/lib/auth/outlet-storage';
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

interface OutletInfo extends PinLoginOutlet {
  settings?: {
    pin_login_message?: string;
    screensaver_url?: string;
    /** Up to 3 admin-managed screensaver images (Settings → Display) — rotated as a slideshow. */
    screensaver_urls?: string[];
    /** Centrally-configured idle timeout (seconds) before the branded screensaver shows. */
    screensaver_timeout_seconds?: number;
  };
}

// Use cases that support POS terminals — logistics/warehouse do not.
const POS_OUTLET_USE_CASES = ['hospitality', 'quick_service', 'retail', 'pharmacy', 'services'];

const TIMEOUT_OPTIONS = [
  { label: '30 s',  ms: 30_000 },
  { label: '1 min', ms: 60_000 },
  { label: '2 min', ms: 120_000 },
  { label: '5 min', ms: 300_000 },
  { label: '10 min', ms: 600_000 },
  { label: 'Never', ms: 0 },
];

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

const WORKFLOW_STEPS = [
  { icon: Store, label: 'Select outlet' },
  { icon: KeyRound, label: 'Enter PIN' },
  { icon: LayoutDashboard, label: 'Start selling' },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PINLoginPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const isOnline = useEffectiveOnline();
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
  const [shift, setShift]           = useState(false); // on-screen QWERTY shift state
  // Which on-screen keyboard is showing — like a real soft-keyboard, only ONE is
  // visible at a time on small screens. Numeric PIN keypad is the default.
  const [keyboardMode, setKeyboardMode] = useState<'numeric' | 'qwerty'>('numeric');

  // Device-local override (set via the gear menu) wins; otherwise fall back to the default.
  const [hasLocalTimeout, setHasLocalTimeout] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHasLocalTimeout(!!localStorage.getItem('pos_screensaver_timeout_ms'));
    }
    setTimeoutMsState(getScreensaverTimeoutMs());
  }, []);
  useEffect(() => {
    if (typeof window !== 'undefined') setStoredEmail(localStorage.getItem('sso_last_email'));
  }, []);

  // Forward an already-authenticated SSO (non-terminal) session off the kiosk.
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
    setHasLocalTimeout(true);
    setShowSettings(false);
  };

  // ── Outlet info ──────────────────────────────────────────────────────────────

  const [storedOutletId, setStoredOutletIdState] = useState<string>(() => getStoredOutletId(orgSlug));

  const { data: outletInfo } = useQuery<OutletInfo | null>({
    queryKey: ['pos-current-outlet', effectiveTenantID, storedOutletId],
    queryFn: async () => {
      const { kvKey, setKV, getKV } = await import('@/lib/db/kv-cache');
      const cacheKey = kvKey('pin-outlet-info', effectiveTenantID, storedOutletId || undefined);
      try {
        const params = storedOutletId ? `?outlet_id=${storedOutletId}` : '';
        const res = await apiClient.get<{ data: OutletInfo }>(
          `/api/v1/${effectiveTenantID}/pos/outlets/current${params}`,
          undefined,
          { suppressErrorToast: true, timeout: 8000 },
        );
        const info = res.data ?? null;
        if (info) await setKV(cacheKey, effectiveTenantID, info).catch(() => {});
        return info;
      } catch {
        return (await getKV<OutletInfo>(cacheKey).catch(() => undefined)) ?? null;
      }
    },
    enabled: !!effectiveTenantID && !tenantLoading,
    staleTime: 10 * 60_000,
    retry: false,
    networkMode: 'always',
  });

  const { data: allOutlets = [], isLoading: outletsLoading } = useQuery<OutletInfo[]>({
    queryKey: ['pos-outlets-list', effectiveTenantID],
    queryFn: async () => {
      const { kvKey, setKV, getKV } = await import('@/lib/db/kv-cache');
      const cacheKey = kvKey('pin-outlets', effectiveTenantID);
      try {
        const res = await apiClient.get<OutletInfo[] | { data: OutletInfo[] }>(
          `/api/v1/${effectiveTenantID}/pos/outlets`,
          undefined,
          { suppressErrorToast: true, timeout: 8000 },
        );
        const list = Array.isArray(res) ? res : (res as { data: OutletInfo[] }).data ?? [];
        if (list.length) await setKV(cacheKey, effectiveTenantID, list).catch(() => {});
        return list;
      } catch {
        return (await getKV<OutletInfo[]>(cacheKey).catch(() => undefined)) ?? [];
      }
    },
    enabled: !!effectiveTenantID && !tenantLoading,
    staleTime: 5 * 60_000,
    retry: false,
    networkMode: 'always',
  });

  // Apply a centrally-configured screensaver timeout (service_config / outlet setting) when the
  // device has no manual override. Default stays 5 min (resolveScreensaverTimeoutMs).
  useEffect(() => {
    if (hasLocalTimeout) return;
    const cfgSeconds = outletInfo?.settings?.screensaver_timeout_seconds;
    setTimeoutMsState(resolveScreensaverTimeoutMs(cfgSeconds));
  }, [outletInfo?.settings?.screensaver_timeout_seconds, hasLocalTimeout]);

  const posOutlets = allOutlets.filter(
    (o) => !o.use_case || POS_OUTLET_USE_CASES.includes(o.use_case)
  );

  // Show outlet selector when multiple outlets and none previously selected for THIS tenant.
  useEffect(() => {
    if (tenantLoading || !effectiveTenantID) return;
    if (!storedOutletId && posOutlets.length > 1) {
      setStep('outlet');
    }
  }, [posOutlets.length, effectiveTenantID, tenantLoading, storedOutletId]);

  // Validate the stored outlet against this tenant's actual outlet list (mirrors the SSO
  // callback's resolveActiveOutlet guard): a deleted/archived outlet — or one left over
  // from before slug-scoping — must never be sent to /auth/pin/identify.
  useEffect(() => {
    if (!storedOutletId || outletsLoading || allOutlets.length === 0) return;
    if (!allOutlets.some((o) => o.id === storedOutletId)) {
      setStoredOutletId(null, orgSlug);
      setStoredOutletIdState('');
      if (posOutlets.length > 1) setStep('outlet');
    }
  }, [storedOutletId, allOutlets, outletsLoading, posOutlets.length, orgSlug]);

  function selectOutlet(outlet: OutletInfo) {
    setStoredOutletId(outlet.id, orgSlug);
    setStoredOutletIdState(outlet.id);
    apiClient.setOutletID(outlet.id);
    setStep('pin');
  }

  // ── Staff profiles (for IndexedDB offline cache) ─────────────────────────────

  const { } = useQuery<StaffProfile[]>({
    queryKey: ['pos-staff-profiles', effectiveTenantID, outletInfo?.id ?? ''],
    // Shared with the 5-min background sync job — preserves cached pin_hash (offline PIN).
    queryFn: async () => {
      const { refreshStaffProfiles } = await import('@/lib/offline/staff-profiles');
      return (await refreshStaffProfiles(effectiveTenantID, outletInfo?.id)) as StaffProfile[];
    },
    enabled: isOnline && !!effectiveTenantID && !tenantLoading,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Load cached profiles UNCONDITIONALLY (not only when offline): on weak-but-connected
  // wifi the online login can fail with a network error mid-submit, and the bcrypt
  // fallback must already have the profiles in hand.
  useEffect(() => {
    if (effectiveTenantID && !tenantLoading) {
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
        use_case: data.user.outlet_use_case ?? sessionOutlet.use_case ?? undefined,
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
      // Bounded timeout: on weak wifi we fail fast and fall back to the cached-bcrypt
      // offline branch in submitPasscode instead of hanging on the axios 15s default.
      return apiClient.post<PINLoginResponse>(
        `/api/v1/${effectiveTenantID}/pos/auth/pin/identify`,
        { pin, outlet_id: outletId },
        { timeout: 5000, suppressErrorToast: true },
      );
    },
    networkMode: 'always',
    onSuccess: handleLoginSuccess,
    onError: async (err: any) => {
      const { isNetworkShapedError } = await import('@/lib/connectivity');
      if (isNetworkShapedError(err)) return; // submitPasscode falls back to the offline branch
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

  // Single submit path shared by: numeric auto-submit at 4 digits, the on-screen
  // QWERTY ENTER key, and the passcode-field Login button. Online → loginMutation, and on a
  // NETWORK-shaped failure (timeout / unreachable — weak wifi reads as "online") it
  // falls back to the same bcrypt-match-against-cached-profiles branch used offline.
  async function submitPasscode(passcode?: string) {
    if (loginMutation.isPending) return;
    const pin = passcode ?? pinDigits.join('');
    if (!pin) return; // guard empty (Login button / Enter on an empty field)

    if (isOnline) {
      try {
        await loginMutation.mutateAsync(pin); // onSuccess handles the session + redirect
        return;
      } catch (err) {
        const { isNetworkShapedError } = await import('@/lib/connectivity');
        if (!isNetworkShapedError(err)) return; // real rejection — onError already showed it
        // fall through to the offline bcrypt branch
      }
    }
    // Offline (or online login unreachable): scan cached profiles for a bcrypt match
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
    if (!offlineOutletId) {
      triggerPinError('Connect once to select an outlet, then you can log in offline.');
      return;
    }
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
      outlet_id:       offlineOutletId,
    } as Parameters<typeof setTerminalSession>[1]);
    setOutlet({
      id:       offlineOutletId,
      code:     '',
      name:     outletInfo?.name ?? offlineOutletId,
      use_case: outletInfo?.use_case ?? '',
      is_hq:    outletInfo?.is_hq ?? false,
      status:   'active',
    });
    apiClient.setOutletID(offlineOutletId);
    router.push(`/${orgSlug}/dashboard`);
  }

  function handleDigit(digit: string) {
    if (loginMutation.isPending) return;
    const next = [...pinDigits, digit];
    setPinDigits(next);
    setPinError(null);
    // Numeric keypad keeps its auto-submit at 4 — via the shared submitPasscode helper.
    if (next.length === 4) {
      void submitPasscode(next.join(''));
    }
  }

  // On-screen QWERTY key handler: append to the SAME pinDigits state. Letters/space/
  // punctuation append (case already applied by the keyboard). QWERTY input does NOT
  // auto-submit — only ENTER / the passcode-field Login button submit.
  function handleKey(char: string) {
    if (loginMutation.isPending) return;
    setPinDigits((d) => [...d, char]);
    setPinError(null);
  }

  function handleBackspace() {
    if (loginMutation.isPending) return;
    setPinDigits((d) => d.slice(0, -1));
    setPinError(null);
  }

  function handleClear() {
    if (loginMutation.isPending) return;
    setPinDigits([]);
    setPinError(null);
  }

  // ── Physical-keyboard support ──────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'pin') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') { e.preventDefault(); void submitPasscode(); return; }
      if (e.key === 'Backspace') { e.preventDefault(); handleBackspace(); return; }
      if (e.key === 'Escape') { handleClear(); return; }
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        const numericSoFar = pinDigits.every((c) => /^[0-9]$/.test(c));
        if (numericSoFar) handleDigit(e.key); else handleKey(e.key);
        return;
      }
      if (e.key.length === 1) { e.preventDefault(); handleKey(e.key); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const tenantDisplayName = tenant?.orgName ?? tenant?.name ?? orgSlug;
  const outletName = outletInfo?.name ?? tenantDisplayName;
  const useCase = outletInfo?.use_case;
  const useCaseColor = useCase ? USE_CASE_COLORS[useCase] : null;
  const useCaseLabel = useCase ? (USE_CASE_LABELS[useCase] ?? useCase) : null;
  const isDemoTenant = orgSlug === 'codevertex-demo';

  // Screensaver media: configured outlet slideshow (up to 3) → legacy single URL →
  // tenant-brand URL → bundled per-slug defaults → branded gradient.
  const screensaverMedia = buildScreensaverMedia({
    configuredUrls: [
      ...(outletInfo?.settings?.screensaver_urls ?? []),
      outletInfo?.settings?.screensaver_url,
      tenant?.posScreensaverUrl,
    ],
    orgSlug,
  });
  const heroBackdrop = tenant?.posScreensaverUrl ?? tenant?.logoUrl ?? null;

  // Settings gear (screensaver timeout) — POS-only control, rendered in the shared header's
  // rightSlot alongside the live clock.
  const SettingsGear = () => (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowSettings((v) => !v)}
        className="h-9 w-9 rounded-xl flex items-center justify-center bg-white/15 ring-1 ring-inset ring-white/25 hover:bg-white/25 text-white transition-colors"
        title="Screensaver timeout"
        aria-label="Screensaver timeout settings"
      >
        <Settings className="h-4 w-4" />
      </button>
      {showSettings && (
        <div className="absolute right-0 top-11 z-50 w-44 rounded-2xl border border-border bg-card shadow-xl p-1.5 space-y-0.5">
          <p className="px-3 py-1.5 text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Screensaver</p>
          {TIMEOUT_OPTIONS.map((opt) => (
            <button
              key={opt.ms}
              type="button"
              onClick={() => handleTimeoutChange(opt.ms)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-xl text-sm transition-colors',
                timeoutMs === opt.ms
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const goSSO = () => redirectToSSO(orgSlug, `/${orgSlug}/dashboard`);

  const BiometricButton = () =>
    biometricSupported && hasRegisteredCredential && storedEmail ? (
      <button
        type="button"
        onClick={() => biometricAuth(storedEmail, orgSlug)}
        disabled={biometricLoading}
        className={cn(
          'mx-auto inline-flex items-center gap-2 px-4 py-2 rounded-full',
          'border border-primary/25 bg-primary/10 text-primary text-xs font-semibold',
          'hover:bg-primary/15 hover:border-primary/45 disabled:opacity-50 transition-all'
        )}
      >
        <Fingerprint className="h-3.5 w-3.5" />
        {biometricLoading ? 'Verifying…' : 'Sign in with fingerprint'}
      </button>
    ) : null;

  // ── Outlet selection step ────────────────────────────────────────────────────

  if (step === 'outlet') {
    const colClass =
      posOutlets.length === 1 ? 'grid-cols-1 max-w-xs mx-auto' :
      posOutlets.length <= 4  ? 'grid-cols-1 sm:grid-cols-2' :
                                'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

    return (
      <PinLoginLayout
        backdropUrl={heroBackdrop}
        header={
          <PinLoginHeader
            serviceName="Codevertex POS"
            tenantName={tenantDisplayName}
            outletName={posOutlets.length > 1 ? 'Select your outlet to continue' : undefined}
            isOnline={isOnline}
            rightSlot={<LiveClock />}
          />
        }
        brandPanel={
          <PinLoginBrandPanel
            tenantName={tenantDisplayName}
            tenantLogoUrl={tenant?.logoUrl}
            workflowSteps={WORKFLOW_STEPS}
          />
        }
        card={
          <div className="flex-1 min-h-0 flex flex-col p-3 sm:p-6 overflow-y-auto">
            {posOutlets.length === 0 && (outletsLoading || tenantLoading) ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-32 rounded-2xl bg-muted/60 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
                ))}
              </div>
            ) : posOutlets.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm my-auto">
                <Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-foreground font-medium">No POS outlets available</p>
                <p className="mt-1 text-sm text-muted-foreground">No point-of-sale outlets are configured for this business yet. Ask an administrator to create an outlet in the admin console.</p>
              </div>
            ) : (
              <div className={cn('grid gap-3', colClass)}>
                {posOutlets.map((outlet, idx) => (
                  <OutletCard
                    key={outlet.id}
                    outlet={outlet}
                    index={idx}
                    onSelect={() => selectOutlet(outlet)}
                  />
                ))}
              </div>
            )}

            <div className="w-full max-w-xs mx-auto mt-6 flex flex-col gap-2.5">
              <PinLoginSSOButton onClick={goSSO} />
              <BiometricButton />
              {biometricError && <p className="text-center text-xs text-destructive">{biometricError}</p>}
            </div>
          </div>
        }
      />
    );
  }

  // ── PIN entry step ────────────────────────────────────────────────────────────

  const PIN_LENGTH = 4;

  return (
    <>
      <Screensaver
        active={screensaverActive}
        onDismiss={() => setScreensaverActive(false)}
        screensaverUrl={screensaverMedia.videoUrl}
        playlist={screensaverMedia.images}
        tenantName={tenant?.orgName ?? tenant?.name}
        tenantLogoUrl={tenant?.logoUrl}
        outletName={outletName !== (tenant?.orgName ?? tenant?.name ?? orgSlug) ? outletName : undefined}
      />

      <PinLoginLayout
        backdropUrl={heroBackdrop}
        header={
          <PinLoginHeader
            serviceName="Codevertex POS"
            tenantName={tenantDisplayName}
            outletName={outletName}
            isHQ={outletInfo?.is_hq}
            showSwitchOutlet={posOutlets.length > 1}
            onSwitchOutlet={() => setStep('outlet')}
            isOnline={isOnline}
            rightSlot={<div className="flex items-center gap-2"><LiveClock /><SettingsGear /></div>}
          />
        }
        brandPanel={
          <PinLoginBrandPanel
            tenantName={tenantDisplayName}
            tenantLogoUrl={tenant?.logoUrl}
            workflowSteps={WORKFLOW_STEPS}
          />
        }
        footer={isDemoTenant && <DemoHints subtitle={useCaseLabel} hints={getDemoHints(useCase)} />}
        card={
          <div className="flex-1 min-h-0 flex flex-col gap-3 p-3 sm:p-6">
            <PasscodeField
              value={pinDigits.join('')}
              error={!!pinError}
              shake={isShaking}
              onSubmit={() => submitPasscode()}
              isSubmitting={loginMutation.isPending}
            />
            <div className="min-h-4 flex items-center justify-center">
              {pinError && (
                <p className="text-destructive text-xs font-medium text-center">{pinError}</p>
              )}
            </div>

            {/* ── SMALL SCREENS (< lg): single active keyboard + toggle ── */}
            <div className="flex-1 min-h-0 flex flex-col gap-4 lg:hidden overflow-y-auto">
              <PinLoginSSOButton onClick={goSSO} />
              <div className="flex flex-col gap-3 rounded-2xl bg-muted/40 border border-border p-2.5 sm:p-4">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <KeyRound className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                    {keyboardMode === 'numeric' ? 'Enter PIN' : 'Enter passcode'}
                  </span>
                </div>
                {keyboardMode === 'numeric' ? (
                  <div className="mx-auto w-full max-w-xs">
                    <PinKeypad
                      onDigit={handleDigit}
                      onBackspace={handleBackspace}
                      onClear={handleClear}
                      onToggleQwerty={() => setKeyboardMode('qwerty')}
                      disabled={loginMutation.isPending}
                      isSubmitting={loginMutation.isPending}
                      digitsLength={pinDigits.length}
                      pinLength={PIN_LENGTH}
                    />
                  </div>
                ) : (
                  <QwertyKeyboard
                    onKey={handleKey}
                    onBackspace={handleBackspace}
                    onEnter={() => submitPasscode()}
                    shift={shift}
                    onToggleShift={() => setShift((s) => !s)}
                    onToggleNumeric={() => setKeyboardMode('numeric')}
                    disabled={loginMutation.isPending}
                  />
                )}
                <BiometricButton />
                {biometricError && <p className="text-center text-xs text-destructive">{biometricError}</p>}
              </div>
            </div>

            {/* ── LARGE SCREENS (lg+): 3-zone row, both keyboards visible ── */}
            <div className="hidden lg:flex flex-1 min-h-0 items-stretch gap-5">
              <div className="w-44 shrink-0 flex flex-col">
                <PinLoginSSOButton onClick={goSSO} tall />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-3 rounded-2xl bg-muted/40 border border-border p-4">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <KeyRound className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">Enter passcode</span>
                </div>
                <QwertyKeyboard
                  onKey={handleKey}
                  onBackspace={handleBackspace}
                  onEnter={() => submitPasscode()}
                  shift={shift}
                  onToggleShift={() => setShift((s) => !s)}
                  disabled={loginMutation.isPending}
                  showToggle={false}
                />
              </div>
              <div className="w-64 shrink-0 flex flex-col gap-3 rounded-2xl bg-muted/40 border border-border p-4">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <KeyRound className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">Enter PIN</span>
                </div>
                <PinKeypad
                  onDigit={handleDigit}
                  onBackspace={handleBackspace}
                  onClear={handleClear}
                  disabled={loginMutation.isPending}
                  isSubmitting={loginMutation.isPending}
                  digitsLength={pinDigits.length}
                  pinLength={PIN_LENGTH}
                  showToggle={false}
                />
              </div>
            </div>
            <div className="hidden lg:flex flex-col items-center gap-1">
              <BiometricButton />
              {biometricError && <p className="text-center text-xs text-destructive">{biometricError}</p>}
            </div>
          </div>
        }
      />
    </>
  );
}
