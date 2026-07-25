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

/** service_config key for the "Developed & maintained by CodeVertex" document footer. Platform
 *  default true (shown); a tenant override lets platform staff grant a specific tenant an
 *  opt-out — never tenant self-service. */
export const PROVIDER_FOOTER_KEY = 'provider_footer_enabled';

export const platformConfigApi = {
  list: () =>
    apiClient
      .get<{ data: PlatformConfig[]; total: number }>('/api/v1/admin/config')
      .then((r) => r.data ?? []),

  upsert: (key: string, body: UpsertPlatformConfigBody) =>
    apiClient.put<PlatformConfig>(`/api/v1/admin/config/${key}`, body),

  /** A specific tenant's config overrides (platform-owner action, NOT the tenant's own
   *  self-service settings route). GET /api/v1/admin/tenants/{tenantID}/config */
  listTenantOverrides: (tenantID: string) =>
    apiClient
      .get<{ data: PlatformConfig[]; total: number }>(`/api/v1/admin/tenants/${tenantID}/config`)
      .then((r) => r.data ?? []),

  upsertTenantOverride: (tenantID: string, key: string, body: UpsertPlatformConfigBody) =>
    apiClient.put<PlatformConfig>(`/api/v1/admin/tenants/${tenantID}/config/${key}`, body),

  deleteTenantOverride: (tenantID: string, key: string) =>
    apiClient.delete(`/api/v1/admin/tenants/${tenantID}/config/${key}`),
};
