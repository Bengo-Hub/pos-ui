import { apiClient } from './client';

/** One cross-service step of a reversal (pos totals / inventory / treasury GL / eTIMS CN). */
export interface ReversalStep {
  step: string;
  service: string;
  status: 'pending' | 'completed' | 'failed' | 'skipped';
  detail?: string;
  ref?: string;
  at?: string;
}

export interface ReversalLine {
  line_id: string;
  sku: string;
  name: string;
  quantity: number;
  of_quantity: number;
  amount: number;
  tax_amount?: number;
}

export interface Reversal {
  id: string;
  order_id: string;
  order_number: string;
  reversal_number: string;
  scope: 'full' | 'partial';
  status: 'pending' | 'completed' | 'partial_failure' | 'failed';
  reason: string;
  refund_channel: string;
  lines: ReversalLine[];
  amount: number;
  tax_amount: number;
  cost_amount: number;
  steps: ReversalStep[];
  created_at: string;
}

export interface CreateReversalPayload {
  order_id: string;
  scope: 'full' | 'partial';
  lines?: { line_id: string; quantity?: number }[];
  reason: string;
  refund_channel?: string;
  idempotency_key?: string;
}

const base = (tenantId: string) => `/api/v1/${tenantId}/pos`;

/** Platform-owner transaction-reversal tool (sync-monitor "Txn Reversals" tab). */
export const reversalsApi = {
  create: (tenantId: string, payload: CreateReversalPayload) =>
    apiClient.post<Reversal>(`${base(tenantId)}/reversals`, payload),

  list: (tenantId: string, filters: { status?: string; order?: string; limit?: number; offset?: number } = {}) => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== '') p.set(k, String(v));
    });
    const qs = p.toString();
    return apiClient.get<{ data: Reversal[]; total: number }>(`${base(tenantId)}/reversals${qs ? `?${qs}` : ''}`);
  },

  get: (tenantId: string, reversalId: string) =>
    apiClient.get<Reversal>(`${base(tenantId)}/reversals/${reversalId}`),

  retry: (tenantId: string, reversalId: string) =>
    apiClient.post<Reversal>(`${base(tenantId)}/reversals/${reversalId}/retry`, {}),
};
