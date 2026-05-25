import { apiClient } from '@/lib/api/client';

const base = (tenantSlug: string) => `/api/v1/${tenantSlug}/pos`;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CatalogItem {
  id: string;
  name: string;
  price: number;
  sku: string;
  barcode?: string;
  description?: string;
  category?: string;
  image_url?: string;
  stock_quantity?: number;
  item_type?: string; // GOODS | SERVICE | RECIPE | VOUCHER
  track_serial_numbers: boolean;
  weight_grams?: number;
  duration_minutes?: number;
  tax_status?: string;
  requires_age_verification?: boolean;
  requires_prescription?: boolean;
  is_controlled_substance?: boolean;
  minimum_age?: number;
  is_returnable?: boolean;
  is_available?: boolean;
}

export interface ScaleReading {
  id: string;
  device_id: string;
  weight_grams: number;
  unit: string;
  tare_grams: number;
  read_at: string;
}

export interface CreateScaleReadingData {
  weight_grams: number;
  unit: string;
  tare_grams?: number;
}

export interface SerialHistory {
  serial: string;
  item_id: string;
  item_name: string;
  events: Array<{ event: string; order_id: string; at: string }>;
}

// ─── Barcode lookup ───────────────────────────────────────────────────────────

export async function lookupItemByBarcode(
  tenantSlug: string,
  barcode: string,
): Promise<CatalogItem> {
  return apiClient.get<CatalogItem>(`${base(tenantSlug)}/catalog/barcode/${encodeURIComponent(barcode)}`);
}

// ─── Scale readings ───────────────────────────────────────────────────────────

export async function getScaleReading(
  tenantSlug: string,
  deviceId: string,
): Promise<ScaleReading> {
  return apiClient.get<ScaleReading>(`${base(tenantSlug)}/devices/${deviceId}/scale/current`);
}

export async function createScaleReading(
  tenantSlug: string,
  deviceId: string,
  data: CreateScaleReadingData,
): Promise<ScaleReading> {
  return apiClient.post<ScaleReading>(`${base(tenantSlug)}/devices/${deviceId}/scale/reading`, data);
}

// ─── Serial numbers ───────────────────────────────────────────────────────────

export async function captureSerials(
  tenantSlug: string,
  orderId: string,
  lineId: string,
  serials: string[],
): Promise<void> {
  await apiClient.post<void>(`${base(tenantSlug)}/orders/${orderId}/lines/${lineId}/serials`, {
    serials,
  });
}

export async function getSerialHistory(
  tenantSlug: string,
  serial: string,
): Promise<SerialHistory> {
  return apiClient.get<SerialHistory>(`${base(tenantSlug)}/serials/${serial}`);
}
