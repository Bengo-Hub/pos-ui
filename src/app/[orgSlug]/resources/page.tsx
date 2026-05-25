'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { useAuthStore } from '@/store/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useState } from 'react';
import { Loader2, Sofa } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Resource {
  id: string;
  name: string;
  type: string;
  status: 'available' | 'occupied' | 'maintenance' | 'reserved';
  capacity?: number;
  notes?: string;
  current_booking_id?: string;
  current_customer?: string;
}

const STATUS_CONFIG: Record<Resource['status'], { label: string; className: string; dot: string }> = {
  available:   { label: 'Available',   className: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700', dot: 'bg-emerald-500' },
  occupied:    { label: 'Occupied',    className: 'bg-amber-500/10  border-amber-500/20  text-amber-700',    dot: 'bg-amber-500'  },
  reserved:    { label: 'Reserved',    className: 'bg-blue-500/10   border-blue-500/20   text-blue-700',     dot: 'bg-blue-500'   },
  maintenance: { label: 'Maintenance', className: 'bg-red-500/10    border-red-500/20    text-red-600',      dot: 'bg-red-500'    },
};

function useResources(typeFilter: string) {
  const user = useAuthStore((s) => s.user);
  const tenantID = user?.tenant_id ?? '';
  return useQuery({
    queryKey: ['resources', tenantID, typeFilter],
    queryFn: () =>
      apiClient.get<{ data: Resource[] }>(
        `/api/v1/${tenantID}/pos/resources${typeFilter ? `?type=${encodeURIComponent(typeFilter)}` : ''}`
      ),
    enabled: !!tenantID,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

function useUpdateResourceStatus() {
  const user = useAuthStore((s) => s.user);
  const tenantID = user?.tenant_id ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Resource['status'] }) =>
      apiClient.patch(`/api/v1/${tenantID}/pos/resources/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resources', tenantID] }),
  });
}

function ResourceCard({ resource }: { resource: Resource }) {
  const cfg = STATUS_CONFIG[resource.status];
  const { mutate, isPending } = useUpdateResourceStatus();
  const nextStatuses: Resource['status'][] = ['available', 'occupied', 'reserved', 'maintenance'].filter(
    (s) => s !== resource.status
  ) as Resource['status'][];

  return (
    <div className={cn('rounded-2xl border p-4 flex flex-col gap-3 transition-all', cfg.className)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-sm">{resource.name}</p>
          <p className="text-xs opacity-70 mt-0.5 capitalize">{resource.type.replace(/_/g, ' ')}</p>
        </div>
        <span className={cn('flex items-center gap-1.5 text-[10px] font-bold border px-2 py-0.5 rounded-full', cfg.className)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
          {cfg.label}
        </span>
      </div>

      {resource.current_customer && (
        <p className="text-xs font-medium opacity-80 truncate">{resource.current_customer}</p>
      )}
      {resource.capacity && (
        <p className="text-[10px] opacity-60">Capacity: {resource.capacity}</p>
      )}
      {resource.notes && (
        <p className="text-[10px] opacity-60 italic truncate">{resource.notes}</p>
      )}

      <div className="flex gap-1.5 flex-wrap mt-auto pt-1">
        {nextStatuses.map((s) => (
          <button
            key={s}
            disabled={isPending}
            onClick={() => mutate({ id: resource.id, status: s })}
            className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-white/60 hover:bg-white/90 border border-current/20 transition-colors disabled:opacity-50 capitalize"
          >
            {s === 'available' ? 'Free' : s === 'occupied' ? 'Mark Occupied' : s === 'reserved' ? 'Reserve' : 'Maintenance'}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResourcesPage() {
  const [typeFilter, setTypeFilter] = useState('');
  const { data, isLoading } = useResources(typeFilter);
  const resources = data?.data ?? [];

  const types = Array.from(new Set(resources.map((r) => r.type)));
  const counts = {
    available:   resources.filter((r) => r.status === 'available').length,
    occupied:    resources.filter((r) => r.status === 'occupied').length,
    reserved:    resources.filter((r) => r.status === 'reserved').length,
    maintenance: resources.filter((r) => r.status === 'maintenance').length,
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Sofa className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Resources</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Rooms, chairs, stations — real-time availability</p>
        </div>
      </div>

      {/* Summary pills */}
      <div className="flex gap-3 flex-wrap mb-6">
        {(Object.entries(counts) as [Resource['status'], number][]).map(([status, count]) => {
          const cfg = STATUS_CONFIG[status];
          return (
            <div key={status} className={cn('flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold', cfg.className)}>
              <span className={cn('h-2 w-2 rounded-full', cfg.dot)} />
              {count} {cfg.label}
            </div>
          );
        })}
      </div>

      {/* Type filter */}
      {types.length > 1 && (
        <div className="flex gap-2 flex-wrap mb-5">
          <button
            onClick={() => setTypeFilter('')}
            className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors', !typeFilter ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground')}
          >
            All
          </button>
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors capitalize', typeFilter === t ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground')}
            >
              {t.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading resources…</span>
        </div>
      ) : resources.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
          <Sofa className="h-10 w-10 opacity-30" />
          <p className="font-medium">No resources configured</p>
          <p className="text-xs">Add rooms, chairs or stations in Settings</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {resources.map((r) => <ResourceCard key={r.id} resource={r} />)}
        </div>
      )}
    </div>
  );
}

export default function ResourcesPageGated() {
  return (
    <ModuleGate moduleKey="resources" fallback={<ModuleUnavailablePage moduleKey="resources" />}>
      <ResourcesPage />
    </ModuleGate>
  );
}
