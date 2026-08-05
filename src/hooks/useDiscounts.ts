import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { discountsApi, type ApplyPromoLine, type DiscountInput, type DiscountListOpts } from '@/lib/api/discounts';

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

/** Currently-in-window auto-apply promotions — the TERMINAL's poll (moved unchanged from
 *  useHotel when the happy-hour surface was folded into discounts; query key and polling
 *  cadence are load-bearing — the terminal subscribes to exactly this). */
export function useActiveHappyHours() {
  const slug = useTenantSlug();
  return useQuery({
    queryKey: ['happy-hours-active', slug],
    queryFn: () => discountsApi.listActive(slug),
    enabled: !!slug,
    // Poll every 60s (and on window focus) so a terminal left open across a happy-hour boundary
    // detects the window OPENING/CLOSING promptly — otherwise a long-open till would keep showing
    // the pre-window state (no auto-add, no live discount) until the next stale refetch. The server
    // re-evaluates authoritatively at add-to-bill/checkout regardless; this keeps the preview honest.
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
}

/** Redeem a typed/scanned promo code against the sale's real cart lines — the ApplyDiscountModal
 *  code tab. Centralizes tenant-slug resolution the same way every other hook here does. */
export function useApplyPromoCode() {
  const slug = useTenantSlug();
  return useMutation({
    mutationFn: ({ promoCode, lines, outletId }: { promoCode: string; lines: ApplyPromoLine[]; outletId?: string }) =>
      discountsApi.apply(slug, promoCode, lines, outletId),
  });
}

export function useCreateDiscount() {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DiscountInput) => discountsApi.create(slug, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['discounts', slug] });
      // The terminal's active-window poll shares these promotion rows.
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
      qc.invalidateQueries({ queryKey: ['happy-hours-active', slug] });
    },
  });
}
