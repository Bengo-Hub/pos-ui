'use client';

import { usePermissions } from '@/hooks/usePermissions';
import { useCloseShift, useCurrentShift } from '@/hooks/useShifts';
import { apiClient } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { canAccessAllOutlets } from '@/lib/auth/outlet-access';
import { P } from '@/lib/rbac/permissions';
import { cn } from '@/lib/utils';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { useSubscription } from '@/hooks/use-subscription';
import { useAuthStore } from '@/store/auth';
import { useOutletFilterStore } from '@/store/outlet-filter';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Building2, Check, ChevronDown, ExternalLink, Loader2, LogOut, MapPin, Menu, PanelLeft, Search, Settings, Square, User } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { NotificationBell } from './notifications/NotificationBell';
import { ThemeToggle } from './theme-toggle';
import { useVisibleServices, type ServiceKey } from '@bengo-hub/shared-ui-lib/app-switcher';

// Canonical service list (labels/icons/coverage, incl. 'coming-soon' entries) lives in
// shared-ui-lib's app-switcher now — see useVisibleServices below. Treasury isn't in that
// registry (pos-ui links OUT to treasury, but treasury doesn't list itself), so it's kept here.
const TREASURY_URL = process.env.NEXT_PUBLIC_TREASURY_UI_URL ?? 'https://books.codevertexafrica.com';
const SERVICE_URLS: Partial<Record<ServiceKey, string>> = {
  inventory: process.env.NEXT_PUBLIC_INVENTORY_UI_URL ?? 'https://inventory.codevertexafrica.com',
  marketflow: process.env.NEXT_PUBLIC_CRM_UI_URL ?? process.env.NEXT_PUBLIC_MARKETFLOW_UI_URL ?? 'https://marketflow.codevertexafrica.com',
  logistics: process.env.NEXT_PUBLIC_LOGISTICS_UI_URL ?? 'https://logistics.codevertexafrica.com',
  erp: process.env.NEXT_PUBLIC_ERP_UI_URL ?? 'https://erp.codevertexafrica.com',
  ordering: process.env.NEXT_PUBLIC_ORDERING_UI_URL ?? 'https://ordering.codevertexafrica.com',
  subscriptions: process.env.NEXT_PUBLIC_SUBSCRIPTIONS_UI_URL ?? 'https://pricing.codevertexafrica.com',
  auth: process.env.NEXT_PUBLIC_AUTH_UI_URL ?? 'https://accounts.codevertexafrica.com',
  projects: process.env.NEXT_PUBLIC_PROJECTS_UI_URL ?? 'https://projects.codevertexafrica.com',
  afya: process.env.NEXT_PUBLIC_HOSPITAL_UI_URL ?? 'https://afya.codevertexafrica.com',
};

const USE_CASE_LABELS: Record<string, string> = {
  hospitality: 'Hospitality',
  quick_service: 'Quick Service',
  retail: 'Retail',
  pharmacy: 'Pharmacy',
  services: 'Services',
};

// Auth-api host — outlets are OWNED by auth-api; mirrors can lag/miss rows, so the switcher
// lists from the owner exactly like treasury-ui/inventory-ui do (their proven pattern).
const AUTH_API_URL =
  process.env.NEXT_PUBLIC_AUTH_API_URL ||
  process.env.NEXT_PUBLIC_SSO_URL ||
  'https://sso.codevertexafrica.com';

// Outlet use cases pos-ui can actually open (mirrors pos-api's posAcceptedUseCases) —
// logistics/warehouse/weighbridge outlets belong to other services.
const POS_USE_CASES = new Set(['hospitality', 'quick_service', 'retail', 'pharmacy', 'services', 'hotel', '']);

interface OutletListItem {
  id: string;
  code: string;
  name: string;
  use_case?: string;
  is_hq?: boolean;
  status?: string;
}

/** Primary: auth-api by tenant slug (bearer token). Fallback: pos-api's public outlets mirror. */
async function fetchTenantOutlets(accessToken: string, tenantSlug: string, tenantId: string): Promise<OutletListItem[]> {
  const normalize = (data: any): OutletListItem[] => {
    const list: OutletListItem[] = Array.isArray(data) ? data : data?.outlets ?? data?.data ?? [];
    return list.filter(
      (o) => o?.id && o.status !== 'archived' && POS_USE_CASES.has((o.use_case ?? '').toLowerCase()),
    );
  };
  // 1) auth-api (owner) — same call treasury-ui/inventory-ui use.
  try {
    if (accessToken && tenantSlug) {
      const res = await fetch(`${AUTH_API_URL}/api/v1/tenants/${tenantSlug}/outlets`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      });
      if (res.ok) {
        const outlets = normalize(await res.json());
        if (outlets.length > 0) return outlets;
      }
    }
  } catch {
    /* fall through to the pos mirror */
  }
  // 2) pos-api public mirror (kiosk endpoint) — no auth required.
  try {
    const data = await apiClient.get<any>(`/api/v1/${tenantId}/pos/outlets`);
    return normalize(data);
  } catch {
    return [];
  }
}

function HeaderOutletChip() {
  const user = useAuthStore((s) => s.user);
  const session = useAuthStore((s) => s.session);
  const authOutlet = useAuthStore((s) => s.outlet);
  const { selectedOutlet, outlets, setOutlets, selectOutlet } = useOutletFilterStore();
  const [open, setOpen] = useState(false);
  const [outletSearch, setOutletSearch] = useState('');
  // The dropdown portals to <body> anchored off this button — the header's overflow/stacking
  // context CLIPPED the absolutely-positioned panel (the chevron flipped "open" but nothing
  // showed; same class of bug treasury-ui fixed with a portal), so it must escape the header.
  const chipBtnRef = useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const toggleOpen = () => {
    if (!open && chipBtnRef.current) {
      const r = chipBtnRef.current.getBoundingClientRect();
      const width = 272;
      setPanelPos({
        top: r.bottom + 6,
        left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      });
    }
    setOutletSearch('');
    setOpen((v) => !v);
  };

  // THE outlet switcher — the sidebar duplicate was removed; this chip is the single place
  // admins/managers load and switch outlets (visible on every breakpoint).
  // Gated on ROLE ONLY — admins/managers get the switcher whether they signed in via SSO or a
  // terminal PIN login. Switching here just drives the X-Outlet-ID drill-down override (see
  // selectOutlet below), which pos-api's OutletContextMiddleware already honors for admin/manager
  // roles regardless of session type — there's no re-authentication involved, so there's no
  // reason to block PIN sessions from it.
  const canSwitch = canAccessAllOutlets(user);

  const tenantId = user?.tenant_id ?? '';
  const tenantSlug = user?.tenant_slug ?? '';

  const { data: fetchedOutlets = [], isLoading: outletsLoading } = useQuery<OutletListItem[]>({
    queryKey: ['header-outlet-list', tenantId, tenantSlug],
    queryFn: () => fetchTenantOutlets(session?.accessToken ?? '', tenantSlug, tenantId),
    enabled: canSwitch && !!tenantId,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (fetchedOutlets.length === 0) return;
    const mapped = fetchedOutlets.map((o) => ({
      id: o.id, code: o.code, name: o.name, useCase: o.use_case, isHq: o.is_hq,
    }));
    setOutlets(mapped);
    apiClient.setOutletID(selectedOutlet?.id ?? authOutlet?.id ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchedOutlets]);

  const activeOutlet = selectedOutlet ?? (authOutlet ? { id: authOutlet.id, code: authOutlet.code, name: authOutlet.name, useCase: authOutlet.use_case } : null);
  const activeName = activeOutlet?.name ?? (canSwitch ? 'All Outlets' : 'Select Outlet');
  const activeUseCase = activeOutlet?.useCase ?? authOutlet?.use_case ?? '';

  // Admins/managers always get the switcher (even with no home outlet of their own — e.g. a
  // superuser); staff without any outlet context show nothing.
  if (!authOutlet && !selectedOutlet && !canSwitch) return null;

  // Visible on ALL breakpoints — with the sidebar duplicate gone this is the only switcher,
  // so hiding it below lg would leave mobile admins unable to change outlet.
  const chipClass = 'flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-2.5 lg:px-3 py-1.5 text-sm font-medium text-muted-foreground shrink-0 min-w-0';

  if (!canSwitch) {
    return (
      <div className={chipClass}>
        <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="truncate max-w-[4.5rem] sm:max-w-[7.5rem]">{activeName}</span>
        {activeUseCase && (
          <span className="hidden sm:inline-block rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary whitespace-nowrap">
            {USE_CASE_LABELS[activeUseCase] ?? activeUseCase}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative block shrink-0 min-w-0">
      <button
        ref={chipBtnRef}
        type="button"
        onClick={toggleOpen}
        className={cn(chipClass, 'hover:bg-muted hover:text-foreground transition-colors cursor-pointer')}
        title="Switch outlet"
      >
        <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="truncate max-w-[4.5rem] sm:max-w-[7.5rem]">{activeName}</span>
        {activeUseCase && (
          <span className="hidden sm:inline-block rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary whitespace-nowrap">
            {USE_CASE_LABELS[activeUseCase] ?? activeUseCase}
          </span>
        )}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && panelPos && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} aria-hidden />
          {/* Portalled + fixed: the header's overflow/stacking context clipped an absolutely-
              positioned panel (open chevron, invisible dropdown). Anchored off the chip rect. */}
          <div
            className="fixed z-[91] w-68 rounded-xl border border-border bg-popover shadow-xl overflow-hidden"
            style={{ top: panelPos.top, left: panelPos.left }}
          >
            <div className="px-3 py-2 border-b border-border">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Switch Outlet</p>
            </div>
            {outlets.length > 5 && (
              <div className="p-2 border-b border-border">
                <input
                  autoFocus
                  value={outletSearch}
                  onChange={(e) => setOutletSearch(e.target.value)}
                  placeholder="Search outlets…"
                  className="w-full bg-accent/30 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}
            {/* The panel always renders when open — a fetch in flight shows a spinner and a
                failed/empty fetch says so, instead of the click appearing to do nothing. */}
            {outletsLoading && outlets.length === 0 && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!outletsLoading && outlets.length === 0 && (
              <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                No outlets found for this organisation.
              </p>
            )}
            <div className="max-h-64 overflow-y-auto py-1">
              <button
                type="button"
                onClick={() => {
                  selectOutlet(null);
                  // Clear the auth-store drill-down override too, so the outlet ORDERS post against
                  // (useEffectiveOutletID) and the X-Outlet-ID header both fall back to the home
                  // outlet. Without this the header switch changed catalog scope but sales/stock
                  // still booked against the home outlet (the two stores were out of sync).
                  useAuthStore.getState().setSelectedOutletId(null);
                  setOpen(false);
                }}
                className={cn('w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left', !selectedOutlet && 'bg-primary/5 text-primary')}
              >
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1">All Outlets</span>
                {!selectedOutlet && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
              {outlets
                .filter((o) =>
                  !outletSearch ||
                  o.name.toLowerCase().includes(outletSearch.toLowerCase()) ||
                  (o.code ?? '').toLowerCase().includes(outletSearch.toLowerCase()))
                .map((o) => {
                const isActive = selectedOutlet?.id === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      selectOutlet(o);
                      // Drive the auth-store drill-down override so EVERY outlet-scoped concern —
                      // the X-Outlet-ID header, catalog scope, AND the outlet orders/stock post
                      // against (useEffectiveOutletID) — follows this switch, not just the header UI.
                      useAuthStore.getState().setSelectedOutletId(o.id);
                      setOpen(false);
                    }}
                    className={cn('w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left', isActive && 'bg-primary/5')}
                  >
                    <span className={cn('h-6 w-6 rounded-lg flex items-center justify-center shrink-0 text-[9px] font-bold', isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground')}>
                      {o.code?.slice(0, 2) ?? '??'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{o.name}</p>
                      {o.useCase && <p className="text-[10px] text-muted-foreground">{o.useCase.replace('_', ' ')}</p>}
                    </div>
                    {isActive && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

function displayName(user: { fullName?: string; name?: string; email?: string } | null): string {
  if (!user) return 'Account';
  return user.fullName ?? user.name ?? user.email?.split('@')[0] ?? 'Account';
}

interface HeaderProps {
  onMenuClick?: () => void;
  // Desktop sidebar collapse toggle (used on the POS terminal to free up screen width).
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
}

export function Header({ onMenuClick, onToggleSidebar, sidebarCollapsed }: HeaderProps) {
  const params = useParams();
  // Never fall back to a hardcoded tenant: a lost route param must not strand
  // the user on codevertex's pin-login after logout/end-shift. The URL path is
  // the working-org source of truth.
  const orgSlug =
    (params?.orgSlug as string) ||
    (typeof window !== 'undefined' ? window.location.pathname.split('/')[1] ?? '' : '');
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { getServiceTitle } = useTenantBranding();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  // Gate only on !!user — _hasHydrated was causing permanent unauthenticated
  // state when the onRehydrateStorage callback failed to fire (e.g. invalid
  // persisted JSON, private browsing restrictions). !!user is safe here because
  // the header has no redirect logic; auth guards live in the middleware/layout.
  const isAuthenticated = !!user;
  const isTerminalSession = useAuthStore((s) => s.isTerminalSession);
  const name = displayName(user);
  const role = user?.roles?.[0];

  const { can, isSuperuser } = usePermissions();
  const isHQUser = isSuperuser || canAccessAllOutlets(user);
  const showSettings = isHQUser || can(P.CONFIG_VIEW) || can(P.CONFIG_CHANGE) || can(P.CONFIG_MANAGE);
  // activeProducts is undefined while the subscription lookup is in flight/unknown — fails open
  // (shows everything) until it resolves, matching this codebase's existing "never block the UI
  // on a subscription-fetch failure" convention.
  const { activeProducts } = useSubscription();
  const services = useVisibleServices({
    orgSlug,
    urls: SERVICE_URLS,
    canManageLinks: isHQUser,
    activeServiceTags: activeProducts,
  });

  const { data: currentShift } = useCurrentShift();
  const closeShift = useCloseShift();
  const hasActiveShift = !!currentShift;

  async function handleEndShift() {
    try {
      await closeShift.mutateAsync({ closing_float: 0 });
      if (isTerminalSession) {
        // Terminal session: logout and redirect back to PIN login.
        await logout();
        router.replace(`/${orgSlug}/pin-login`);
      } else {
        toast.success('Shift ended');
      }
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to end shift'));
    }
  }

  return (
    <header className="h-14 sm:h-20 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-8 flex items-center gap-4">
      {/* Left: title + search + outlet context */}
      <div className="flex items-center gap-4 flex-1 min-w-0 overflow-hidden">
        <button type="button" onClick={onMenuClick} className="lg:hidden p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors shrink-0" aria-label="Open menu">
          <Menu className="h-5 w-5 text-slate-500" />
        </button>
        {/* Desktop sidebar collapse toggle — lets the cashier reclaim width on the POS terminal. */}
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="hidden lg:inline-flex p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors shrink-0"
            aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
            aria-pressed={!sidebarCollapsed}
            title={sidebarCollapsed ? 'Show menu' : 'Hide menu'}
          >
            <PanelLeft className={cn('h-5 w-5 transition-colors', sidebarCollapsed ? 'text-primary' : 'text-slate-500')} />
          </button>
        )}
        <div className="flex items-center gap-6 min-w-0">
            {/* Hidden below sm: on the narrowest phones the hamburger + outlet chip already
                fill the row; adding the brand title crowded them into an overlapping mess. */}
            <h1 className="hidden sm:block text-lg sm:text-xl font-black tracking-tight text-foreground uppercase truncate max-w-none shrink-0">
                {getServiceTitle('POS')}
            </h1>
            <div className="hidden lg:flex relative w-64 max-w-full group shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
              <input
                placeholder="Search orders, tables..."
                className="w-full h-10 bg-slate-50 dark:bg-white/5 border-none rounded-xl py-1.5 pl-10 pr-4 text-sm focus:ring-1 focus:ring-primary/30 transition-all outline-none"
              />
            </div>
        </div>
        <HeaderOutletChip />
      </div>

      {/* Right: actions + profile — shrink-0 so it's never squeezed off screen */}
      <div className="flex items-center gap-1 sm:gap-3 shrink-0">
        {isAuthenticated && hasActiveShift && (
          <button
            type="button"
            onClick={handleEndShift}
            disabled={closeShift.isPending}
            title="End shift"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-all text-xs font-bold disabled:opacity-50"
          >
            <Square className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">End Shift</span>
          </button>
        )}
        {isAuthenticated && (
          <button
            type="button"
            onClick={() => void logout()}
            title="Logout"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-all text-xs font-bold"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        )}
        <NotificationBell />

        <ThemeToggle />

        <div className="h-8 w-[1px] bg-slate-200 dark:bg-white/10 mx-1 hidden sm:block"></div>

        <div className="relative" ref={profileRef}>
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => setProfileOpen((v) => !v)}
              className="flex items-center gap-3 rounded-2xl hover:bg-slate-100 dark:hover:bg-white/5 p-1 transition-all group"
              aria-expanded={profileOpen}
              aria-haspopup="true"
              aria-label="Open profile menu"
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-primary to-orange-400 flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-primary/20 transition-transform group-hover:scale-105">
                {name[0]?.toUpperCase() ?? <User className="h-5 w-5" />}
              </div>
              <div className="hidden md:block text-left mr-1">
                <p className="text-xs font-black text-foreground truncate max-w-[120px]">{name}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{role || 'Member'}</p>
              </div>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${profileOpen ? 'rotate-180' : ''}`} />
            </button>
          ) : null}
          {isAuthenticated && profileOpen && (
            <>
              <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setProfileOpen(false)} />
              {/* Wide enough for full service titles; panel scrolls internally only when
                  taller than the viewport, so all items stay reachable. */}
              <div className="absolute right-0 top-full mt-2 z-50 w-80 max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-5rem)] overflow-y-auto rounded-[1.5rem] p-3 shadow-2xl border border-border bg-popover">
                <div className="mb-2 px-3 py-2">
                  <p className="text-sm font-black text-foreground">{name}</p>
                  <p className="text-[10px] text-slate-400 truncate font-bold uppercase tracking-widest mt-0.5">{role || 'Member'}</p>
                </div>

                <div className="h-px bg-slate-100 dark:bg-white/5 my-2 mx-1" />

                {showSettings && (
                  <div className="grid gap-1">
                    <Link
                      href={`/${orgSlug}/settings`}
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-all group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/10 flex items-center justify-center group-hover:text-primary transition-colors">
                        <Settings className="h-4 w-4" />
                      </div>
                      Settings
                    </Link>
                  </div>
                )}

                {(showSettings || isHQUser) && (
                  <div className="h-px bg-slate-100 dark:bg-white/5 my-2 mx-1" />
                )}

                {isHQUser && (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-3 mb-1.5">Services</p>
                    {/* No inner scroll cap — full titles, all items visible; the panel itself
                        scrolls only when taller than the viewport. */}
                    <div className="grid gap-1">
                      <a
                        href={`${TREASURY_URL}/${orgSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-all group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/10 flex items-center justify-center group-hover:text-primary transition-colors">
                          <BookOpen className="h-4 w-4" />
                        </div>
                        <span className="flex-1">Treasury</span>
                        <ExternalLink className="h-3 w-3 text-slate-400 opacity-60" />
                      </a>
                      {services.map(({ key, label, href, Icon }) =>
                        href ? (
                          <a
                            key={key}
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setProfileOpen(false)}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-all group"
                          >
                            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/10 flex items-center justify-center group-hover:text-primary transition-colors">
                              <Icon className="h-4 w-4" />
                            </div>
                            <span className="flex-1">{label}</span>
                            <ExternalLink className="h-3 w-3 text-slate-400 opacity-60" />
                          </a>
                        ) : (
                          <div
                            key={key}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-400 dark:text-slate-500 cursor-default"
                            title={`${label} — coming soon`}
                          >
                            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/10 flex items-center justify-center">
                              <Icon className="h-4 w-4" />
                            </div>
                            <span className="flex-1">{label}</span>
                            <span className="text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded-full">Soon</span>
                          </div>
                        ),
                      )}
                    </div>
                  </>
                )}

                <div className="h-px bg-slate-100 dark:bg-white/5 my-2 mx-1" />

                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    void logout();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center transition-colors">
                    <LogOut className="h-4 w-4" />
                  </div>
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
