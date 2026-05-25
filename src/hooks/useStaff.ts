import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { staffApi } from '@/lib/api/staff';

export function useStaffList(tenantId: string, outletId?: string) {
  return useQuery({
    queryKey: ['staff', tenantId, outletId],
    queryFn: () => staffApi.list(tenantId, outletId),
    enabled: !!tenantId,
  });
}

export function useSetStaffPIN(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, pin }: { userId: string; pin: string }) =>
      staffApi.setPin(tenantId, userId, pin),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff', tenantId] });
    },
  });
}
