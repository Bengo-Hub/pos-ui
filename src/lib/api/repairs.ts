import { apiClient } from './client';

// ─── Types (mirror pos-api ent schemas + handlers/repairs.go) ─────────────────

/** Repair job lifecycle statuses — must match the ent enum in repairjob.go. */
export type RepairStatus =
  | 'intake'
  | 'diagnosed'
  | 'awaiting_parts'
  | 'in_progress'
  | 'ready'
  | 'completed'
  | 'cancelled';

/** Ordered list of statuses for board columns / status pickers. */
export const REPAIR_STATUSES: RepairStatus[] = [
  'intake',
  'diagnosed',
  'awaiting_parts',
  'in_progress',
  'ready',
  'completed',
  'cancelled',
];

/** Human-readable labels for each status. */
export const REPAIR_STATUS_LABELS: Record<RepairStatus, string> = {
  intake: 'Intake',
  diagnosed: 'Diagnosed',
  awaiting_parts: 'Awaiting Parts',
  in_progress: 'In Progress',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// Decimal fields are serialized by the API as quoted strings (shopspring/decimal).
export interface RepairJob {
  id: string;
  tenant_id: string;
  outlet_id?: string | null;
  job_number: string;
  customer_phone?: string;
  customer_name?: string;
  device_description?: string;
  reported_issue?: string;
  status: RepairStatus;
  diagnosis?: string;
  estimated_cost?: string;
  quoted_cost?: string | null;
  assigned_staff_id?: string | null;
  pos_order_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RepairJobPart {
  id: string;
  repair_job_id: string;
  inventory_sku?: string;
  inventory_item_id?: string | null;
  description?: string;
  quantity: number;
  unit_cost: string;
  line_total: string;
}

export interface RepairJobEvent {
  id: string;
  repair_job_id: string;
  event_type: string; // intake | diagnosis | parts_added | status_change | note | settled
  notes?: string;
  actor_id?: string | null;
  created_at: string;
}

/** GET /repairs/{id} returns the job plus its parts and timeline. */
export interface RepairJobDetail {
  job: RepairJob;
  parts: RepairJobPart[];
  events: RepairJobEvent[];
}

// pos-api wraps list responses in a pagination envelope ({ data, total, ... }).
export interface RepairListResponse {
  data: RepairJob[];
  total: number;
  page?: number;
  limit?: number;
}

export interface CreateRepairInput {
  customer_name?: string;
  customer_phone?: string;
  device_description?: string;
  reported_issue?: string;
  estimated_cost?: string;
  outlet_id?: string;
  assigned_staff_id?: string;
}

export interface UpdateRepairInput {
  status?: RepairStatus;
  diagnosis?: string;
  quoted_cost?: string;
  assigned_staff_id?: string;
  note?: string;
}

export interface AddPartInput {
  inventory_sku?: string;
  inventory_item_id?: string;
  description?: string;
  quantity: number;
  unit_cost: string;
}

function base(tenantID: string) {
  return `/api/v1/${tenantID}/pos/repairs`;
}

export const repairsApi = {
  list: (tenantID: string, status?: RepairStatus, page = 1, limit = 100) =>
    apiClient.get<RepairListResponse>(base(tenantID), {
      status: status || undefined,
      page,
      limit,
    }),

  create: (tenantID: string, input: CreateRepairInput) =>
    apiClient.post<RepairJob>(base(tenantID), input),

  get: (tenantID: string, jobID: string) =>
    apiClient.get<RepairJobDetail>(`${base(tenantID)}/${jobID}`),

  update: (tenantID: string, jobID: string, input: UpdateRepairInput) =>
    apiClient.patch<RepairJob>(`${base(tenantID)}/${jobID}`, input),

  addPart: (tenantID: string, jobID: string, input: AddPartInput) =>
    apiClient.post<{ part: RepairJobPart; parts_total: string }>(
      `${base(tenantID)}/${jobID}/parts`,
      input,
    ),

  removePart: (tenantID: string, jobID: string, partID: string) =>
    apiClient.delete<{ parts_total: string }>(`${base(tenantID)}/${jobID}/parts/${partID}`),

  settle: (tenantID: string, jobID: string, posOrderID: string) =>
    apiClient.post<RepairJob>(`${base(tenantID)}/${jobID}/settle`, { pos_order_id: posOrderID }),
};
