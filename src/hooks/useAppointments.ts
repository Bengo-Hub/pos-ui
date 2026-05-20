'use client';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

function basePath(tenantID: string) {
  return `/api/v1/${tenantID}/pos/appointments`;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'no_show'
  | 'cancelled';

export interface Appointment {
  id: string;
  date: string;
  time: string;
  duration_minutes: number;
  staff_id: string;
  staff_name: string;
  customer_id: string;
  customer_name: string;
  customer_phone?: string;
  service_id: string;
  service_name: string;
  status: AppointmentStatus;
  notes?: string;
  created_at: string;
}

export interface CreateAppointmentInput {
  date: string;
  time: string;
  duration_minutes?: number;
  staff_id: string;
  customer_name: string;
  customer_phone?: string;
  service_id: string;
  notes?: string;
}

// ─── List ───────────────────────────────────────────────────────────────────

export function useAppointments(filters?: {
  date?: string;
  status?: string;
  staff_id?: string;
}) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['appointments', tenantID, filters],
    queryFn: () =>
      apiClient.get<{ data: Appointment[]; total: number }>(basePath(tenantID), {
        date: filters?.date,
        status: filters?.status,
        staff_id: filters?.staff_id,
      }),
    enabled: !!tenantID,
    staleTime: 15_000,
  });
}

// ─── Create ─────────────────────────────────────────────────────────────────

export function useCreateAppointment() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAppointmentInput) =>
      apiClient.post(basePath(tenantID), data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });
}

// ─── Get single ─────────────────────────────────────────────────────────────

export function useAppointment(id: string) {
  const tenantID = useTenantID();
  return useQuery({
    queryKey: ['appointment', tenantID, id],
    queryFn: () => apiClient.get<Appointment>(`${basePath(tenantID)}/${id}`),
    enabled: !!tenantID && !!id,
  });
}

// ─── Update (full edit) ──────────────────────────────────────────────────────

export function useUpdateAppointment() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateAppointmentInput> }) =>
      apiClient.put<Appointment>(`${basePath(tenantID)}/${id}`, data),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['appointment', tenantID, v.id] });
    },
  });
}

// ─── Status-transition action helpers ────────────────────────────────────────

function useAppointmentAction(action: string) {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`${basePath(tenantID)}/${id}/${action}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });
}

export const useCheckInAppointment  = () => useAppointmentAction('check-in');
export const useStartAppointment    = () => useAppointmentAction('start');
export const useCompleteAppointment = () => useAppointmentAction('complete');
export const useCancelAppointment   = () => useAppointmentAction('cancel');
export const useNoShowAppointment   = () => useAppointmentAction('no-show');

// ─── Legacy alias (kept for appointments list page) ──────────────────────────

export function useUpdateAppointmentStatus() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatus }) =>
      apiClient.put(`${basePath(tenantID)}/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });
}
