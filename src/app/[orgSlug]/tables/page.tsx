'use client';

import { Badge, Button, Card, CardContent } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import { useTables, useSections, useUpdateTableStatus, useReleaseTable } from '@/hooks/usePOS';
import {
  CheckCircle,
  Grid3x3,
  Loader2,
  Users,
  X,
} from 'lucide-react';
import { useState } from 'react';

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { border: string; bg: string; badge: string; label: string; dot: string }> = {
  available:      { border: 'border-emerald-500', bg: 'bg-emerald-500/5',  badge: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400', label: 'Available',  dot: 'bg-emerald-500' },
  occupied:       { border: 'border-red-500',     bg: 'bg-red-500/5',      badge: 'bg-red-500/20 text-red-700 dark:text-red-400',             label: 'Occupied',   dot: 'bg-red-500'     },
  reserved:       { border: 'border-amber-500',   bg: 'bg-amber-500/5',    badge: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',        label: 'Reserved',   dot: 'bg-amber-500'   },
  cleaning:       { border: 'border-blue-500',    bg: 'bg-blue-500/5',     badge: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',           label: 'Cleaning',   dot: 'bg-blue-500'    },
  out_of_service: { border: 'border-gray-400',    bg: 'bg-gray-500/5',     badge: 'bg-muted text-muted-foreground',                           label: 'Out of Svc', dot: 'bg-gray-400'    },
};

function getStatusCfg(status: string) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.available;
}

// ─── Status filter pills ────────────────────────────────────────────────────────

const FILTER_OPTIONS = [
  { value: 'all',       label: 'All',       dot: '' },
  { value: 'available', label: 'Available', dot: 'bg-emerald-500' },
  { value: 'occupied',  label: 'Occupied',  dot: 'bg-red-500'     },
  { value: 'reserved',  label: 'Reserved',  dot: 'bg-amber-500'   },
  { value: 'cleaning',  label: 'Cleaning',  dot: 'bg-blue-500'    },
];

// ─── Table Card ────────────────────────────────────────────────────────────────

interface TableCardProps {
  table: any;
  onRelease: () => void;
  onChangeStatus: (status: string) => void;
  releaseLoading: boolean;
}

function TableCard({ table, onRelease, onChangeStatus, releaseLoading }: TableCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const cfg = getStatusCfg(table.status);

  return (
    <>
      <button
        onClick={() => setSheetOpen(true)}
        className={cn(
          'relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all min-h-36 w-full touch-manipulation active:scale-95 hover:shadow-md',
          cfg.border,
          cfg.bg
        )}
      >
        {/* Status dot */}
        <span className={cn('absolute top-3 right-3 h-2.5 w-2.5 rounded-full', cfg.dot)} />

        {/* Table number — large */}
        <span className="text-3xl font-bold font-display leading-none mb-1">{table.name}</span>

        {/* Capacity */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
          <Users className="h-3.5 w-3.5" />
          <span>{table.capacity} seats</span>
        </div>

        {/* Status badge */}
        <span className={cn('text-[10px] px-2.5 py-1 rounded-full font-semibold capitalize', cfg.badge)}>
          {cfg.label}
        </span>

        {/* Tags */}
        {table.tags && table.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2 justify-center">
            {table.tags.map((tag: string) => (
              <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground font-bold">
                {tag}
              </span>
            ))}
          </div>
        )}
      </button>

      {/* Action sheet (bottom drawer) */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-card rounded-t-3xl border border-border shadow-2xl pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="h-1 w-12 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Sheet header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className={cn('h-10 w-10 rounded-xl border-2 flex items-center justify-center font-bold text-lg', cfg.border, cfg.bg)}>
                  {table.name}
                </div>
                <div>
                  <p className="font-bold">{table.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className={cn('h-2 w-2 rounded-full', cfg.dot)} />
                    {cfg.label} · {table.capacity} seats
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSheetOpen(false)}
                className="h-9 w-9 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Actions */}
            <div className="p-4 space-y-2.5">
              {/* Assign order */}
              <button
                onClick={() => setSheetOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl border-2 border-primary bg-primary/5 hover:bg-primary/10 transition-colors min-h-14 touch-manipulation"
              >
                <CheckCircle className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <p className="font-bold text-sm">Assign Order</p>
                  <p className="text-xs text-muted-foreground">Link an order to this table</p>
                </div>
              </button>

              {/* Change status options */}
              <div className="grid grid-cols-2 gap-2">
                {['available', 'occupied', 'reserved', 'cleaning'].map((s) => {
                  const sc = getStatusCfg(s);
                  const isActive = table.status === s;
                  return (
                    <button
                      key={s}
                      onClick={() => {
                        onChangeStatus(s);
                        setSheetOpen(false);
                      }}
                      disabled={isActive}
                      className={cn(
                        'flex items-center gap-2 px-3 py-3 rounded-xl border-2 transition-all min-h-13 touch-manipulation',
                        isActive
                          ? cn(sc.border, sc.bg, 'opacity-100 cursor-default')
                          : 'border-border hover:border-primary/30 hover:bg-accent/30'
                      )}
                    >
                      <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', sc.dot)} />
                      <span className="text-sm font-semibold capitalize">{sc.label}</span>
                      {isActive && <span className="ml-auto text-[10px] text-muted-foreground">Current</span>}
                    </button>
                  );
                })}
              </div>

              {/* Release table */}
              {table.status === 'occupied' && (
                <Button
                  variant="outline"
                  className="w-full min-h-13 border-destructive/30 text-destructive hover:bg-destructive/10 gap-2"
                  onClick={() => {
                    onRelease();
                    setSheetOpen(false);
                  }}
                  disabled={releaseLoading}
                >
                  {releaseLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Release Table
                </Button>
              )}
            </div>

            {/* Safe bottom spacing */}
            <div className="h-4" />
          </div>
        </div>
      )}
    </>
  );
}

// ─── Section Group ─────────────────────────────────────────────────────────────

function SectionGroup({
  title,
  type,
  tables,
  updateStatus,
  releaseTable,
}: {
  title: string;
  type?: string;
  tables: any[];
  updateStatus: any;
  releaseTable: any;
}) {
  const counts = tables.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h2 className="text-base font-bold font-display">{title}</h2>
        {type && (
          <Badge variant="outline" className="text-[10px] capitalize">
            {type.replace('_', ' ')}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">{tables.length} table{tables.length !== 1 ? 's' : ''}</span>
        {/* Mini status summary */}
        <div className="flex items-center gap-2 ml-auto">
          {Object.entries(counts).map(([status, count]) => {
            const cfg = getStatusCfg(status);
            return (
              <span key={status} className={cn('flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold', cfg.badge)}>
                <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
                {count}
              </span>
            );
          })}
        </div>
      </div>
      {/* Table grid */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {tables.map((table: any) => (
          <TableCard
            key={table.id}
            table={table}
            onRelease={() => releaseTable.mutate(table.id)}
            onChangeStatus={(status) => updateStatus.mutate({ id: table.id, status })}
            releaseLoading={releaseTable.isPending}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Summary bar ──────────────────────────────────────────────────────────────

function SummaryBar({ tables }: { tables: any[] }) {
  const cfg = {
    available: { label: 'Available', dot: 'bg-emerald-500', badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
    occupied:  { label: 'Occupied',  dot: 'bg-red-500',     badge: 'bg-red-500/15 text-red-700 dark:text-red-400'            },
    reserved:  { label: 'Reserved',  dot: 'bg-amber-500',   badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400'      },
    cleaning:  { label: 'Cleaning',  dot: 'bg-blue-500',    badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-400'         },
  };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {(Object.entries(cfg) as [string, typeof cfg[keyof typeof cfg]][]).map(([status, c]) => {
        const count = tables.filter((t) => t.status === status).length;
        return (
          <div key={status} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold', c.badge)}>
            <span className={cn('h-2 w-2 rounded-full', c.dot)} />
            {c.label}
            <span className="font-bold ml-0.5">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TablesPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: tablesData, isLoading: tablesLoading } = useTables(
    statusFilter !== 'all' ? { status: statusFilter } : undefined
  );
  const { data: sectionsData } = useSections();
  const updateStatus = useUpdateTableStatus();
  const releaseTable = useReleaseTable();

  const tables = tablesData?.data ?? [];
  const sections = sectionsData?.data ?? [];

  // Group tables by section
  const tablesBySection = sections.map((section: any) => ({
    ...section,
    tables: tables.filter((t: any) => {
      const sectionId = t.section_id || t.edges?.section?.id;
      return sectionId === section.id;
    }),
  }));

  // Tables without section
  const unassignedTables = tables.filter((t: any) => {
    const sectionId = t.section_id || t.edges?.section?.id;
    return !sectionId || !sections.find((s: any) => s.id === sectionId);
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sticky top bar */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-border bg-background space-y-4">
        {/* Title row */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold font-display tracking-tight">Floor Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tables.length} table{tables.length !== 1 ? 's' : ''} across {sections.length} section{sections.length !== 1 ? 's' : ''}
            </p>
          </div>
          {tables.length > 0 && <SummaryBar tables={tables} />}
        </div>

        {/* Status filter pills — horizontal scroll */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all min-h-9.5 shrink-0',
                statusFilter === opt.value
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
              )}
            >
              {opt.dot && (
                <span className={cn('h-2 w-2 rounded-full', opt.dot)} />
              )}
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {tablesLoading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading tables…</p>
          </div>
        ) : tables.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-4">
            <Grid3x3 className="h-14 w-14 opacity-20" />
            <div className="text-center">
              <p className="font-bold">No tables configured</p>
              <p className="text-sm mt-1">Run the seed script to populate tables and sections.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Section groups */}
            {tablesBySection.map(
              (section: any) =>
                section.tables.length > 0 && (
                  <SectionGroup
                    key={section.id}
                    title={section.name}
                    type={section.section_type || section.sectionType}
                    tables={section.tables}
                    updateStatus={updateStatus}
                    releaseTable={releaseTable}
                  />
                )
            )}

            {/* Unassigned tables */}
            {unassignedTables.length > 0 && (
              <SectionGroup
                title="Other Tables"
                tables={unassignedTables}
                updateStatus={updateStatus}
                releaseTable={releaseTable}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
