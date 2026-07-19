'use client';

import { useState } from 'react';
import {
  ChefHat, Clock, CreditCard, DatabaseBackup, Gift, Key, Layers, Monitor, Percent, Receipt, Truck,
  Settings, ShieldCheck, Table2, Users, Hash,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useModuleAccess } from '@/hooks/use-module-access';
import { usePermissions } from '@/hooks/usePermissions';
import { P } from '@/lib/rbac/permissions';
import { PageGuard } from '@/components/auth/page-guard';
import { cn } from '@/lib/utils';

import { GeneralTab } from '@/components/settings/GeneralTab';
import { DisplayTab } from '@/components/settings/DisplayTab';
import { TaxTab } from '@/components/settings/TaxTab';
import { ReceiptTab } from '@/components/settings/ReceiptTab';
import { DocumentNumberingTab } from '@/components/settings/DocumentNumberingTab';
import { ModulesTab } from '@/components/settings/ModulesTab';
import { ShiftsSettingsTab } from '@/components/settings/ShiftsSettingsTab';
import { KDSStationsTab } from '@/components/settings/KDSStationsTab';
import { TablesSettingsTab } from '@/components/settings/TablesSettingsTab';
import { TeamTab } from '@/components/settings/TeamTab';
import { AuditTab } from '@/components/settings/AuditTab';
import { PlatformTab } from '@/components/settings/PlatformTab';
import { LoyaltySettingsTab } from '@/components/settings/LoyaltySettingsTab';
import { PaymentDisplayTab } from '@/components/settings/PaymentDisplayTab';
import { SubscriptionTab } from '@/components/settings/SubscriptionTab';
import { DevicesTab } from '@/components/settings/DevicesTab';
import { CardTerminalTab } from '@/components/settings/CardTerminalTab';
import { ChannelsTab } from '@/components/settings/ChannelsTab';
import { BookingPolicyTab } from '@/components/settings/BookingPolicyTab';
import { BackupsTab } from '@/components/settings/BackupsTab';
import { CashierPolicyTab } from '@/components/settings/CashierPolicyTab';

type Tab =
  | 'general'
  | 'display'
  | 'tax'
  | 'receipt'
  | 'document_numbering'
  | 'payment_display'
  | 'card_terminal'
  | 'cashier_policy'
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
  | 'team'
  | 'audit'
  | 'backups';

// Permission groups for settings surfaces. Config screens require a config permission;
// the Team tab requires a users permission. Admins (wildcard) and managers (pos.config.* /
// pos.users.*) satisfy these; a role without them is blocked — the tab hides AND its content
// no longer renders, so RBAC is enforced by permission rather than by a role-name list.
const CONFIG_PERMS = [P.CONFIG_VIEW, P.CONFIG_CHANGE, P.CONFIG_MANAGE];
const TEAM_PERMS = [P.USERS_VIEW, P.USERS_MANAGE];
const AUDIT_PERMS = [P.CONFIG_MANAGE, P.REPORTS_VIEW, P.REPORTS_MANAGE];

// Section labels group the tabs into scannable categories. SECTION_ORDER controls render order.
// "General & Localization" + "Sales & Payments" + "Team & Security" are SHARED across every use
// case; "Use-Case Modules" holds the tabs that only surface for a matching outlet use case
// (KDS/Tables/Loyalty/Booking/Channels are already requireModule-gated); "Platform" is owner-only.
type SettingsSection =
  | 'General & Localization'
  | 'Sales & Payments'
  | 'Use-Case Modules'
  | 'Team & Security'
  | 'Platform';

const SECTION_ORDER: SettingsSection[] = [
  'General & Localization',
  'Sales & Payments',
  'Use-Case Modules',
  'Team & Security',
  'Platform',
];

// requireModule    → only shown when the module is enabled (or to superusers).
// requirePermission → only shown when the caller holds one of the listed permissions.
const ALL_TABS: { id: Tab; label: string; icon: React.ElementType; group: SettingsSection; requireModule?: string; requirePermission?: string[]; description: string }[] = [
  // General & Localization (shared)
  { id: 'general',          label: 'Outlet Config',      icon: Settings,    group: 'General & Localization', requirePermission: CONFIG_PERMS, description: 'Currency and returns policy' },
  { id: 'display',          label: 'Display',            icon: Monitor,     group: 'General & Localization', requirePermission: CONFIG_PERMS, description: 'Idle-screen screensavers (up to 3, rotating slideshow)' },
  { id: 'tax',              label: 'Tax',                icon: Percent,     group: 'General & Localization', requirePermission: CONFIG_PERMS, description: 'Treasury tax codes (source of truth) and legacy fallback' },
  // Sales & Payments (shared)
  { id: 'cashier_policy',   label: 'Cashier & Terminal', icon: Users,       group: 'Sales & Payments', requirePermission: CONFIG_PERMS, description: 'Sales visibility, auto-logout, and the hospitality-cashier menu surface (per outlet)' },
  { id: 'receipt',          label: 'Receipt & Printing', icon: Receipt,     group: 'Sales & Payments', requirePermission: CONFIG_PERMS, description: 'Receipt format and printer profiles' },
  { id: 'document_numbering', label: 'Document Numbering', icon: Hash,      group: 'Sales & Payments', requirePermission: CONFIG_PERMS, description: 'Numeric or prefixed order, receipt, return, reversal & repair numbers' },
  { id: 'payment_display',  label: 'Payment Display',    icon: CreditCard,  group: 'Sales & Payments', requirePermission: CONFIG_PERMS, description: 'Paybill, till, and bank details on receipts' },
  { id: 'card_terminal',    label: 'Card Terminal',      icon: CreditCard,  group: 'Sales & Payments', requirePermission: CONFIG_PERMS, description: 'PDQ / card-terminal mode, approval ref, and integrated terminal' },
  // Use-Case Modules (surfaced per outlet use case)
  { id: 'modules',          label: 'Modules',            icon: Layers,      group: 'Use-Case Modules', requirePermission: CONFIG_PERMS, description: 'Use case and feature toggles' },
  { id: 'shifts',           label: 'Shifts',             icon: Clock,       group: 'Use-Case Modules', requirePermission: CONFIG_PERMS, description: 'Float rules and shift visibility' },
  { id: 'kds_stations',     label: 'KDS Stations',       icon: ChefHat,     group: 'Use-Case Modules', requireModule: 'kds', requirePermission: CONFIG_PERMS, description: 'Kitchen and bar display screens' },
  { id: 'tables',           label: 'Tables',             icon: Table2,      group: 'Use-Case Modules', requireModule: 'tables', requirePermission: CONFIG_PERMS, description: 'Floor plan and table configuration' },
  { id: 'loyalty',          label: 'Loyalty',            icon: Gift,        group: 'Use-Case Modules', requireModule: 'loyalty', requirePermission: CONFIG_PERMS, description: 'Points, tiers, and earn rates' },
  { id: 'channels',         label: 'Delivery Channels',  icon: Truck,       group: 'Use-Case Modules', requireModule: 'online_orders', requirePermission: CONFIG_PERMS, description: '3rd-party delivery integrations & catalogue sync' },
  { id: 'booking_policy',   label: 'Booking Policy',     icon: Clock,       group: 'Use-Case Modules', requireModule: 'hotel', requirePermission: CONFIG_PERMS, description: 'Amendment & cancellation windows and fees for hotel bookings' },
  // Team & Security (shared)
  { id: 'team',             label: 'Team',               icon: Users,       group: 'Team & Security', requirePermission: TEAM_PERMS, description: 'Staff members, roles, and permissions' },
  { id: 'audit',            label: 'Loss Prevention',    icon: ShieldCheck, group: 'Team & Security', requirePermission: AUDIT_PERMS, description: 'Audit trail + per-cashier exception report' },
  { id: 'backups',          label: 'Backups',            icon: DatabaseBackup, group: 'Team & Security', requirePermission: CONFIG_PERMS, description: 'Opt in to daily automatic backups and set retention' },
  // Platform (owner-only) + account
  { id: 'subscription',     label: 'Subscription',       icon: Key,         group: 'Platform', requirePermission: CONFIG_PERMS, description: 'Your POS plan, limits, and features (view only)' },
  { id: 'devices',          label: 'Devices',            icon: Monitor,     group: 'Platform', requirePermission: CONFIG_PERMS, description: 'POS terminals linked to this outlet (view only)' },
  { id: 'platform',         label: 'Platform',           icon: ShieldCheck, group: 'Platform', description: 'Admin and tenant management' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const user = useAuthStore((s) => s.user);
  const { isSuperUser, hasModule } = useModuleAccess();
  const { canAny } = usePermissions();
  const isPlatformOwner = isSuperUser || user?.isPlatformOwner;

  const visibleTabs = ALL_TABS.filter((t) => {
    if (t.id === 'platform') return isPlatformOwner;
    if (t.requireModule && !(isSuperUser || hasModule(t.requireModule))) return false;
    if (t.requirePermission && !canAny(t.requirePermission)) return false;
    return true;
  });
  const canTab = (id: Tab) => visibleTabs.some((t) => t.id === id);

  const activeTabDef = visibleTabs.find((t) => t.id === activeTab) ?? visibleTabs[0];

  return (
    <PageGuard moduleKey="settings" permission={[...CONFIG_PERMS, ...TEAM_PERMS, ...AUDIT_PERMS]}>
    <div className="p-4 sm:p-6 xl:p-8 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black tracking-tight">POS Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure outlet behaviour, modules, printers, and integrations.
        </p>
      </div>

      {/* Top-nav tabs, grouped into labeled sections. Each section renders only when it has at
          least one visible tab (so a use case without any use-case modules shows no empty group). */}
      <div className="mb-6 flex flex-col gap-3">
        {SECTION_ORDER.map((section) => {
          const tabs = visibleTabs.filter((t) => t.group === section);
          if (tabs.length === 0) return null;
          return (
            <div key={section} className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-1">
                {section}
              </span>
              <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-accent/30 border border-border">
                {tabs.map((tab) => {
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
            </div>
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
        {activeTab === 'display'          && <DisplayTab />}
        {activeTab === 'tax'              && <TaxTab />}
        {activeTab === 'receipt'          && <ReceiptTab />}
        {activeTab === 'document_numbering' && <DocumentNumberingTab />}
        {activeTab === 'payment_display'  && <PaymentDisplayTab />}
        {activeTab === 'card_terminal'    && <CardTerminalTab />}
        {activeTab === 'cashier_policy'   && <CashierPolicyTab />}
        {activeTab === 'modules'          && <ModulesTab />}
        {activeTab === 'shifts'           && <ShiftsSettingsTab />}
        {activeTab === 'kds_stations'     && <KDSStationsTab />}
        {activeTab === 'tables'           && <TablesSettingsTab />}
        {activeTab === 'loyalty'          && <LoyaltySettingsTab />}
        {activeTab === 'channels'         && <ChannelsTab />}
        {activeTab === 'subscription'     && canTab('subscription') && <SubscriptionTab />}
        {activeTab === 'devices'          && canTab('devices') && <DevicesTab />}
        {activeTab === 'booking_policy'   && <BookingPolicyTab />}
        {activeTab === 'team'             && canTab('team') && <TeamTab />}
        {activeTab === 'audit'            && canTab('audit') && <AuditTab />}
        {activeTab === 'backups'          && canTab('backups') && <BackupsTab />}
        {activeTab === 'platform'         && isPlatformOwner && <PlatformTab />}
      </div>
    </div>
    </PageGuard>
  );
}
