import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { discountsApi, type DiscountInput } from '@/lib/api/discounts';

// Matches useHotel's resolution: the tenant path segment is the tenant UUID (httpware
// resolves both, but every existing promotions call sends the id — stay consistent).
function useTenantSlug() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

/** All discounts (every kind + status) — the Sell → Discounts management list. */
export function useDiscounts(status: string = 'all') {
  const slug = useTenantSlug();
  return useQuery({
    queryKey: ['discounts', slug, status],
    queryFn: () => discountsApi.list(slug, status),
    enabled: !!slug,
    staleTime: 60_000,
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
