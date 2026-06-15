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
//
// Backend shapes:
//   - List  → pagination envelope `{ data: Prescription[], total, page, limit }`
//             (list rows do NOT include `lines`).
//   - Get / Create / Dispense → `{ prescription: Prescription, lines: PrescriptionLine[] }`.
// We normalise both to a flat `Prescription` (with `lines`) for the UI.

/** Flatten the `{ prescription, lines }` detail envelope into a flat Prescription. */
function flattenPrescription(res: { prescription: Prescription; lines?: PrescriptionLine[] }): Prescription {
  return { ...res.prescription, lines: res.lines ?? res.prescription?.lines ?? [] };
}

export async function listPrescriptions(
  tenantSlug: string,
  params?: PrescriptionFilters,
): Promise<Prescription[]> {
  const res = await apiClient.get<{ data: Prescription[] }>(
    `${base(tenantSlug)}/prescriptions`,
    params,
  );
  return (res.data ?? []).map((p) => ({ ...p, lines: p.lines ?? [] }));
}

export async function getPrescription(tenantSlug: string, id: string): Promise<Prescription> {
  const res = await apiClient.get<{ prescription: Prescription; lines?: PrescriptionLine[] }>(
    `${base(tenantSlug)}/prescriptions/${id}`,
  );
  return flattenPrescription(res);
}

export async function createPrescription(tenantSlug: string, data: CreatePrescriptionData): Promise<Prescription> {
  const res = await apiClient.post<{ prescription: Prescription; lines?: PrescriptionLine[] }>(
    `${base(tenantSlug)}/prescriptions`,
    data,
  );
  return flattenPrescription(res);
}

export async function dispensePrescription(tenantSlug: string, id: string): Promise<Prescription> {
  const res = await apiClient.post<{ prescription: Prescription; lines?: PrescriptionLine[] }>(
    `${base(tenantSlug)}/prescriptions/${id}/dispense`,
    {},
  );
  return flattenPrescription(res);
}
