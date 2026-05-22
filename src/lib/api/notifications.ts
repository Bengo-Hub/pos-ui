import { apiClient } from '@/lib/api/client';

const base = (tenantID: string) => `/api/v1/${tenantID}/pos`;

export interface PosNotification {
  id: string;
  tenant_id: string;
  outlet_id: string;
  user_id: string;
  notification_type: string;
  title: string;
  body: string;
  payload: Record<string, any>;
  is_read: boolean;
  created_at: string;
}

export async function getNotifications(tenantID: string, includeRead = false): Promise<{ data: PosNotification[]; total: number }> {
  return apiClient.get(`${base(tenantID)}/notifications`, { include_read: includeRead ? 'true' : undefined });
}

export async function markNotificationRead(tenantID: string, id: string): Promise<void> {
  await apiClient.patch(`${base(tenantID)}/notifications/${id}/read`, {});
}

export async function markAllNotificationsRead(tenantID: string): Promise<{ marked_read: number }> {
  return apiClient.post(`${base(tenantID)}/notifications/mark-all-read`, {});
}
