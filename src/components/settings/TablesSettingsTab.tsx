'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import {
  useSections,
  useTables,
  useCreateSection,
  useCreateTable,
  useUpdateTable,
  useUpdateSection,
  useDeleteTable,
  useDeleteSection,
  type Section,
  type Table,
} from '@/hooks/usePOS';
import { usePermissions } from '@/hooks/usePermissions';
import { P } from '@/lib/rbac/permissions';
import { usePOSSettings, useUpdateTableSettings } from '@/hooks/usePOSSettings';
import { Card, CardContent } from '@/components/ui/base';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { LayoutGrid, Loader2, Map, Pencil, Plus, Trash2, X, Check, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';

// ─── Constants ────────────────────────────────────────────────────────────────

const TW = 88;
const TH = 64;
const CVW = 900;
const CVH = 520;
const GRID = 20;

const STATUS_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  available:   { fill: '#dcfce7', stroke: '#22c55e', text: '#15803d' },
  occupied:    { fill: '#fee2e2', stroke: '#ef4444', text: '#dc2626' },
  reserved:    { fill: '#fef9c3', stroke: '#eab308', text: '#a16207' },
  cleaning:    { fill: '#dbeafe', stroke: '#3b82f6', text: '#1d4ed8' },
  maintenance: { fill: '#ede9fe', stroke: '#8b5cf6', text: '#6d28d9' },
  checkout:    { fill: '#f3f4f6', stroke: '#6b7280', text: '#374151' },
};

const SECTION_PALETTE = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
];

const inputCls = 'w-full bg-accent/10 border border-border rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-primary outline-none disabled:opacity-50';
const labelCls = 'block text-xs font-semibold text-muted-foreground mb-1';

function snap(v: number) {
  return Math.round(v / GRID) * GRID;
}

function defaultPos(idx: number) {
  const col = idx % 8;
  const row = Math.floor(idx / 8);
  return { x: snap(20 + col * 110), y: snap(20 + row * 90) };
}

// ─── Inline edit state for a table card ────────────────────────────────────

interface EditState {
  name: string;
  capacity: number;
  sectionId: string;
}

function TableAgingSettings({ canEdit }: { canEdit: boolean }) {
  const { data: settings } = usePOSSettings();
  const updateTables = useUpdateTableSettings();
  const [mins, setMins] = useState<string>('');

  useEffect(() => {
    if (settings?.table_max_occupation_minutes !== undefined) {
      setMins(String(settings.table_max_occupation_minutes));
    }
  }, [settings?.table_max_occupation_minutes]);

  async function handleSave() {
    const val = parseInt(mins) || 0;
    try {
      await updateTables.mutateAsync({ table_max_occupation_minutes: val });
    } catch {
      // toast handled by hook
    }
  }

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Table Aging</p>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className={labelCls}>Max Occupation Time (minutes, 0 = disabled)</label>
            <input
              type="number"
              min={0}
              max={1440}
              value={mins}
              disabled={!canEdit}
              onChange={(e) => setMins(e.target.value)}
              placeholder="240"
              className={inputCls}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Tables occupied beyond this time show an aging badge (green → amber → red). 0 disables it.
            </p>
          </div>
          {canEdit && (
            <button
              onClick={handleSave}
              disabled={updateTables.isPending}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
            >
              {updateTables.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function TablesSettingsTab() {
  const outlet = useAuthStore((s) => s.outlet);
  const { can } = usePermissions();
  const canEdit = can(P.CONFIG_MANAGE) || can(P.CONFIG_CHANGE) || can(P.TABLES_MANAGE);

  const { data: sectionsData, isLoading } = useSections();
  const { data: tablesData, refetch: refetchTables } = useTables();
  const createSection  = useCreateSection();
  const createTable    = useCreateTable();
  const updateTable    = useUpdateTable();
  const updateSection  = useUpdateSection();
  const deleteTable    = useDeleteTable();
  const deleteSection  = useDeleteSection();

  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'floor'>('list');

  // Add section form
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [sectionName, setSectionName] = useState('');

  // Add table form
  const [showTableForm, setShowTableForm] = useState(false);
  const [tableForm, setTableForm] = useState({ name: '', capacity: 4, sectionId: '' });

  // Inline edit for table card
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ name: '', capacity: 4, sectionId: '' });

  // Inline rename section
  const [renamingSectionId, setRenamingSectionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Confirm dialogs
  const [confirmSection, setConfirmSection] = useState<Section | null>(null);
  const [confirmTable, setConfirmTable] = useState<Table | null>(null);

  // Floor plan positions
  type PosMap = Record<string, { x: number; y: number; dirty: boolean }>;
  const [positions, setPositions] = useState<PosMap>({});
  const [savingLayout, setSavingLayout] = useState(false);
  const dragging = useRef<{ id: string; svgX: number; svgY: number; ox: number; oy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const sections: Section[] = sectionsData?.data ?? [];
  const allTables: Table[]  = tablesData?.data ?? [];

  const displayTables = selectedSection
    ? allTables.filter((t) => t.section_id === selectedSection)
    : allTables;

  // ── Helpers ─────────────────────────────────────────────────────────────

  function getPos(t: Table, idx: number) {
    const local = positions[t.id];
    if (local) return local;
    if (t.x_position != null && t.y_position != null) return { x: t.x_position, y: t.y_position, dirty: false };
    return { ...defaultPos(idx), dirty: false };
  }

  function getSectionColor(sectionId?: string) {
    if (!sectionId) return SECTION_PALETTE[0];
    const idx = sections.findIndex((s) => s.id === sectionId);
    return SECTION_PALETTE[Math.max(0, idx) % SECTION_PALETTE.length];
  }

  // ── SVG drag ────────────────────────────────────────────────────────────

  const svgPoint = useCallback((clientX: number, clientY: number) => {
    const el = svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (CVW / rect.width),
      y: (clientY - rect.top) * (CVH / rect.height),
    };
  }, []);

  const onRectPointerDown = useCallback((
    e: React.PointerEvent<SVGRectElement>, id: string, x: number, y: number,
  ) => {
    if (!canEdit) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = svgPoint(e.clientX, e.clientY);
    dragging.current = { id, svgX: pt.x, svgY: pt.y, ox: x, oy: y };
  }, [canEdit, svgPoint]);

  const onSvgPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    const pt = svgPoint(e.clientX, e.clientY);
    const dx = pt.x - dragging.current.svgX;
    const dy = pt.y - dragging.current.svgY;
    const nx = snap(Math.max(0, Math.min(CVW - TW, dragging.current.ox + dx)));
    const ny = snap(Math.max(0, Math.min(CVH - TH, dragging.current.oy + dy)));
    const id = dragging.current.id;
    setPositions((prev) => ({ ...prev, [id]: { x: nx, y: ny, dirty: true } }));
  }, [svgPoint]);

  const onSvgPointerUp = useCallback(() => { dragging.current = null; }, []);

  // ── Actions ─────────────────────────────────────────────────────────────

  async function handleCreateSection() {
    if (!sectionName.trim()) return;
    try {
      await createSection.mutateAsync({ outletId: outlet?.id ?? '', name: sectionName.trim() });
      setSectionName('');
      setShowSectionForm(false);
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to create section'));
    }
  }

  async function handleRenameSection(sectionId: string) {
    if (!renameValue.trim()) return;
    try {
      await updateSection.mutateAsync({ sectionId, input: { name: renameValue.trim() } });
      setRenamingSectionId(null);
      toast.success('Section renamed');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to rename section'));
    }
  }

  function handleDeleteSection(sec: Section) {
    const count = allTables.filter((t) => t.section_id === sec.id).length;
    if (count > 0) {
      toast.error(`Move or delete the ${count} table${count > 1 ? 's' : ''} in "${sec.name}" first`);
      return;
    }
    setConfirmSection(sec);
  }

  async function doDeleteSection() {
    if (!confirmSection) return;
    try {
      await deleteSection.mutateAsync(confirmSection.id);
      if (selectedSection === confirmSection.id) setSelectedSection(null);
      toast.success(`Section "${confirmSection.name}" deleted`);
    } catch (err: unknown) {
      toast.error(await apiErrorMessage(err, 'Failed to delete section'));
    } finally {
      setConfirmSection(null);
    }
  }

  async function handleCreateTable() {
    const sectionId = tableForm.sectionId || selectedSection;
    if (!tableForm.name.trim() || !sectionId) return;
    try {
      await createTable.mutateAsync({
        outletId: outlet?.id ?? '',
        sectionId,
        name: tableForm.name.trim(),
        capacity: tableForm.capacity,
      });
      setTableForm({ name: '', capacity: 4, sectionId: '' });
      setShowTableForm(false);
      toast.success('Table added');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to create table'));
    }
  }

  function startEditTable(t: Table) {
    setEditingTableId(t.id);
    setEditState({ name: t.name, capacity: t.capacity, sectionId: t.section_id ?? '' });
  }

  async function handleSaveTableEdit(tableId: string) {
    if (!editState.name.trim()) return;
    try {
      await updateTable.mutateAsync({
        tableId,
        input: {
          name: editState.name.trim(),
          capacity: editState.capacity,
          ...(editState.sectionId ? { sectionId: editState.sectionId } : {}),
        },
      });
      setEditingTableId(null);
      toast.success('Table updated');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to update table'));
    }
  }

  function handleDeleteTable(t: Table) {
    if (t.status === 'occupied') {
      toast.error('Cannot delete an occupied table — release it first');
      return;
    }
    setConfirmTable(t);
  }

  async function doDeleteTable() {
    if (!confirmTable) return;
    try {
      await deleteTable.mutateAsync(confirmTable.id);
      toast.success(`Table "${confirmTable.name}" deleted`);
    } catch (err: unknown) {
      toast.error(await apiErrorMessage(err, 'Failed to delete table'));
    } finally {
      setConfirmTable(null);
    }
  }

  async function saveLayout() {
    const dirty = Object.entries(positions).filter(([, p]) => p.dirty);
    if (dirty.length === 0) { toast('No changes to save'); return; }
    setSavingLayout(true);
    try {
      await Promise.all(
        dirty.map(([id, pos]) =>
          updateTable.mutateAsync({ tableId: id, input: { xPosition: Math.round(pos.x), yPosition: Math.round(pos.y) } })
        )
      );
      setPositions((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => { next[k] = { ...next[k], dirty: false }; });
        return next;
      });
      toast.success(`Layout saved for ${dirty.length} table${dirty.length > 1 ? 's' : ''}`);
      refetchTables();
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to save layout'));
    } finally {
      setSavingLayout(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="h-40 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasDirty = Object.values(positions).some((p) => p.dirty);

  return (
    <div className="space-y-4">
      <TableAgingSettings canEdit={canEdit} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

      {/* ── Sections panel ──────────────────────────────────────────────── */}
      <div className="md:col-span-1 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Sections</p>
          {canEdit && (
            <button
              onClick={() => setShowSectionForm((v) => !v)}
              className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-accent border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {showSectionForm && (
          <div className="flex gap-2">
            <input
              autoFocus
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateSection()}
              placeholder="e.g. Main Hall, Bar, VIP"
              className={`${inputCls} flex-1 text-xs`}
            />
            <button
              onClick={handleCreateSection}
              disabled={createSection.isPending || !sectionName.trim()}
              className="px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {createSection.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
            </button>
            <button onClick={() => setShowSectionForm(false)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {sections.length === 0 && !showSectionForm && (
          <p className="text-xs text-muted-foreground py-6 text-center">No sections yet. Click + to add one.</p>
        )}

        <button
          onClick={() => setSelectedSection(null)}
          className={`w-full text-left px-4 py-3 rounded-xl border transition-colors text-sm font-semibold ${
            selectedSection === null
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-border bg-card text-foreground hover:border-primary/50'
          }`}
        >
          All Sections
          <span className="float-right text-xs font-normal text-muted-foreground">{allTables.length} tables</span>
        </button>

        {sections.map((sec) => {
          const count = allTables.filter((t) => t.section_id === sec.id).length;
          const isRenaming = renamingSectionId === sec.id;
          return (
            <div key={sec.id} className="group relative">
              {isRenaming ? (
                <div className="flex gap-1.5 px-1">
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameSection(sec.id);
                      if (e.key === 'Escape') setRenamingSectionId(null);
                    }}
                    className={`${inputCls} flex-1 text-xs`}
                  />
                  <button
                    onClick={() => handleRenameSection(sec.id)}
                    disabled={updateSection.isPending}
                    className="h-8 w-8 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {updateSection.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => setRenamingSectionId(null)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setSelectedSection(sec.id === selectedSection ? null : sec.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-colors text-sm font-semibold ${
                    selectedSection === sec.id
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border bg-card text-foreground hover:border-primary/50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: getSectionColor(sec.id) }} />
                    {sec.name}
                  </span>
                  <span className="float-right text-xs font-normal text-muted-foreground">{count} tables</span>
                </button>
              )}
              {canEdit && !isRenaming && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 bg-card/90 backdrop-blur-sm rounded-lg px-1 py-0.5 shadow-sm border border-border">
                  <button
                    onClick={() => { setRenamingSectionId(sec.id); setRenameValue(sec.name); }}
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                    title="Rename section"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handleDeleteSection(sec)}
                    disabled={deleteSection.isPending}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    title="Delete section"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Tables panel ────────────────────────────────────────────────── */}
      <div className="md:col-span-2 space-y-4">

        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex rounded-xl border border-border overflow-hidden text-xs font-semibold">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-2 transition-colors ${
                viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> List
            </button>
            <button
              onClick={() => setViewMode('floor')}
              className={`flex items-center gap-1.5 px-3 py-2 transition-colors ${
                viewMode === 'floor' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              <Map className="h-3.5 w-3.5" /> Floor Plan
            </button>
          </div>

          <div className="flex items-center gap-2">
            {canEdit && viewMode === 'list' && (
              <button
                onClick={() => { setShowTableForm((v) => !v); setEditingTableId(null); }}
                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add Table
              </button>
            )}
            {viewMode === 'floor' && canEdit && (
              <button
                onClick={saveLayout}
                disabled={savingLayout || !hasDirty}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
              >
                {savingLayout && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save Layout
              </button>
            )}
          </div>
        </div>

        {/* ── Add table form (labeled, responsive) ──────────────────── */}
        {showTableForm && (
          <Card className="border-dashed border-primary/40">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-foreground mb-3">New Table</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className={labelCls}>Table Name <span className="text-destructive">*</span></label>
                  <input
                    autoFocus
                    value={tableForm.name}
                    onChange={(e) => setTableForm((f) => ({ ...f, name: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateTable()}
                    placeholder="e.g. T1, Table 4, Bar 2"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Seats <span className="text-destructive">*</span></label>
                  <input
                    type="number" min={1} max={100}
                    value={tableForm.capacity}
                    onChange={(e) => setTableForm((f) => ({ ...f, capacity: parseInt(e.target.value) || 1 }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Section <span className="text-destructive">*</span></label>
                  <select
                    value={tableForm.sectionId || selectedSection || ''}
                    onChange={(e) => setTableForm((f) => ({ ...f, sectionId: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">Select section…</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleCreateTable}
                  disabled={createTable.isPending || !tableForm.name.trim() || !(tableForm.sectionId || selectedSection)}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                >
                  {createTable.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Add Table
                </button>
                <button
                  onClick={() => setShowTableForm(false)}
                  className="px-4 py-2 rounded-lg border border-border text-sm font-semibold text-muted-foreground hover:bg-accent"
                >
                  Cancel
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── List View ──────────────────────────────────────────────── */}
        {viewMode === 'list' && (
          <>
            {displayTables.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground text-sm gap-2">
                <p>
                  {selectedSection
                    ? 'No tables in this section yet — click Add Table to get started.'
                    : 'No tables yet — create a section first, then add tables.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {displayTables.map((t) => {
                  const col = STATUS_COLORS[t.status] ?? STATUS_COLORS.available;
                  const isEditing = editingTableId === t.id;
                  return (
                    <Card key={t.id} className="text-center group relative">
                      <CardContent className="p-3 space-y-1">
                        {isEditing ? (
                          <div className="space-y-2 text-left">
                            <div>
                              <label className={labelCls}>Name</label>
                              <input
                                autoFocus
                                value={editState.name}
                                onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))}
                                className={`${inputCls} text-xs`}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Seats</label>
                              <input
                                type="number" min={1} max={100}
                                value={editState.capacity}
                                onChange={(e) => setEditState((s) => ({ ...s, capacity: parseInt(e.target.value) || 1 }))}
                                className={`${inputCls} text-xs`}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Section</label>
                              <select
                                value={editState.sectionId}
                                onChange={(e) => setEditState((s) => ({ ...s, sectionId: e.target.value }))}
                                className={`${inputCls} text-xs`}
                              >
                                <option value="">No section</option>
                                {sections.map((s) => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </select>
                            </div>
                            <div className="flex gap-1 pt-1">
                              <button
                                onClick={() => handleSaveTableEdit(t.id)}
                                disabled={updateTable.isPending}
                                className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1"
                              >
                                {updateTable.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                Save
                              </button>
                              <button
                                onClick={() => setEditingTableId(null)}
                                className="px-2 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-accent"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm font-bold">{t.name}</p>
                            <p className="text-xs text-muted-foreground">{t.capacity} seats</p>
                            <span
                              className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
                              style={{ backgroundColor: col.fill, color: col.text }}
                            >
                              {t.status}
                            </span>
                            {t.section_id && (
                              <p className="text-[10px] text-muted-foreground truncate">
                                {sections.find((s) => s.id === t.section_id)?.name ?? ''}
                              </p>
                            )}
                            {canEdit && (
                              <div className="absolute top-1.5 right-1.5 hidden group-hover:flex items-center gap-0.5 bg-card/90 backdrop-blur-sm rounded-lg px-1 py-0.5 shadow-sm border border-border">
                                <button
                                  onClick={() => startEditTable(t)}
                                  className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                                  title="Edit table"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTable(t)}
                                  disabled={deleteTable.isPending}
                                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                  title={t.status === 'occupied' ? 'Release table first' : 'Delete table'}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── Floor Plan View ─────────────────────────────────────────── */}
        {viewMode === 'floor' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {canEdit
                ? 'Drag tables to position them. Purple outline = unsaved. Click Save Layout when done.'
                : 'Floor plan view (read-only).'}
            </p>
            <div className="rounded-xl border border-border overflow-hidden bg-muted/20">
              {displayTables.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                  No tables to display. Add tables to a section first.
                </div>
              ) : (
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${CVW} ${CVH}`}
                  className="w-full select-none"
                  style={{ touchAction: 'none', display: 'block' }}
                  onPointerMove={onSvgPointerMove}
                  onPointerUp={onSvgPointerUp}
                  onPointerLeave={onSvgPointerUp}
                >
                  <defs>
                    <pattern id="floorGrid" x="0" y="0" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
                      <circle cx="1" cy="1" r="1" fill="#d1d5db" />
                    </pattern>
                  </defs>
                  <rect width={CVW} height={CVH} fill="url(#floorGrid)" />
                  {displayTables.map((t, idx) => {
                    const { x, y, dirty } = getPos(t, idx);
                    const col = STATUS_COLORS[t.status] ?? STATUS_COLORS.available;
                    const secColor = getSectionColor(t.section_id);
                    return (
                      <g key={t.id} style={{ cursor: canEdit ? 'grab' : 'default' }}>
                        <rect x={x} y={y} width={TW} height={4} rx={4} fill={secColor} style={{ pointerEvents: 'none' }} />
                        <rect
                          x={x} y={y + 4} width={TW} height={TH - 4} rx={6}
                          fill={col.fill}
                          stroke={dirty ? '#7c3aed' : col.stroke}
                          strokeWidth={dirty ? 2.5 : 1.5}
                          onPointerDown={(e) => onRectPointerDown(e, t.id, x, y)}
                        />
                        <text x={x + TW / 2} y={y + TH / 2 + 2} textAnchor="middle" dominantBaseline="middle"
                          fontSize={13} fontWeight="700" fill={col.text}
                          style={{ pointerEvents: 'none', userSelect: 'none' }}>
                          {t.name}
                        </text>
                        <text x={x + TW / 2} y={y + TH - 6} textAnchor="middle" fontSize={9} fill={col.text} opacity={0.65}
                          style={{ pointerEvents: 'none', userSelect: 'none' }}>
                          {t.capacity} seats
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {Object.entries(STATUS_COLORS).map(([status, col]) => (
                <span key={status} className="flex items-center gap-1 text-[10px] text-muted-foreground capitalize">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: col.stroke }} />
                  {status}
                </span>
              ))}
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="h-2 w-2 rounded-sm bg-violet-600" />
                unsaved move
              </span>
              {sections.map((sec, i) => (
                <span key={sec.id} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: SECTION_PALETTE[i % SECTION_PALETTE.length] }} />
                  {sec.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmSection}
        onOpenChange={(o) => { if (!o) setConfirmSection(null); }}
        title={`Delete section "${confirmSection?.name}"?`}
        description="This cannot be undone. Make sure no tables are assigned to this section first."
        confirmLabel="Delete Section"
        variant="danger"
        loading={deleteSection.isPending}
        onConfirm={doDeleteSection}
      />

      <ConfirmDialog
        open={!!confirmTable}
        onOpenChange={(o) => { if (!o) setConfirmTable(null); }}
        title={`Delete table "${confirmTable?.name}"?`}
        description="This cannot be undone. Historical order data will be preserved."
        confirmLabel="Delete Table"
        variant="danger"
        loading={deleteTable.isPending}
        onConfirm={doDeleteTable}
      />
      </div>
    </div>
  );
}
