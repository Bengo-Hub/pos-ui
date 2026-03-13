'use client';

import { useAuthStore } from '@/store/auth';
import { Bell, ChevronDown, LogOut, Menu, Search, Settings, User } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { ThemeToggle } from './theme-toggle';

import { useTenantBranding } from '@/providers/tenant-branding-provider';

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
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const isAuthenticated = !!user && status === 'authenticated';
  const name = displayName(user);
  const role = user?.roles?.[0];

  return (
    <header className="h-16 border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50 flex items-center justify-between px-6">
      <div className="flex items-center gap-4 flex-1">
        <button type="button" onClick={onMenuClick} className="lg:hidden p-2 rounded-lg hover:bg-accent transition" aria-label="Open menu">
          <Menu className="h-5 w-5 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-4">
            <h1 className="text-lg font-black tracking-tight text-foreground uppercase bg-gradient-to-r from-brand-orange to-brand-gold bg-clip-text text-transparent">
                {getServiceTitle('POS')}
            </h1>
            <div className="relative max-w-xs w-full group hidden lg:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                placeholder="Search orders, tables..."
                className="w-full bg-accent/30 border border-border/50 rounded-lg py-1.5 pl-10 pr-4 text-sm focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button className="relative h-9 w-9 flex items-center justify-center rounded-md hover:bg-accent transition">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-card"></span>
        </button>

        <ThemeToggle />

        <div className="h-8 w-[1px] bg-border mx-1"></div>

        <div className="relative flex items-center gap-3 pl-2" ref={profileRef}>
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => setProfileOpen((v) => !v)}
              className="flex items-center gap-3 rounded-lg hover:bg-accent/50 p-1.5 transition-colors"
              aria-expanded={profileOpen}
              aria-haspopup="true"
              aria-label="Open profile menu"
            >
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold leading-none">{name}</p>
                {role ? <p className="text-xs text-muted-foreground mt-1 capitalize">{role}</p> : null}
              </div>
              <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold border border-border shadow-sm">
                {name[0]?.toUpperCase() ?? <User className="h-5 w-5" />}
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
            </button>
          ) : null}
          {isAuthenticated && profileOpen && (
            <>
              <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setProfileOpen(false)} />
              <div className="absolute right-0 top-full mt-2 z-50 min-w-[180px] py-1 rounded-lg border border-border bg-card shadow-lg">
                <Link
                  href={`/${orgSlug}/settings`}
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    void logout();
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors text-red-600 hover:text-red-700"
                >
                  <LogOut className="h-4 w-4" />
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
