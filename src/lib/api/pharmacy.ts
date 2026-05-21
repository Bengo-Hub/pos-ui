import { apiClient } from '@/lib/api/client';

const base = (tenantSlug: string) => `/api/v1/${tenantSlug}/pos/pharmacy`;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PrescriptionLine {
  id: string;
  drug_name: string;
  dosage: string;
  form: string;
  instructions: string;
  quantity_prescribed: number;
  quantity_dispensed: number;
  catalog_item_id?: string;
  lot_number?: string;
  unit_price?: number;
}

export interface Prescription {
  id: string;
  outlet_id: string;
  order_id?: string;
  prescription_number: string;
  prescriber_name: string;
  prescriber_license: string;
  patient_name: string;
  patient_dob?: string;
  patient_id_number?: string;
  status: 'pending' | 'partially_dispensed' | 'dispensed' | 'cancelled';
  notes?: string;
  lines: PrescriptionLine[];
  created_at: string;
}

export interface CreatePrescriptionData {
  outlet_id: string;
  prescription_number: string;
  prescriber_name: string;
  prescriber_license: string;
  patient_name: string;
  patient_dob?: string;
  patient_id_number?: string;
  notes?: string;
  lines: Omit<PrescriptionLine, 'id' | 'quantity_dispensed'>[];
}

export interface PrescriptionFilters {
  status?: string;
  patient_name?: string;
  date_from?: string;
  date_to?: string;
}

// ─── API functions ────────────────────────────────────────────────────────────

export function listPrescriptions(tenantSlug: string, params?: PrescriptionFilters) {
  return apiClient.get<Prescription[]>(`${base(tenantSlug)}/prescriptions`, params);
}

export function getPrescription(tenantSlug: string, id: string) {
  return apiClient.get<Prescription>(`${base(tenantSlug)}/prescriptions/${id}`);
}

export function createPrescription(tenantSlug: string, data: CreatePrescriptionData) {
  return apiClient.post<Prescription>(`${base(tenantSlug)}/prescriptions`, data);
}

export function dispensePrescription(tenantSlug: string, id: string) {
  return apiClient.post<Prescription>(`${base(tenantSlug)}/prescriptions/${id}/dispense`, {});
}
