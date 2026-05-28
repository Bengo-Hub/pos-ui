'use client';

import { useState } from 'react';
import { Check, ChefHat, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button, Card, CardContent } from '@/components/ui/base';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  useAllKDSStations, useCreateKDSStation, useUpdateKDSStation, useDeleteKDSStation,
} from '@/hooks/useKDS';
import { usePermissions } from '@/hooks/usePermissions';
import { P } from '@/lib/rbac/permissions';
import { useAuthStore } from '@/store/auth';
import { toast } from 'sonner';
import { Toggle, inputClass, labelClass } from './shared';

const KDS_CATEGORIES = [
  'food', 'mains', 'starters', 'desserts', 'drinks',
  'cocktails', 'mocktails', 'beverages', 'sides',
];

type StationRef = { id: string; name: string; is_active: boolean };

export function KDSStationsTab() {
  const { data, isLoading } = useAllKDSStations();
  const createStation = useCreateKDSStation();
  const updateStation = useUpdateKDSStation();
  const deleteStation = useDeleteKDSStation();
  const { can } = usePermissions();
  const outlet = useAuthStore((s) => s.outlet);
  const canEdit = can(P.CONFIG_MANAGE) || can(P.CONFIG_CHANGE);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', category_filter: [] as string[], sort_order: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', category_filter: [] as string[], sort_order: 0 });
  const [confirmToggle, setConfirmToggle] = useState<StationRef | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StationRef | null>(null);

  const stations = data?.data ?? [];

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    try {
      await createStation.mutateAsync({
        outlet_id: outlet?.id ?? '',
        name: form.name,
        category_filter: form.category_filter,
        sort_order: form.sort_order,
      });
      setForm({ name: '', category_filter: [], sort_order: 0 });
      setShowForm(false);
      toast.success('Station created');
    } catch {
      toast.error('Failed to create station');
    }
  };

  const doToggleActive = () => {
    if (!confirmToggle) return;
    const action = confirmToggle.is_active ? 'deactivate' : 'reactivate';
    updateStation.mutate(
      { stationID: confirmToggle.id, input: { is_active: !confirmToggle.is_active } },
      {
        onSuccess: () => { toast.success(`Station ${action}d`); setConfirmToggle(null); },
        onError: () => { toast.error(`Failed to ${action} station`); setConfirmToggle(null); },
      },
    );
  };

  const startEdit = (s: { id: string; name: string; category_filter: string[]; sort_order: number }) => {
    setEditingId(s.id);
    setEditForm({ name: s.name, category_filter: s.category_filter ?? [], sort_order: s.sort_order });
  };

  const handleSaveEdit = async (stationID: string) => {
    if (!editForm.name.trim()) return;
    try {
      await updateStation.mutateAsync({
        stationID,
        input: { name: editForm.name, category_filter: editForm.category_filter, sort_order: editForm.sort_order },
      });
      setEditingId(null);
      toast.success('Station updated');
    } catch {
      toast.error('Failed to update station');
    }
  };

  const doDelete = () => {
    if (!confirmDelete) return;
    deleteStation.mutate(confirmDelete.id, {
      onSuccess: () => { toast.success(`Station "${confirmDelete.name}" deleted`); setConfirmDelete(null); },
      onError: () => { toast.error('Failed to delete station'); setConfirmDelete(null); },
    });
  };

  if (isLoading) {
    return (
      <div className="h-40 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Configure kitchen and bar display stations. Category filters route specific items to each station.
        </p>
        {canEdit && (
          <Button size="sm" onClick={() => { setShowForm(!showForm); setEditingId(null); }} className="gap-2">
            <Plus className="h-4 w-4" /> Add Station
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className={labelClass}>Station Name</label>
                <input
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Kitchen, Bar"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Sort Order</label>
                <input
                  type="number"
                  min={0}
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                  className={`${inputClass} font-mono`}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Category Filters (leave empty to show all)</label>
              <div className="flex flex-wrap gap-2">
                {KDS_CATEGORIES.map((cat) => {
                  const selected = form.category_filter.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setForm((f) => ({
                        ...f,
                        category_filter: selected
                          ? f.category_filter.filter((c) => c !== cat)
                          : [...f.category_filter, cat],
                      }))}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                        selected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-muted-foreground hover:border-primary'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={createStation.isPending || !form.name.trim()}>
                {createStation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {stations.length === 0 && !showForm && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No KDS stations configured. Add your first station to get started.
        </div>
      )}

      <div className="space-y-2">
        {stations.map((station) => {
          const isEditing = editingId === station.id;
          return (
            <div key={station.id} className={`rounded-xl border bg-card transition-opacity ${!station.is_active ? 'opacity-50' : ''}`}>
              {isEditing ? (
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className={labelClass}>Station Name</label>
                      <input
                        autoFocus
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className={labelClass}>Sort Order</label>
                      <input
                        type="number"
                        min={0}
                        value={editForm.sort_order}
                        onChange={(e) => setEditForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className={labelClass}>Category Filters</label>
                    <div className="flex flex-wrap gap-2">
                      {KDS_CATEGORIES.map((cat) => {
                        const sel = editForm.category_filter.includes(cat);
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setEditForm((f) => ({
                              ...f,
                              category_filter: sel
                                ? f.category_filter.filter((c) => c !== cat)
                                : [...f.category_filter, cat],
                            }))}
                            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                              sel
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'border-border text-muted-foreground hover:border-primary'
                            }`}
                          >
                            {cat}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                      <X className="h-3.5 w-3.5 mr-1" />Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleSaveEdit(station.id)}
                      disabled={updateStation.isPending || !editForm.name.trim()}
                    >
                      {updateStation.isPending
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        : <Check className="h-3.5 w-3.5 mr-1" />}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold">{station.name}</p>
                      {!station.is_active && (
                        <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(station.category_filter ?? []).length > 0
                        ? (station.category_filter ?? []).map((c) => (
                          <span key={c} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">{c}</span>
                        ))
                        : <span className="text-[10px] text-muted-foreground">All categories</span>
                      }
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">#{station.sort_order}</span>
                  {canEdit && (
                    <div className="flex items-center gap-2">
                      <Toggle
                        checked={station.is_active}
                        onChange={() => setConfirmToggle({ id: station.id, name: station.name, is_active: station.is_active })}
                      />
                      <button
                        onClick={() => startEdit(station)}
                        className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete({ id: station.id, name: station.name, is_active: station.is_active })}
                        disabled={deleteStation.isPending}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={!!confirmToggle}
        onOpenChange={(o) => { if (!o) setConfirmToggle(null); }}
        title={confirmToggle?.is_active ? 'Deactivate station?' : 'Reactivate station?'}
        description={
          confirmToggle?.is_active
            ? `"${confirmToggle?.name}" will stop receiving tickets until reactivated.`
            : `"${confirmToggle?.name}" will start receiving tickets again.`
        }
        confirmLabel={confirmToggle?.is_active ? 'Deactivate' : 'Reactivate'}
        variant={confirmToggle?.is_active ? 'warning' : 'info'}
        loading={updateStation.isPending}
        onConfirm={doToggleActive}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title={`Delete station "${confirmDelete?.name}"?`}
        description="Historical ticket data will be preserved, but this station will no longer appear anywhere."
        confirmLabel="Delete Station"
        variant="danger"
        loading={deleteStation.isPending}
        onConfirm={doDelete}
      />
    </div>
  );
}
