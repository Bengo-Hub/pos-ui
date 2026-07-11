import { apiClient } from './client';

export interface ShiftSession {
  id: string;
  device_id: string;
  user_id: string;
  opened_at: string;
  closed_at?: string;
  session_status: 'open' | 'closed';
  float_amount: number;
  closing_float?: number;
  variance?: number;
  notes?: string;
}

export interface TenderBreakdown {
  name: string;
  type: string;
  amount: number;
  count: number;
}

export interface SessionSummary {
  session_id: string;
  opened_at: string;
  opening_float: number;
  order_count: number;
  total_revenue: number;
  expected_cash: number;
  refund_count: number;
  total_refunds: number;
  void_count: number;
  tender_breakdown: TenderBreakdown[];
}

export interface ShiftHistoryRow {
  id: string;
  status: string;
  opened_at: string;
  closed_at?: string;
  opening_float: number;
  closing_float?: number;
  variance?: number;
  notes?: string;
  auto_closed?: boolean;
  order_count: number;
  total_revenue: number;
}

/** Filters/pagination for the shift-history endpoint. All optional. */
export interface ShiftHistoryParams {
  from?: string;    // YYYY-MM-DD (interpreted in the tenant timezone) on opened_at
  to?: string;
  status?: 'open' | 'closed';
  page?: number;
  limit?: number;
}

function shiftsBase(tenantId: string) {
  return `/api/v1/${tenantId}/pos/devices/current/sessions`;
}

export const shiftsApi = {
  getCurrent: (tenantId: string) =>
    apiClient.get<ShiftSession>(`${shiftsBase(tenantId)}/current`),

  getSummary: (tenantId: string) =>
    apiClient.get<SessionSummary>(`${shiftsBase(tenantId)}/current/summary`),

  getHistory: (tenantId: string, params?: ShiftHistoryParams) =>
    apiClient.get<{ data: ShiftHistoryRow[]; total: number; page?: number; limit?: number; hasMore?: boolean }>(
      `${shiftsBase(tenantId)}/history`,
      {
        from: params?.from,
        to: params?.to,
        status: params?.status,
        page: params?.page ?? 1,
        limit: params?.limit ?? 20,
      },
    ),

  open: (tenantId: string, opening_float: number) =>
    apiClient.post<ShiftSession>(`${shiftsBase(tenantId)}/open`, { opening_float }),

  close: (tenantId: string, payload: { closing_float: number; notes?: string }) =>
    apiClient.post<ShiftSession>(`${shiftsBase(tenantId)}/close`, payload),
};
