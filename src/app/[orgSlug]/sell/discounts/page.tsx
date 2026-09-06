'use client';

import { useEffect, useMemo, useState } from 'react';
import { Percent, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { usePermissions, P } from '@/hooks/usePermissions';
import { useDiscounts, useCreateDiscount, useUpdateDiscount, useDeleteDiscount } from '@/hooks/useDiscounts';
import { useFullCatalog, useCategories } from '@/hooks/usePOS';
import { useSubscription } from '@/hooks/use-subscription';
import { useModuleAccess } from '@/hooks/use-module-access';
import { useAuthStore } from '@/store/auth';
import { useOutletFilterStore } from '@/store/outlet-filter';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { UpgradeDialog } from '@bengo-hub/shared-ui-lib/subscription';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { Discount, DiscountInput } from '@/lib/api/discounts';
import { DiscountFormModal } from '@/components/pos/discounts/discount-form-modal';
import { searchCatalogItemsAdapter, fetchCategoryItemsAdapter } from '@/components/pos/discounts/apply-discount-modal';
import { DataTable } from '@bengo-hub/shared-ui-lib/data-table';
import { buildDiscountColumns } from './discounts-columns';

/**
 * Sell → Discounts — management surface for the platform's discount source of truth
 * (pos-api promotions). Lists ALL discounts (promo codes, automatic, time-windowed
 * happy hours incl. BOGO/pairing deals) and creates/edits them through the shared
 * DiscountFormModal; the same rows drive the POS terminal, Add Sale, and every service
 * integrated via the S2S discount endpoints. The old hotel Happy Hour editor is retired —
 * this page owns every deal kind.
 */
export default function DiscountsPage() {
  const { can, canAny } = usePermissions();
  const canView = canAny([P.PROMOTIONS_VIEW, P.PROMOTIONS_ADD, P.PROMOTIONS_CHANGE, P.PROMOTIONS_MANAGE]);
  const canManage = canAny([P.PROMOTIONS_ADD, P.PROMOTIONS_MANAGE]);
  const { data: posSettings } = usePOSSettings();
  const currency = (posSettings as any)?.currency ?? 'KES';

  // Current outlet's use_case scopes which discount fields the form shows (Happy Hour + meal
  // period are hospitality-only); the outlet id lets the form offer "this outlet only" scoping.
  // Drill-down (HQ admin viewing another outlet) takes priority over the home outlet, same
  // resolution order useModuleAccess uses internally.
  const { useCase } = useModuleAccess();
  const homeOutlet = useAuthStore((s) => s.outlet);
  const drillOutlet = useOutletFilterStore((s) => s.selectedOutlet);
  const currentOutletId = drillOutlet?.id ?? homeOutlet?.id;
  const currentOutletName = drillOutlet?.name ?? homeOutlet?.name;
  const allOutlets = useOutletFilterStore((s) => s.outlets);
  const outletNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of allOutlets) m.set(o.id, o.name);
    if (homeOutlet?.id) m.set(homeOutlet.id, homeOutlet.name);
    return m;
  }, [allOutlets, homeOutlet]);

  // Search-first pagination: typing resets to page 1 and the query is applied SERVER-side
  // (promotions ?q= name filter), so matches surface from the full set — never just the
  // currently fetched page.
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 300); return () => clearTimeout(t); }, [search]);

  const { data, isLoading, isError, refetch } = useDiscounts('all', { q: debouncedSearch, page, limit: pageSize });
  const discounts: Discount[] = (data as any)?.data ?? [];
  const total: number = (data as any)?.total ?? (data as any)?.meta?.total ?? discounts.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const createMut = useCreateDiscount();
  const updateMut = useUpdateDiscount();
  const deleteMut = useDeleteDiscount();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Discount | null>(null);

  // happy_hour kind is a Pro sub-feature: creating NEW time-window deals is gated (editing
  // existing ones stays allowed — grandfathered urban-loft deals must remain manageable).
  const { hasFeature } = useSubscription();
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null);

  // SKU → name resolution for edit-prefill chips + pairing rows (rule.scope_ids /
  // get_pair_map carry only SKUs). Full catalog, not one page — deep SKUs must resolve.
  const { data: fullCatalog } = useFullCatalog();
  const nameBySku = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of fullCatalog ?? []) if (i.sku) m.set(i.sku, i.name);
    return m;
  }, [fullCatalog]);

  // Category names for the modal's category scope + bulk-add (outlet-scoped catalog tree).
  const { data: catalogCategories } = useCategories();
  const categoryNames = useMemo(
    () => (catalogCategories ?? []).map((c: { name?: string }) => c.name ?? '').filter(Boolean),
    [catalogCategories],
  );

  async function handleSubmit(payload: DiscountInput) {
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, body: payload });
        toast.success('Discount updated');
      } else {
        await createMut.mutateAsync(payload);
        toast.success('Discount created');
      }
      setModalOpen(false);
      setEditing(null);
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to save discount'));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      toast.success('Discount deactivated');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to delete discount'));
    } finally {
      setDeleteTarget(null);
    }
  }

  const columns = useMemo(
    () => buildDiscountColumns({
      currency,
      outletNameById,
      canManage,
      canDeactivate: can(P.PROMOTIONS_MANAGE),
      onEdit: (d) => { setEditing(d); setModalOpen(true); },
      onDeactivate: (d) => setDeleteTarget(d),
    }),
    [currency, outletNameById, canManage, can],
  );

  if (!canView) {
    return <div className="p-12 text-center text-muted-foreground">You don&apos;t have permission to view discounts.</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Percent className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Discounts</h1>
            <p className="text-sm text-muted-foreground">
              One source of truth — promo codes, automatic deals, happy hours &amp; BOGO. Applies on the
              terminal, Add Sale, and every integrated service.
            </p>
          </div>
        </div>
        {canManage && (
          <button onClick={() => { setEditing(null); setModalOpen(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90">
            <Plus className="h-4 w-4" /> New Discount
          </button>
        )}
      </div>

      <DataTable<Discount>
        columns={columns}
        rows={discounts}
        rowKey={(d) => d.id}
        loading={isLoading}
        loadingRows={8}
        error={isError}
        onRetry={() => refetch()}
        storageKey="sell-discounts-col-prefs"
        emptyText={debouncedSearch ? `No discounts match "${debouncedSearch}".` : 'No discounts yet. Create one to start discounting sales across all channels.'}
        toolbar={(
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search discounts by name…"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        total={total}
        pageSize={pageSize}
        onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
      />

      <DiscountFormModal
        open={modalOpen}
        initial={editing}
        saving={createMut.isPending || updateMut.isPending}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSubmit={handleSubmit}
        searchItems={searchCatalogItemsAdapter}
        resolveItemName={(sku) => nameBySku.get(sku)}
        categories={categoryNames}
        fetchCategoryItems={fetchCategoryItemsAdapter}
        happyHourLocked={!hasFeature('happy_hour')}
        onLockedKindClick={() => setUpgradeFeature('happy_hour')}
        flashSaleLocked={!hasFeature('flash_sale')}
        onLockedFlashSaleClick={() => setUpgradeFeature('flash_sale')}
        useCase={useCase}
        currentOutletId={currentOutletId}
        currentOutletName={currentOutletName}
      />
      <UpgradeDialog feature={upgradeFeature ?? 'happy_hour'} open={!!upgradeFeature} onClose={() => setUpgradeFeature(null)} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Deactivate discount?"
        description={`"${deleteTarget?.name}" will stop applying immediately. Past sales keep their discount history.`}
        confirmLabel="Deactivate"
        variant="danger"
        onConfirm={handleDelete}
      />
    </div>
  );
}
