'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Percent, Plus, Pencil, Trash2, Ticket, Zap, Clock3, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/base';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Pagination } from '@/components/ui/pagination';
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
import { DiscountFormModal, describeDiscount, describeScope } from '@/components/pos/discounts/discount-form-modal';
import { searchCatalogItemsAdapter, fetchCategoryItemsAdapter } from '@/components/pos/discounts/apply-discount-modal';
import { cn } from '@/lib/utils';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PAGE_SIZE = 20;

const KIND_META: Record<string, { label: string; icon: typeof Ticket; cls: string }> = {
  code: { label: 'Promo Code', icon: Ticket, cls: 'bg-blue-500/10 text-blue-600' },
  auto: { label: 'Automatic', icon: Zap, cls: 'bg-amber-500/10 text-amber-600' },
  happy_hour: { label: 'Time Window', icon: Clock3, cls: 'bg-purple-500/10 text-purple-600' },
};

function scheduleText(d: Discount): string {
  if (d.promo_kind === 'happy_hour') {
    if (d.start_at && !d.days_of_week?.length) {
      // One-time window: an explicit start → end occurrence.
      const from = new Date(d.start_at).toLocaleString('en-KE');
      const to = d.end_at ? new Date(d.end_at).toLocaleString('en-KE') : '—';
      return `${from} → ${to}`;
    }
    const days = (d.days_of_week ?? []).map((v) => DAY_LABELS[v]).join(', ') || 'Daily';
    return `${days} · ${d.window_start || '—'}–${d.window_end || '—'}`;
  }
  const from = d.start_at ? new Date(d.start_at).toLocaleDateString('en-KE') : null;
  const to = d.end_at ? new Date(d.end_at).toLocaleDateString('en-KE') : null;
  if (from && to) return `${from} → ${to}`;
  if (to) return `until ${to}`;
  return 'Always';
}

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
  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 300); return () => clearTimeout(t); }, [search]);

  const { data, isLoading, isError, refetch } = useDiscounts('all', { q: debouncedSearch, page, limit: PAGE_SIZE });
  const discounts: Discount[] = (data as any)?.data ?? [];
  const total: number = (data as any)?.total ?? (data as any)?.meta?.total ?? discounts.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const createMut = useCreateDiscount();
  const updateMut = useUpdateDiscount();
  const deleteMut = useDeleteDiscount();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Discount | null>(null);

  // happy_hour kind is a Pro sub-feature: creating NEW time-window deals is gated (editing
  // existing ones stays allowed — grandfathered urban-loft deals must remain manageable).
  const { hasFeature } = useSubscription();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

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

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search discounts by name…"
          className="w-full pl-9 pr-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : isError ? (
            <div className="py-12 text-center">
              <p className="text-sm text-destructive">Could not load discounts.</p>
              <button onClick={() => refetch()} className="mt-3 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Retry</button>
            </div>
          ) : discounts.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {debouncedSearch
                ? <>No discounts match &ldquo;{debouncedSearch}&rdquo;.</>
                : <>No discounts yet. Create one to start discounting sales across all channels.</>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-border bg-accent/5 text-xs uppercase tracking-wider text-muted-foreground text-left">
                    <th className="px-4 py-3 font-bold">Name</th>
                    <th className="px-4 py-3 font-bold">Type</th>
                    <th className="px-4 py-3 font-bold">Code</th>
                    <th className="px-4 py-3 font-bold">Deal</th>
                    <th className="px-4 py-3 font-bold">Scope</th>
                    <th className="px-4 py-3 font-bold">Outlet</th>
                    <th className="px-4 py-3 font-bold">Schedule / Validity</th>
                    <th className="px-4 py-3 font-bold text-center">Status</th>
                    {canManage && <th className="px-4 py-3 font-bold text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {discounts.map((d) => {
                    const meta = KIND_META[d.promo_kind] ?? KIND_META.code;
                    const KindIcon = meta.icon;
                    return (
                      <tr key={d.id} className="hover:bg-accent/5">
                        <td className="px-4 py-3 font-medium">{d.name}</td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', meta.cls)}>
                            <KindIcon className="h-3 w-3" /> {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{d.promo_kind === 'code' ? (d.promo_code || '—') : '—'}</td>
                        <td className="px-4 py-3">{describeDiscount(d, currency)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{describeScope(d)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {d.outlet_id ? (outletNameById.get(d.outlet_id) ?? 'This outlet') : 'All outlets'}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{scheduleText(d)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn('text-xs px-2 py-1 rounded-full font-medium',
                            d.status === 'active' ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground')}>
                            {d.status}
                          </span>
                        </td>
                        {canManage && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button title="Edit" onClick={() => { setEditing(d); setModalOpen(true); }}
                                className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent">
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                              {can(P.PROMOTIONS_MANAGE) && d.status === 'active' && (
                                <button title="Deactivate" onClick={() => setDeleteTarget(d)}
                                  className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent">
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} itemLabel="discounts" />
      )}

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
        onLockedKindClick={() => setUpgradeOpen(true)}
        useCase={useCase}
        currentOutletId={currentOutletId}
        currentOutletName={currentOutletName}
      />
      <UpgradeDialog feature="happy_hour" open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />

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
