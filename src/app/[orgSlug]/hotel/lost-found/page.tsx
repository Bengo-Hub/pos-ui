'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import {
  useLostFoundItems,
  useClaimLostFoundItem,
  useDisposeLostFoundItem,
  useHotelRooms,
} from '@/hooks/useHotel';
import { usePermissions, P } from '@/hooks/usePermissions';
import type { LostFoundItem } from '@/lib/api/hotel';
import { cn } from '@/lib/utils';
import { resolveMediaUrl } from '@/lib/screensaver';
import { CheckCircle2, Loader2, PackageSearch, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';

const STATUS_OPTIONS = ['all', 'stored', 'claimed', 'disposed', 'donated'];

const STATUS_COLORS: Record<string, string> = {
  stored:   'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  claimed:  'bg-green-500/10 text-green-700 dark:text-green-400',
  disposed: 'bg-muted text-muted-foreground',
  donated:  'bg-purple-500/10 text-purple-700 dark:text-purple-400',
};

const CATEGORY_LABELS: Record<string, string> = {
  electronics: 'Electronics', clothing: 'Clothing', jewelry: 'Jewelry',
  documents: 'Documents', toiletries: 'Toiletries', luggage: 'Luggage', other: 'Other',
};

function ClaimModal({ item, onClose }: { item: LostFoundItem; onClose: () => void }) {
  const [name, setName] = useState(item.guest_name ?? '');
  const [notes, setNotes] = useState('');
  const claim = useClaimLostFoundItem();

  async function handleClaim() {
    if (!name.trim()) { toast.error('Enter who is claiming this item'); return; }
    try {
      await claim.mutateAsync({ id: item.id, claimedByName: name.trim(), claimedNotes: notes.trim() || undefined });
      toast.success('Item marked as claimed');
      onClose();
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to mark item as claimed'));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/50 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="w-full max-w-sm sm:rounded-2xl rounded-t-2xl bg-card border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">Claim Item</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-foreground">{item.description}</p>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Claimed by *</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Guest or claimant name"
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. ID verified, picked up in person"
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
            <button
              onClick={handleClaim}
              disabled={claim.isPending}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {claim.isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Mark Claimed'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DisposeModal({ item, onClose }: { item: LostFoundItem; onClose: () => void }) {
  const [disposition, setDisposition] = useState<'disposed' | 'donated'>('disposed');
  const [reason, setReason] = useState('');
  const dispose = useDisposeLostFoundItem();

  async function handleDispose() {
    if (!reason.trim()) { toast.error('A reason is required'); return; }
    try {
      await dispose.mutateAsync({ id: item.id, disposition, reason: reason.trim() });
      toast.success(disposition === 'donated' ? 'Item marked as donated' : 'Item marked as disposed');
      onClose();
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to update item'));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/50 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="w-full max-w-sm sm:rounded-2xl rounded-t-2xl bg-card border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">Dispose / Donate Item</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-foreground">{item.description}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDisposition('disposed')}
              className={cn('py-2.5 rounded-xl border text-sm font-semibold transition-colors', disposition === 'disposed' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}
            >
              Dispose
            </button>
            <button
              type="button"
              onClick={() => setDisposition('donated')}
              className={cn('py-2.5 rounded-xl border text-sm font-semibold transition-colors', disposition === 'donated' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}
            >
              Donate
            </button>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason *</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Unclaimed after 90 days per policy"
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
            <button
              onClick={handleDispose}
              disabled={dispose.isPending}
              className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 disabled:opacity-50 transition-colors"
            >
              {dispose.isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LostFoundPage() {
  const { can } = usePermissions();
  const canManage = can(P.HOTEL_MANAGE);
  const [filter, setFilter] = useState<string | undefined>('stored');
  const [claimTarget, setClaimTarget] = useState<LostFoundItem | null>(null);
  const [disposeTarget, setDisposeTarget] = useState<LostFoundItem | null>(null);

  const { data: items = [], isLoading } = useLostFoundItems(filter ? { status: filter } : undefined);
  const { data: rooms = [] } = useHotelRooms();

  const roomLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rooms) m.set(r.id, `Room ${r.room_number}`);
    return m;
  }, [rooms]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <PackageSearch className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Lost &amp; Found</h1>
            <p className="text-sm text-muted-foreground mt-1">{items.length} item{items.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s === 'all' ? undefined : s)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium capitalize transition-colors',
              (s === 'all' ? !filter : filter === s) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
          <PackageSearch className="h-12 w-12 opacity-30" />
          <p>No items{filter ? ` (${filter})` : ''}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-foreground">{item.room_id ? (roomLabel.get(item.room_id) ?? 'Room') : 'Common area'}</p>
                  <p className="text-xs text-muted-foreground">{new Date(item.found_at).toLocaleString()}</p>
                </div>
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize', STATUS_COLORS[item.status])}>{item.status}</span>
              </div>

              <p className="mt-3 text-sm text-foreground">{item.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                <span className="px-2 py-0.5 rounded-full bg-muted">{CATEGORY_LABELS[item.category] ?? item.category}</span>
                {item.location_found && <span className="px-2 py-0.5 rounded-full bg-muted">Found: {item.location_found}</span>}
                {item.storage_location && <span className="px-2 py-0.5 rounded-full bg-muted">Stored: {item.storage_location}</span>}
              </div>

              {(item.guest_name || item.guest_phone) && (
                <p className="mt-2 text-xs text-muted-foreground">Guest: {item.guest_name}{item.guest_phone ? ` · ${item.guest_phone}` : ''}</p>
              )}

              {item.photo_urls.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.photo_urls.map((url) => (
                    <a key={url} href={resolveMediaUrl(url)} target="_blank" rel="noopener noreferrer">
                      <img src={resolveMediaUrl(url)} alt="Found item" className="h-16 w-16 rounded-lg object-cover border border-border hover:opacity-80 transition-opacity" />
                    </a>
                  ))}
                </div>
              )}

              {item.status === 'claimed' && (
                <p className="mt-3 text-xs text-muted-foreground rounded-lg bg-muted/50 px-3 py-2">
                  Claimed by {item.claimed_by_name}{item.claimed_at ? ` on ${new Date(item.claimed_at).toLocaleDateString()}` : ''}
                  {item.claimed_notes ? ` — ${item.claimed_notes}` : ''}
                </p>
              )}
              {(item.status === 'disposed' || item.status === 'donated') && item.disposal_reason && (
                <p className="mt-3 text-xs text-muted-foreground rounded-lg bg-muted/50 px-3 py-2">{item.disposal_reason}</p>
              )}

              {canManage && item.status === 'stored' && (
                <div className="mt-4 flex gap-2 pt-3 border-t border-border">
                  <button
                    onClick={() => setClaimTarget(item)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-500/10 text-green-700 dark:text-green-400 text-sm font-medium hover:bg-green-500/20 transition-colors"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Claim
                  </button>
                  <button
                    onClick={() => setDisposeTarget(item)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" /> Dispose
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {claimTarget && <ClaimModal item={claimTarget} onClose={() => setClaimTarget(null)} />}
      {disposeTarget && <DisposeModal item={disposeTarget} onClose={() => setDisposeTarget(null)} />}
    </div>
  );
}

export default function LostFoundPageGated() {
  return (
    <ModuleGate moduleKey="hotel" fallback={<ModuleUnavailablePage moduleKey="hotel" />}>
      <LostFoundPage />
    </ModuleGate>
  );
}
