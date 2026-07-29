import { normalizeUseCase } from '@/lib/use-case-config';

/**
 * Where a plain cashier should land right after logging in (PIN or SSO) — instead of the
 * Dashboard, which shows outlet-wide KPIs a cashier shouldn't need to parse through to start
 * working. Retail/pharmacy/services cashiers go straight to the POS Terminal (ring sales);
 * hospitality/quick_service cashiers go to Order History (their open bills to settle).
 * Returns null for every other role (admin/manager/waiter/etc.) — callers keep their existing
 * default (Dashboard).
 */
export function cashierLandingPath(role: string | undefined | null, useCase: string | undefined | null): string | null {
  if ((role ?? '').toLowerCase() !== 'cashier') return null;
  const profile = normalizeUseCase(useCase ?? '');
  if (profile === 'hospitality' || profile === 'quick_service') return '/orders';
  return '/order';
}
