import { apiClient } from '@/lib/api/client';

const base = (tenantSlug: string) => `/api/v1/${tenantSlug}/pos`;

export interface Appointment {
  id: string;
  outlet_id: string;
  customer_id?: string;
  customer_name: string;
  customer_phone?: string;
  staff_member_id?: string;
  service_item_id: string;
  service_sku: string;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  notes?: string;
  pos_order_id?: string;
  created_at: string;
}

export interface CreateAppointmentInput {
  outlet_id: string;
  customer_id?: string;
  customer_name: string;
  customer_phone?: string;
  staff_member_id?: string;
  service_item_id: string;
  service_sku: string;
  start_time: string;
  end_time: string;
  notes?: string;
}

export interface UpdateAppointmentInput {
  status?: string;
  staff_member_id?: string;
  start_time?: string;
  end_time?: string;
  notes?: string;
  pos_order_id?: string;
}

export interface BookedSlot {
  start: string;
  end: string;
}

export interface AvailabilityResponse {
  date: string;
  staff_member: string;
  booked_slots: BookedSlot[];
}

export async function listAppointments(
  tenantSlug: string,
  params?: { status?: string; staff_member_id?: string; start_from?: string; start_to?: string },
): Promise<Appointment[]> {
  // Backend returns the `{ data, total, page, limit }` pagination envelope.
  const res = await apiClient.get<{ data: Appointment[] }>(`${base(tenantSlug)}/appointments`, params);
  return res.data ?? [];
}

export function createAppointment(tenantSlug: string, data: CreateAppointmentInput) {
  return apiClient.post<Appointment>(`${base(tenantSlug)}/appointments`, data);
}

export function getAppointment(tenantSlug: string, id: string) {
  return apiClient.get<Appointment>(`${base(tenantSlug)}/appointments/${id}`);
}

export function updateAppointment(tenantSlug: string, id: string, data: UpdateAppointmentInput) {
  return apiClient.put<Appointment>(`${base(tenantSlug)}/appointments/${id}`, data);
}

export function getAvailability(tenantSlug: string, staffMemberId: string, date: string) {
  return apiClient.get<AvailabilityResponse>(`${base(tenantSlug)}/appointments/availability`, {
    staff_member_id: staffMemberId,
    date,
  });
}
