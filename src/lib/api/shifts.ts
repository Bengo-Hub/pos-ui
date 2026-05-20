import { apiClient } from './client';

export interface ShiftSession {
  id: string;
  device_id: string;
  opened_by: string;
  opened_at: string;
  closed_at?: string;
  opening_float: number;
  closing_float?: number;
  status: 'open' | 'closed';
}

function shiftsBase(tenantId: string) {
  return `/api/v1/${tenantId}/pos/devices/current/sessions`;
}

export const shiftsApi = {
  getCurrent: (tenantId: string) =>
    apiClient.get<ShiftSession>(`${shiftsBase(tenantId)}/current`),

  open: (tenantId: string, opening_float: number) =>
    apiClient.post<ShiftSession>(`${shiftsBase(tenantId)}/open`, { opening_float }),

  close: (tenantId: string, closing_float: number) =>
    apiClient.post<ShiftSession>(`${shiftsBase(tenantId)}/close`, { closing_float }),
};
