'use client';

import { useState } from 'react';
import { Loader2, RefreshCw, Plus, Truck } from 'lucide-react';
import { Button, Card, CardContent } from '@/components/ui/base';
import { usePermissions } from '@/hooks/usePermissions';
import { P } from '@/lib/rbac/permissions';
import { useChannels, useCreateChannel, useTriggerChannelSync } from '@/hooks/useChannels';
import { toast } from 'sonner';

const CHANNEL_TYPES = [
  { value: 'uber_eats', label: 'Uber Eats' },
  { value: 'glovo', label: 'Glovo' },
  { value: 'bolt_food', label: 'Bolt Food' },
  { value: 'jumia_food', label: 'Jumia Food' },
  { value: 'own_website', label: 'Own Website' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

function relTime(iso?: string | null) {
  if (!iso) return 'never';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * ChannelsTab — connect 3rd-party delivery channels and push the catalogue to them.
 * Surfaces the previously orphaned pos-api /channels + /channels/{id}/sync-jobs endpoints.
 */
export function ChannelsTab() {
  const { can } = usePermissions();
  const canEdit = can(P.CONFIG_CHANGE) || can(P.CONFIG_MANAGE);
  const { data: channels = [], isLoading } = useChannels();
  const createChannel = useCreateChannel();
  const triggerSync = useTriggerChannelSync();
  const [name, setName] = useState('');
  const [type, setType] = useState(CHANNEL_TYPES[0].value);

  const typeLabel = (t: string) => CHANNEL_TYPES.find((c) => c.value === t)?.label ?? t;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error('Channel name is required'); return; }
    try {
      await createChannel.mutateAsync({ channel_name: name.trim(), channel_type: type });
      toast.success('Channel added');
      setName('');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to add channel');
    }
  }

  async function handleSync(id: string) {
    try {
      await triggerSync.mutateAsync(id);
      toast.success('Catalog sync queued');
    } catch (err: any) {
      toast.error(err?.message ?? 'Sync failed');
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Connect third-party delivery channels and push your catalogue to them.</p>

      {canEdit && (
        <Card>
          <CardContent className="p-5">
            <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Channel name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Glovo — Westlands"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Type</label>
                <select value={type} onChange={(e) => setType(e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {CHANNEL_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <Button type="submit" disabled={createChannel.isPending} className="gap-2">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="h-24 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : channels.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground border-2 border-dashed border-border rounded-2xl">
          <Truck className="h-9 w-9 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No delivery channels connected.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {channels.map((ch) => (
            <Card key={ch.id}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{ch.channel_name}</p>
                  <p className="text-xs text-muted-foreground">{typeLabel(ch.channel_type)} · synced {relTime(ch.last_synced_at)}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ch.status === 'active' ? 'bg-green-500/15 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                  {ch.status ?? 'inactive'}
                </span>
                <Button size="sm" variant="outline" className="gap-1.5" disabled={triggerSync.isPending} onClick={() => handleSync(ch.id)}>
                  <RefreshCw className="h-3.5 w-3.5" /> Sync
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
