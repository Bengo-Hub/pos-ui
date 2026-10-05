'use client';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';

export interface POSGateways {
  /** Daraja M-Pesa (the tenant's own paybill or till): STK Push and C2B. */
  mpesa: boolean;
  paystack: boolean;
  wallet: boolean;
  cod: boolean;
  complimentary: boolean;
  /** PayHero, its own gateway like Paystack: one tender opening the PayHero modal. */
  payhero: boolean;
  /** PayHero's rails in the outlet's currency (mpesa, airtel_money, payhero_card, ...). */
  payhero_methods?: string[];
  /** Daraja backs M-Pesa, so C2B till matching works. */
  mpesa_c2b: boolean;
}

// Fail closed until treasury answers: every gateway tender is off. This used to start with M-Pesa
// and Paystack on, so a tenant who never enabled them saw STK Push, C2B and Paystack flash on
// the till (and stay on whenever treasury was unreachable). Cash, Card (PDQ) and Credit Sale are
// not gateway-backed and always show.
const NONE_ENABLED: POSGateways = {
  mpesa: false, paystack: false, wallet: false, cod: false, complimentary: false,
  payhero: false, payhero_methods: [], mpesa_c2b: false,
};

/** The tenant's online payment rails. currency (the outlet's) decides which PayHero rails exist
 *  (e.g. MTN and Airtel for UGX). */
export function usePOSGateways(currency?: string) {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  const cur = (currency ?? '').toUpperCase();
  return useQuery({
    queryKey: ['pos-gateways', tenantID, cur],
    queryFn: () => apiClient.get<POSGateways>(`/api/v1/${tenantID}/pos/gateways${cur ? `?currency=${cur}` : ''}`),
    enabled: !!tenantID,
    staleTime: 5 * 60_000,
    placeholderData: NONE_ENABLED,
  });
}
