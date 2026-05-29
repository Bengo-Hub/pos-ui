'use client';

import { useEffect, useState } from 'react';
import { Loader2, Lock, Printer, Receipt, Save } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { usePOSSettings, useUpdatePOSSettings } from '@/hooks/usePOSSettings';
import { usePermissions } from '@/hooks/usePermissions';
import { P } from '@/lib/rbac/permissions';
import type { PrinterProfile } from '@/lib/api/settings';
import { Toggle, inputClass, labelClass } from './shared';

const RECEIPT_PRINTER_ROLES = [
  { id: 'customer', label: 'Customer Receipt', desc: 'Full receipt printed at point of sale' },
  { id: 'kitchen', label: 'Kitchen Printer', desc: 'Kitchen ticket (no prices) sent on order open' },
  { id: 'bar', label: 'Bar Printer', desc: 'Bar ticket for drinks and cocktails' },
  { id: 'waiter', label: 'Waiter Copy', desc: 'Order summary for the serving staff' },
];

export function ReceiptTab() {
  const { data: settings, isLoading } = usePOSSettings();
  const updateSettings = useUpdatePOSSettings();
  const { can } = usePermissions();
  const canEdit = can(P.CONFIG_CHANGE) || can(P.CONFIG_MANAGE);

  const [form, setForm] = useState({
    receiptHeader: '',
    receiptFooter: '',
    autoPrintOrder: false,
    autoPrintKitchen: false,
  });
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);

  useEffect(() => {
    if (settings) {
      setForm({
        receiptHeader: settings.receipt_header ?? '',
        receiptFooter: settings.receipt_footer ?? '',
        autoPrintOrder: settings.auto_print_order ?? false,
        autoPrintKitchen: settings.auto_print_kitchen ?? false,
      });
      setProfiles(settings.printer_profiles ?? []);
    }
  }, [settings]);

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
      printer_profiles: profiles.filter((p) => p.printer_type !== 'none'),
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
          <div className="flex items-center gap-2">
            <Printer className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Printer Profiles</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Configure separate printers for customer receipts, kitchen tickets, and bar orders.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {RECEIPT_PRINTER_ROLES.map((role) => {
            const p = getProfile(role.id);
            return (
              <div key={role.id} className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold">{role.label}</p>
                    <p className="text-xs text-muted-foreground">{role.desc}</p>
                  </div>
                  <select
                    value={p.printer_type}
                    onChange={(e) => setProfile(role.id, 'printer_type', e.target.value as any)}
                    disabled={!canEdit}
                    className={`${inputClass} w-40`}
                  >
                    <option value="none">Disabled</option>
                    <option value="network">Network (ESC/POS)</option>
                    <option value="browser">Browser Print</option>
                    <option value="bluetooth">Bluetooth</option>
                  </select>
                </div>
                {p.printer_type === 'network' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className={labelClass}>Printer IP</label>
                      <input
                        value={p.printer_ip ?? ''}
                        onChange={(e) => setProfile(role.id, 'printer_ip', e.target.value)}
                        disabled={!canEdit}
                        placeholder="192.168.1.100"
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className={labelClass}>Paper Width</label>
                      <select
                        value={p.paper_width ?? '80mm'}
                        onChange={(e) => setProfile(role.id, 'paper_width', e.target.value)}
                        disabled={!canEdit}
                        className={inputClass}
                      >
                        <option value="58mm">58mm</option>
                        <option value="80mm">80mm</option>
                      </select>
                    </div>
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
