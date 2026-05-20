'use client';

import { cn } from '@/lib/utils';
import { webhooksApi, type WebhookSubscription, type WebhookDelivery, type CreateWebhookInput } from '@/lib/api/webhooks';
import { useAuthStore } from '@/store/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
  Webhook,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';

const EVENT_TYPES = [
  'order.created',
  'order.completed',
  'order.cancelled',
  'payment.recorded',
  'payment.success',
  'payment.failed',
  'return.initiated',
  'return.completed',
  'sale.finalized',
];

const STATUS_COLOR: Record<string, string> = {
  success: 'bg-green-500/10 text-green-700 dark:text-green-400',
  failed:  'bg-red-500/10 text-red-700 dark:text-red-400',
  pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

function DeliveryRow({ d }: { d: WebhookDelivery }) {
  return (
    <tr className="text-sm border-b border-border hover:bg-muted/30 transition-colors">
      <td className="px-4 py-2.5">
        <span className={cn('px-2 py-0.5 rounded text-xs font-semibold capitalize', STATUS_COLOR[d.status])}>
          {d.status}
        </span>
      </td>
      <td className="px-4 py-2.5 text-muted-foreground">{d.http_status ?? '—'}</td>
      <td className="px-4 py-2.5 text-muted-foreground">{d.attempt}</td>
      <td className="px-4 py-2.5 text-muted-foreground text-xs">
        {d.delivered_at
          ? new Date(d.delivered_at).toLocaleString()
          : new Date(d.created_at).toLocaleString()}
      </td>
      {d.error_message && (
        <td className="px-4 py-2.5 text-xs text-destructive max-w-xs truncate">{d.error_message}</td>
      )}
    </tr>
  );
}

function WebhookRow({ webhook, tenantID }: { webhook: WebhookSubscription; tenantID: string }) {
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();

  const { data: deliveries, isLoading: dlLoading } = useQuery({
    queryKey: ['webhook-deliveries', tenantID, webhook.id],
    queryFn: () => webhooksApi.listDeliveries(tenantID, webhook.id),
    enabled: expanded && !!tenantID,
    staleTime: 15_000,
  });

  const toggle = useMutation({
    mutationFn: () => webhooksApi.update(tenantID, webhook.id, { is_active: !webhook.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks', tenantID] }),
  });

  const del = useMutation({
    mutationFn: () => webhooksApi.delete(tenantID, webhook.id),
    onSuccess: () => {
      toast.success('Webhook deleted');
      qc.invalidateQueries({ queryKey: ['webhooks', tenantID] });
    },
  });

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{webhook.target_url}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{webhook.event_type}</p>
        </div>

        <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold', webhook.is_active ? 'bg-green-500/10 text-green-700' : 'bg-muted text-muted-foreground')}>
          {webhook.is_active ? 'Active' : 'Paused'}
        </span>

        <button
          onClick={() => toggle.mutate()}
          disabled={toggle.isPending}
          className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground disabled:opacity-50"
        >
          {webhook.is_active ? 'Pause' : 'Resume'}
        </button>

        <button
          onClick={() => {
            if (confirm('Delete this webhook?')) del.mutate();
          }}
          disabled={del.isPending}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Recent Deliveries
          </p>
          {dlLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : !deliveries || deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deliveries yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">HTTP</th>
                  <th className="text-left px-4 py-2">Attempt</th>
                  <th className="text-left px-4 py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => <DeliveryRow key={d.id} d={d} />)}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function WebhooksPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateWebhookInput>({ event_type: EVENT_TYPES[0], target_url: '', secret: '' });

  const { data: webhooks = [], isLoading } = useQuery({
    queryKey: ['webhooks', tenantID],
    queryFn: () => webhooksApi.list(tenantID),
    enabled: !!tenantID,
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: () => webhooksApi.create(tenantID, { ...form, secret: form.secret || undefined }),
    onSuccess: () => {
      toast.success('Webhook created');
      setShowCreate(false);
      setForm({ event_type: EVENT_TYPES[0], target_url: '', secret: '' });
      qc.invalidateQueries({ queryKey: ['webhooks', tenantID] });
    },
    onError: () => toast.error('Failed to create webhook'),
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Webhooks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Subscribe to POS events and receive POST callbacks to your endpoints.
          </p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showCreate ? 'Cancel' : 'Add Webhook'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <p className="font-semibold text-sm">New Webhook Subscription</p>

          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Event Type</span>
              <select
                value={form.event_type}
                onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {EVENT_TYPES.map((et) => (
                  <option key={et} value={et}>{et}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Target URL</span>
              <input
                type="url"
                placeholder="https://your-server.com/webhook"
                value={form.target_url}
                onChange={(e) => setForm((f) => ({ ...f, target_url: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Secret (optional HMAC key)</span>
              <input
                type="text"
                placeholder="Optional — used to sign X-Webhook-Signature header"
                value={form.secret}
                onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>

          <button
            onClick={() => create.mutate()}
            disabled={create.isPending || !form.target_url || !form.event_type}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {create.isPending ? 'Creating…' : 'Create Webhook'}
          </button>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading webhooks…</span>
        </div>
      ) : webhooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
          <Webhook className="h-12 w-12 opacity-20" />
          <p className="text-sm">No webhooks yet. Add one to start receiving events.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh) => (
            <WebhookRow key={wh.id} webhook={wh} tenantID={tenantID} />
          ))}
        </div>
      )}

      {/* Info box */}
      <div className="rounded-xl bg-muted/40 border border-border p-4 flex gap-3">
        <Activity className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground text-sm">How it works</p>
          <p>When a subscribed event fires, POS sends a POST request to your target URL with a JSON body. If your server returns a 2xx status the delivery is marked successful. Failed deliveries are retried up to 5 times.</p>
          <p>Set a secret to verify requests using the <code className="bg-muted px-1 rounded">X-Webhook-Signature</code> header (HMAC-SHA256).</p>
        </div>
      </div>
    </div>
  );
}
