'use client';

import { useState } from 'react';
import {
  ChefHat, Clock, Link2, Layers, Receipt,
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

type Tab =
  | 'general'
  | 'receipt'
  | 'modules'
  | 'shifts'
  | 'kds_stations'
  | 'tables'
  | 'integrations'
  | 'platform'
  | 'team';

const ALL_TABS: { id: Tab; label: string; icon: React.ElementType; requireModule?: string }[] = [
  { id: 'general',      label: 'General',          icon: Settings  },
  { id: 'receipt',      label: 'Receipt & Printing',icon: Receipt   },
  { id: 'modules',      label: 'Modules',           icon: Layers    },
  { id: 'shifts',       label: 'Shifts',            icon: Clock     },
  { id: 'kds_stations', label: 'KDS Stations',      icon: ChefHat,  requireModule: 'kds'    },
  { id: 'tables',       label: 'Tables',            icon: Table2,   requireModule: 'tables' },
  { id: 'integrations', label: 'Integrations',      icon: Link2     },
  { id: 'team',         label: 'Team',              icon: Users     },
  { id: 'platform',     label: 'Platform',          icon: ShieldCheck },
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

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">POS Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage receipt format, printer, modules, and integrations.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-2xl bg-muted/50 border border-border overflow-x-auto scrollbar-hide">
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

      {/* Tab content */}
      <div>
        {activeTab === 'general'      && <GeneralTab />}
        {activeTab === 'receipt'      && <ReceiptTab />}
        {activeTab === 'modules'      && <ModulesTab />}
        {activeTab === 'shifts'       && <ShiftsSettingsTab />}
        {activeTab === 'kds_stations' && <KDSStationsTab />}
        {activeTab === 'tables'       && <TablesSettingsTab />}
        {activeTab === 'integrations' && <IntegrationsTab />}
        {activeTab === 'team'         && <TeamTab />}
        {activeTab === 'platform'     && isPlatformOwner && <PlatformTab />}
      </div>
    </div>
  );
}
