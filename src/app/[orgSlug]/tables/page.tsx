'use client';

import { Badge, Button, Card, CardContent } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import {
  Grid3x3,
  Plus,
  Users
} from 'lucide-react';
import { useState } from 'react';

interface TableInfo {
  id: string;
  number: number;
  seats: number;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning';
  currentOrder?: string;
  guests?: number;
  server?: string;
  elapsedMinutes?: number;
}

const mockTables: TableInfo[] = [
  { id: '1', number: 1, seats: 4, status: 'occupied', currentOrder: 'ORD-079', guests: 3, server: 'Alice K.', elapsedMinutes: 45 },
  { id: '2', number: 2, seats: 2, status: 'available' },
  { id: '3', number: 3, seats: 4, status: 'occupied', currentOrder: 'ORD-081', guests: 2, server: 'Brian O.', elapsedMinutes: 22 },
  { id: '4', number: 4, seats: 6, status: 'available' },
  { id: '5', number: 5, seats: 4, status: 'occupied', currentOrder: 'ORD-084', guests: 4, server: 'Alice K.', elapsedMinutes: 8 },
  { id: '6', number: 6, seats: 2, status: 'reserved' },
  { id: '7', number: 7, seats: 4, status: 'available' },
  { id: '8', number: 8, seats: 4, status: 'occupied', currentOrder: 'ORD-080', guests: 1, server: 'James M.', elapsedMinutes: 30 },
  { id: '9', number: 9, seats: 6, status: 'cleaning' },
  { id: '10', number: 10, seats: 2, status: 'available' },
  { id: '11', number: 11, seats: 8, status: 'available' },
  { id: '12', number: 12, seats: 4, status: 'occupied', currentOrder: 'ORD-083', guests: 2, server: 'James M.', elapsedMinutes: 12 },
  { id: '13', number: 13, seats: 2, status: 'available' },
  { id: '14', number: 14, seats: 4, status: 'available' },
  { id: '15', number: 15, seats: 6, status: 'reserved' },
  { id: '16', number: 16, seats: 2, status: 'available' },
  { id: '17', number: 17, seats: 4, status: 'available' },
  { id: '18', number: 18, seats: 4, status: 'available' },
  { id: '19', number: 19, seats: 2, status: 'available' },
  { id: '20', number: 20, seats: 8, status: 'available' },
];

const statusColors: Record<string, string> = {
  available: 'border-green-500/30 bg-green-500/5 hover:border-green-500/60',
  occupied: 'border-rose-500/30 bg-rose-500/5 hover:border-rose-500/60',
  reserved: 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60',
  cleaning: 'border-blue-500/30 bg-blue-500/5 hover:border-blue-500/60',
};

const statusBadge: Record<string, 'success' | 'error' | 'warning' | 'default'> = {
  available: 'success',
  occupied: 'error',
  reserved: 'warning',
  cleaning: 'default',
};

export default function TablesPage() {
  const [filter, setFilter] = useState<string>('all');

  const filtered = mockTables.filter((t) =>
    filter === 'all' || t.status === filter
  );

  const counts = {
    all: mockTables.length,
    available: mockTables.filter((t) => t.status === 'available').length,
    occupied: mockTables.filter((t) => t.status === 'occupied').length,
    reserved: mockTables.filter((t) => t.status === 'reserved').length,
    cleaning: mockTables.filter((t) => t.status === 'cleaning').length,
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Floor Management</h1>
          <p className="text-muted-foreground mt-1">Manage tables, seating, and reservations.</p>
        </div>
        <Button className="gap-2 shadow-lg shadow-primary/20">
          <Plus className="h-4 w-4" /> Add Table
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        {(['all', 'available', 'occupied', 'reserved', 'cleaning'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold capitalize transition-all min-h-[44px]",
              filter === s
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {s} ({counts[s]})
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filtered.map((table) => (
          <Card
            key={table.id}
            className={cn(
              "cursor-pointer transition-all hover:shadow-md border-2",
              statusColors[table.status]
            )}
          >
            <CardContent className="p-5 text-center">
              <div className="flex items-center justify-between mb-3">
                <Grid3x3 className="h-4 w-4 text-muted-foreground" />
                <Badge variant={statusBadge[table.status]}>
                  {table.status}
                </Badge>
              </div>
              <p className="text-2xl font-bold">{table.number}</p>
              <div className="flex items-center justify-center gap-1 mt-2 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                <span>{table.guests ?? 0} / {table.seats}</span>
              </div>
              {table.status === 'occupied' && (
                <div className="mt-3 pt-3 border-t border-border space-y-1">
                  <p className="text-[10px] font-mono text-muted-foreground">{table.currentOrder}</p>
                  <p className="text-[10px] text-muted-foreground">{table.elapsedMinutes}m &middot; {table.server}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
