import { apiClient } from './client';

export type QueueStatus = 'waiting' | 'in_progress' | 'done' | 'cancelled';

export interface QueueEntry {
  id: string;
  tenant_id: string;
  outlet_id: string;
  customer_name: string;
  customer_phone?: string;
  service_name?: string;
  staff_member_id?: string;
  status: QueueStatus;
  queue_position: number;
  notes?: string;
  called_at?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateQueueEntryInput {
  outlet_id: string;
  customer_name: string;
  customer_phone?: string;
  service_name?: string;
  staff_member_id?: string;
  notes?: string;
}

function base(tenantID: string) {
  return `/api/v1/${tenantID}/pos/queue`;
}

export const queueApi = {
  list: (tenantID: string, outletID?: string, status?: string) =>
    apiClient.get<{ entries: QueueEntry[]; total: number }>(base(tenantID), {
      outlet_id: outletID,
      status,
    }),

  create: (tenantID: string, input: CreateQueueEntryInput) =>
    apiClient.post<QueueEntry>(base(tenantID) + '/entries', input),

  updateStatus: (tenantID: string, entryID: string, status: QueueStatus) =>
    apiClient.patch<QueueEntry>(`${base(tenantID)}/entries/${entryID}/status`, { status }),
};
