'use client';

/**
 * OutletSwitcher — shown only to admin/manager (HQ) users.
 * Lets them switch between outlets mid-session without going back to the outlet selector.
 * Stores the drill-down selection in useOutletFilterStore + updates apiClient X-Outlet-ID.
 */

import { useEffect, useState } from 'react';
import { Building2, ChevronDown, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useOutletFilterStore, type OutletOption } from '@/store/outlet-filter';
import { apiClient } from '@/lib/api/client';

const USE_CASE_COLORS: Record<string, string> = {
  hospitality:   'bg-blue-500/20 text-blue-300',
  quick_service: 'bg-orange-500/20 text-orange-300',
  retail:        'bg-green-500/20 text-green-300',
  pharmacy:      'bg-purple-500/20 text-purple-300',
  services:      'bg-yellow-500/20 text-yellow-300',
};

function useTenantOutlets() {
  const user = useAuthStore((s) => s.user);
  const tenantID = user?.tenant_id ?? '';
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantID) return;
    apiClient
      .get<{ data: OutletOption[] }>(`/api/v1/${tenantID}/pos/outlets`)
      .then((res) => {
        const list: OutletOption[] = Array.isArray(res) ? res : (res as any).data ?? [];
        setOutlets(list.filter((o: any) => o.status !== 'archived'));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tenantID]);

  return { outlets, loading };
}

export function OutletSwitcher() {
  const user = useAuthStore((s) => s.user);
  const outlet = useAuthStore((s) => s.outlet);
  const { selectedOutlet, selectOutlet, setOutlets } = useOutletFilterStore();
  const [open, setOpen] = useState(false);
  const { outlets, loading } = useTenantOutlets();

  // Populate the filter store with full outlet list for other consumers
  useEffect(() => {
    if (outlets.length > 0) setOutlets(outlets);
  }, [outlets, setOutlets]);

  // Determine which outlet is currently displayed
  const activeOutlet = selectedOutlet ?? (outlet ? { id: outlet.id, code: outlet.code, name: outlet.name, useCase: outlet.use_case, isHq: outlet.is_hq } : null);
  const activeName = activeOutlet?.name ?? outlet?.name ?? 'Select Outlet';
  const activeUseCase = activeOutlet?.useCase ?? outlet?.use_case ?? '';

  // Only show when multiple outlets exist (no point switching if only 1)
  if (!loading && outlets.length <= 1) return null;

  function handleSelect(o: OutletOption) {
    selectOutlet(o);
    apiClient.setOutletID(o.id);
    setOpen(false);
  }

  function handleClearDrillDown() {
    // Revert to home outlet
    selectOutlet(null);
    apiClient.setOutletID(outlet?.id ?? null);
    setOpen(false);
  }

  return (
    <div className="relative px-3 pb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-sidebar-foreground/8 hover:bg-sidebar-foreground/12 border border-sidebar-foreground/10 transition-colors text-left"
      >
        <Building2 className="h-3.5 w-3.5 text-sidebar-foreground/50 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-sidebar-foreground truncate">{activeName}</p>
          {activeUseCase && (
            <span className={cn('inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-0.5', USE_CASE_COLORS[activeUseCase] ?? 'bg-sidebar-foreground/10 text-sidebar-foreground/50')}>
              {activeUseCase.replace('_', ' ')}
            </span>
          )}
        </div>
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 text-sidebar-foreground/40 animate-spin shrink-0" />
        ) : (
          <ChevronDown className={cn('h-3.5 w-3.5 text-sidebar-foreground/40 shrink-0 transition-transform duration-150', open && 'rotate-180')} />
        )}
      </button>

      {open && !loading && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div className="absolute left-3 right-3 top-full mt-1 z-20 rounded-xl border border-sidebar-border bg-sidebar shadow-xl shadow-black/20 overflow-hidden">
            <div className="px-3 py-2 border-b border-sidebar-border">
              <p className="text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/40">Switch Outlet</p>
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {/* All outlets option */}
              <button
                type="button"
                onClick={handleClearDrillDown}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-sidebar-foreground/8 transition-colors text-left"
              >
                <div className="h-6 w-6 rounded-lg bg-sidebar-foreground/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-3 w-3 text-sidebar-foreground/50" />
                </div>
                <span className="text-xs font-medium text-sidebar-foreground/70 flex-1">All Outlets (HQ view)</span>
                {!selectedOutlet && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </button>

              {outlets.map((o) => {
                const isActive = selectedOutlet?.id === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => handleSelect(o)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-sidebar-foreground/8 transition-colors text-left"
                  >
                    <div className={cn('h-6 w-6 rounded-lg flex items-center justify-center shrink-0 text-[9px] font-bold', isActive ? 'bg-primary/20 text-primary' : 'bg-sidebar-foreground/10 text-sidebar-foreground/50')}>
                      {o.code?.slice(0, 2) ?? '??'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-xs font-medium truncate', isActive ? 'text-sidebar-foreground' : 'text-sidebar-foreground/70')}>{o.name}</p>
                      {o.useCase && (
                        <span className={cn('text-[9px]', USE_CASE_COLORS[o.useCase] ?? 'text-sidebar-foreground/40')}>
                          {o.useCase.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                    {isActive && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
