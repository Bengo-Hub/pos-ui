'use client';

import { Badge, Button, Card, CardContent } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import { useTables, useSections, useUpdateTableStatus, useReleaseTable } from '@/hooks/usePOS';
import {
  Grid3x3,
  Loader2,
  Users
} from 'lucide-react';
import { useState } from 'react';

const statusColors: Record<string, string> = {
  available: 'border-green-500/30 bg-green-500/5',
  occupied: 'border-red-500/30 bg-red-500/5',
  reserved: 'border-amber-500/30 bg-amber-500/5',
  cleaning: 'border-blue-500/30 bg-blue-500/5',
  out_of_service: 'border-gray-500/30 bg-gray-500/5',
};

const statusBadge: Record<string, string> = {
  available: 'success',
  occupied: 'error',
  reserved: 'warning',
  cleaning: 'default',
};

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

  const statusFilters = ['all', 'available', 'occupied', 'reserved'];

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Floor Management</h1>
          <p className="text-muted-foreground mt-1">Manage tables, sections, and seating.</p>
        </div>
        <div className="flex gap-2">
          {statusFilters.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all",
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-accent/30 text-muted-foreground hover:text-foreground"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {tablesLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : tables.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Grid3x3 className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-bold">No tables configured</p>
          <p className="text-sm">Run the seed script to populate tables and sections.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {tablesBySection.map((section: any) => (
            section.tables.length > 0 && (
              <div key={section.id}>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-lg font-bold">{section.name}</h2>
                  <Badge variant="outline" className="text-[10px]">{section.section_type || section.sectionType}</Badge>
                  <span className="text-xs text-muted-foreground">{section.tables.length} tables</span>
                </div>
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {section.tables.map((table: any) => (
                    <Card
                      key={table.id}
                      className={cn(
                        "border-2 transition-all hover:shadow-md cursor-pointer",
                        statusColors[table.status] || statusColors.available
                      )}
                    >
                      <CardContent className="p-4 text-center">
                        <p className="text-lg font-bold">{table.name}</p>
                        <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mt-1">
                          <Users className="h-3 w-3" />
                          <span>{table.capacity} seats</span>
                        </div>
                        <Badge
                          variant={statusBadge[table.status] as any || 'default'}
                          className="mt-2 text-[10px]"
                        >
                          {table.status}
                        </Badge>
                        {table.tags && table.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2 justify-center">
                            {table.tags.map((tag: string) => (
                              <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-accent/50 text-muted-foreground font-bold">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        {table.status === 'occupied' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3 w-full text-xs h-7"
                            onClick={() => releaseTable.mutate(table.id)}
                          >
                            Release
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )
          ))}

          {unassignedTables.length > 0 && (
            <div>
              <h2 className="text-lg font-bold mb-4">Other Tables</h2>
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {unassignedTables.map((table: any) => (
                  <Card
                    key={table.id}
                    className={cn("border-2 transition-all", statusColors[table.status] || statusColors.available)}
                  >
                    <CardContent className="p-4 text-center">
                      <p className="text-lg font-bold">{table.name}</p>
                      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mt-1">
                        <Users className="h-3 w-3" />
                        <span>{table.capacity} seats</span>
                      </div>
                      <Badge variant={statusBadge[table.status] as any || 'default'} className="mt-2 text-[10px]">
                        {table.status}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
