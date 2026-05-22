'use client';

import { useAuthStore } from '@/store/auth';
import { Bell, BookOpen, ChevronDown, ExternalLink, Globe, LogOut, MapPin, Menu, Package, Search, Settings, ShoppingCart, Square, Tag, User } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ThemeToggle } from './theme-toggle';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { OutletFilter } from './outlet-filter';
import { useCurrentShift, useCloseShift } from '@/hooks/useShifts';
import { toast } from 'sonner';

const INVENTORY_URL = process.env.NEXT_PUBLIC_INVENTORY_UI_URL ?? 'https://inventory.codevertexitsolutions.com';
const TREASURY_URL = process.env.NEXT_PUBLIC_TREASURY_UI_URL ?? 'https://books.codevertexitsolutions.com';
const PRICING_URL = process.env.NEXT_PUBLIC_SUBSCRIPTIONS_UI_URL ?? 'https://pricing.codevertexitsolutions.com';
const ORDERING_URL = process.env.NEXT_PUBLIC_ORDERING_UI_URL ?? 'https://order.codevertexitsolutions.com';
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_UI_URL ?? 'https://accounts.codevertexitsolutions.com';

const SERVICES = [
  { label: 'Inventory', href: (slug: string) => `${INVENTORY_URL}/${slug}`, Icon: Package },
  { label: 'Treasury', href: (slug: string) => `${TREASURY_URL}/${slug}`, Icon: BookOpen },
  { label: 'Online Store', href: (slug: string) => `${ORDERING_URL}/${slug}`, Icon: ShoppingCart },
  { label: 'Subscriptions', href: (slug: string) => `${PRICING_URL}/${slug}`, Icon: Tag },
  { label: 'Account Portal', href: (slug: string) => `${AUTH_URL}/${slug}`, Icon: Globe },
] as const;

const USE_CASE_LABELS: Record<string, string> = {
  hospitality: 'Hospitality',
  quick_service: 'Quick Service',
  retail: 'Retail',
  pharmacy: 'Pharmacy',
  services: 'Services',
};

function displayName(user: { fullName?: string; name?: string; email?: string } | null): string {
  if (!user) return 'Account';
  return user.fullName ?? user.name ?? user.email?.split('@')[0] ?? 'Account';
}

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || 'codevertex';
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { getServiceTitle } = useTenantBranding();
  const outlet = useAuthStore((s) => s.outlet);
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

  const canSwitchOutlet = !isTerminalSession && user?.roles?.some(r =>
    ['admin', 'superuser', 'manager', 'pos_admin', 'super_admin'].includes(r)
  );

  const { data: currentShift } = useCurrentShift();
  const closeShift = useCloseShift();
  const hasActiveShift = !!currentShift;

  async function handleEndShift() {
    try {
      await closeShift.mutateAsync(0);
      if (isTerminalSession) {
        // Terminal session: logout and redirect back to PIN login.
        await logout();
        router.replace(`/${orgSlug}/pin-login`);
      } else {
        toast.success('Shift ended');
      }
    } catch {
      toast.error('Failed to end shift');
    }
  }

  return (
    <header className="h-20 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-8 flex items-center gap-4">
      {/* Left: title + search + outlet context */}
      <div className="flex items-center gap-4 flex-1 min-w-0 overflow-hidden">
        <button type="button" onClick={onMenuClick} className="lg:hidden p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors shrink-0" aria-label="Open menu">
          <Menu className="h-5 w-5 text-slate-500" />
        </button>
        <div className="flex items-center gap-6 min-w-0">
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-foreground uppercase truncate max-w-[150px] sm:max-w-none shrink-0">
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
        {/* Outlet chip — shows home outlet name + use_case.
            Terminal sessions and non-admin staff see a display-only chip (no navigation). */}
        {outlet && canSwitchOutlet && (
          <Link
            href={`/${orgSlug}/auth/select-outlet`}
            className="hidden lg:flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors shrink-0"
            title="Switch outlet"
          >
            <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate max-w-30">{outlet.name}</span>
            {outlet.use_case && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary whitespace-nowrap">
                {USE_CASE_LABELS[outlet.use_case] ?? outlet.use_case}
              </span>
            )}
          </Link>
        )}
        {outlet && !canSwitchOutlet && (
          <div
            className="hidden lg:flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-1.5 text-sm font-medium text-muted-foreground shrink-0"
            title={outlet.name}
          >
            <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate max-w-30">{outlet.name}</span>
            {outlet.use_case && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary whitespace-nowrap">
                {USE_CASE_LABELS[outlet.use_case] ?? outlet.use_case}
              </span>
            )}
          </div>
        )}
        <OutletFilter className="hidden md:block shrink-0" />
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
        <button className="relative group p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all">
          <Bell className="h-5 w-5 text-slate-500 group-hover:text-primary transition-colors" />
          <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white dark:border-slate-950" />
        </button>

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
              <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-[1.5rem] p-3 shadow-2xl border border-border bg-popover overflow-hidden">
                <div className="mb-2 px-3 py-2">
                  <p className="text-sm font-black text-foreground">{name}</p>
                  <p className="text-[10px] text-slate-400 truncate font-bold uppercase tracking-widest mt-0.5">{role || 'Member'}</p>
                </div>

                <div className="h-px bg-slate-100 dark:bg-white/5 my-2 mx-1" />

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

                <div className="h-px bg-slate-100 dark:bg-white/5 my-2 mx-1" />

                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-3 mb-1.5">Services</p>
                <div className="grid gap-1">
                  {SERVICES.map(({ label, href, Icon }) => (
                    <a
                      key={label}
                      href={href(orgSlug)}
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
                  ))}
                </div>

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
