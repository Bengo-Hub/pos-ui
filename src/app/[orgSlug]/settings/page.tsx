'use client';

import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { useTenantBranding } from '@/providers/tenant-branding-provider';
import {
  Palette,
  Printer,
  Receipt,
  Save,
  Settings
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { tenant, logoUrl, primaryColor, isLoading } = useTenantBranding();
  const [settings, setSettings] = useState({
    receiptHeader: 'BengoBox Restaurant',
    receiptFooter: 'Thank you! Visit again.',
    showVAT: true,
    vatRate: '16',
    printerType: 'thermal',
    printerIP: '',
    paperWidth: '80mm',
    autoPrintOnOrder: true,
    printKitchenTicket: true,
    currency: 'KES',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 1000));
    setSaving(false);
    toast.success('POS settings saved successfully');
  };

  return (
    <div className="p-8 space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">POS Settings</h1>
        <p className="text-muted-foreground mt-1">Configure receipt format, printer, and POS behavior.</p>
      </div>

      {/* Tenant branding (from auth-api) */}
      {!isLoading && (tenant || logoUrl || primaryColor) && (
        <Card>
          <CardHeader className="border-b border-border/50 py-4">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              <h3 className="font-bold text-sm uppercase tracking-tight">Tenant & Branding</h3>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {tenant && (
              <p className="text-sm text-muted-foreground">
                <strong>{tenant.name}</strong> ({tenant.slug}). Branding is loaded from auth-api tenant metadata (primary_color, logo_url). Update tenant in auth portal to change.
              </p>
            )}
            {(logoUrl || primaryColor) && (
              <div className="flex items-center gap-4">
                {logoUrl && <img src={logoUrl} alt="Logo" className="h-10 object-contain" />}
                {primaryColor && <div className="h-8 w-24 rounded border" style={{ backgroundColor: primaryColor }} title="Primary" />}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="border-b border-border/50 py-4">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            <h3 className="font-bold text-sm uppercase tracking-tight">Receipt Format</h3>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Header Text</label>
              <input
                value={settings.receiptHeader}
                onChange={(e) => setSettings({ ...settings, receiptHeader: e.target.value })}
                className="w-full bg-accent/10 border border-border rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Footer Text</label>
              <input
                value={settings.receiptFooter}
                onChange={(e) => setSettings({ ...settings, receiptFooter: e.target.value })}
                className="w-full bg-accent/10 border border-border rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Currency</label>
              <select
                value={settings.currency}
                onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                className="w-full bg-accent/10 border border-border rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-primary outline-none"
              >
                <option value="KES">KES - Kenyan Shilling</option>
                <option value="USD">USD - US Dollar</option>
                <option value="TZS">TZS - Tanzanian Shilling</option>
                <option value="UGX">UGX - Ugandan Shilling</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">VAT Rate (%)</label>
              <input
                value={settings.vatRate}
                onChange={(e) => setSettings({ ...settings, vatRate: e.target.value })}
                className="w-48 bg-accent/10 border border-border rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-primary outline-none font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-accent/10 border border-border">
            <div>
              <h4 className="text-sm font-bold">Show VAT Breakdown</h4>
              <p className="text-xs text-muted-foreground mt-0.5">Display VAT as a separate line item on receipts.</p>
            </div>
            <button
              onClick={() => setSettings({ ...settings, showVAT: !settings.showVAT })}
              className={`relative w-11 h-6 rounded-full transition-colors ${settings.showVAT ? 'bg-primary' : 'bg-accent'}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.showVAT ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border/50 py-4">
          <div className="flex items-center gap-2">
            <Printer className="h-4 w-4 text-primary" />
            <h3 className="font-bold text-sm uppercase tracking-tight">Printer Configuration</h3>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Printer Type</label>
              <select
                value={settings.printerType}
                onChange={(e) => setSettings({ ...settings, printerType: e.target.value })}
                className="w-full bg-accent/10 border border-border rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-primary outline-none"
              >
                <option value="thermal">Thermal (ESC/POS)</option>
                <option value="network">Network Printer</option>
                <option value="bluetooth">Bluetooth</option>
                <option value="none">No Printer</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Printer IP / Address</label>
              <input
                value={settings.printerIP}
                onChange={(e) => setSettings({ ...settings, printerIP: e.target.value })}
                placeholder="192.168.1.100"
                className="w-full bg-accent/10 border border-border rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-primary outline-none font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Paper Width</label>
              <select
                value={settings.paperWidth}
                onChange={(e) => setSettings({ ...settings, paperWidth: e.target.value })}
                className="w-full bg-accent/10 border border-border rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-primary outline-none"
              >
                <option value="58mm">58mm</option>
                <option value="80mm">80mm</option>
              </select>
            </div>
          </div>

          {[
            { key: 'autoPrintOnOrder' as const, label: 'Auto-Print on Order', desc: 'Automatically print receipt when an order is placed.' },
            { key: 'printKitchenTicket' as const, label: 'Print Kitchen Ticket', desc: 'Send a kitchen order ticket to the kitchen printer.' },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between p-4 rounded-xl bg-accent/10 border border-border">
              <div>
                <h4 className="text-sm font-bold">{item.label}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, [item.key]: !settings[item.key] })}
                className={`relative w-11 h-6 rounded-full transition-colors ${settings[item.key] ? 'bg-primary' : 'bg-accent'}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings[item.key] ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2 px-8 shadow-lg shadow-primary/10">
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
