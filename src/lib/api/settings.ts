import { apiClient } from './client';

/** Connection type for a printer. 'os' = an OS/QZ-listed printer picked by name; 'network' = a raw
 *  ESC/POS printer addressed by IP:port; 'usb'/'bluetooth' = a WebUSB/Web-Bluetooth paired device;
 *  'browser' = the browser print dialog; 'none' = unconfigured. ('thermal' kept for back-compat read). */
export type PrinterConnType = 'browser' | 'os' | 'network' | 'usb' | 'bluetooth' | 'thermal' | 'none';

/** Full supported paper range — thermal roll widths through cut-sheet sizes. */
export type PaperSize = '58mm' | '76mm' | '80mm' | 'A6' | 'A5' | 'A4' | 'Letter';

export interface PrinterProfile {
  id: string;                 // 'customer' | 'waiter' | a KDS station UUID
  label: string;
  printer_type: PrinterConnType;
  printer_ip?: string;
  /** Raw ESC/POS TCP port for a network printer (default 9100). */
  printer_port?: number;
  /** OS/QZ-Tray/USB/Bluetooth printer name selected from discovery; '' or 'browser' => browser dialog. */
  printer_name?: string;
  /** @deprecated legacy field kept for back-compat reads; new code writes `paper_size`. */
  paper_width?: string;
  paper_size?: PaperSize;
  auto_print?: boolean;
  /** Category codes routed here — mirrors the linked KDS station's category_filter. */
  categories?: string[];
  /** KDS station this printer is bound to (for station printers). */
  station_id?: string;
  station_type?: string;
}

export interface POSSettings {
  tenant_id: string;
  outlet_id?: string | null;
  use_case?: string | null;
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
  pin_login_message?: string | null;
  screensaver_url?: string | null;
  /** Up to 3 admin-managed screensaver media URLs (Settings → Display) — slideshow order. */
  screensaver_urls?: string[];
  printer_profiles: PrinterProfile[];
  // cash drawer (ESC/POS drawer kick via the assigned printer)
  cash_drawer_enabled: boolean;
  cash_drawer_printer?: string | null;
  cash_drawer_auto_open: boolean;
  cash_drawer_kick_code: string;
  // card terminal / PDQ
  card_terminal_mode: string; // 'manual' | 'integrated'
  card_terminal_provider?: string | null;
  card_terminal_tid?: string | null;
  card_terminal_require_ref: boolean;
  enable_kds: boolean;
  enable_appointments: boolean;
  hotel_module_enabled: boolean;
  layaway_enabled: boolean;
  shift_reports_enabled: boolean;
  shift_auto_end_enabled: boolean;
  shift_max_hours: number;
  table_max_occupation_minutes: number;
  return_window_days: number;
  // payment display — shown on printed receipts
  mpesa_paybill?: string | null;
  mpesa_account_reference?: string | null;
  airtel_money_number?: string | null;
  mpesa_till?: string | null;
  mpesa_pochi?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_account_name?: string | null;
  show_payment_info_on_receipt: boolean;
  // Sidebar visibility — moduleKeys the outlet hid entirely, and individual sidebar item hrefs hid.
  // The flat lists apply to ALL roles; the *_by_role maps (role code → hrefs/module keys) hide
  // additionally for specific roles only. Platform-owner/superuser users are exempt from both.
  disabled_modules?: string[];
  hidden_items?: string[];
  disabled_modules_by_role?: Record<string, string[]>;
  hidden_items_by_role?: Record<string, string[]>;
  /** A paired Local Print Agent polled the server recently: the till should rely on server-side
   *  background print jobs (queue) and skip its own client-side auto-printing. */
  print_agent_online?: boolean;
  updated_at: string;
}

export interface UpdatePOSSettingsInput {
  display_mode?: string;
  default_view?: string;
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
  pin_login_message?: string | null;
  screensaver_url?: string | null;
  screensaver_urls?: string[];
  printer_profiles?: PrinterProfile[];
  return_window_days?: number;
  // cash drawer
  cash_drawer_enabled?: boolean;
  cash_drawer_printer?: string | null;
  cash_drawer_auto_open?: boolean;
  cash_drawer_kick_code?: string;
  // card terminal / PDQ
  card_terminal_mode?: string;
  card_terminal_provider?: string | null;
  card_terminal_tid?: string | null;
  card_terminal_require_ref?: boolean;
  // payment display
  mpesa_paybill?: string | null;
  mpesa_account_reference?: string | null;
  airtel_money_number?: string | null;
  mpesa_till?: string | null;
  mpesa_pochi?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_account_name?: string | null;
  show_payment_info_on_receipt?: boolean;
}

export interface UpdatePOSModulesInput {
  hotel_module_enabled?: boolean;
  layaway_enabled?: boolean;
  shift_reports_enabled?: boolean;
  enable_kds?: boolean;
  enable_appointments?: boolean;
  // Whole-module hide (by moduleKey) and individual sidebar item hide (by href). A provided array
  // replaces the stored list; omit to leave unchanged. The *_by_role maps hide additionally per role.
  disabled_modules?: string[];
  hidden_items?: string[];
  disabled_modules_by_role?: Record<string, string[]>;
  hidden_items_by_role?: Record<string, string[]>;
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

  patchTables: (tenantID: string, body: { table_max_occupation_minutes?: number }) =>
    apiClient.patch<POSSettings>(`${settingsBase(tenantID)}/tables`, body),

  patchOutletConfig: (tenantID: string, body: { use_case?: string | null }) =>
    apiClient.patch<POSSettings>(`${settingsBase(tenantID)}/outlet`, body),

  getOutlet: (tenantID: string, outletID: string) =>
    apiClient.get<POSSettings>(`/api/v1/${tenantID}/pos/outlets/${outletID}/settings`),
};

/** Managed screensaver media (Settings → Display). URLs are RELATIVE /media/... paths —
 *  resolve for display via resolveMediaUrl (lib/screensaver). Max 3; replacing requires an
 *  explicit delete first (the backend 409s when full and removes the file on delete). */
export const screensaverMediaApi = {
  list: (tenantID: string) =>
    apiClient.get<{ screensaver_urls: string[]; max: number }>(
      `/api/v1/${tenantID}/pos/settings/screensavers`,
    ),

  upload: (tenantID: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient.post<{ screensaver_urls: string[]; uploaded: string }>(
      `/api/v1/${tenantID}/pos/settings/screensavers`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  },

  remove: (tenantID: string, url: string) =>
    apiClient.delete<{ screensaver_urls: string[]; deleted: string }>(
      `/api/v1/${tenantID}/pos/settings/screensavers?url=${encodeURIComponent(url)}`,
    ),
};

export const printApi = {
  printReceipt: (tenantID: string, orderID: string, body: { printer_id?: string; type: string; reason?: string }) =>
    apiClient.post(`/api/v1/${tenantID}/pos/orders/${orderID}/print`, body),
};
