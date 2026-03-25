'use client';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function useTenantID() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

function basePath(tenantID: string) {
  return `/api/v1/${tenantID}/appointments`;
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

// ─── Update Status ──────────────────────────────────────────────────────────

export function useUpdateAppointmentStatus() {
  const tenantID = useTenantID();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatus }) =>
      apiClient.patch(`${basePath(tenantID)}/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });
}
