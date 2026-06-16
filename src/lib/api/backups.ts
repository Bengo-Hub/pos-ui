import { apiClient } from './client';

/**
 * Per-tenant auto-backup settings. Auto-backup is OPT-IN: it runs only when auto_enabled is
 * true (default off — activated here). The backups routes are mounted directly under the
 * tenant (NOT under /pos): /api/v1/{tenantId}/backups/settings.
 */
export interface BackupSettings {
  auto_enabled: boolean;
  schedule_hour: number;
  retention_days: number;
}

function settingsUrl(tenantID: string) {
  return `/api/v1/${tenantID}/backups/settings`;
}

export const backupsApi = {
  getSettings: (tenantID: string) =>
    apiClient.get<BackupSettings>(settingsUrl(tenantID)),

  updateSettings: (tenantID: string, body: BackupSettings) =>
    apiClient.put<BackupSettings>(settingsUrl(tenantID), body),
};
