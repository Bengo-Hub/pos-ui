import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { discountsApi, type DiscountInput, type DiscountListOpts } from '@/lib/api/discounts';

// Matches useHotel's resolution: the tenant path segment is the tenant UUID (httpware
// resolves both, but every existing promotions call sends the id — stay consistent).
function useTenantSlug() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

/** All discounts (every kind + status) — the Sell → Discounts management list.
 *  opts.q = server-side name search; opts.page/limit = server pagination. */
export function useDiscounts(status: string = 'all', opts: DiscountListOpts = {}) {
  const slug = useTenantSlug();
  return useQuery({
    queryKey: ['discounts', slug, status, opts.q ?? '', opts.page ?? 1, opts.limit ?? 100],
    queryFn: () => discountsApi.list(slug, status, opts),
    enabled: !!slug,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useCreateDiscount() {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DiscountInput) => discountsApi.create(slug, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['discounts', slug] });
      // Happy-hour pages share the same promotion rows.
      qc.invalidateQueries({ queryKey: ['happy-hours', slug] });
      qc.invalidateQueries({ queryKey: ['happy-hours-active', slug] });
    },
  });
}

export function useUpdateDiscount() {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DiscountInput }) => discountsApi.update(slug, id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['discounts', slug] });
      qc.invalidateQueries({ queryKey: ['happy-hours', slug] });
      qc.invalidateQueries({ queryKey: ['happy-hours-active', slug] });
    },
  });
}

export function useDeleteDiscount() {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => discountsApi.remove(slug, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['discounts', slug] });
      qc.invalidateQueries({ queryKey: ['happy-hours', slug] });
      qc.invalidateQueries({ queryKey: ['happy-hours-active', slug] });
    },
  });
}
