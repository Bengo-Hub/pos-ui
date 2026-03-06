'use client';

import { useMe } from '@/hooks/useMe';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import {
  ClipboardList,
  Grid3x3,
  Key,
  LayoutDashboard,
  Monitor,
  Plus,
  Settings,
  ShoppingCart,
  Wallet
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

export function Sidebar() {
  const pathname = usePathname();
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const session = useAuthStore((s) => s.session);
  const { hasRole } = useMe(!!session);
  const isSuperAdmin = hasRole('super_admin');

  const routes = [
    {
      label: 'Dashboard',
      icon: LayoutDashboard,
      href: `/${orgSlug}`,
      active: pathname === `/${orgSlug}`,
    },
    {
      label: 'New Order',
      icon: Plus,
      href: `/${orgSlug}/order`,
      active: pathname.startsWith(`/${orgSlug}/order`) && !pathname.startsWith(`/${orgSlug}/orders`),
    },
    {
      label: 'Orders',
      icon: ClipboardList,
      href: `/${orgSlug}/orders`,
      active: pathname.startsWith(`/${orgSlug}/orders`),
    },
    {
      label: 'Tables',
      icon: Grid3x3,
      href: `/${orgSlug}/tables`,
      active: pathname.startsWith(`/${orgSlug}/tables`),
    },
    {
      label: 'Cash Drawer',
      icon: Wallet,
      href: `/${orgSlug}/drawer`,
      active: pathname.startsWith(`/${orgSlug}/drawer`),
    },
    {
      label: 'Settings',
      icon: Settings,
      href: `/${orgSlug}/settings`,
      active: pathname.startsWith(`/${orgSlug}/settings`),
    },
  ];

  const platformRoutes = [
    {
      label: 'Devices',
      icon: Monitor,
      href: `/${orgSlug}/platform`,
      active: pathname === `/${orgSlug}/platform`,
    },
    {
      label: 'Licenses',
      icon: Key,
      href: `/${orgSlug}/platform?tab=licenses`,
      active: false,
    },
  ];

  return (
    <div className="space-y-4 py-4 flex flex-col h-full bg-card border-r border-border min-w-[240px]">
      <div className="px-3 py-2 flex-1">
        <Link href={`/${orgSlug}`} className="flex items-center pl-3 mb-14">
          <div className="relative w-8 h-8 mr-3 bg-primary rounded-lg flex items-center justify-center">
            <ShoppingCart className="text-primary-foreground h-5 w-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">POS</h1>
        </Link>
        <div className="space-y-1">
          {routes.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className={cn(
                "text-sm group flex p-3 w-full justify-start font-medium cursor-pointer hover:bg-accent/50 rounded-lg transition",
                route.active ? "bg-accent text-foreground" : "text-muted-foreground"
              )}
            >
              <div className="flex items-center flex-1">
                <route.icon className={cn("h-5 w-5 mr-3", route.active ? "text-primary" : "text-muted-foreground")} />
                {route.label}
              </div>
            </Link>
          ))}
        </div>

        {isSuperAdmin && (
          <div className="mt-8">
            <div className="px-3 mb-2 text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
              Platform
            </div>
            <div className="space-y-1">
              {platformRoutes.map((route) => (
                <Link
                  key={route.label}
                  href={route.href}
                  className={cn(
                    "text-sm group flex p-3 w-full justify-start font-medium cursor-pointer hover:bg-accent/50 rounded-lg transition",
                    route.active ? "bg-accent text-foreground" : "text-muted-foreground"
                  )}
                >
                  <div className="flex items-center flex-1">
                    <route.icon className={cn("h-5 w-5 mr-3", route.active ? "text-primary" : "text-muted-foreground")} />
                    {route.label}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-border">
        <div className="p-3 text-xs text-muted-foreground uppercase tracking-widest font-semibold">
          Organization
        </div>
        <div className="flex items-center px-3 py-2 gap-3 text-sm font-medium">
          <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary capitalize">
            {orgSlug?.[0]}
          </div>
          <span className="capitalize">{orgSlug?.replace('-', ' ')}</span>
        </div>
      </div>
    </div>
  );
}
