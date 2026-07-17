'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { compare as bcryptCompare } from 'bcryptjs';
import {
  Building2, CalendarClock, Clock3, ExternalLink, Fingerprint, KeyRound, UserRound,
} from 'lucide-react';
import { useEffectiveOnline } from '@/lib/connectivity';
import { useIdleTimer, getScreensaverTimeoutMs, setScreensaverTimeoutMs, resolveScreensaverTimeoutMs } from '@/hooks/use-idle-timer';
import { useBiometric } from '@/hooks/use-biometric';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { getCachedStaffProfiles, cacheStaffProfile, type CachedStaffProfile } from '@/lib/db/pos-db';
import { Screensaver } from '@/components/pos/screensaver';
import { buildScreensaverMedia } from '@/lib/screensaver';
import {
  LoginHero, PinKeypad, OutletCard, DemoHints, USE_CASE_COLORS, USE_CASE_LABELS,
} from '@/components/pos/pin-login-ui';
import { QwertyKeyboard } from '@/components/pos/pin-login-keyboards';
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

interface OutletInfo {
  id: string;
  name: string;
  use_case?: string;
  is_hq?: boolean;
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
  // Where to land AFTER a successful PIN/SSO login. Default (null) → dashboard.
  // The "Attendance" action sets this to /shifts so the user must authenticate first
  // and then lands on their shift page (instead of navigating in without a fresh login).
  const [postLoginRedirect, setPostLoginRedirect] = useState<string | null>(null);
  // Which on-screen keyboard is showing — like a real soft-keyboard, only ONE is
  // visible at a time. Numeric PIN keypad is the default; "ABC"/"?123" toggle between
  // them. This is the ONLY new state; no handler/mutation is duplicated.
  const [keyboardMode, setKeyboardMode] = useState<'numeric' | 'qwerty'>('numeric');

  // Device-local override (set via the gear menu) wins; otherwise fall back to the default.
  // Once the outlet settings load, a centrally-configured timeout is applied when the user
  // has NOT picked a device-local value (resolveScreensaverTimeoutMs keeps local precedence).
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
    setHasLocalTimeout(true);
    setShowSettings(false);
  };

  // ── Outlet info ──────────────────────────────────────────────────────────────

  // Slug-scoped: never resolves an outlet persisted while working in ANOTHER tenant
  // (that leak used to send the old tenant's outlet_id to /auth/pin/identify → login failed).
  const [storedOutletId, setStoredOutletIdState] = useState<string>(() => getStoredOutletId(orgSlug));

  // Both outlet queries are IndexedDB-first (kvCache): the PIN page must render its outlet
  // context (name, use case, screensaver, timeout) on an offline/weak-wifi cold start too.
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
        use_case: data.user.outlet_use_case ?? sessionOutlet.use_case,
        is_hq:    data.user.is_hq_user ?? sessionOutlet.is_hq ?? false,
        status:   'active',
      });
      apiClient.setOutletID(sessionOutlet.id);
    }
    // Single success-redirect path: Attendance sets postLoginRedirect → /shifts,
    // everything else falls back to the dashboard.
    router.push(postLoginRedirect ?? `/${orgSlug}/dashboard`);
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
  // QWERTY ENTER key, and the hero "Login" button. Online → loginMutation, and on a
  // NETWORK-shaped failure (timeout / unreachable — weak wifi reads as "online") it
  // falls back to the same bcrypt-match-against-cached-profiles branch used offline.
  async function submitPasscode(passcode?: string) {
    if (loginMutation.isPending) return;
    const pin = passcode ?? pinDigits.join('');
    if (!pin) return; // guard empty (hero Login / Enter on an empty field)

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
      // Neither the last-fetched outlet info nor a stored outlet id is available (e.g. the
      // very first login on a fresh device while offline) — completing the login here would
      // leave the session with NO outlet context, so every subsequent request (tables,
      // sections, catalog) goes out with no X-Outlet-ID and silently gets the wrong outlet's
      // data from the server's HQ fallback. Block instead of producing a broken session.
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
    // Same success-redirect destination as the online path (Attendance → /shifts).
    router.push(postLoginRedirect ?? `/${orgSlug}/dashboard`);
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

  // On-screen QWERTY key handler (genuinely-new logic): append to the SAME pinDigits
  // state. Letters/space/punctuation append (case already applied by the keyboard).
  // QWERTY input does NOT auto-submit — only ENTER / hero-Login submit.
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

  // Clears all entered digits at once (the reference's destructive CLEAR key).
  function handleClear() {
    if (loginMutation.isPending) return;
    setPinDigits([]);
    setPinError(null);
  }

  const tenantDisplayName = tenant?.orgName ?? tenant?.name ?? orgSlug;
  const outletName = outletInfo?.name ?? tenantDisplayName;
  const useCase = outletInfo?.use_case;
  const pinLoginMessage = outletInfo?.settings?.pin_login_message;
  const useCaseColor = useCase ? USE_CASE_COLORS[useCase] : null;
  const useCaseLabel = useCase ? (USE_CASE_LABELS[useCase] ?? useCase) : null;
  const isDemoTenant = orgSlug === 'codevertex-demo';

  // Screensaver media: configured outlet slideshow (up to 3) → legacy single URL →
  // tenant-brand URL → bundled per-slug defaults → branded gradient. Shared resolver
  // with TerminalIdleScreensaver so both idle screens rotate the same set.
  const screensaverMedia = buildScreensaverMedia({
    configuredUrls: [
      ...(outletInfo?.settings?.screensaver_urls ?? []),
      outletInfo?.settings?.screensaver_url,
      tenant?.posScreensaverUrl,
    ],
    orgSlug,
  });

  // Hero shared bits — brand backdrop image (screensaver/logo) + fallback initials.
  const heroBackdrop = tenant?.posScreensaverUrl ?? tenant?.logoUrl ?? null;
  const heroInitials = (tenant?.orgName ?? orgSlug).slice(0, 2).toUpperCase();

  // Attendance intent: if the user is ALREADY in a (terminal) session, jump straight to
  // /shifts. Otherwise DON'T navigate — record /shifts as the post-login redirect, keep the
  // user on the PIN screen to authenticate, and surface a brief inline hint. The actual
  // login still flows through the SINGLE existing success path (handleLoginSuccess /
  // offline bcrypt path) which now honours postLoginRedirect.
  const shiftsHref = `/${orgSlug}/shifts`;
  function handleAttendance() {
    if (hasSession && isTerminalSession) {
      router.push(shiftsHref);
      return;
    }
    setPostLoginRedirect(shiftsHref);
  }
  const attendanceArmed = postLoginRedirect === shiftsHref;

  // Shared Login (redirectToSSO) + Attendance (→ /shifts) action buttons. Factored
  // out so the SAME markup/handlers serve BOTH responsive layouts without copy-paste.
  //  - orientation="row"  → side-by-side (small-screen stacked layout, full width)
  //  - orientation="col"  → stacked tall buttons (large-screen LEFT zone)
  const ActionButtons = ({ orientation }: { orientation: 'row' | 'col' }) => (
    <div className={cn('gap-3', orientation === 'row' ? 'grid grid-cols-2' : 'flex flex-col h-full')}>
      <button
        onClick={() => redirectToSSO(orgSlug, postLoginRedirect ?? `/${orgSlug}/dashboard`)}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-2xl py-4 sm:py-5',
          'text-white font-bold shadow-md ring-1 ring-inset ring-white/15',
          'active:scale-[0.98] transition-all duration-150',
          orientation === 'col' && 'flex-1'
        )}
        style={{ background: 'linear-gradient(160deg, hsl(var(--primary)) 0%, hsl(var(--primary-dark)) 100%)' }}
      >
        <span className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-white/20 ring-1 ring-inset ring-white/25 flex items-center justify-center">
          <UserRound className="h-5 w-5 sm:h-6 sm:w-6" />
        </span>
        <span className="text-sm">Login</span>
      </button>
      <button
        onClick={handleAttendance}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-2xl py-4 sm:py-5',
          'text-secondary-foreground font-bold shadow-md ring-1 ring-inset',
          'hover:brightness-95 active:scale-[0.98] transition-all duration-150',
          // When armed (no session yet), mark Attendance as the active intent so the user
          // knows their PIN entry will clock them in.
          attendanceArmed ? 'ring-primary/60 ring-2' : 'ring-black/5',
          orientation === 'col' && 'flex-1'
        )}
        style={{ background: 'hsl(var(--secondary))' }}
      >
        <span className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-black/5 flex items-center justify-center">
          <CalendarClock className="h-5 w-5 sm:h-6 sm:w-6" />
        </span>
        <span className="text-sm">Attendance</span>
      </button>
    </div>
  );

  // Shared biometric affordance — same handler/markup in both layouts.
  const BiometricButton = () =>
    biometricSupported && hasRegisteredCredential && storedEmail ? (
      <button
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
      <div className="relative min-h-screen w-screen flex flex-col bg-slate-50">
        {/* Brand hero band — applied to BOTH steps */}
        <LoginHero
          eyebrow="POS System"
          heading="Welcome Back"
          outletName={posOutlets.length > 1 ? 'Select your outlet to continue' : tenantDisplayName}
          backdropUrl={heroBackdrop}
          logoUrl={tenant?.logoUrl}
          fallbackInitials={heroInitials}
          isOnline={isOnline}
        />

        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.015]" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <filter id="grain-outlet"><feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="4" stitchTiles="stitch"/></filter>
          <rect width="100%" height="100%" filter="url(#grain-outlet)"/>
        </svg>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-40 overflow-hidden">
          <div className="absolute top-1/2 -right-48 h-[500px] w-[500px] rounded-full blur-3xl animate-breathe-slow"
               style={{ background: 'hsl(var(--primary) / 0.06)' }} />
          <div className="absolute -bottom-48 left-1/3 h-96 w-96 rounded-full blur-3xl"
               style={{ background: 'hsl(var(--primary) / 0.06)' }} />
        </div>

        <div className="relative z-10 flex flex-col flex-1 items-center px-4 sm:px-6 pt-8 pb-10 overflow-y-auto">
          <div className="w-full max-w-2xl">
            {posOutlets.length === 0 && (outletsLoading || tenantLoading) ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-36 rounded-2xl bg-slate-200/60 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
                ))}
              </div>
            ) : posOutlets.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                <Building2 className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                <p className="text-slate-900 font-medium">No POS outlets available</p>
                <p className="mt-1 text-sm text-slate-500">No point-of-sale outlets are configured for this business yet. Ask an administrator to create an outlet in the admin console.</p>
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
          </div>

          <div className="w-full max-w-xs mt-10 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-[10px] text-slate-400 font-medium tracking-widest uppercase">or</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            <button
              onClick={() => redirectToSSO(orgSlug, `/${orgSlug}/dashboard`)}
              className={cn(
                'w-full flex items-center justify-center gap-2.5 px-5 py-3 rounded-2xl',
                'border border-slate-200 bg-white',
                'text-sm text-slate-600 font-medium shadow-sm',
                'hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300',
                'transition-all duration-200 group'
              )}
            >
              <ExternalLink className="h-4 w-4 group-hover:text-primary transition-colors" />
              Sign in with your account
            </button>
            <button
              onClick={() => {
                // From the outlet step the user has no session yet — arm the post-login
                // redirect and drop them on the PIN screen to authenticate first.
                if (hasSession && isTerminalSession) { router.push(shiftsHref); return; }
                setPostLoginRedirect(shiftsHref);
                setStep('pin');
              }}
              className={cn(
                'w-full flex items-center justify-center gap-2.5 px-5 py-3 rounded-2xl',
                'border bg-white',
                'text-sm text-slate-600 font-medium shadow-sm',
                'hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300',
                'transition-all duration-200 group',
                attendanceArmed ? 'border-primary/50 ring-1 ring-primary/30' : 'border-slate-200'
              )}
            >
              <Clock3 className="h-4 w-4 group-hover:text-primary transition-colors" />
              Attendance
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
                {biometricError && <p className="text-center text-xs text-red-500">{biometricError}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── PIN entry step (full-screen, PIN-first) ───────────────────────────────────

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

      <div className="relative h-screen w-screen overflow-hidden flex flex-col bg-slate-50">
        {/* Grain texture */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.015]" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <filter id="grain-pin"><feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="4" stitchTiles="stitch"/></filter>
          <rect width="100%" height="100%" filter="url(#grain-pin)"/>
        </svg>

        {/* ── Brand hero band (identity, clock, offline, settings) ── */}
        <LoginHero
          eyebrow="POS System"
          heading="Welcome Back"
          outletName={outletName}
          backdropUrl={heroBackdrop}
          logoUrl={tenant?.logoUrl}
          fallbackInitials={tenantDisplayName.slice(0, 2).toUpperCase()}
          useCaseLabel={useCaseLabel}
          useCaseAccent={useCaseColor?.accent ?? null}
          isHQ={outletInfo?.is_hq}
          pinLoginMessage={pinLoginMessage}
          showSwitchOutlet={posOutlets.length > 1}
          onSwitchOutlet={() => setStep('outlet')}
          isOnline={isOnline}
          settings={{
            show: showSettings,
            onToggle: () => setShowSettings((v) => !v),
            options: TIMEOUT_OPTIONS,
            activeMs: timeoutMs,
            onPick: handleTimeoutChange,
          }}
          passcode={{
            length: pinDigits.length,
            error: !!pinError,
            shake: isShaking,
            onSubmit: () => submitPasscode(),
            isSubmitting: loginMutation.isPending,
          }}
        />

        {/* Ambient blob under the body */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-44 overflow-hidden">
          <div className="absolute top-1/3 -right-32 h-96 w-96 rounded-full blur-3xl animate-breathe-slow"
               style={{ background: 'hsl(var(--primary) / 0.06)' }} />
          <div className="absolute -bottom-32 left-1/4 h-80 w-80 rounded-full blur-3xl"
               style={{ background: 'hsl(var(--primary) / 0.06)' }} />
        </div>

        {/* ── Body: white card on the light panel. Two RESPONSIVE layouts of the SAME
               content/handlers (no duplicated logic):
                 • SMALL (< lg): single-column stack with ONE active keyboard +
                   the ABC/?123 toggle (driven by keyboardMode).  → `lg:hidden`
                 • LARGE (lg+): wide 3-zone row — actions LEFT, full QWERTY CENTER,
                   numeric keypad RIGHT, both shown at once, no toggle. → `hidden lg:flex`
               Both reuse <ActionButtons>, <PinKeypad>, <QwertyKeyboard>, <BiometricButton>
               and the shared handlers; only `keyboardMode` differs between them. ── */}
        <div className="relative z-10 flex-1 flex items-start justify-center overflow-y-auto px-3 sm:px-6 lg:px-8 pt-2 pb-6">

          {/* ── SMALL SCREENS (< lg): single-keyboard toggle stack ── */}
          <div className="w-full max-w-3xl lg:hidden rounded-3xl bg-white border border-slate-200 shadow-xl shadow-slate-900/5 p-4 sm:p-6">
            {/* Error / attendance-intent hint — shared across all input zones */}
            <div className="min-h-4 mb-2 flex items-center justify-center">
              {pinError ? (
                <p className="text-destructive text-xs font-medium animate-fade-in text-center">
                  {pinError}
                </p>
              ) : attendanceArmed ? (
                <p className="text-primary text-xs font-medium animate-fade-in text-center">
                  Enter your PIN to clock in / manage your shift
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-4 sm:gap-5">
              {/* Action buttons: full-width row, stacking nicely on the narrowest phones */}
              <ActionButtons orientation="row" />

              {/* Active on-screen keyboard — numeric by default, QWERTY when toggled.
                  Only ONE keyboard is mounted at a time (like a real soft keyboard). */}
              <div className="flex flex-col gap-3 rounded-2xl bg-slate-50/60 border border-slate-100 p-3 sm:p-4">
                <div className="flex items-center justify-center gap-2 text-slate-400">
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

                {/* Biometric affordance kept available below the active keyboard */}
                <BiometricButton />
                {biometricError && <p className="text-center text-xs text-destructive">{biometricError}</p>}
              </div>
            </div>
          </div>

          {/* ── LARGE SCREENS (lg+): wide 3-zone layout, both keyboards visible ── */}
          <div className="hidden lg:flex w-full max-w-6xl rounded-3xl bg-white border border-slate-200 shadow-xl shadow-slate-900/5 p-6 flex-col">
            {/* Error / attendance-intent hint — shared across all input zones */}
            <div className="min-h-4 mb-3 flex items-center justify-center">
              {pinError ? (
                <p className="text-destructive text-xs font-medium animate-fade-in text-center">
                  {pinError}
                </p>
              ) : attendanceArmed ? (
                <p className="text-primary text-xs font-medium animate-fade-in text-center">
                  Enter your PIN to clock in / manage your shift
                </p>
              ) : null}
            </div>

            <div className="flex items-stretch gap-5">
              {/* LEFT zone: tall Login + Attendance buttons */}
              <div className="w-44 shrink-0">
                <ActionButtons orientation="col" />
              </div>

              {/* CENTER zone: full QWERTY keyboard (no ?123 toggle) */}
              <div className="flex-1 min-w-0 flex flex-col gap-3 rounded-2xl bg-slate-50/60 border border-slate-100 p-4">
                <div className="flex items-center justify-center gap-2 text-slate-400">
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

              {/* RIGHT zone: numeric PIN keypad (no ABC toggle) */}
              <div className="w-64 shrink-0 flex flex-col gap-3 rounded-2xl bg-slate-50/60 border border-slate-100 p-4">
                <div className="flex items-center justify-center gap-2 text-slate-400">
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

            {/* Biometric affordance + error — shared, centred below the 3 zones */}
            <div className="mt-4 flex flex-col items-center gap-1">
              <BiometricButton />
              {biometricError && <p className="text-center text-xs text-destructive">{biometricError}</p>}
            </div>
          </div>
        </div>

        {/* ── Demo hints (codevertex-demo only) — floating bottom-right ── */}
        {isDemoTenant && <DemoHints useCase={useCase} hints={getDemoHints(useCase)} />}
      </div>
    </>
  );
}
