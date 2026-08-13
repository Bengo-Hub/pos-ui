'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Button } from '@/components/ui/base';
import { CreateLayawayModal } from '@/components/pos/layaway/create-layaway-modal';
import { useLayawayPlans } from '@/hooks/useLayaway';
import { useOutletFilterStore } from '@/store/outlet-filter';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { SearchableCombobox } from '@bengo-hub/shared-ui-lib/combobox';
import { cn } from '@/lib/utils';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '@bengo-hub/shared-ui-lib/data-table';
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker';
import { buildLayawayColumns } from './layaway-columns';

function LayawayListPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const router = useRouter();
  const searchParams = useSearchParams();

  // Branch filter (QA req 7a): filter plans by outlet; "" = all branches.
  // Preselects + follows the globally selected outlet (top-nav switcher).
  const outlets = useOutletFilterStore((s) => s.outlets);
  const selectedOutlet = useOutletFilterStore((s) => s.selectedOutlet);
  const [outletFilter, setOutletFilter] = useState(selectedOutlet?.id ?? '');
  useEffect(() => {
    setOutletFilter(selectedOutlet?.id ?? '');
  }, [selectedOutlet?.id]);
  const outletNameById = useMemo(() => Object.fromEntries(outlets.map((o) => [o.id, o.name])), [outlets]);

  const [range, setRange] = useState<DateRange>({ from: '', to: '' });
  const { data: plans = [], isLoading, isError, refetch, isFetching } = useLayawayPlans('active', outletFilter || undefined, range.from || undefined, range.to || undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';
  const columns = useMemo(() => buildLayawayColumns(currency, outletNameById), [currency, outletNameById]);

  // ?new=1 from redirect (e.g. navigating to /layaway/new)
  useEffect(() => {
    if (searchParams?.get('new') === '1') {
      setCreateOpen(true);
      router.replace(`/${orgSlug}/layaway`);
    }
  }, [searchParams, orgSlug, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading…</span>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Layaway Plans</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage customer layaway agreements</p>
        </div>
        <div className="flex items-center gap-2">
          {outlets.length > 1 && (
            <div className="w-48">
              <SearchableCombobox
                options={outlets.map((o) => ({ value: o.id, label: o.name }))}
                value={outletFilter}
                onChange={(value) => setOutletFilter(value)}
                placeholder="All branches"
                clearable
              />
            </div>
          )}
          <DateRangePicker value={range} onChange={setRange} className="w-60" />
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh — pulls in installments paid from another till"
            className="h-10 w-10 rounded-xl border border-border flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </button>
          <Button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5">
            <Plus className="h-4 w-4" />
            New Layaway
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={plans}
        rowKey={(plan) => plan.id}
        error={isError}
        onRetry={() => refetch()}
        onRowClick={(plan) => router.push(`/${orgSlug}/layaway/${plan.id}`)}
        storageKey="layaway-col-prefs"
        emptyState={
          <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <p className="font-medium">No active layaway plans</p>
            <button onClick={() => setCreateOpen(true)} className="text-sm text-primary underline">
              Create one
            </button>
          </div>
        }
      />

      <CreateLayawayModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(plan) => {
          setCreateOpen(false);
          router.push(`/${orgSlug}/layaway/${plan.id}`);
        }}
      />
    </div>
  );
}

export default function LayawayListPageGated() {
  return (
    <ModuleGate moduleKey="layaway" fallback={<ModuleUnavailablePage moduleKey="layaway" />}>
      <LayawayListPage />
    </ModuleGate>
  );
}
