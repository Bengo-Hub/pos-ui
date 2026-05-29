import { apiClient } from './client';

export interface ShiftRotation {
  id: string;
  tenant_id: string;
  outlet_id?: string;
  name: string;
  cycle_days: number;
  start_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShiftRotationSlot {
  id: string;
  rotation_id: string;
  tenant_id: string;
  staff_member_id: string;
  cycle_day: number;
  start_time: string;
  end_time: string;
  is_off_day: boolean;
  created_at: string;
}

export interface ShiftRotationDetail {
  rotation: ShiftRotation;
  slots: ShiftRotationSlot[];
}

export interface CreateRotationInput {
  name: string;
  cycle_days?: number;  // defaults to 14
  start_date: string;   // YYYY-MM-DD
}

export interface RotationSlotInput {
  staff_member_id: string;
  cycle_day: number;
  start_time: string;
  end_time: string;
  is_off_day?: boolean;
}

function rotationBase(tenantID: string) {
  return `/api/v1/${tenantID}/pos/shift-rotations`;
}

export const shiftRotationsApi = {
  list: (tenantID: string, activeOnly = false) =>
    apiClient.get<ShiftRotation[]>(rotationBase(tenantID), activeOnly ? { active: 'true' } : {}),

  get: (tenantID: string, rotationId: string) =>
    apiClient.get<ShiftRotationDetail>(`${rotationBase(tenantID)}/${rotationId}`),

  create: (tenantID: string, body: CreateRotationInput) =>
    apiClient.post<ShiftRotation>(rotationBase(tenantID), body),

  update: (tenantID: string, rotationId: string, body: { name?: string; is_active?: boolean }) =>
    apiClient.patch<ShiftRotation>(`${rotationBase(tenantID)}/${rotationId}`, body),

  upsertSlots: (tenantID: string, rotationId: string, slots: RotationSlotInput[]) =>
    apiClient.put<ShiftRotationSlot[]>(`${rotationBase(tenantID)}/${rotationId}/slots`, slots),
};
