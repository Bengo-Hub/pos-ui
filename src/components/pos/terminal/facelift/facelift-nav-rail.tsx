'use client';

/**
 * FaceliftNavRail — left icon nav rail of the hospitality/QSR facelift.
 *
 * Brand logo + user name & role at the top; icon nav buttons (Home, Order[active], Menu, Wallet,
 * History, Promos, Bills, Settings); a dark/light toggle pill at the bottom. Nav targets are the
 * real pos-ui routes (so no workflow is lost) and each respects the orgSlug prefix. Theme uses the
 * app's next-themes provider (default stays light per frontends-default-light-theme).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useTerminal } from '@/components/pos/terminal/terminal-context';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { cn } from '@/lib/utils';
import {
  ClipboardList, Gift, History, Home, Moon, Receipt, Settings, ShoppingCart, Sun, Wallet,
} from 'lucide-react';

interface RailItem {
  label: string;
  icon: React.ElementType;
  href: string;
  /** Mark the Order/terminal entry as the active surface. */
  current?: boolean;
}

export function FaceliftNavRail() {
  const t = useTerminal();
  const pathname = usePathname();
  const { tenant } = useTenantBranding();
  const { theme, setTheme } = useTheme();
  const slug = t.orgSlug;

  const role = (t.user?.roles ?? [])[0];
  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Staff';
  const name = t.user?.fullName || tenant?.orgName || slug;
  const initial = (name?.[0] ?? '?').toUpperCase();

  const items: RailItem[] = [
    { label: 'Home', icon: Home, href: `/${slug}/dashboard` },
    { label: 'Order', icon: ShoppingCart, href: `/${slug}/order`, current: true },
    { label: 'Menu', icon: ClipboardList, href: `/${slug}/sell/add` },
    { label: 'Wallet', icon: Wallet, href: `/${slug}/drawer` },
    { label: 'History', icon: History, href: `/${slug}/orders` },
    { label: 'Promos', icon: Gift, href: `/${slug}/loyalty` },
    { label: 'Bills', icon: Receipt, href: `/${slug}/sell/drafts` },
    { label: 'Settings', icon: Settings, href: `/${slug}/settings` },
  ];

  return (
    <div className="hidden md:flex flex-col items-center w-18 shrink-0 bg-sidebar border-r border-sidebar-border py-3 gap-3">
      {/* Brand mark */}
      <Link href={`/${slug}/dashboard`} className="shrink-0">
        {tenant?.logoUrl ? (
          <div className="h-11 w-11 rounded-2xl overflow-hidden border border-sidebar-border bg-card flex items-center justify-center">
            <img src={tenant.logoUrl} alt={tenant?.orgName ?? slug} className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="h-11 w-11 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
            <span className="text-sm font-black text-primary-foreground">{(tenant?.orgName ?? slug).slice(0, 2).toUpperCase()}</span>
          </div>
        )}
      </Link>

      {/* User chip */}
      <div className="flex flex-col items-center gap-1 px-1">
        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
          <span className="text-xs font-bold text-primary">{initial}</span>
        </div>
        <span className="text-[9px] font-semibold text-sidebar-foreground/70 text-center leading-tight max-w-[64px] truncate" title={name}>
          {name}
        </span>
        <span className="text-[8px] uppercase tracking-wide text-sidebar-foreground/40">{roleLabel}</span>
      </div>

      <div className="h-px w-8 bg-sidebar-border" />

      {/* Nav buttons */}
      <nav className="flex-1 flex flex-col items-center gap-1.5 overflow-y-auto scrollbar-hide w-full px-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.current || pathname === item.href;
          return (
            <Link
              key={item.label}
              href={item.href}
              title={item.label}
              className={cn(
                'group flex flex-col items-center gap-0.5 w-full py-2 rounded-2xl transition-colors',
                active
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                  : 'text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-foreground/8',
              )}
            >
              <Icon className={cn('h-5 w-5 transition-transform', !active && 'group-hover:scale-110')} />
              <span className="text-[9px] font-semibold">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Dark/light toggle pill */}
      <button
        type="button"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        title="Toggle theme"
        className="shrink-0 flex flex-col items-center gap-1 rounded-full bg-sidebar-foreground/8 p-1.5 hover:bg-sidebar-foreground/14 transition-colors"
        aria-label="Toggle dark/light mode"
      >
        <span className={cn('h-7 w-7 rounded-full flex items-center justify-center transition-colors', theme !== 'dark' ? 'bg-card text-amber-500 shadow' : 'text-sidebar-foreground/40')}>
          <Sun className="h-4 w-4" />
        </span>
        <span className={cn('h-7 w-7 rounded-full flex items-center justify-center transition-colors', theme === 'dark' ? 'bg-card text-blue-400 shadow' : 'text-sidebar-foreground/40')}>
          <Moon className="h-4 w-4" />
        </span>
      </button>
    </div>
  );
}
