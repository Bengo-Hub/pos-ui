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
}

// complimentary and the new Uganda/Kenya rails are deliberately false here — unlike mpesa/
// paystack/wallet/cod, they're opt-in per tenant and must never flash on before the real
// per-tenant toggle value loads from treasury (matches the backend's fail-closed default).
const ALL_ENABLED: POSGateways = {
  mpesa: true, paystack: true, wallet: true, cod: true, complimentary: false,
  mtn_momo: false, airtel_money: false, bank_transfer: false,
};

export function usePOSGateways() {
  const tenantID = useAuthStore((s) => s.user?.tenant_id ?? '');
  return useQuery({
    queryKey: ['pos-gateways', tenantID],
    queryFn: () => apiClient.get<POSGateways>(`/api/v1/${tenantID}/pos/gateways`),
    enabled: !!tenantID,
    staleTime: 5 * 60_000,
    placeholderData: ALL_ENABLED,
  });
}
