'use client';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useQuery } from '@tanstack/react-query';

export interface POSGateways {
  mpesa: boolean;
  paystack: boolean;
  wallet: boolean;
  cod: boolean;
  complimentary: boolean;
  mtn_momo: boolean;
  airtel_money: boolean;
  bank_transfer: boolean;
  // PayHero rails treasury offers for the outlet's currency.
  mobile_money: boolean;
  payhero_card: boolean;
  payhero_bank: boolean;
  payhero_offline: boolean;
  /** "daraja" or "payhero": the account behind M-Pesa (absent when M-Pesa is off). */
  mpesa_provider?: string;
  /** Daraja backs M-Pesa, so C2B till matching works. */
  mpesa_c2b: boolean;
}

// Fail closed until treasury answers: every gateway tender is off. This used to start with M-Pesa
// and Paystack on, so a tenant who never enabled them saw STK Push, C2B and Paystack flash on
// the till (and stay on whenever treasury was unreachable). Cash, Card (PDQ) and Credit Sale are
// not gateway-backed and always show.
const NONE_ENABLED: POSGateways = {
  mpesa: false, paystack: false, wallet: false, cod: false, complimentary: false,
  mtn_momo: false, airtel_money: false, bank_transfer: false,
  mobile_money: false, payhero_card: false, payhero_bank: false, payhero_offline: false,
  mpesa_c2b: false,
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
