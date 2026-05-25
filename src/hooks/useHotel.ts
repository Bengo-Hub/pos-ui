'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { hotelApi, type Room, type FolioItem, type Facility, type FacilityBooking, type CreateRoomInput } from '@/lib/api/hotel';

function useTenantSlug() {
  return useAuthStore((s) => s.user?.tenant_id ?? '');
}

// ─── Rooms ──────────────────────────────────────────────────────────────────

export function useHotelRooms(status?: string) {
  const slug = useTenantSlug();
  return useQuery({
    queryKey: ['hotel-rooms', slug, status],
    queryFn: () => hotelApi.listRooms(slug, status),
    enabled: !!slug,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useCreateRoom() {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRoomInput) => hotelApi.createRoom(slug, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hotel-rooms', slug] }),
  });
}

export function useUpdateRoom(roomId: string) {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<CreateRoomInput>) => hotelApi.updateRoom(slug, roomId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hotel-rooms', slug] });
      qc.invalidateQueries({ queryKey: ['hotel-room', slug, roomId] });
    },
  });
}

export function useDeleteRoom() {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roomId: string) => hotelApi.deleteRoom(slug, roomId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hotel-rooms', slug] }),
  });
}

export function useHotelRoom(roomId: string) {
  const slug = useTenantSlug();
  return useQuery({
    queryKey: ['hotel-room', slug, roomId],
    queryFn: () => hotelApi.getRoom(slug, roomId),
    enabled: !!slug && !!roomId,
    staleTime: 15_000,
  });
}

export function useRoomGuest(roomId: string, enabled: boolean) {
  const slug = useTenantSlug();
  return useQuery({
    queryKey: ['room-guest', slug, roomId],
    queryFn: () => hotelApi.getRoomGuest(slug, roomId),
    enabled: !!slug && !!roomId && enabled,
    staleTime: 15_000,
  });
}

export function useRoomFolio(roomId: string, enabled: boolean) {
  const slug = useTenantSlug();
  return useQuery({
    queryKey: ['room-folio', slug, roomId],
    queryFn: () => hotelApi.getRoomFolio(slug, roomId),
    enabled: !!slug && !!roomId && enabled,
    staleTime: 15_000,
  });
}

export function useCheckIn(roomId: string) {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { guest_name: string; phone: string; id_number: string; nights: number }) =>
      hotelApi.checkIn(slug, roomId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hotel-rooms', slug] });
      qc.invalidateQueries({ queryKey: ['hotel-room', slug, roomId] });
      qc.invalidateQueries({ queryKey: ['room-guest', slug, roomId] });
    },
  });
}

export function useCheckOut(roomId: string) {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => hotelApi.checkOut(slug, roomId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hotel-rooms', slug] });
      qc.invalidateQueries({ queryKey: ['hotel-room', slug, roomId] });
    },
  });
}

export function useUpdateRoomStatus(roomId: string) {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: string) => hotelApi.updateRoomStatus(slug, roomId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hotel-rooms', slug] });
      qc.invalidateQueries({ queryKey: ['hotel-room', slug, roomId] });
    },
  });
}

export function usePostFolioCharge(roomId: string) {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { description: string; amount: number; charge_type: string }) =>
      hotelApi.postFolioCharge(slug, roomId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['room-folio', slug, roomId] }),
  });
}

// ─── Facilities ──────────────────────────────────────────────────────────────

export function useFacilities() {
  const slug = useTenantSlug();
  return useQuery({
    queryKey: ['facilities', slug],
    queryFn: () => hotelApi.listFacilities(slug),
    enabled: !!slug,
    staleTime: 60_000,
  });
}

export function useBookFacility(facilityId: string) {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { guest_name: string; phone: string; session_date: string; start_time: string; end_time: string; guests_count: number }) =>
      hotelApi.bookFacility(slug, facilityId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facilities', slug] }),
  });
}

export function useFacilityBookings() {
  const slug = useTenantSlug();
  return useQuery({
    queryKey: ['facility-bookings', slug],
    queryFn: () => hotelApi.listFacilityBookings(slug),
    enabled: !!slug,
    staleTime: 30_000,
  });
}
