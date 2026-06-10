'use client';

import { useEffect, useState } from 'react';
import { Loader2, Lock, Printer, Receipt, Save } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { usePOSSettings, useUpdatePOSSettings } from '@/hooks/usePOSSettings';
import { usePermissions } from '@/hooks/usePermissions';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import { useAuthStore } from '@/store/auth';
import { useOutletFilterStore } from '@/store/outlet-filter';
import { P } from '@/lib/rbac/permissions';
import type { PrinterProfile } from '@/lib/api/settings';
import { discoverPrinters } from '@/lib/pos/printer-discovery';
import { Toggle, inputClass, labelClass } from './shared';
import { toast } from 'sonner';

const RECEIPT_PRINTER_ROLES = [
  { id: 'customer', label: 'Bill / Customer Receipt', desc: 'Full receipt (prices) printed at point of sale' },
  { id: 'kitchen', label: 'KOT Kitchen Printer', desc: 'Kitchen ticket (food, no prices) on order open' },
  { id: 'bar', label: 'KOT Bar Printer', desc: 'Bar ticket for alcohol & cold drinks' },
  { id: 'coffee', label: 'KOT Coffee Shop', desc: 'Dedicated coffee/tea ticket (else folds into Kitchen)' },
  { id: 'waiter', label: 'Waiter Copy', desc: 'Order summary for the serving staff' },
];

const PAPER_OPTIONS = ['80mm', '58mm'];

// Sensible default footer when the tenant hasn't set one yet.
const DEFAULT_RECEIPT_FOOTER = 'Thank you for your business!';

export function ReceiptTab() {
  const { data: settings, isLoading } = usePOSSettings();
  const updateSettings = useUpdatePOSSettings();
  const { can } = usePermissions();
  const { tenant } = useTenantBranding();
  const authOutlet = useAuthStore((s) => s.outlet);
  const selectedOutlet = useOutletFilterStore((s) => s.selectedOutlet);
  const canEdit = can(P.CONFIG_CHANGE) || can(P.CONFIG_MANAGE);
  const tenantName = tenant?.orgName || tenant?.name || '';
  // Prefer the currently-active outlet's name (HQ drill-down aware), falling back to the
  // tenant/business name. Receipts are per-outlet, so the outlet name is the better header default.
  const defaultHeader = selectedOutlet?.name || authOutlet?.name || tenantName;

  const [form, setForm] = useState({
    receiptHeader: '',
    receiptFooter: '',
    autoPrintOrder: false,
    autoPrintKitchen: false,
  });
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);
  // Discovered printers (from the QZ Tray bridge, when available) for the printer-name dropdowns.
  const [discovered, setDiscovered] = useState<string[]>([]);
  const [discoverNote, setDiscoverNote] = useState('');
  const [discovering, setDiscovering] = useState(false);

  const handleDetectPrinters = async () => {
    setDiscovering(true);
    try {
      const res = await discoverPrinters();
      setDiscovered(res.printers);
      setDiscoverNote(res.note ?? (res.source === 'qz' ? `Found ${res.printers.length} printer(s) via QZ Tray.` : ''));
      if (res.source === 'qz' && res.printers.length) toast.success(`Detected ${res.printers.length} printer(s).`);
      else if (res.source !== 'qz') toast.info('No print bridge detected — using browser print.');
    } finally {
      setDiscovering(false);
    }
  };

  useEffect(() => {
    if (settings) {
      // Prefill sensible defaults when the outlet hasn't configured the text yet:
      // header → current outlet name (or business name), footer → a friendly default. These become
      // editable form values so the operator sees them and persists them on Save.
      setForm({
        receiptHeader: settings.receipt_header ?? defaultHeader,
        receiptFooter: settings.receipt_footer ?? DEFAULT_RECEIPT_FOOTER,
        autoPrintOrder: settings.auto_print_order ?? false,
        autoPrintKitchen: settings.auto_print_kitchen ?? false,
      });
      setProfiles(settings.printer_profiles ?? []);
    }
  }, [settings, defaultHeader]);

  const set = (k: keyof typeof form, v: unknown) =>
    setForm((f) => ({ ...f, [k]: v }));

  const setProfile = (id: string, field: keyof PrinterProfile, value: unknown) => {
    setProfiles((prev) => {
      const existing = prev.find((p) => p.id === id);
      if (existing) return prev.map((p) => (p.id === id ? { ...p, [field]: value } : p));
      const role = RECEIPT_PRINTER_ROLES.find((r) => r.id === id);
      return [...prev, { id, label: role?.label ?? id, printer_type: 'none', [field]: value } as PrinterProfile];
    });
  };

  const getProfile = (id: string): PrinterProfile =>
    profiles.find((p) => p.id === id) ?? { id, label: id, printer_type: 'none' };

  const handleSave = () => {
    updateSettings.mutate({
      receipt_header: form.receiptHeader || null,
      receipt_footer: form.receiptFooter || null,
      auto_print_order: form.autoPrintOrder,
      auto_print_kitchen: form.autoPrintKitchen,
      // Keep any station the operator configured: a non-disabled type, an assigned printer name, or auto-print on.
      printer_profiles: profiles.filter(
        (p) => p.printer_type !== 'none' || (p.printer_name && p.printer_name !== 'browser') || p.auto_print,
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
                placeholder="Thank you message, social handles…"
                className={`${inputClass} resize-none`}
              />
            </div>
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
              { key: 'autoPrintKitchen' as const, label: 'Auto-Print Kitchen Ticket', desc: 'Send a kitchen order ticket when an order is created.' },
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Printer className="h-4 w-4 text-primary" />
              <span className="font-bold text-sm">Order Printing — Stations</span>
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
            Assign a printer to each station (Bill, Kitchen, Bar, Coffee). Detect Printers scans network,
            USB &amp; Bluetooth printers via QZ Tray; with none detected, printing uses the browser dialog.
          </p>
          {discoverNote && (
            <p className="text-[11px] mt-1.5 rounded-lg bg-accent/30 px-3 py-2 text-muted-foreground">{discoverNote}</p>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {RECEIPT_PRINTER_ROLES.map((role) => {
            const p = getProfile(role.id);
            const currentName = p.printer_name ?? '';
            // Build the dropdown options: browser default + discovered + any previously-saved name.
            const names = Array.from(new Set([...discovered, ...(currentName && currentName !== 'browser' ? [currentName] : [])]));
            return (
              <div key={role.id} className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{role.label}</p>
                    <p className="text-xs text-muted-foreground">{role.desc}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground">Auto-print</span>
                    <Toggle checked={p.auto_print ?? false} onChange={(v) => setProfile(role.id, 'auto_print', v)} disabled={!canEdit} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className={labelClass}>Paper Size</label>
                    <select
                      value={p.paper_width ?? '80mm'}
                      onChange={(e) => setProfile(role.id, 'paper_width', e.target.value)}
                      disabled={!canEdit}
                      className={inputClass}
                    >
                      {PAPER_OPTIONS.map((w) => <option key={w} value={w}>{w === '80mm' ? '80 (72) x 297mm' : '58mm'}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className={labelClass}>Printer Name</label>
                    <select
                      value={currentName || 'browser'}
                      onChange={(e) => {
                        const v = e.target.value;
                        setProfile(role.id, 'printer_name', v === 'browser' ? '' : v);
                        // Reflect choice in printer_type so legacy consumers + the save filter behave.
                        setProfile(role.id, 'printer_type', v === 'browser' ? 'browser' : 'network');
                      }}
                      disabled={!canEdit}
                      className={inputClass}
                    >
                      <option value="browser">Browser print (default)</option>
                      {names.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
                {/* Optional explicit network IP for ESC/POS printers not exposed via the bridge. */}
                {p.printer_type === 'network' && !currentName && (
                  <div className="space-y-1">
                    <label className={labelClass}>Network Printer IP (optional)</label>
                    <input
                      value={p.printer_ip ?? ''}
                      onChange={(e) => setProfile(role.id, 'printer_ip', e.target.value)}
                      disabled={!canEdit}
                      placeholder="192.168.1.100"
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                )}
              </div>
            );
          })}
          </div>
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
