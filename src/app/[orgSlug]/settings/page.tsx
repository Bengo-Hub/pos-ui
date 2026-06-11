'use client';

import { useState } from 'react';
import {
  ChefHat, Clock, CreditCard, Gift, Key, Layers, Monitor, Percent, Receipt, Truck,
  Settings, ShieldCheck, Table2, Users,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useModuleAccess } from '@/hooks/use-module-access';
import { cn } from '@/lib/utils';

import { GeneralTab } from '@/components/settings/GeneralTab';
import { TaxTab } from '@/components/settings/TaxTab';
import { ReceiptTab } from '@/components/settings/ReceiptTab';
import { ModulesTab } from '@/components/settings/ModulesTab';
import { ShiftsSettingsTab } from '@/components/settings/ShiftsSettingsTab';
import { KDSStationsTab } from '@/components/settings/KDSStationsTab';
import { TablesSettingsTab } from '@/components/settings/TablesSettingsTab';
import { TeamTab } from '@/components/settings/TeamTab';
import { PlatformTab } from '@/components/settings/PlatformTab';
import { LoyaltySettingsTab } from '@/components/settings/LoyaltySettingsTab';
import { PaymentDisplayTab } from '@/components/settings/PaymentDisplayTab';
import { SubscriptionTab } from '@/components/settings/SubscriptionTab';
import { DevicesTab } from '@/components/settings/DevicesTab';
import { CardTerminalTab } from '@/components/settings/CardTerminalTab';
import { ChannelsTab } from '@/components/settings/ChannelsTab';
import { BookingPolicyTab } from '@/components/settings/BookingPolicyTab';

type Tab =
  | 'general'
  | 'tax'
  | 'receipt'
  | 'payment_display'
  | 'card_terminal'
  | 'modules'
  | 'shifts'
  | 'kds_stations'
  | 'tables'
  | 'loyalty'
  | 'channels'
  | 'subscription'
  | 'devices'
  | 'booking_policy'
  | 'platform'
  | 'team';

// requireModule → only shown when the module is enabled (or to superusers).
// requireAdmin  → read-only account views shown to tenant admins/managers (and platform owners).
const ALL_TABS: { id: Tab; label: string; icon: React.ElementType; requireModule?: string; requireAdmin?: boolean; description: string }[] = [
  { id: 'general',          label: 'Outlet Config',      icon: Settings,    description: 'Currency and returns policy' },
  { id: 'tax',              label: 'Tax',                icon: Percent,     description: 'Treasury tax codes (source of truth) and legacy fallback' },
  { id: 'receipt',          label: 'Receipt & Printing', icon: Receipt,     description: 'Receipt format and printer profiles' },
  { id: 'payment_display',  label: 'Payment Display',    icon: CreditCard,  description: 'Paybill, till, and bank details on receipts' },
  { id: 'card_terminal',    label: 'Card Terminal',      icon: CreditCard,  description: 'PDQ / card-terminal mode, approval ref, and integrated terminal' },
  { id: 'modules',          label: 'Modules',            icon: Layers,      description: 'Use case and feature toggles' },
  { id: 'shifts',           label: 'Shifts',             icon: Clock,       description: 'Float rules and shift visibility' },
  { id: 'kds_stations',     label: 'KDS Stations',       icon: ChefHat,     description: 'Kitchen and bar display screens', requireModule: 'kds' },
  { id: 'tables',           label: 'Tables',             icon: Table2,      description: 'Floor plan and table configuration', requireModule: 'tables' },
  { id: 'loyalty',          label: 'Loyalty',            icon: Gift,        description: 'Points, tiers, and earn rates', requireModule: 'loyalty' },
  { id: 'channels',         label: 'Delivery Channels',  icon: Truck,       description: '3rd-party delivery integrations & catalogue sync', requireModule: 'online_orders' },
  { id: 'subscription',     label: 'Subscription',       icon: Key,         description: 'Your POS plan, limits, and features (view only)', requireAdmin: true },
  { id: 'devices',          label: 'Devices',            icon: Monitor,     description: 'POS terminals linked to this outlet (view only)', requireAdmin: true },
  { id: 'booking_policy',   label: 'Booking Policy',     icon: Clock,       description: 'Amendment & cancellation windows and fees for hotel bookings', requireModule: 'hotel' },
  { id: 'team',             label: 'Team',               icon: Users,       description: 'Staff members and roles' },
  { id: 'platform',         label: 'Platform',           icon: ShieldCheck, description: 'Admin and tenant management' },
];

const ADMIN_ROLES = ['admin', 'pos_admin', 'manager', 'store_manager', 'owner', 'super_admin', 'superuser'];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const user = useAuthStore((s) => s.user);
  const { isSuperUser, hasModule } = useModuleAccess();
  const isPlatformOwner = isSuperUser || user?.isPlatformOwner;
  const isAdminOrManager =
    isPlatformOwner || (user?.roles ?? []).some((r) => ADMIN_ROLES.includes(r));

  const visibleTabs = ALL_TABS.filter((t) => {
    if (t.id === 'platform') return isPlatformOwner;
    if (t.requireAdmin) return isAdminOrManager;
    if (t.requireModule) return isSuperUser || hasModule(t.requireModule);
    return true;
  });

  const activeTabDef = visibleTabs.find((t) => t.id === activeTab) ?? visibleTabs[0];

  return (
    <div className="p-4 sm:p-6 xl:p-8 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black tracking-tight">POS Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure outlet behaviour, modules, printers, and integrations.
        </p>
      </div>

      {/* Top-nav tabs — wraps responsively; mirrors the Platform page tab design */}
      <div className="mb-6 flex flex-wrap gap-1 p-1 rounded-lg bg-accent/30 border border-border">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap',
                active
                  ? 'bg-card shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content area — full width now that the nav is on top */}
      <div className="min-w-0 space-y-1">
        {/* Section heading above each tab */}
        <div className="mb-5">
          <h2 className="text-lg font-bold">{activeTabDef?.label}</h2>
          <p className="text-sm text-muted-foreground">{activeTabDef?.description}</p>
        </div>

        {activeTab === 'general'          && <GeneralTab />}
        {activeTab === 'tax'              && <TaxTab />}
        {activeTab === 'receipt'          && <ReceiptTab />}
        {activeTab === 'payment_display'  && <PaymentDisplayTab />}
        {activeTab === 'card_terminal'    && <CardTerminalTab />}
        {activeTab === 'modules'          && <ModulesTab />}
        {activeTab === 'shifts'           && <ShiftsSettingsTab />}
        {activeTab === 'kds_stations'     && <KDSStationsTab />}
        {activeTab === 'tables'           && <TablesSettingsTab />}
        {activeTab === 'loyalty'          && <LoyaltySettingsTab />}
        {activeTab === 'channels'         && <ChannelsTab />}
        {activeTab === 'subscription'     && isAdminOrManager && <SubscriptionTab />}
        {activeTab === 'devices'          && isAdminOrManager && <DevicesTab />}
        {activeTab === 'booking_policy'   && <BookingPolicyTab />}
        {activeTab === 'team'             && <TeamTab />}
        {activeTab === 'platform'         && isPlatformOwner && <PlatformTab />}
      </div>
    </div>
  );
}
