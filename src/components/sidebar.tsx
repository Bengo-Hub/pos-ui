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
    X,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useTenantBranding } from '@/providers/tenant-branding-provider';

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const isPlatformOwner = orgSlug === 'codevertex';
  const { tenant } = useTenantBranding();

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
    <div className="space-y-4 py-4 flex flex-col h-full bg-brand-dark text-brand-light border-r border-white/10 min-w-[240px]">
      <div className="px-3 py-2 flex-1">
        <Link href={`/${orgSlug}`} onClick={onClose} className="flex items-center pl-6 mb-14">
          {tenant?.logoUrl ? (
            <img src={tenant.logoUrl} alt={tenant.name} className="h-10 w-auto object-contain" />
          ) : (
            <div className="w-10 h-10 bg-brand-orange rounded-xl flex items-center justify-center shadow-glow-orange">
              <ShoppingCart className="text-white h-6 w-6" />
            </div>
          )}
        </Link>
        <div className="space-y-1">
          <div className="px-6 pb-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-beige opacity-50">
              Operations
            </p>
          </div>
          {routes.map((route) => {
            const Icon = route.icon;
            return (
              <Link
                key={route.href}
                href={route.href}
                onClick={onClose}
                className={cn(
                  "group flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-300",
                  route.active 
                    ? "bg-brand-orange text-white shadow-glow-orange" 
                    : "opacity-70 hover:opacity-100 hover:bg-white/5"
                )}
              >
                <Icon className={cn("h-5 w-5", route.active ? "text-white" : "text-brand-beige")} />
                <span className="font-bold tracking-tight">{route.label}</span>
              </Link>
            );
          })}
        </div>

        {isPlatformOwner && (
          <div className="mt-8 pt-8 border-t border-white/10">
            <div className="px-6 mb-4 text-[10px] text-brand-beige uppercase tracking-[0.2em] font-black opacity-50">
              Platform
            </div>
            <div className="space-y-1">
              {platformRoutes.map((route) => {
                const Icon = route.icon;
                return (
                  <Link
                    key={route.label}
                    href={route.href}
                    onClick={onClose}
                    className={cn(
                        "group flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-300",
                        route.active 
                            ? "bg-brand-orange text-white shadow-glow-orange" 
                            : "opacity-70 hover:opacity-100 hover:bg-white/5"
                    )}
                  >
                    <Icon className={cn("h-5 w-5", route.active ? "text-white" : "text-brand-beige")} />
                    <span className="font-bold tracking-tight">{route.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="px-6 py-6 border-t border-white/10 mt-auto">
        <div className="flex items-center gap-4 px-6 py-4 opacity-70">
          <div className="w-8 h-8 rounded-xl bg-brand-orange/20 flex items-center justify-center text-xs font-black text-brand-orange uppercase">
            {tenant?.name?.[0] || orgSlug?.[0]}
          </div>
          <span className="font-bold tracking-tight truncate flex-1 uppercase text-xs opacity-70">{tenant?.name || orgSlug}</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={onClose} aria-hidden />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col transition-transform duration-300 lg:static lg:z-auto lg:translate-x-0 lg:min-w-[240px]",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4 lg:hidden bg-brand-dark">
          <span className="text-sm font-bold text-brand-light">Menu</span>
          <button type="button" onClick={onClose} className="inline-flex size-9 items-center justify-center rounded-md text-brand-beige hover:bg-white/5 hover:text-white" aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{content}</div>
      </aside>
    </>
  );
}
