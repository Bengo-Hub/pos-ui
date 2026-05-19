'use client';

import { useAuthStore } from '@/store/auth';
import { Bell, ChevronDown, LogOut, MapPin, Menu, Search, Settings, User } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { ThemeToggle } from './theme-toggle';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { OutletFilter } from './outlet-filter';

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
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  const logout = useAuthStore((state) => state.logout);
  const { getServiceTitle } = useTenantBranding();
  const outlet = useAuthStore((s) => s.outlet);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const isAuthenticated = !!user && status === 'authenticated';
  const name = displayName(user);
  const role = user?.roles?.[0];

  return (
    <header className="h-20 border-b border-slate-200 dark:border-white/5 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-8 flex items-center justify-between">
      <div className="flex items-center gap-4 flex-1">
        <button type="button" onClick={onMenuClick} className="lg:hidden p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors" aria-label="Open menu">
          <Menu className="h-5 w-5 text-slate-500" />
        </button>
        <div className="flex items-center gap-6">
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 dark:text-white uppercase truncate max-w-[150px] sm:max-w-none">
                {getServiceTitle('POS')}
            </h1>
            <div className="hidden lg:flex relative w-80 max-w-full group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
              <input
                placeholder="Search orders, tables..."
                className="w-full h-10 bg-slate-50 dark:bg-white/5 border-none rounded-xl py-1.5 pl-10 pr-4 text-sm focus:ring-1 focus:ring-primary/30 transition-all outline-none"
              />
            </div>
        </div>
        {/* Outlet chip — shows home outlet name + use_case; tap to switch */}
        {outlet && (
          <Link
            href={`/${orgSlug}/auth/select-outlet`}
            className="hidden lg:flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-white/70 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors group"
            title="Switch outlet"
          >
            <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate max-w-30">{outlet.name}</span>
            {outlet.use_case && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {USE_CASE_LABELS[outlet.use_case] ?? outlet.use_case}
              </span>
            )}
          </Link>
        )}
        <OutletFilter className="hidden md:block" />
      </div>

      <div className="flex items-center gap-1 sm:gap-3">
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
                <p className="text-xs font-black text-slate-900 dark:text-white truncate max-w-[120px]">{name}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{role || 'Member'}</p>
              </div>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${profileOpen ? 'rotate-180' : ''}`} />
            </button>
          ) : null}
          {isAuthenticated && profileOpen && (
            <>
              <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setProfileOpen(false)} />
              <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-[1.5rem] p-3 shadow-2xl border border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="mb-2 px-3 py-2">
                  <p className="text-sm font-black text-slate-900 dark:text-white">{name}</p>
                  <p className="text-[10px] text-slate-400 truncate font-bold uppercase tracking-widest mt-0.5">{role || 'Member'}</p>
                </div>
                
                <div className="h-[1px] bg-slate-100 dark:bg-white/5 my-2 mx-1" />

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
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      void logout();
                    }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center transition-colors">
                      <LogOut className="h-4 w-4" />
                    </div>
                    Logout
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
