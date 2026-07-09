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
}

// complimentary is deliberately false here — unlike the other rails, it's opt-in per tenant and
// must never flash on before the real per-tenant toggle value loads from treasury.
const ALL_ENABLED: POSGateways = { mpesa: true, paystack: true, wallet: true, cod: true, complimentary: false };

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
