'use client';

import { cn } from '@/lib/utils';
import { webhooksApi, type WebhookSubscription, type WebhookDelivery, type CreateWebhookInput } from '@/lib/api/webhooks';
import { useAuthStore } from '@/store/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePermissions, P } from '@/hooks/usePermissions';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Activity, ChevronDown, ChevronRight, Loader2, Plus, ShieldAlert, Trash2, Webhook, X,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';

const EVENT_TYPES = [
  'order.created', 'order.completed', 'order.cancelled',
  'payment.recorded', 'payment.success', 'payment.failed',
  'return.initiated', 'return.completed', 'sale.finalized',
];

const STATUS_COLOR: Record<string, string> = {
  success: 'bg-green-500/10 text-green-700 dark:text-green-400',
  failed:  'bg-red-500/10 text-red-700 dark:text-red-400',
  pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

function DeliveryRow({ d }: { d: WebhookDelivery }) {
  return (
    <tr className="border-b border-border text-sm transition-colors hover:bg-muted/30">
      <td className="px-4 py-2.5">
        <span className={cn('rounded px-2 py-0.5 text-xs font-semibold capitalize', STATUS_COLOR[d.status])}>{d.status}</span>
      </td>
      <td className="px-4 py-2.5 text-muted-foreground">{d.http_status ?? '—'}</td>
      <td className="px-4 py-2.5 text-muted-foreground">{d.attempt}</td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground">
        {d.delivered_at ? new Date(d.delivered_at).toLocaleString() : new Date(d.created_at).toLocaleString()}
      </td>
      {d.error_message && <td className="max-w-xs truncate px-4 py-2.5 text-xs text-destructive">{d.error_message}</td>}
    </tr>
  );
}

function WebhookRow({ webhook, tenantID }: { webhook: WebhookSubscription; tenantID: string }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setExpanded((v) => !v)} className="text-muted-foreground transition-colors hover:text-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{webhook.target_url}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{webhook.event_type}</p>
        </div>
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', webhook.is_active ? 'bg-green-500/10 text-green-700' : 'bg-muted text-muted-foreground')}>
          {webhook.is_active ? 'Active' : 'Paused'}
        </span>
        <button onClick={() => toggle.mutate()} disabled={toggle.isPending} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50">
          {webhook.is_active ? 'Pause' : 'Resume'}
        </button>
        <button onClick={() => setConfirmDelete(true)} disabled={del.isPending} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Deliveries</p>
          {dlLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : !deliveries || deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deliveries yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">HTTP</th>
                    <th className="px-4 py-2 text-left">Attempt</th>
                    <th className="px-4 py-2 text-left">Time</th>
                  </tr>
                </thead>
                <tbody>{deliveries.map((d) => <DeliveryRow key={d.id} d={d} />)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this webhook?"
        description={`Stop delivering ${webhook.event_type} events to ${webhook.target_url}.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => del.mutate()}
        loading={del.isPending}
      />
    </div>
  );
}

/** Webhooks management UI — embedded as a tab in POS Settings. */
export function WebhooksTab() {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const qc = useQueryClient();
  const { can } = usePermissions();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateWebhookInput>({ event_type: EVENT_TYPES[0], target_url: '', secret: '' });

  const { data: webhooks = [], isLoading } = useQuery({
    queryKey: ['webhooks', tenantID],
    queryFn: () => webhooksApi.list(tenantID),
    enabled: !!tenantID && can(P.CONFIG_MANAGE),
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
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to create webhook')),
  });

  if (!can(P.CONFIG_MANAGE)) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-muted-foreground">
        <ShieldAlert className="h-12 w-12 opacity-30" />
        <div className="text-center">
          <p className="font-semibold text-foreground">Access Restricted</p>
          <p className="mt-1 text-sm">Webhooks are only accessible to administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showCreate ? 'Cancel' : 'Add Webhook'}
        </button>
      </div>

      {showCreate && (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold">New Webhook Subscription</p>
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Event Type</span>
              <select value={form.event_type} onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {EVENT_TYPES.map((et) => <option key={et} value={et}>{et}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Target URL</span>
              <input type="url" placeholder="https://your-server.com/webhook" value={form.target_url} onChange={(e) => setForm((f) => ({ ...f, target_url: e.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Secret (optional HMAC key)</span>
              <input type="text" placeholder="Optional — signs the X-Webhook-Signature header" value={form.secret} onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </label>
          </div>
          <button onClick={() => create.mutate()} disabled={create.isPending || !form.target_url || !form.event_type} className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
            {create.isPending ? 'Creating…' : 'Create Webhook'}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex h-32 items-center justify-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading webhooks…</span>
        </div>
      ) : webhooks.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Webhook className="h-12 w-12 opacity-20" />
          <p className="text-sm">No webhooks yet. Add one to start receiving events.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh) => <WebhookRow key={wh.id} webhook={wh} tenantID={tenantID} />)}
        </div>
      )}

      <div className="flex gap-3 rounded-xl border border-border bg-muted/40 p-4">
        <Activity className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="text-sm font-semibold text-foreground">How it works</p>
          <p>When a subscribed event fires, POS sends a POST request to your target URL with a JSON body. A 2xx response marks the delivery successful; failures are retried up to 5 times.</p>
          <p>Set a secret to verify requests using the <code className="rounded bg-muted px-1">X-Webhook-Signature</code> header (HMAC-SHA256).</p>
        </div>
      </div>
    </div>
  );
}
