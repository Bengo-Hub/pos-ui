/**
 * OPD clinical workflow: Records (patient registration) -> Triage (vitals) -> Examination
 * (diagnosis, lab referral, prescribing) -> Lab (test results) -> Pharmacy (existing prescription
 * flow in pharmacy.ts). Each stage is independently toggleable per outlet in Settings.
 */
import { apiClient } from '@/lib/api/client';

const base = (tenantSlug: string) => `/api/v1/${tenantSlug}/pos/clinical`;

// ─── Prescribers (shared with the standalone New Prescription form) ───────────

export interface Prescriber {
  staff_id: string;
  user_id: string;
  name: string;
  role: string;
  license_number?: string;
}

export async function listPrescribers(tenantSlug: string): Promise<Prescriber[]> {
  const res = await apiClient.get<{ data: Prescriber[] }>(`/api/v1/${tenantSlug}/pos/pharmacy/prescribers`);
  return res.data ?? [];
}

// ─── Patients ──────────────────────────────────────────────────────────────────

export interface Patient {
  id: string;
  patient_number: string;
  full_name: string;
  dob?: string;
  gender?: string;
  phone?: string;
  id_number?: string;
  address?: string;
  allergy_flags?: string[];
  crm_contact_id?: string;
  created_at: string;
}

export interface CreatePatientData {
  outlet_id: string;
  full_name: string;
  dob?: string;
  gender?: string;
  phone?: string;
  id_number?: string;
  address?: string;
  allergy_flags?: string[];
  crm_contact_id?: string;
}

export async function createPatient(tenantSlug: string, data: CreatePatientData): Promise<Patient> {
  return apiClient.post<Patient>(`${base(tenantSlug)}/patients`, data);
}

export async function listPatients(tenantSlug: string, q?: string): Promise<Patient[]> {
  const res = await apiClient.get<{ data: Patient[] }>(`${base(tenantSlug)}/patients`, q ? { q } : undefined);
  return res.data ?? [];
}

export async function getPatient(tenantSlug: string, id: string): Promise<{ patient: Patient; visits: Visit[] }> {
  return apiClient.get(`${base(tenantSlug)}/patients/${id}`);
}

// ─── Visits ────────────────────────────────────────────────────────────────────

export type VisitStatus =
  | 'registered'
  | 'triaged'
  | 'in_examination'
  | 'awaiting_lab'
  | 'lab_complete'
  | 'prescribed'
  | 'dispensed'
  | 'completed'
  | 'cancelled';

export interface Visit {
  id: string;
  outlet_id: string;
  patient_id: string;
  visit_number: string;
  status: VisitStatus;
  registration_fee_order_id?: string;
  chief_complaint?: string;
  registered_by?: string;
  created_at: string;
}

export interface CreateVisitData {
  patient_id: string;
  outlet_id: string;
  chief_complaint?: string;
}

export interface CreateVisitResult {
  visit: Visit;
  registration_fee_order?: { id: string; order_number: string; total_amount: number };
}

export async function createVisit(tenantSlug: string, data: CreateVisitData): Promise<CreateVisitResult> {
  return apiClient.post(`${base(tenantSlug)}/visits`, data);
}

export async function listVisits(tenantSlug: string, status?: VisitStatus): Promise<Visit[]> {
  const res = await apiClient.get<{ data: Visit[] }>(`${base(tenantSlug)}/visits`, status ? { status } : undefined);
  return res.data ?? [];
}

export interface Triage {
  id: string;
  visit_id: string;
  taken_by: string;
  bp_systolic?: number;
  bp_diastolic?: number;
  temperature_celsius?: number;
  pulse_bpm?: number;
  respiration_rate?: number;
  spo2_percent?: number;
  weight_kg?: number;
  height_cm?: number;
  notes?: string;
  taken_at: string;
}

export interface Examination {
  id: string;
  visit_id: string;
  examined_by: string;
  chief_complaint?: string;
  diagnosis?: string;
  diagnosis_codes?: string[];
  clinical_notes?: string;
  lab_requested: boolean;
  prescription_id?: string;
  status: 'in_progress' | 'awaiting_lab' | 'completed';
  examined_at: string;
  completed_at?: string;
}

export interface LabOrderLine {
  id: string;
  lab_order_id: string;
  test_name: string;
  result?: string;
  unit?: string;
  reference_range?: string;
  flag: 'pending' | 'normal' | 'abnormal' | 'critical';
  notes?: string;
  resulted_by?: string;
  resulted_at?: string;
}

export interface LabOrder {
  id: string;
  visit_id: string;
  examination_id?: string;
  ordered_by: string;
  status: 'ordered' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
  ordered_at: string;
  completed_at?: string;
}

export interface VisitDetail {
  visit: Visit;
  patient: Patient;
  triage?: Triage;
  examination?: Examination;
  lab_orders?: { lab_order: LabOrder; lines: LabOrderLine[] }[] | (LabOrder & { lines: LabOrderLine[] })[];
}

export async function getVisit(tenantSlug: string, id: string): Promise<VisitDetail> {
  return apiClient.get(`${base(tenantSlug)}/visits/${id}`);
}

// ─── Triage ────────────────────────────────────────────────────────────────────

export interface TriageInput {
  bp_systolic?: number;
  bp_diastolic?: number;
  temperature_celsius?: number;
  pulse_bpm?: number;
  respiration_rate?: number;
  spo2_percent?: number;
  weight_kg?: number;
  height_cm?: number;
  notes?: string;
}

export async function recordTriage(tenantSlug: string, visitId: string, data: TriageInput): Promise<{ triage: Triage; visit: Visit }> {
  return apiClient.post(`${base(tenantSlug)}/visits/${visitId}/triage`, data);
}

// ─── Examination ───────────────────────────────────────────────────────────────

export interface ExaminationInput {
  chief_complaint?: string;
  /** Free-text summary; derived by joining diagnosis_codes when left empty. */
  diagnosis?: string;
  /** Structured multi-select from the diagnosis catalogue (a visit may carry a combination). */
  diagnosis_codes?: string[];
  clinical_notes?: string;
  lab_requested: boolean;
  /** Priced catalogue picks. */
  lab_test_ids?: string[];
  /** Free-typed one-off tests the catalogue doesn't carry yet. */
  lab_tests?: string[];
}

export async function recordExamination(
  tenantSlug: string,
  visitId: string,
  data: ExaminationInput,
): Promise<{ examination: Examination; visit: Visit; lab_order?: LabOrder; lab_order_lines?: LabOrderLine[] }> {
  return apiClient.post(`${base(tenantSlug)}/visits/${visitId}/examination`, data);
}

export interface PrescribeLineInput {
  drug_name: string;
  dosage: string;
  form: string;
  instructions: string;
  quantity_prescribed: number;
  catalog_item_id?: string;
  unit_price?: number;
}

export interface PrescribeInput {
  prescriber_name: string;
  prescriber_license?: string;
  notes?: string;
  lines: PrescribeLineInput[];
}

export async function prescribeFromExamination(tenantSlug: string, visitId: string, data: PrescribeInput) {
  return apiClient.post(`${base(tenantSlug)}/visits/${visitId}/prescribe`, data);
}

// ─── Lab ───────────────────────────────────────────────────────────────────────

export async function listLabOrders(tenantSlug: string, status?: string) {
  const res = await apiClient.get<{ data: any[] }>(`${base(tenantSlug)}/lab-orders`, status ? { status } : undefined);
  return res.data ?? [];
}

export interface LabResultLineInput {
  line_id: string;
  result: string;
  unit?: string;
  reference_range?: string;
  flag?: 'normal' | 'abnormal' | 'critical';
  notes?: string;
}

export async function submitLabResults(tenantSlug: string, labOrderId: string, lines: LabResultLineInput[]) {
  return apiClient.post(`${base(tenantSlug)}/lab-orders/${labOrderId}/results`, { lines });
}

// ─── Lab test catalogue ────────────────────────────────────────────────────────

export interface LabTest {
  id: string;
  name: string;
  code?: string;
  category?: string;
  price: string | number;
  sample_type?: string;
  reference_range?: string;
  unit?: string;
  turnaround_hours?: number;
  is_active: boolean;
}

export interface LabTestInput {
  name: string;
  code?: string;
  category?: string;
  price: number;
  sample_type?: string;
  reference_range?: string;
  unit?: string;
  turnaround_hours?: number;
  is_active?: boolean;
}

export async function listLabTests(
  tenantSlug: string,
  params?: { category?: string; q?: string; include_inactive?: boolean },
): Promise<{ data: LabTest[]; categories: string[] }> {
  const res = await apiClient.get<{ data: LabTest[]; categories: string[] }>(
    `${base(tenantSlug)}/lab-tests`,
    params as Record<string, unknown> | undefined,
  );
  return { data: res.data ?? [], categories: res.categories ?? [] };
}

export async function createLabTest(tenantSlug: string, body: LabTestInput): Promise<LabTest> {
  return apiClient.post<LabTest>(`${base(tenantSlug)}/lab-tests`, body);
}

export async function updateLabTest(tenantSlug: string, id: string, body: LabTestInput): Promise<LabTest> {
  return apiClient.put<LabTest>(`${base(tenantSlug)}/lab-tests/${id}`, body);
}

export async function deleteLabTest(tenantSlug: string, id: string): Promise<void> {
  await apiClient.delete(`${base(tenantSlug)}/lab-tests/${id}`);
}

// ─── Diagnosis catalogue ───────────────────────────────────────────────────────

export interface Diagnosis {
  id: string;
  name: string;
  code?: string;
  category?: string;
  is_global: boolean;
  is_active: boolean;
}

export async function listDiagnoses(tenantSlug: string, q?: string): Promise<Diagnosis[]> {
  const res = await apiClient.get<{ data: Diagnosis[] }>(`${base(tenantSlug)}/diagnoses`, q ? { q } : undefined);
  return res.data ?? [];
}

export async function createDiagnosis(
  tenantSlug: string,
  body: { name: string; code?: string; category?: string },
): Promise<Diagnosis> {
  return apiClient.post<Diagnosis>(`${base(tenantSlug)}/diagnoses`, body);
}

// ─── Lab order activation (after its bill is settled) ──────────────────────────

export async function activateLabOrder(tenantSlug: string, labOrderId: string) {
  return apiClient.post(`${base(tenantSlug)}/lab-orders/${labOrderId}/activate`, {});
}

// ─── Bills queue (cashier-facing, "billing" workflow mode) ─────────────────────

export interface PharmacyBill {
  prescription: {
    id: string;
    prescription_number: string;
    patient_name: string;
    prescriber_name: string;
    status: string;
    order_id?: string;
    created_at: string;
  };
  lines: { id: string; drug_name: string; quantity_prescribed: number; quantity_dispensed: number }[];
  line_count: number;
  estimated_total: number;
  order_id?: string;
  order_total?: number;
}

export async function listPharmacyBills(tenantSlug: string): Promise<PharmacyBill[]> {
  const res = await apiClient.get<{ data: PharmacyBill[] }>(`/api/v1/${tenantSlug}/pos/pharmacy/bills`);
  return res.data ?? [];
}

// ─── Pharmacy dispensing-workflow config ───────────────────────────────────────

export interface PharmacyWorkflowConfig {
  outlet_id: string;
  pharmacy_workflow_mode: 'direct' | 'billing';
  require_lab_prepayment: boolean;
}

export async function getPharmacyWorkflow(tenantSlug: string, outletId?: string): Promise<PharmacyWorkflowConfig> {
  return apiClient.get(`${base(tenantSlug)}/workflow-config`, outletId ? { outlet_id: outletId } : undefined);
}

export async function updatePharmacyWorkflow(
  tenantSlug: string,
  body: { outlet_id?: string; pharmacy_workflow_mode?: 'direct' | 'billing'; require_lab_prepayment?: boolean },
): Promise<PharmacyWorkflowConfig> {
  return apiClient.patch(`${base(tenantSlug)}/workflow-config`, body);
}
