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
}

// complimentary and the new Uganda/Kenya rails are deliberately false here — unlike mpesa/
// paystack/wallet/cod, they're opt-in per tenant and must never flash on before the real
// per-tenant toggle value loads from treasury (matches the backend's fail-closed default).
const ALL_ENABLED: POSGateways = {
  mpesa: true, paystack: true, wallet: true, cod: true, complimentary: false,
  mtn_momo: false, airtel_money: false, bank_transfer: false,
  mobile_money: false, payhero_card: false, payhero_bank: false, payhero_offline: false,
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
    placeholderData: ALL_ENABLED,
  });
}
