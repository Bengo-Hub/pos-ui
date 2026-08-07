'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { Button } from '@/components/ui/base';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { usePackages, useCreatePackage, useDeactivatePackage, type CreatePackageInput } from '@/hooks/usePackages';
import { Loader2, Package, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { DataTable } from '@bengo-hub/shared-ui-lib/data-table';
import { buildPackagesColumns } from './packages-columns';

const EMPTY_FORM: CreatePackageInput = {
  name: '',
  description: '',
  price: 0,
  session_count: 1,
  validity_days: undefined,
};

function PackagesPage() {
  const { data: packages = [], isLoading, isError } = usePackages();
  const createPackage = useCreatePackage();
  const deactivate = useDeactivatePackage();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreatePackageInput>(EMPTY_FORM);
  const [deactivateTarget, setDeactivateTarget] = useState<{ id: string; name: string } | null>(null);

  const setField = <K extends keyof CreatePackageInput>(key: K, value: CreatePackageInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.price || !form.session_count) {
      toast.error('Please fill in all required fields');
      return;
    }
    const payload: CreatePackageInput = {
      name: form.name,
      price: Number(form.price),
      session_count: Number(form.session_count),
    };
    if (form.description) payload.description = form.description;
    if (form.validity_days) payload.validity_days = Number(form.validity_days);

    createPackage.mutate(payload, {
      onSuccess: () => {
        toast.success('Package created');
        setCreateOpen(false);
        setForm(EMPTY_FORM);
      },
      onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to create package')),
    });
  };

  const handleDeactivate = (id: string, name: string) => setDeactivateTarget({ id, name });
  const columns = useMemo(
    () => buildPackagesColumns({ deactivatingId: deactivate.isPending ? deactivateTarget?.id ?? null : null, onDeactivate: handleDeactivate }),
    [deactivate.isPending, deactivateTarget?.id],
  );

  const confirmDeactivate = () => {
    if (!deactivateTarget) return;
    const { id, name } = deactivateTarget;
    deactivate.mutate(id, {
      onSuccess: () => {
        toast.success(`Package "${name}" deactivated`);
        setDeactivateTarget(null);
      },
      onError: async (e) => {
        toast.error(await apiErrorMessage(e, 'Failed to deactivate package'));
        setDeactivateTarget(null);
      },
    });
  };

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Service Packages</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage bundled service packages for clients</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5">
          <Plus className="h-4 w-4" />
          New Package
        </Button>
      </div>

      {isError && (
        <p className="text-sm text-destructive mb-4">Failed to load packages.</p>
      )}

      <DataTable
        columns={columns}
        rows={packages}
        rowKey={(pkg) => pkg.id}
        storageKey="packages-col-prefs"
        emptyState={
          <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Package className="h-10 w-10 opacity-30" />
            <p className="font-medium">No service packages</p>
            <button onClick={() => setCreateOpen(true)} className="text-sm text-primary underline">
              Create one
            </button>
          </div>
        }
      />

      {/* Create Package Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-base">New Service Package</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Bundle services into a sellable package</p>
              </div>
              <button
                onClick={() => { setCreateOpen(false); setForm(EMPTY_FORM); }}
                className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Package Name <span className="text-destructive">*</span>
                </label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder="e.g. 10-Session Haircut Bundle"
                  className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Description</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                  placeholder="Optional description…"
                  className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    Price (KES) <span className="text-destructive">*</span>
                  </label>
                  <input
                    required
                    type="number"
                    min="0"
                    value={form.price || ''}
                    onChange={(e) => setField('price', e.target.valueAsNumber)}
                    placeholder="0"
                    className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                    Sessions <span className="text-destructive">*</span>
                  </label>
                  <input
                    required
                    type="number"
                    min="1"
                    value={form.session_count || ''}
                    onChange={(e) => setField('session_count', e.target.valueAsNumber)}
                    placeholder="10"
                    className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Validity (days)</label>
                <input
                  type="number"
                  min="1"
                  value={form.validity_days || ''}
                  onChange={(e) => setField('validity_days', e.target.value ? e.target.valueAsNumber : undefined)}
                  placeholder="e.g. 365 (leave blank for no expiry)"
                  className="w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 min-h-11"
                  onClick={() => { setCreateOpen(false); setForm(EMPTY_FORM); }}
                  disabled={createPackage.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 min-h-11" disabled={createPackage.isPending}>
                  {createPackage.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Create Package
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}
        title={`Deactivate package "${deactivateTarget?.name ?? ''}"?`}
        description="Existing subscribers will keep their access until expiry, but no new subscriptions can be started."
        confirmLabel="Deactivate"
        variant="warning"
        loading={deactivate.isPending}
        onConfirm={confirmDeactivate}
      />
    </div>
  );
}

export default function PackagesPageGated() {
  return (
    <ModuleGate moduleKey="packages" fallback={<ModuleUnavailablePage moduleKey="packages" />}>
      <PackagesPage />
    </ModuleGate>
  );
}
