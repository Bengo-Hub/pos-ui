import { apiClient } from './client';

export interface PrinterProfile {
  id: string;
  label: string;
  printer_type: 'network' | 'thermal' | 'bluetooth' | 'browser' | 'none';
  printer_ip?: string;
  paper_width?: '58mm' | '80mm';
  auto_print?: boolean;
  categories?: string[];
}

export interface POSSettings {
  tenant_id: string;
  outlet_id?: string | null;
  display_mode: string;
  show_images: boolean;
  show_barcode_scanner: boolean;
  default_view: string;
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
  printer_profiles: PrinterProfile[];
  enable_kds: boolean;
  enable_appointments: boolean;
  hotel_module_enabled: boolean;
  layaway_enabled: boolean;
  shift_reports_enabled: boolean;
  shift_auto_end_enabled: boolean;
  shift_max_hours: number;
  updated_at: string;
}

export interface UpdatePOSSettingsInput {
  display_mode?: string;
  show_images?: boolean;
  show_barcode_scanner?: boolean;
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
  printer_profiles?: PrinterProfile[];
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

  patchShifts: (tenantID: string, body: { shift_auto_end_enabled?: boolean; shift_max_hours?: number }) =>
    apiClient.patch<POSSettings>(`${settingsBase(tenantID)}/shifts`, body),

  getOutlet: (tenantID: string, outletID: string) =>
    apiClient.get<POSSettings>(`/api/v1/${tenantID}/pos/outlets/${outletID}/settings`),
};

export const printApi = {
  printReceipt: (tenantID: string, orderID: string, body: { printer_id?: string; type: string; reason?: string }) =>
    apiClient.post(`/api/v1/${tenantID}/pos/orders/${orderID}/print`, body),
};
