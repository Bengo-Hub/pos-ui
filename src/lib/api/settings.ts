import { apiClient } from './client';

export interface POSSettings {
  tenant_id: string;
  outlet_id?: string | null;
  receipt_header?: string | null;
  receipt_footer?: string | null;
  currency: string;
  vat_enabled: boolean;
  vat_rate: number;
  printer_type: string;
  printer_ip?: string | null;
  paper_width: string;
  auto_print_order: boolean;
  auto_print_kitchen: boolean;
  hotel_module_enabled: boolean;
  layaway_enabled: boolean;
  shift_reports_enabled: boolean;
  updated_at: string;
}

export interface UpdatePOSSettingsInput {
  receipt_header?: string | null;
  receipt_footer?: string | null;
  currency?: string;
  vat_enabled?: boolean;
  vat_rate?: number;
  printer_type?: string;
  printer_ip?: string | null;
  paper_width?: string;
  auto_print_order?: boolean;
  auto_print_kitchen?: boolean;
}

export interface UpdatePOSModulesInput {
  hotel_module_enabled?: boolean;
  layaway_enabled?: boolean;
  shift_reports_enabled?: boolean;
  enable_kds?: boolean;
  enable_appointments?: boolean;
}

function settingsBase(tenantID: string) {
  return `/api/v1/${tenantID}/pos/settings`;
}

export const posSettingsApi = {
  get: (tenantID: string) =>
    apiClient.get<POSSettings>(settingsBase(tenantID)),

  put: (tenantID: string, body: UpdatePOSSettingsInput) =>
    apiClient.put<POSSettings>(settingsBase(tenantID), body),

  patchModules: (tenantID: string, body: UpdatePOSModulesInput) =>
    apiClient.patch<POSSettings>(`${settingsBase(tenantID)}/modules`, body),

  getOutlet: (tenantID: string, outletID: string) =>
    apiClient.get<POSSettings>(`/api/v1/${tenantID}/pos/outlets/${outletID}/settings`),
};
