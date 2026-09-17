import { apiClient } from './client';

/** A tenant's scheduled maintenance window (product name: Repair Mode). Fleet-wide platform-owner
 *  tool — the route is NOT tenant-path-scoped like the rest of pos-api, it takes tenant_id
 *  explicitly so a platform owner can operate on ANY tenant, not just the one they're currently
 *  viewing. See pos-api's internal/http/handlers/maintenance_window.go. */
export interface MaintenanceWindow {
  tenant_id: string;
  tenant_slug: string;
  starts_at?: string;
  ends_at?: string;
  reason?: string;
  activated_by?: string;
  currently_under_repair: boolean;
}

export interface ScheduleMaintenanceWindowPayload {
  starts_at: string; // RFC3339
  ends_at: string; // RFC3339
  reason?: string;
}

export const maintenanceWindowApi = {
  get: (tenantId: string) =>
    apiClient.get<MaintenanceWindow>(`/api/v1/maintenance-window/${tenantId}`),
  schedule: (tenantId: string, payload: ScheduleMaintenanceWindowPayload) =>
    apiClient.post<MaintenanceWindow>(`/api/v1/maintenance-window/${tenantId}`, payload),
  cancel: (tenantId: string) =>
    apiClient.delete<MaintenanceWindow>(`/api/v1/maintenance-window/${tenantId}`),
};
