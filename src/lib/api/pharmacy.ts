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

export type PrescriptionStatus =
  | 'pending'
  | 'flagged'
  | 'pharmacist_review'
  | 'approved'
  | 'locked'
  | 'partially_dispensed'
  | 'dispensed'
  | 'rejected'
  | 'cancelled';

export interface PrescriptionMetadata {
  allergy_flags?: string[];
  interaction_check_id?: string;
  approved_by?: string;
  approved_at?: string;
  approval_override_reason?: string;
  reservation_id?: string;
  crm_contact_id?: string;
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
  status: PrescriptionStatus;
  notes?: string;
  metadata?: PrescriptionMetadata;
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
  allergy_flags?: string[];
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

export async function approvePrescription(
  tenantSlug: string,
  id: string,
  overrideReason?: string,
): Promise<Prescription> {
  return apiClient.post<Prescription>(`${base(tenantSlug)}/prescriptions/${id}/approve`, {
    override_reason: overrideReason,
  });
}

export async function lockPrescription(tenantSlug: string, id: string): Promise<Prescription> {
  return apiClient.post<Prescription>(`${base(tenantSlug)}/prescriptions/${id}/lock`, {});
}

export interface InteractionCheckResult {
  id: string;
  result: 'clear' | 'flagged';
  details: string;
  drug_skus: string[];
}

export async function createInteractionCheck(
  tenantSlug: string,
  data: { drug_skus: string[]; prescription_id?: string; order_id?: string },
): Promise<InteractionCheckResult> {
  return apiClient.post<InteractionCheckResult>(`${base(tenantSlug)}/interaction-checks`, data);
}

export interface CRMContact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  created_at: string;
}

export async function searchCRMContacts(tenantSlug: string, q: string): Promise<CRMContact[]> {
  const res = await apiClient.get<{ contacts: CRMContact[] }>(`${base(tenantSlug)}/crm-contacts`, { q });
  return res.contacts ?? [];
}

export async function linkCRMContact(
  tenantSlug: string,
  id: string,
  crmContactId: string,
): Promise<Prescription> {
  const res = await apiClient.post<{ prescription: Prescription }>(
    `${base(tenantSlug)}/prescriptions/${id}/link-crm-contact`,
    { crm_contact_id: crmContactId },
  );
  return res.prescription;
}
