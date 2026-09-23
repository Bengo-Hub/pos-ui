'use client';

import { useModuleAccess } from '@/hooks/use-module-access';
import { useAuthStore } from '@/store/auth';
import { useParams } from 'next/navigation';
import {
  AdminDashboard,
  BarDashboard,
  CashierDashboard,
  HospitalityDashboard,
  KitchenDashboard,
  QuickServiceDashboard,
  ReceptionistDashboard,
  RetailDashboard,
  ServicesDashboard,
  WaiterDashboard,
} from '@/components/dashboard/role-dashboards';

function hasRole(roles: string[], ...check: string[]): boolean {
  return check.some((r) => roles.includes(r));
}

export default function DashboardPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const user = useAuthStore((s) => s.user);
  const { isSuperUser, isServices, isRetail, isQuickService, isHospitality, hotelModuleEnabled } = useModuleAccess();
  const roles = user?.roles ?? [];

  const primaryRole =
    isSuperUser || hasRole(roles, 'admin', 'pos_admin', 'superuser', 'super_admin')
      ? 'admin'
      : hasRole(roles, 'store_manager', 'manager')
      ? 'manager'
      : hasRole(roles, 'receptionist')
      ? 'receptionist'
      : hasRole(roles, 'cashier')
      ? 'cashier'
      : hasRole(roles, 'waiter')
      ? 'waiter'
      : hasRole(roles, 'kitchen')
      ? 'kitchen'
      : hasRole(roles, 'bar')
      ? 'bar'
      : 'cashier';

  switch (primaryRole) {
    case 'admin':
    case 'manager':
      if (isServices)     return <ServicesDashboard orgSlug={orgSlug} />;
      if (isRetail)       return <RetailDashboard orgSlug={orgSlug} />;
      if (isQuickService) return <QuickServiceDashboard orgSlug={orgSlug} />;
      // Room/accommodation KPIs only belong on the main dashboard once this outlet actually runs
      // the hotel module — a hospitality outlet that's restaurant/bar/cafe-only (hotel module never
      // turned on) gets the generic overview instead, same as any other non-accommodation business.
      // If the hotel module is later enabled, the main dashboard automatically upgrades to the
      // combined accommodation + F&B overview — the room-only "Hotel Overview" screen (its own
      // status/quick-links page) lives at /hotel regardless, gated by the hotel module itself.
      if (isHospitality && hotelModuleEnabled) return <HospitalityDashboard orgSlug={orgSlug} />;
      return <AdminDashboard orgSlug={orgSlug} />;
    case 'receptionist':
      return <ReceptionistDashboard orgSlug={orgSlug} />;
    case 'cashier':
      return <CashierDashboard orgSlug={orgSlug} />;
    case 'waiter':
      return <WaiterDashboard orgSlug={orgSlug} />;
    case 'kitchen':
      return <KitchenDashboard orgSlug={orgSlug} />;
    case 'bar':
      return <BarDashboard orgSlug={orgSlug} />;
    default:
      return <CashierDashboard orgSlug={orgSlug} />;
  }
}
