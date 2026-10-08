'use client';

import { useState } from 'react';
import { AlertTriangle, Bell, Check, ChefHat, Loader2, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { Button, Card, CardContent } from '@/components/ui/base';
import { KDS_TONES, getKDSTone, setKDSTone, playKDSTone, type KDSToneId } from '@/lib/kds-sounds';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  useAllKDSStations, useCreateKDSStation, useUpdateKDSStation, useDeleteKDSStation,
  type KDSStation, type KDSStationType,
} from '@/hooks/useKDS';
import { useCategories } from '@/hooks/usePOS';
import { normaliseCategoryKey } from '@/lib/kds/routing';
import { usePermissions } from '@/hooks/usePermissions';
import { P } from '@/lib/rbac/permissions';
import { useAuthStore } from '@/store/auth';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { Toggle, inputClass, labelClass } from './shared';
import { KDSItemAssignmentPanel } from './KDSItemAssignmentPanel';

type StationRef = { id: string; name: string; is_active: boolean };

// Station type determines which physical KDS screen/queue receives this station's tickets
// (GetKitchenQueue / GetBarQueue on the server filter by this exact value) — get it wrong and a
// "Bar" station created as the default "kitchen" type never shows up on the bar screen, while its
// tickets bleed into the kitchen queue instead.
const STATION_TYPES: { value: KDSStationType; label: string; hint: string }[] = [
  { value: 'kitchen', label: 'Kitchen', hint: 'Hot food prep — shows on the Kitchen Display' },
  { value: 'bar', label: 'Bar', hint: 'Drinks/cocktails — shows on the Bar Display' },
  { value: 'cold', label: 'Cold Station', hint: 'Salads/cold prep' },
  { value: 'expo', label: 'Expo', hint: 'Expediter — sees every unresolved item as a secondary copy' },
  { value: 'all', label: 'All', hint: 'Receives a secondary copy of every unresolved item' },
];

function StationTypeSelect({ value, onChange }: { value: KDSStationType; onChange: (v: KDSStationType) => void }) {
  return (
    <div className="space-y-1">
      <label className={labelClass}>Station Type</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as KDSStationType)}
        className={inputClass}
      >
        {STATION_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      <p className="text-[11px] text-muted-foreground">
        {STATION_TYPES.find((t) => t.value === value)?.hint}
      </p>
    </div>
  );
}

// Merge category name lists by normalised key (the server's matching rule), keeping the first
// spelling, so stale filters (a category renamed or deleted in inventory) still render and can
// be removed, while "Coffee" and a stale "Coffees" never show as two chips.
function mergeCategories(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const c of list) {
      const k = normaliseCategoryKey(c);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
  }
  return out;
}

// CategoryChips renders the category filter picker. Chips already claimed by ANOTHER station are
// shown deactivated so the same category cannot be routed to two stations; filter entries that no
// longer match an inventory category are marked so they can be replaced.
function CategoryChips({
  categories, selected, usedElsewhere, stale, onToggle, loading,
}: {
  categories: string[];
  selected: string[];
  usedElsewhere: Set<string>; // normalised category keys claimed by other stations
  stale?: Set<string>; // normalised keys of filter entries missing from inventory
  onToggle: (cat: string) => void;
  loading?: boolean;
}) {
  if (loading) {
    return <p className="text-xs text-muted-foreground">Loading categories…</p>;
  }
  if (categories.length === 0) {
    return <p className="text-xs text-muted-foreground">No categories found in inventory.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((cat) => {
        const key = normaliseCategoryKey(cat);
        const isSel = selected.some((s) => normaliseCategoryKey(s) === key);
        const blocked = !isSel && usedElsewhere.has(key);
        const isStale = stale?.has(key) ?? false;
        return (
          <button
            key={cat}
            type="button"
            disabled={blocked}
            title={
              blocked ? 'Already assigned to another station'
                : isStale ? 'No inventory category has this name any more. It routes nothing; remove it.'
                : undefined
            }
            onClick={() => onToggle(cat)}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              isSel && isStale
                ? 'bg-destructive/10 text-destructive border-destructive'
                : isSel
                ? 'bg-primary text-primary-foreground border-primary'
                : blocked
                ? 'border-border/40 text-muted-foreground/40 line-through cursor-not-allowed'
                : 'border-border text-muted-foreground hover:border-primary'
            }`}
          >
            {isStale && <AlertTriangle className="h-3 w-3" />}
            {cat}
          </button>
        );
      })}
    </div>
  );
}

// InheritedCoverage lists the sub-categories a station owns through a parent section it claims
// (server-computed category_routes minus the station's own filter entries).
function InheritedCoverage({ station }: { station: KDSStation }) {
  const own = new Set((station.category_filter ?? []).map(normaliseCategoryKey));
  const inherited = (station.category_routes ?? []).filter((c) => !own.has(normaliseCategoryKey(c)));
  if (inherited.length === 0) return null;
  return (
    <p className="mt-1 text-[11px] text-muted-foreground">
      Also covers: {inherited.join(', ')}
    </p>
  );
}

export function KDSStationsTab() {
  const { data, isLoading } = useAllKDSStations();
  const { data: categoriesData, isLoading: catsLoading } = useCategories();
  const createStation = useCreateKDSStation();
  const updateStation = useUpdateKDSStation();
  const deleteStation = useDeleteKDSStation();
  const { can } = usePermissions();
  const outlet = useAuthStore((s) => s.outlet);
  const canEdit = can(P.CONFIG_MANAGE) || can(P.CONFIG_CHANGE);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', station_type: 'kitchen' as KDSStationType, category_filter: [] as string[], sort_order: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', station_type: 'kitchen' as KDSStationType, category_filter: [] as string[], sort_order: 0 });
  const [confirmToggle, setConfirmToggle] = useState<StationRef | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StationRef | null>(null);

  const stations = data?.data ?? [];
  // This outlet's routing summary (the list is outlet-scoped by the X-Outlet-ID header).
  const routing = (data?.routing ?? []).find((r) => !outlet?.id || r.outlet_id === outlet.id) ?? data?.routing?.[0];
  // Every inventory category, parent sections included (from the server's routing coverage),
  // plus the till's sellable list as a fallback when the tree could not be loaded.
  const liveCategories = mergeCategories(
    stations.flatMap((s) => s.category_routes ?? []),
    routing?.unclaimed_categories ?? [],
    (categoriesData ?? []).map((c) => c.name),
  );
  const staleOf = (s: { stale_filters?: string[] }) =>
    new Set((s.stale_filters ?? []).map(normaliseCategoryKey));
  const fallbackStation = stations.find((s) => s.id === routing?.fallback_station_id);

  // Categories claimed by other stations (normalised keys, the server's conflict rule). excludeId
  // keeps a station from conflicting with itself when editing. Drives chip deactivation.
  const usedByOthers = (excludeId?: string) =>
    new Set(
      stations
        .filter((s) => s.id !== excludeId)
        .flatMap((s) => (s.category_filter ?? []).map(normaliseCategoryKey)),
    );
  const toggleIn = (list: string[], cat: string) => {
    const k = normaliseCategoryKey(cat);
    return list.some((c) => normaliseCategoryKey(c) === k)
      ? list.filter((c) => normaliseCategoryKey(c) !== k)
      : [...list, cat];
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    try {
      await createStation.mutateAsync({
        outlet_id: outlet?.id ?? '',
        name: form.name,
        station_type: form.station_type,
        category_filter: form.category_filter,
        sort_order: form.sort_order,
      });
      setForm({ name: '', station_type: 'kitchen', category_filter: [], sort_order: 0 });
      setShowForm(false);
      toast.success('Station created');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to create station'));
    }
  };

  const doToggleActive = () => {
    if (!confirmToggle) return;
    const action = confirmToggle.is_active ? 'deactivate' : 'reactivate';
    updateStation.mutate(
      { stationID: confirmToggle.id, input: { is_active: !confirmToggle.is_active } },
      {
        onSuccess: () => { toast.success(`Station ${action}d`); setConfirmToggle(null); },
        onError: async (e) => { toast.error(await apiErrorMessage(e, `Failed to ${action} station`)); setConfirmToggle(null); },
      },
    );
  };

  const startEdit = (s: { id: string; name: string; station_type: KDSStationType; category_filter: string[]; sort_order: number }) => {
    setEditingId(s.id);
    setEditForm({ name: s.name, station_type: s.station_type ?? 'kitchen', category_filter: s.category_filter ?? [], sort_order: s.sort_order });
  };

  const handleSaveEdit = async (stationID: string) => {
    if (!editForm.name.trim()) return;
    try {
      await updateStation.mutateAsync({
        stationID,
        input: { name: editForm.name, station_type: editForm.station_type, category_filter: editForm.category_filter, sort_order: editForm.sort_order },
      });
      setEditingId(null);
      toast.success('Station updated');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to update station'));
    }
  };

  const doDelete = () => {
    if (!confirmDelete) return;
    deleteStation.mutate(confirmDelete.id, {
      onSuccess: () => { toast.success(`Station "${confirmDelete.name}" deleted`); setConfirmDelete(null); },
      onError: async (e) => { toast.error(await apiErrorMessage(e, 'Failed to delete station')); setConfirmDelete(null); },
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
      <WaiterToneSetting />

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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <StationTypeSelect value={form.station_type} onChange={(v) => setForm((f) => ({ ...f, station_type: v }))} />
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
              <label className={labelClass}>Categories (a section also covers its sub-categories)</label>
              <CategoryChips
                categories={mergeCategories(liveCategories, form.category_filter)}
                selected={form.category_filter}
                usedElsewhere={usedByOthers()}
                loading={catsLoading && liveCategories.length === 0}
                onToggle={(cat) => setForm((f) => ({ ...f, category_filter: toggleIn(f.category_filter, cat) }))}
              />
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

      {stations.length > 0 && routing && routing.tree_loaded && routing.unclaimed_categories.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs">
          <p className="font-semibold text-foreground">
            Not assigned to a station ({routing.unclaimed_categories.length})
            {fallbackStation ? `: these go to ${fallbackStation.name}` : ''}
          </p>
          <p className="mt-1 text-muted-foreground">{routing.unclaimed_categories.join(', ')}</p>
        </div>
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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className={labelClass}>Station Name</label>
                      <input
                        autoFocus
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                    <StationTypeSelect value={editForm.station_type} onChange={(v) => setEditForm((f) => ({ ...f, station_type: v }))} />
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
                    <label className={labelClass}>Categories (a section also covers its sub-categories)</label>
                    <CategoryChips
                      categories={mergeCategories(editForm.category_filter, liveCategories)}
                      selected={editForm.category_filter}
                      usedElsewhere={usedByOthers(station.id)}
                      stale={staleOf(station)}
                      loading={catsLoading && liveCategories.length === 0}
                      onToggle={(cat) => setEditForm((f) => ({ ...f, category_filter: toggleIn(f.category_filter, cat) }))}
                    />
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
                      <span className="text-[10px] font-semibold bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full capitalize">
                        {STATION_TYPES.find((t) => t.value === station.station_type)?.label ?? station.station_type}
                      </span>
                      {!station.is_active && (
                        <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(station.category_filter ?? []).length > 0
                        ? (station.category_filter ?? []).map((c) => (
                          staleOf(station).has(normaliseCategoryKey(c))
                            ? (
                              <span key={c} title="No inventory category has this name any more. It routes nothing."
                                className="inline-flex items-center gap-1 text-[10px] bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-semibold">
                                <AlertTriangle className="h-3 w-3" />{c}
                              </span>
                            )
                            : <span key={c} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">{c}</span>
                        ))
                        : <span className="text-[10px] text-muted-foreground">No categories</span>
                      }
                    </div>
                    <InheritedCoverage station={station} />
                    {(station.stale_filters?.length ?? 0) > 0 && (
                      <p className="mt-1 text-[11px] text-destructive">
                        {station.stale_filters!.length === 1 ? 'One category name no longer exists' : `${station.stale_filters!.length} category names no longer exist`} in
                        inventory, so items in the renamed category go to another station. Edit the station and pick the current name.
                      </p>
                    )}
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

      <KDSItemAssignmentPanel />
    </div>
  );
}

// WaiterToneSetting lets each station pick (and test-play) the tone that rings when the KDS
// "Call Waiter" action fires. The choice is stored per-device in localStorage.
function WaiterToneSetting() {
  const [tone, setTone] = useState<KDSToneId>(() => getKDSTone());

  const choose = (id: KDSToneId) => {
    setTone(id);
    setKDSTone(id);
    playKDSTone(id); // preview on select
  };

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Waiter Alert Tone</p>
        </div>
        <p className="text-xs text-muted-foreground">
          The sound this station rings when staff tap “Waiter” on a ticket to summon a server. Tap a
          tone to preview and select it. Saved on this device.
        </p>
        <div className="flex flex-wrap gap-2">
          {KDS_TONES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => choose(t.id)}
              className={
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ' +
                (tone === t.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted text-muted-foreground border-border hover:bg-muted/80')
              }
            >
              {tone === t.id ? <Check className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {t.label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
