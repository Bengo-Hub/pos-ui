'use client';

import { useState } from 'react';
import { Plus, RefreshCw, Users } from 'lucide-react';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { QueueBoard } from '@/components/service/QueueBoard';
import { useQueue, useCreateQueueEntry, useUpdateQueueStatus } from '@/hooks/useQueue';
import { useAuthStore } from '@/store/auth';
import type { QueueStatus } from '@/lib/api/queue';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';

function AddToQueueModal({ outletID, onClose }: { outletID: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [service, setService] = useState('');
  const [notes, setNotes] = useState('');
  const createEntry = useCreateQueueEntry();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createEntry.mutateAsync({
        outlet_id: outletID,
        customer_name: name.trim(),
        customer_phone: phone.trim() || undefined,
        service_name: service.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success(`${name} added to queue`);
      onClose();
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to add to queue'));
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-bold text-base">Add Walk-in</h2>
        <div className="space-y-3">
          <input
            required
            placeholder="Customer name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <input
            placeholder="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <input
            placeholder="Service requested"
            value={service}
            onChange={(e) => setService(e.target.value)}
            className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <textarea
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none"
          />
        </div>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || createEntry.isPending}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            {createEntry.isPending ? 'Adding…' : 'Add to Queue'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function QueuePage() {
  const outlet = useAuthStore((s) => s.outlet);
  const [addOpen, setAddOpen] = useState(false);
  const { data, isLoading, refetch, isFetching } = useQueue(outlet?.id, undefined);
  const updateStatus = useUpdateQueueStatus();

  const entries = data?.entries ?? [];

  async function handleStatusChange(entryID: string, status: QueueStatus) {
    try {
      await updateStatus.mutateAsync({ entryID, status });
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to update status'));
    }
  }

  return (
    <ModuleGate moduleKey="queue" fallback={<ModuleUnavailablePage moduleKey="queue" />}>
      <div className="flex flex-col h-full p-4 sm:p-6 gap-4">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-none">Walk-in Queue</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{entries.length} active</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-2 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Walk-in
            </button>
          </div>
        </div>

        {/* Board */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <QueueBoard
              entries={entries}
              onStatusChange={handleStatusChange}
              loading={updateStatus.isPending}
            />
          )}
        </div>
      </div>

      {addOpen && outlet && (
        <AddToQueueModal outletID={outlet.id} onClose={() => setAddOpen(false)} />
      )}
    </ModuleGate>
  );
}
