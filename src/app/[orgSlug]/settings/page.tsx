'use client';

import { useState } from 'react';
import {
  ChefHat, Clock, Gift, Link2, Layers, Receipt,
  Settings, ShieldCheck, Table2, Users,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useModuleAccess } from '@/hooks/use-module-access';

import { GeneralTab } from '@/components/settings/GeneralTab';
import { ReceiptTab } from '@/components/settings/ReceiptTab';
import { ModulesTab } from '@/components/settings/ModulesTab';
import { ShiftsSettingsTab } from '@/components/settings/ShiftsSettingsTab';
import { KDSStationsTab } from '@/components/settings/KDSStationsTab';
import { TablesSettingsTab } from '@/components/settings/TablesSettingsTab';
import { IntegrationsTab } from '@/components/settings/IntegrationsTab';
import { TeamTab } from '@/components/settings/TeamTab';
import { PlatformTab } from '@/components/settings/PlatformTab';
import { LoyaltySettingsTab } from '@/components/settings/LoyaltySettingsTab';

type Tab =
  | 'general'
  | 'receipt'
  | 'modules'
  | 'shifts'
  | 'kds_stations'
  | 'tables'
  | 'integrations'
  | 'loyalty'
  | 'platform'
  | 'team';

const ALL_TABS: { id: Tab; label: string; icon: React.ElementType; requireModule?: string; description: string }[] = [
  { id: 'general',      label: 'Outlet Config',      icon: Settings,   description: 'Currency, tax, and returns policy' },
  { id: 'receipt',      label: 'Receipt & Printing',  icon: Receipt,    description: 'Receipt format and printer profiles' },
  { id: 'modules',      label: 'Modules',             icon: Layers,     description: 'Use case and feature toggles' },
  { id: 'shifts',       label: 'Shifts',              icon: Clock,      description: 'Float rules and shift visibility' },
  { id: 'kds_stations', label: 'KDS Stations',        icon: ChefHat,    description: 'Kitchen and bar display screens', requireModule: 'kds' },
  { id: 'tables',       label: 'Tables',              icon: Table2,     description: 'Floor plan and table configuration', requireModule: 'tables' },
  { id: 'integrations', label: 'Integrations',        icon: Link2,      description: 'Webhooks and third-party services' },
  { id: 'loyalty',      label: 'Loyalty',             icon: Gift,       description: 'Points, tiers, and earn rates', requireModule: 'loyalty' },
  { id: 'team',         label: 'Team',                icon: Users,      description: 'Staff members and roles' },
  { id: 'platform',     label: 'Platform',            icon: ShieldCheck, description: 'Admin and tenant management' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const user = useAuthStore((s) => s.user);
  const { isSuperUser, hasModule } = useModuleAccess();
  const isPlatformOwner = isSuperUser || user?.isPlatformOwner;

  const visibleTabs = ALL_TABS.filter((t) => {
    if (t.id === 'platform') return isPlatformOwner;
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

      {/* Mobile: horizontal scrollable tabs */}
      <div className="md:hidden mb-5 flex gap-1 p-1 rounded-2xl bg-muted/50 border border-border overflow-x-auto scrollbar-hide">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all
                ${active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Desktop: sidebar nav + content */}
      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Sidebar navigation */}
        <nav className="hidden md:block w-52 shrink-0 sticky top-6">
          <div className="bg-card rounded-2xl border border-border p-2 space-y-0.5">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left
                    ${active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Main content area */}
        <div className="flex-1 min-w-0 space-y-1">
          {/* Section heading above each tab */}
          <div className="mb-5">
            <h2 className="text-lg font-bold">{activeTabDef?.label}</h2>
            <p className="text-sm text-muted-foreground">{activeTabDef?.description}</p>
          </div>

          {activeTab === 'general'      && <GeneralTab />}
          {activeTab === 'receipt'      && <ReceiptTab />}
          {activeTab === 'modules'      && <ModulesTab />}
          {activeTab === 'shifts'       && <ShiftsSettingsTab />}
          {activeTab === 'kds_stations' && <KDSStationsTab />}
          {activeTab === 'tables'       && <TablesSettingsTab />}
          {activeTab === 'integrations' && <IntegrationsTab />}
          {activeTab === 'loyalty'      && <LoyaltySettingsTab />}
          {activeTab === 'team'         && <TeamTab />}
          {activeTab === 'platform'     && isPlatformOwner && <PlatformTab />}
        </div>
      </div>
    </div>
  );
}
