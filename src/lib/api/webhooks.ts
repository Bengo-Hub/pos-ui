import { apiClient } from './client';

export interface WebhookSubscription {
  id: string;
  tenant_id: string;
  outlet_id?: string;
  event_type: string;
  target_url: string;
  secret?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  subscription_id: string;
  event_type: string;
  http_status?: number;
  status: 'pending' | 'success' | 'failed';
  attempt: number;
  delivered_at?: string;
  error_message?: string;
  created_at: string;
}

export interface CreateWebhookInput {
  event_type: string;
  target_url: string;
  secret?: string;
}

export interface UpdateWebhookInput {
  target_url?: string;
  secret?: string;
  is_active?: boolean;
}

function webhookBase(tenantID: string) {
  return `/api/v1/${tenantID}/pos/webhooks`;
}

export const webhooksApi = {
  list: (tenantID: string, eventType?: string) =>
    apiClient
      .get<{ data: WebhookSubscription[]; total: number } | WebhookSubscription[]>(
        webhookBase(tenantID),
        eventType ? { event_type: eventType } : {},
      )
      .then((res): WebhookSubscription[] =>
        Array.isArray(res) ? res : ((res as { data: WebhookSubscription[] }).data ?? []),
      ),

  create: (tenantID: string, body: CreateWebhookInput) =>
    apiClient.post<WebhookSubscription>(webhookBase(tenantID), body),

  update: (tenantID: string, webhookID: string, body: UpdateWebhookInput) =>
    apiClient.put<WebhookSubscription>(`${webhookBase(tenantID)}/${webhookID}`, body),

  delete: (tenantID: string, webhookID: string) =>
    apiClient.delete(`${webhookBase(tenantID)}/${webhookID}`),

  listDeliveries: (tenantID: string, webhookID: string) =>
    apiClient.get<WebhookDelivery[]>(`${webhookBase(tenantID)}/${webhookID}/deliveries`),
};
