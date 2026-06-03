'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { useHotelRooms, useCreateRoom, useUpdateRoom, useDeleteRoom, useInventoryServiceItems } from '@/hooks/useHotel';
import { usePermissions, P } from '@/hooks/usePermissions';
import type { Room, CreateRoomInput } from '@/lib/api/hotel';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { BedDouble, Edit2, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROOM_TYPES = [
  { value: 'standard', label: 'Standard' },
  { value: 'deluxe', label: 'Deluxe' },
  { value: 'suite', label: 'Suite' },
  { value: 'executive', label: 'Executive' },
  { value: 'family', label: 'Family' },
  { value: 'single', label: 'Single' },
  { value: 'double', label: 'Double' },
  { value: 'twin', label: 'Twin' },
  { value: 'studio', label: 'Studio' },
];

const STATUS_COLORS: Record<string, string> = {
  available:   'bg-green-500/10 text-green-700 dark:text-green-400',
  occupied:    'bg-red-500/10 text-red-700 dark:text-red-400',
  cleaning:    'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  maintenance: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  reserved:    'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  checkout:    'bg-muted text-muted-foreground',
};

const STATUS_OPTIONS = ['all', 'available', 'occupied', 'cleaning', 'maintenance', 'reserved'];

// ─── Room Form Modal ──────────────────────────────────────────────────────────

interface RoomFormProps {
  room?: Room;
  onClose: () => void;
}

function RoomFormModal({ room, onClose }: RoomFormProps) {
  const isEdit = !!room;
  const [form, setForm] = useState<CreateRoomInput>({
    room_number: room?.room_number ?? '',
    room_type: room?.room_type ?? 'standard',
    floor: room?.floor ?? 1,
    rate_per_night: room?.rate_per_night ?? 0,
    name: room?.name ?? '',
    currency: room?.currency ?? 'KES',
    inventory_item_id: room?.inventory_item_id ?? undefined,
  });

  const createRoom = useCreateRoom();
  const updateRoom = useUpdateRoom(room?.id ?? '');
  const { data: roomTypeItems = [] } = useInventoryServiceItems('HOSPITALITY_ROOM');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.room_number.trim()) { toast.error('Room number is required'); return; }
    if (form.rate_per_night <= 0) { toast.error('Rate per night must be greater than 0'); return; }
    try {
      if (isEdit) {
        await updateRoom.mutateAsync(form);
        toast.success('Room updated');
      } else {
        await createRoom.mutateAsync(form);
        toast.success('Room created');
      }
      onClose();
    } catch {
      toast.error(isEdit ? 'Failed to update room' : 'Failed to create room');
    }
  }

  const isPending = createRoom.isPending || updateRoom.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md sm:rounded-2xl rounded-t-2xl bg-card border border-border shadow-2xl overflow-y-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">{isEdit ? 'Edit Room' : 'Add Room'}</h2>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Room Number *</span>
              <input
                required
                value={form.room_number}
                onChange={(e) => setForm((f) => ({ ...f, room_number: e.target.value }))}
                placeholder="101"
                className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Floor</span>
              <input
                type="number"
                min={1}
                value={form.floor}
                onChange={(e) => setForm((f) => ({ ...f, floor: parseInt(e.target.value) || 1 }))}
                className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Room Type</span>
            <select
              value={form.room_type}
              onChange={(e) => setForm((f) => ({ ...f, room_type: e.target.value }))}
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {ROOM_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>

          {/* Inventory room-type master link — authoritative rate comes from inventory when set */}
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Inventory Room-Type (rate master)</span>
            <select
              value={form.inventory_item_id ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, inventory_item_id: e.target.value || undefined }))}
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— Not linked (use manual rate) —</option>
              {roomTypeItems.map((it) => (
                <option key={it.id} value={it.id}>{it.name} ({it.sku})</option>
              ))}
            </select>
            {form.inventory_item_id && (
              <span className="mt-1 block text-[11px] text-muted-foreground">Nightly rate will be resolved from inventory pricing at check-in.</span>
            )}
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Display Name (optional)</span>
            <input
              value={form.name ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. The Loft Suite"
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rate / Night *</span>
              <input
                type="number"
                min={0}
                step={0.01}
                required
                value={form.rate_per_night}
                onChange={(e) => setForm((f) => ({ ...f, rate_per_night: parseFloat(e.target.value) || 0 }))}
                className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Currency</span>
              <select
                value={form.currency ?? 'KES'}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : isEdit ? 'Save Changes' : 'Add Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function RoomsPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const { can } = usePermissions();
  const canManage = can(P.HOTEL_MANAGE);
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [formRoom, setFormRoom] = useState<Room | null | 'new'>(null);
  const [deleteTarget, setDeleteTarget] = useState<Room | null>(null);

  const { data: rooms = [], isLoading } = useHotelRooms(filter);
  const deleteRoom = useDeleteRoom();

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteRoom.mutateAsync(deleteTarget.id);
      toast.success(`Room ${deleteTarget.room_number} deleted`);
      setDeleteTarget(null);
    } catch {
      toast.error('Failed to delete room');
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Rooms</h1>
          <p className="text-sm text-muted-foreground mt-1">{rooms.length} room{rooms.length !== 1 ? 's' : ''}</p>
        </div>
        {canManage && (
          <button
            onClick={() => setFormRoom('new')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Room
          </button>
        )}
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s === 'all' ? undefined : s)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium capitalize transition-colors',
              (s === 'all' ? !filter : filter === s)
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {rooms.map((room) => (
            <div key={room.id} className="group relative block p-4 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all">
              {/* Edit / Delete actions */}
              {canManage && (
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setFormRoom(room)}
                    className="h-7 w-7 rounded-lg bg-background/80 border border-border flex items-center justify-center hover:bg-primary/10 hover:text-primary transition-colors"
                    title="Edit room"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(room)}
                    className="h-7 w-7 rounded-lg bg-background/80 border border-border flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors"
                    title="Delete room"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <Link href={`/${orgSlug}/hotel/rooms/${room.id}`} className="block">
                <div className="flex items-start justify-between mb-3">
                  <div className="size-10 rounded-xl bg-muted flex items-center justify-center">
                    <BedDouble className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize', STATUS_COLORS[room.status] ?? 'bg-muted text-muted-foreground')}>
                    {room.status}
                  </span>
                </div>
                <p className="font-bold text-foreground text-lg">{room.room_number}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {ROOM_TYPES.find((t) => t.value === room.room_type)?.label ?? room.room_type} · Floor {room.floor}
                </p>
                <p className="text-xs text-primary font-semibold mt-1">
                  {room.currency ?? 'KES'} {room.rate_per_night.toLocaleString()}/night
                </p>
              </Link>
            </div>
          ))}
        </div>
      )}

      {!isLoading && rooms.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
          <BedDouble className="h-12 w-12 opacity-30" />
          <p>No rooms found</p>
          {canManage && (
            <button
              onClick={() => setFormRoom('new')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" /> Add your first room
            </button>
          )}
        </div>
      )}

      {/* Create / Edit modal */}
      {formRoom !== null && (
        <RoomFormModal
          room={formRoom === 'new' ? undefined : formRoom}
          onClose={() => setFormRoom(null)}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`Delete Room ${deleteTarget?.room_number ?? ''}?`}
        description="This will permanently remove the room. Active bookings will be unaffected but no new check-ins will be possible."
        confirmLabel="Delete Room"
        variant="danger"
        onConfirm={handleDelete}
        loading={deleteRoom.isPending}
      />
    </div>
  );
}

export default function RoomsPageGated() {
  return (
    <ModuleGate moduleKey="hotel" fallback={<ModuleUnavailablePage moduleKey="hotel" />}>
      <RoomsPage />
    </ModuleGate>
  );
}
