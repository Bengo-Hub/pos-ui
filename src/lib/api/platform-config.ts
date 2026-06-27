import { apiClient } from './client';

/**
 * Platform-level service config (tenant_id IS NULL). Read via
 * GET /api/v1/admin/config (returns { data, total }); written per-key via
 * PUT /api/v1/admin/config/{key}. These routes are platform-owner gated.
 */
export interface PlatformConfig {
  id: string;
  tenant_id?: string;
  config_key: string;
  config_value: string;
  config_type: string;
  description?: string;
  is_secret: boolean;
  is_override: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpsertPlatformConfigBody {
  config_value: string;
  config_type?: string;
  description?: string;
  is_secret?: boolean;
}

/** service_config key for the POS terminal screensaver idle-timeout (seconds). */
export const SCREENSAVER_TIMEOUT_KEY = 'pos.screensaver_idle_timeout_seconds';

export const platformConfigApi = {
  list: () =>
    apiClient
      .get<{ data: PlatformConfig[]; total: number }>('/api/v1/admin/config')
      .then((r) => r.data ?? []),

  upsert: (key: string, body: UpsertPlatformConfigBody) =>
    apiClient.put<PlatformConfig>(`/api/v1/admin/config/${key}`, body),
};
