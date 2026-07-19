'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  documentSequencesApi,
  type DocumentSequence,
  type UpdateDocumentSequenceInput,
} from '@/lib/api/document-sequences';
import { apiErrorMessage } from '@/lib/api/error-message';
import { useAuthStore } from '@/store/auth';
import { toast } from 'sonner';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

export function useDocumentSequences() {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['pos-document-sequences', tenantID],
    queryFn: async () => {
      const res = await documentSequencesApi.list(tenantID);
      // Tolerate either an envelope ({ data: [...] }) or a bare array.
      const list = Array.isArray(res) ? res : res?.data;
      return (list ?? []) as DocumentSequence[];
    },
    enabled: !!tenantID,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateDocumentSequence() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docType, data }: { docType: string; data: UpdateDocumentSequenceInput }) =>
      documentSequencesApi.update(tenantID, docType, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-document-sequences', tenantID] });
    },
    onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to update numbering')),
  });
}
