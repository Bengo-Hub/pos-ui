'use client';

import { useEffect, useState } from 'react';
import { Bluetooth, Download, HelpCircle, Inbox, Loader2, Lock, Network, Printer, Receipt, Save, Usb, Wifi } from 'lucide-react';

// pos-api base — the print-agent installer download is served by pos-api, not the pos-ui host.
const POS_API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://posapi.codevertexafrica.com';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { usePOSSettings, useUpdatePOSSettings } from '@/hooks/usePOSSettings';
import { ReceiptFormatPicker } from './receipt-format-picker';
import { useAllKDSStations, type KDSStation } from '@/hooks/useKDS';
import { usePermissions } from '@/hooks/usePermissions';
import { useModuleAccess } from '@/hooks/use-module-access';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { useAuthStore } from '@/store/auth';
import { useOutletFilterStore } from '@/store/outlet-filter';
import { P } from '@/lib/rbac/permissions';
import type { PrinterProfile, PrinterConnType } from '@/lib/api/settings';
import {
  discoverPrinters, openCashDrawerProfile, requestUSBPrinter, requestBluetoothPrinter,
  printProfileHtml, agentAvailable, pingNetworkPrinter, fetchTestTicketEscposHex,
  type DrawerKickCode, type DiscoveredDevice,
} from '@/lib/pos/printer-discovery';
import { BILL_PROFILE_ID, WAITER_PROFILE_ID, paperOf, hasRealPrinter, resolveBillProfile } from '@/lib/pos/printer-stations';
import { localAgentPrinters } from '@/lib/pos/print-jobs';
import { PrintAgentCard } from './PrintAgentCard';
import { Toggle, inputClass, labelClass } from './shared';
import { toast } from 'sonner';

// Full supported paper range — thermal roll widths through cut-sheet sizes.
const PAPER_OPTIONS: { value: string; label: string }[] = [
  { value: '58mm', label: '58 mm (thermal)' },
  { value: '76mm', label: '76 mm (thermal / dot-matrix)' },
  { value: '80mm', label: '80 mm (72 mm print)' },
  { value: 'A6', label: 'A6 (105 × 148 mm)' },
  { value: 'A5', label: 'A5 (148 × 210 mm)' },
  { value: 'A4', label: 'A4 (210 × 297 mm)' },
  { value: 'Letter', label: 'Letter (8.5 × 11 in)' },
];

// Connection types; each swaps the fields shown on the card.
const CONN_TYPES: { value: Exclude<PrinterConnType, 'thermal' | 'none'>; label: string; icon: React.ReactNode }[] = [
  { value: 'browser', label: 'Browser dialog', icon: <Printer className="h-3.5 w-3.5" /> },
  { value: 'os', label: 'OS / QZ Tray', icon: <Printer className="h-3.5 w-3.5" /> },
  { value: 'network', label: 'Network (IP)', icon: <Network className="h-3.5 w-3.5" /> },
  { value: 'usb', label: 'USB', icon: <Usb className="h-3.5 w-3.5" /> },
  { value: 'bluetooth', label: 'Bluetooth', icon: <Bluetooth className="h-3.5 w-3.5" /> },
];

const DEFAULT_RECEIPT_FOOTER = 'Thank you for your business!';

/** Effective connection type for the selector (maps legacy/none to a sensible current value). */
function connOf(p: PrinterProfile): Exclude<PrinterConnType, 'thermal' | 'none'> {
  const t = p.printer_type;
  if (t === 'network' || t === 'usb' || t === 'bluetooth' || t === 'os') return t;
  if (t === 'thermal') return 'os';
  if (p.printer_ip) return 'network';
  if (p.printer_name && p.printer_name !== 'browser') return 'os';
  return 'browser';
}

interface PrinterCard {
  id: string;
  label: string;
  desc: string;
  categories?: string[];
  station?: KDSStation;
}

export function ReceiptTab() {
  const { data: settings, isLoading } = usePOSSettings();
  const { data: kdsData } = useAllKDSStations();
  const updateSettings = useUpdatePOSSettings();
  const { can } = usePermissions();
  const { hasModule } = useModuleAccess();
  // Per-station KOT printers only make sense where there's a kitchen display; the waiter copy only
  // where there's table service. Retail/pharmacy print just the customer bill.
  const showKitchenStations = hasModule('kds');
  const showWaiterStation = hasModule('tables');
  const { tenant } = useTenantBranding();
  const authOutlet = useAuthStore((s) => s.outlet);
  const selectedOutlet = useOutletFilterStore((s) => s.selectedOutlet);
  const canEdit = can(P.CONFIG_CHANGE) || can(P.CONFIG_MANAGE);
  const tenantName = tenant?.orgName || tenant?.name || '';
  const defaultHeader = selectedOutlet?.name || authOutlet?.name || tenantName;

  const [form, setForm] = useState({
    receiptHeader: '',
    receiptFooter: '',
    receiptFormat: 'auto',
    showLogoOnReceipt: true,
    showTenantEmailOnReceipt: false,
    showTenantNameOnReceipt: true,
    autoPrintOrder: false,
    autoPrintKitchen: false,
    cashDrawerEnabled: false,
    cashDrawerPrinter: '',
    cashDrawerAutoOpen: true,
    cashDrawerKickCode: 'default',
  });
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);
  const [discovered, setDiscovered] = useState<string[]>([]);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [discoverNotes, setDiscoverNotes] = useState<string[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [showPrinterHelp, setShowPrinterHelp] = useState(false);
  const [testingDrawer, setTestingDrawer] = useState(false);
  const [agentUp, setAgentUp] = useState<boolean | null>(null);
  // Per-card in-flight state for the "Ping printer" button (keyed by profile id).
  const [pingingId, setPingingId] = useState<string | null>(null);

  // Probe the local print agent once so the status pill and setup help reflect reality.
  useEffect(() => { void agentAvailable().then(setAgentUp); }, []);

  // The printers shown: fixed Customer/Bill (+ Waiter where table service) then one per active KDS
  // station — so printers are auto-created from and linked to the live KDS stations, not hardcoded.
  const stations = (kdsData?.data ?? []).filter((s) => s.is_active !== false);
  const printerCards: PrinterCard[] = [
    { id: BILL_PROFILE_ID, label: 'Bill / Customer Receipt', desc: 'Full receipt (prices) printed at point of sale' },
    ...(showWaiterStation ? [{ id: WAITER_PROFILE_ID, label: 'Waiter Copy', desc: 'Order summary for the serving staff' }] : []),
    ...(showKitchenStations
      ? stations.map((s): PrinterCard => ({
          id: s.id,
          label: s.name,
          desc: (s.category_filter?.length ? '' : 'All categories') + ` · ${s.station_type}`,
          categories: s.category_filter,
          station: s,
        }))
      : []),
  ];

  const drawerProfile = (): PrinterProfile | undefined => {
    if (form.cashDrawerPrinter) return { id: 'drawer', label: 'Drawer', printer_type: 'os', printer_name: form.cashDrawerPrinter };
    return profiles.find((p) => p.id === BILL_PROFILE_ID);
  };

  const handleTestDrawer = async () => {
    const profile = drawerProfile();
    if (!profile) {
      toast.info('Assign a drawer printer (or a Bill station printer) and run Detect Printers first.');
      return;
    }
    setTestingDrawer(true);
    try {
      const ok = await openCashDrawerProfile(profile, form.cashDrawerKickCode as DrawerKickCode);
      if (ok) toast.success('Drawer kick sent.');
      else toast.error('Could not reach the drawer. Is QZ Tray / the print agent running with the printer connected?');
    } finally {
      setTestingDrawer(false);
    }
  };

  const handleDetectPrinters = async () => {
    setDiscovering(true);
    try {
      const [res, up, localNames] = await Promise.all([discoverPrinters(), agentAvailable(), localAgentPrinters()]);
      setAgentUp(up);
      // Local-agent OS printers included so a USB profile can be bound to its exact spooler name.
      setDiscovered((prev) => Array.from(new Set([...res.printers, ...localNames, ...prev])));
      setDiscoveredDevices(res.devices ?? []);
      setDiscoverNotes(res.notes ?? (res.note ? [res.note] : []));
      if (res.printers.length) toast.success(`Detected ${res.printers.length} printer(s).`);
      else {
        toast.info('No printers detected — see the setup steps below.');
        setShowPrinterHelp(true);
      }
    } finally {
      setDiscovering(false);
    }
  };

  const handleTestPrint = async (card: PrinterCard) => {
    const p = getProfile(card.id);
    const html = `<div style="font-family:'Courier New',monospace;text-align:center">
      <h3>Test Print</h3><p>${card.label}</p><p>${paperOf(p)}</p>
      <p>${new Date().toLocaleString()}</p></div>`;

    // Every REAL printer (network IP, USB, OS, Bluetooth) tests the SAME way live printing works:
    // server-built ESC/POS bytes dispatched silently via the Local Print Agent (network by ip:port,
    // USB/OS by spooler name — agent >= 1.2.0) or QZ Tray. NEVER the browser print dialog — that's
    // reserved for profiles explicitly set to "Browser dialog".
    if (hasRealPrinter(p)) {
      const escposHex = (await fetchTestTicketEscposHex(card.label, paperOf(p))) ?? undefined;
      const ok = await printProfileHtml(p, `Test — ${card.label}`, html, escposHex, { silent: true });
      if (!ok) {
        toast.error('Could not reach the printer — install/start the Print Agent (or QZ Tray) and check the printer connection.');
        setShowPrinterHelp(true);
        return;
      }
    } else {
      // Browser-dialog profile (or nothing configured yet): the dialog IS the chosen destination.
      await printProfileHtml(p, `Test — ${card.label}`, html);
    }
    // Test print uses the card's CURRENT (possibly unsaved) config; live sale printing reads the
    // SAVED settings. Nudge to Save so "test works but receipts don't print" can't happen.
    const saved = (settings?.printer_profiles ?? []).find((sp) => sp.id === card.id);
    if (JSON.stringify(saved ?? null) !== JSON.stringify(profiles.find((lp) => lp.id === card.id) ?? null)) {
      toast.warning('Test page sent — remember to Save: receipts print with the saved settings, not this unsaved test config.');
    } else {
      toast.success('Test page sent.');
    }
  };

  const handlePing = async (card: PrinterCard) => {
    const p = getProfile(card.id);
    if (!p.printer_ip) { toast.info('Enter the printer IP first.'); return; }
    setPingingId(card.id);
    try {
      const res = await pingNetworkPrinter(p.printer_ip, p.printer_port ?? 9100);
      if (res.ok) toast.success(`Printer reachable at ${p.printer_ip}:${p.printer_port ?? 9100}${res.ms != null ? ` (${res.ms} ms)` : ''}.`);
      else if (res.agentDown) toast.error('Local print agent not running — install & start it to ping network printers.');
      else toast.error(`Could not reach ${p.printer_ip}:${p.printer_port ?? 9100} — ${res.error ?? 'unreachable'}.`);
    } finally {
      setPingingId(null);
    }
  };

  useEffect(() => {
    if (settings) {
      setForm({
        receiptHeader: settings.receipt_header ?? defaultHeader,
        receiptFooter: settings.receipt_footer ?? DEFAULT_RECEIPT_FOOTER,
        receiptFormat: settings.receipt_format || 'auto',
        showLogoOnReceipt: settings.show_logo_on_receipt ?? true,
        showTenantEmailOnReceipt: settings.show_tenant_email_on_receipt ?? false,
        showTenantNameOnReceipt: settings.show_tenant_name_on_receipt ?? true,
        autoPrintOrder: settings.auto_print_order ?? false,
        autoPrintKitchen: settings.auto_print_kitchen ?? false,
        cashDrawerEnabled: settings.cash_drawer_enabled ?? false,
        cashDrawerPrinter: settings.cash_drawer_printer ?? '',
        cashDrawerAutoOpen: settings.cash_drawer_auto_open ?? true,
        cashDrawerKickCode: settings.cash_drawer_kick_code ?? 'default',
      });
      setProfiles(settings.printer_profiles ?? []);
    }
  }, [settings, defaultHeader]);

  const set = (k: keyof typeof form, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const getProfile = (id: string): PrinterProfile => {
    const card = printerCards.find((c) => c.id === id);
    return profiles.find((p) => p.id === id) ?? { id, label: card?.label ?? id, printer_type: 'none' };
  };

  /** Merge a patch into a profile, auto-creating it (with its KDS-station link) on first edit. */
  const patchProfile = (card: PrinterCard, patch: Partial<PrinterProfile>) => {
    setProfiles((prev) => {
      const base: PrinterProfile = prev.find((p) => p.id === card.id) ?? {
        id: card.id,
        label: card.label,
        printer_type: 'none',
        ...(card.station ? { station_id: card.station.id, station_type: card.station.station_type, categories: card.station.category_filter } : {}),
      };
      const next = { ...base, ...patch, label: card.label };
      return prev.some((p) => p.id === card.id) ? prev.map((p) => (p.id === card.id ? next : p)) : [...prev, next];
    });
  };

  // Switching connection type resets the fields that don't apply to the new type.
  const changeConnType = (card: PrinterCard, type: Exclude<PrinterConnType, 'thermal' | 'none'>) => {
    const patch: Partial<PrinterProfile> = { printer_type: type };
    if (type === 'browser') { patch.printer_name = ''; patch.printer_ip = ''; }
    if (type === 'network') { patch.printer_name = ''; patch.printer_port = getProfile(card.id).printer_port ?? 9100; }
    if (type === 'os' || type === 'usb' || type === 'bluetooth') patch.printer_ip = '';
    patchProfile(card, patch);
  };

  const handlePairUSB = async (card: PrinterCard) => {
    const d = await requestUSBPrinter();
    if (d) { patchProfile(card, { printer_type: 'usb', printer_name: d.name }); setDiscovered((prev) => Array.from(new Set([d.name, ...prev]))); toast.success(`Paired USB: ${d.name}`); }
    else toast.info('No USB printer selected (or WebUSB unsupported on this browser).');
  };

  const handlePairBluetooth = async (card: PrinterCard) => {
    const d = await requestBluetoothPrinter();
    if (d) { patchProfile(card, { printer_type: 'bluetooth', printer_name: d.name }); setDiscovered((prev) => Array.from(new Set([d.name, ...prev]))); toast.success(`Paired Bluetooth: ${d.name}`); }
    else toast.info('No Bluetooth printer paired (or Web Bluetooth unsupported on this browser).');
  };

  const handleSave = () => {
    updateSettings.mutate({
      receipt_header: form.receiptHeader || null,
      receipt_footer: form.receiptFooter || null,
      receipt_format: form.receiptFormat || 'auto',
      show_logo_on_receipt: form.showLogoOnReceipt,
      show_tenant_email_on_receipt: form.showTenantEmailOnReceipt,
      show_tenant_name_on_receipt: form.showTenantNameOnReceipt,
      auto_print_order: form.autoPrintOrder,
      auto_print_kitchen: form.autoPrintKitchen,
      cash_drawer_enabled: form.cashDrawerEnabled,
      cash_drawer_printer: form.cashDrawerPrinter || null,
      cash_drawer_auto_open: form.cashDrawerAutoOpen,
      cash_drawer_kick_code: form.cashDrawerKickCode,
      // Keep any station the operator touched: a real printer (same hasRealPrinter predicate the
      // runtime print paths use — save and runtime must never disagree), an explicit connection
      // type choice (including "browser"), or a per-card auto-print flag. Only truly untouched
      // 'none' placeholders are dropped.
      printer_profiles: profiles.filter(
        (p) => hasRealPrinter(p) || p.printer_type !== 'none' || p.auto_print,
      ),
    });
  };

  if (isLoading) {
    return (
      <div className="h-40 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Receipt Content</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <ReceiptFormatPicker
            value={form.receiptFormat}
            options={settings?.available_receipt_formats}
            disabled={!canEdit}
            onChange={(id) => set('receiptFormat', id)}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className={labelClass}>Header Text</label>
              <textarea
                rows={3}
                value={form.receiptHeader}
                onChange={(e) => set('receiptHeader', e.target.value)}
                disabled={!canEdit}
                placeholder="Business name, address…"
                className={`${inputClass} resize-none`}
              />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Footer Text</label>
              <textarea
                rows={3}
                value={form.receiptFooter}
                onChange={(e) => set('receiptFooter', e.target.value)}
                disabled={!canEdit}
                placeholder="Thank you message, motto (e.g. IN GOD WE TRUST)…"
                className={`${inputClass} resize-none`}
              />
              <p className="text-[11px] text-muted-foreground">
                Printed near the bottom of every customer receipt, just above the fine print.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl bg-accent/10 border border-border gap-4">
            <div className="min-w-0">
              <h4 className="text-sm font-bold">Show Business Logo</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Include your logo at the top of generated receipts (on-screen, HTML and PDF). Turn
                off for a text-only header.
              </p>
            </div>
            <Toggle checked={form.showLogoOnReceipt} onChange={(v) => set('showLogoOnReceipt', v)} disabled={!canEdit} />
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl bg-accent/10 border border-border gap-4">
            <div className="min-w-0">
              <h4 className="text-sm font-bold">Show Business Email</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Print your business contact email on receipts. Off by default — turn on to show it.
              </p>
            </div>
            <Toggle
              checked={form.showTenantEmailOnReceipt}
              onChange={(v) => set('showTenantEmailOnReceipt', v)}
              disabled={!canEdit}
            />
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl bg-accent/10 border border-border gap-4">
            <div className="min-w-0">
              <h4 className="text-sm font-bold">Show Business Name on Receipt</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Default: this outlet&apos;s receipts print the TENANT&apos;s name. Turn off on a
                non-HQ/branch outlet (multi-outlet tenants) to print this outlet&apos;s own name
                instead — the HQ/default outlet always shows the tenant name regardless.
              </p>
            </div>
            <Toggle
              checked={form.showTenantNameOnReceipt}
              onChange={(v) => set('showTenantNameOnReceipt', v)}
              disabled={!canEdit}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Printer className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Auto-Print Behavior</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { key: 'autoPrintOrder' as const, label: 'Auto-Print Receipt on Completion', desc: 'Automatically print customer receipt when a sale is completed.' },
              ...(showKitchenStations
                ? [{ key: 'autoPrintKitchen' as const, label: 'Auto-Print Station Tickets', desc: 'Send each KDS station its ticket (on its printer) when an order is created.' }]
                : []),
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between p-4 rounded-xl bg-accent/10 border border-border gap-4">
                <div className="min-w-0">
                  <h4 className="text-sm font-bold">{item.label}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
                <Toggle checked={form[item.key]} onChange={(v) => set(item.key, v)} disabled={!canEdit} />
              </div>
            ))}
          </div>
          {form.autoPrintOrder && !hasRealPrinter(getProfile(BILL_PROFILE_ID)) && (
            <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
              <span className="font-bold">Auto-print is on but no Bill / Customer Receipt printer is set.</span>{' '}
              {hasRealPrinter(resolveBillProfile(profiles))
                ? <>Receipts will fall back to the “{resolveBillProfile(profiles).label}” printer. Assign a printer on the Bill / Customer Receipt card below to control this.</>
                : <>Receipts will NOT print automatically until you assign a printer on the Bill / Customer Receipt card below and Save.</>}
            </div>
          )}
        </CardContent>
      </Card>

      <PrintAgentCard canEdit={canEdit} />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Printer className="h-4 w-4 text-primary" />
              <span className="font-bold text-sm">Order Printing — Station Printers</span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleDetectPrinters}
              disabled={discovering}
              className="gap-2 h-8 text-xs"
            >
              {discovering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
              {discovering ? 'Detecting…' : 'Detect Printers'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Each printer below is linked to a live KDS station (plus the customer bill). When an order is
            routed to a station, its ticket prints on that station&apos;s printer. Pick a connection type
            per printer — the fields change to match.
          </p>
          <div className="mt-1.5 flex items-center gap-2 text-[11px]">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold ${agentUp ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${agentUp ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`} />
              {agentUp == null ? 'Checking print agent…' : agentUp ? 'Local print agent running' : 'Local print agent not detected'}
            </span>
          </div>
          {discoverNotes.length > 0 && (
            <ul className="text-[11px] mt-1.5 rounded-lg bg-accent/30 px-3 py-2 text-muted-foreground space-y-1 list-disc list-inside">
              {discoverNotes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setShowPrinterHelp((v) => !v)}
            className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:underline"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            {showPrinterHelp ? 'Hide setup help' : "Printer not showing? Setup help"}
          </button>
          {showPrinterHelp && (
            <div className="mt-1.5 rounded-lg border border-border bg-background px-3 py-3 text-[11px] text-muted-foreground space-y-2">
              <ol className="list-decimal list-inside space-y-1.5">
                <li>
                  <span className="font-medium text-foreground">Best for network printers: install the Local Print Agent</span> on this
                  terminal. It scans this Wi-Fi/LAN and auto-lists printers, and prints to them by IP — no OS install needed.
                  It installs as a background service that auto-starts on boot.
                  <a
                    className="ml-1.5 inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-primary-foreground font-semibold hover:bg-primary/90"
                    href={`${POS_API_BASE}/api/v1/pos/print-agent/download?os=windows`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download className="h-3 w-3" /> Download Print Agent (Windows)
                  </a>
                </li>
                <li>
                  <span className="font-medium text-foreground">Or add the printer to this computer</span> (Windows → Bluetooth &amp;
                  devices → Printers &amp; scanners → Add device; for network use a Standard TCP/IP port with its static IP), then
                  install &amp; start <a className="text-primary hover:underline" href="https://qz.io/download/" target="_blank" rel="noreferrer">QZ Tray</a> and click Detect Printers.
                </li>
                <li>
                  <span className="font-medium text-foreground">Or just choose “Network (IP)”</span> on a printer below and type its IP
                  and port (9100) — it prints via QZ Tray or the agent with no OS setup.
                </li>
                <li>
                  <span className="font-medium text-foreground">Windows 11:</span> turn off “Windows protected print mode” if a thermal/POS
                  printer won&apos;t appear, then re-add it.
                </li>
              </ol>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {printerCards.length === 0 ? (
            <p className="text-xs text-muted-foreground">No KDS stations configured yet. Add stations under KDS Stations to create their printers here.</p>
          ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {printerCards.map((card) => {
            const p = getProfile(card.id);
            const conn = connOf(p);
            const currentName = p.printer_name ?? '';
            const names = Array.from(new Set([...discovered, ...(currentName && currentName !== 'browser' ? [currentName] : [])]));
            // Detected network printers (from the agent/backend LAN scan) that carry a structured IP.
            const netDevices = discoveredDevices.filter((d) => d.source === 'network' && !!d.ip);
            return (
              <div key={card.id} className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{card.label}</p>
                    <p className="text-xs text-muted-foreground">{card.desc}</p>
                    {card.categories && card.categories.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {card.categories.map((c) => (
                          <span key={c} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground">Auto-print</span>
                    <Toggle checked={p.auto_print ?? false} onChange={(v) => patchProfile(card, { auto_print: v })} disabled={!canEdit} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className={labelClass}>Connection</label>
                    <select
                      value={conn}
                      onChange={(e) => changeConnType(card, e.target.value as Exclude<PrinterConnType, 'thermal' | 'none'>)}
                      disabled={!canEdit}
                      className={inputClass}
                    >
                      {CONN_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className={labelClass}>Paper Size</label>
                    <select
                      value={paperOf(p)}
                      onChange={(e) => patchProfile(card, { paper_size: e.target.value as PrinterProfile['paper_size'] })}
                      disabled={!canEdit}
                      className={inputClass}
                    >
                      {PAPER_OPTIONS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Fields that depend on the connection type. */}
                {conn === 'os' && (
                  <div className="space-y-1">
                    <label className={labelClass}>Printer (from Detect)</label>
                    <select
                      value={currentName || ''}
                      onChange={(e) => patchProfile(card, { printer_name: e.target.value })}
                      disabled={!canEdit}
                      className={inputClass}
                    >
                      <option value="">Select a detected printer…</option>
                      {names.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                )}
                {conn === 'network' && (
                  <div className="space-y-2">
                    {/* Pick a detected network printer to auto-fill its IP + port (from the agent's LAN scan). */}
                    {netDevices.length > 0 && (
                      <div className="space-y-1">
                        <label className={labelClass}>Detected network printers</label>
                        <select
                          value=""
                          disabled={!canEdit}
                          onChange={(e) => {
                            const d = netDevices[Number(e.target.value)];
                            if (d?.ip) patchProfile(card, { printer_ip: d.ip, printer_port: d.port ?? 9100 });
                          }}
                          className={inputClass}
                        >
                          <option value="">Select a detected printer…</option>
                          {netDevices.map((d, i) => (
                            <option key={`${d.ip}:${d.port}:${i}`} value={i}>
                              {d.name}{d.ip ? ` — ${d.ip}:${d.port ?? 9100}` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1">
                      <label className={labelClass}>Printer IP</label>
                      <input
                        value={p.printer_ip ?? ''}
                        onChange={(e) => patchProfile(card, { printer_ip: e.target.value })}
                        disabled={!canEdit}
                        placeholder="192.168.1.100"
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className={labelClass}>Port</label>
                      <input
                        type="number"
                        value={p.printer_port ?? 9100}
                        onChange={(e) => patchProfile(card, { printer_port: parseInt(e.target.value) || 9100 })}
                        disabled={!canEdit}
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                    </div>
                    {/* Confirm the network printer is reachable (TCP connect via the local agent) before
                        printing — no data is sent to the printer. */}
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handlePing(card)}
                        disabled={pingingId === card.id || !p.printer_ip}
                        className="gap-2 h-8 text-xs"
                      >
                        {pingingId === card.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
                        {pingingId === card.id ? 'Pinging…' : 'Ping printer'}
                      </Button>
                      <span className="text-[11px] text-muted-foreground">Checks the printer is on this network.</span>
                    </div>
                  </div>
                )}
                {conn === 'usb' && (
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => handlePairUSB(card)} disabled={!canEdit} className="gap-2 h-8 text-xs">
                      <Usb className="h-3.5 w-3.5" /> {currentName ? 'Re-pair USB' : 'Pair USB'}
                    </Button>
                    {currentName && <span className="text-xs text-muted-foreground truncate">{currentName}</span>}
                  </div>
                )}
                {conn === 'bluetooth' && (
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => handlePairBluetooth(card)} disabled={!canEdit} className="gap-2 h-8 text-xs">
                      <Bluetooth className="h-3.5 w-3.5" /> {currentName ? 'Re-pair Bluetooth' : 'Pair Bluetooth'}
                    </Button>
                    {currentName && <span className="text-xs text-muted-foreground truncate">{currentName}</span>}
                  </div>
                )}

                <div className="flex justify-end">
                  <Button type="button" variant="ghost" onClick={() => handleTestPrint(card)} className="h-7 text-[11px] gap-1.5">
                    <Printer className="h-3 w-3" /> Test print
                  </Button>
                </div>
              </div>
            );
          })}
          </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Cash Drawer</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            The drawer connects to a receipt printer&apos;s RJ11/12 port and is opened by an ESC/POS
            kick pulse sent to that printer. Assign the printer the drawer is wired to.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl bg-accent/10 border border-border gap-4">
            <div className="min-w-0">
              <h4 className="text-sm font-bold">Enable Cash Drawer</h4>
              <p className="text-xs text-muted-foreground mt-0.5">Allow the POS to pop the drawer via the assigned printer.</p>
            </div>
            <Toggle checked={form.cashDrawerEnabled} onChange={(v) => set('cashDrawerEnabled', v)} disabled={!canEdit} />
          </div>

          {form.cashDrawerEnabled && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className={labelClass}>Drawer Printer</label>
                  <select
                    value={form.cashDrawerPrinter || ''}
                    onChange={(e) => set('cashDrawerPrinter', e.target.value)}
                    disabled={!canEdit}
                    className={inputClass}
                  >
                    <option value="">Bill / customer station printer (default)</option>
                    {Array.from(new Set([
                      ...discovered,
                      ...(form.cashDrawerPrinter ? [form.cashDrawerPrinter] : []),
                    ])).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <p className="text-[11px] text-muted-foreground">Run Detect Printers above to populate this list.</p>
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>Kick Pulse</label>
                  <select
                    value={form.cashDrawerKickCode}
                    onChange={(e) => set('cashDrawerKickCode', e.target.value)}
                    disabled={!canEdit}
                    className={inputClass}
                  >
                    <option value="default">Default (pin 2)</option>
                    <option value="pin5">Pin 5</option>
                    <option value="legacy">Legacy (long pulse)</option>
                  </select>
                  <p className="text-[11px] text-muted-foreground">Switch to Pin 5 if the drawer doesn&apos;t open.</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-accent/10 border border-border gap-4">
                <div className="min-w-0">
                  <h4 className="text-sm font-bold">Auto-Open on Sale</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">Automatically pop the drawer when a cash or card sale is settled.</p>
                </div>
                <Toggle checked={form.cashDrawerAutoOpen} onChange={(v) => set('cashDrawerAutoOpen', v)} disabled={!canEdit} />
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleTestDrawer}
                disabled={testingDrawer}
                className="gap-2 h-9 text-xs"
              >
                {testingDrawer ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Inbox className="h-3.5 w-3.5" />}
                {testingDrawer ? 'Opening…' : 'Test — Open Drawer'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {!canEdit && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Lock className="h-3 w-3" /> View only
          </p>
        )}
        <Button
          onClick={handleSave}
          disabled={!canEdit || updateSettings.isPending}
          className="gap-2 px-8 shadow-lg shadow-primary/10"
        >
          {updateSettings.isPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Save className="h-4 w-4" />}
          {updateSettings.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
