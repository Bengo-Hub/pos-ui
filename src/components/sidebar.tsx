'use client';

import { cn } from '@/lib/utils';
import {
    ClipboardList,
    Grid3x3,
    Key,
    LayoutDashboard,
    Monitor,
    Plus,
    Settings,
    ShoppingCart,
    Wallet,
    X
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const isPlatformOwner = orgSlug === 'codevertex';

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

  const content = (
    <div className="space-y-4 py-4 flex flex-col h-full bg-card border-r border-border min-w-[240px]">
      <div className="px-3 py-2 flex-1">
        <Link href={`/${orgSlug}`} onClick={onClose} className="flex items-center pl-3 mb-14">
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
              onClick={onClose}
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

        {isPlatformOwner && (
          <div className="mt-8">
            <div className="px-3 mb-2 text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
              Platform
            </div>
            <div className="space-y-1">
              {platformRoutes.map((route) => (
                <Link
                  key={route.label}
                  href={route.href}
                  onClick={onClose}
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

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} aria-hidden />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col border-r border-border bg-card transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 lg:min-w-[240px]",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4 lg:hidden">
          <span className="text-sm font-bold text-foreground">Menu</span>
          <button type="button" onClick={onClose} className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{content}</div>
      </aside>
    </>
  );
}
