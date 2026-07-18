'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import {
  hotelApi,
  type CreateRoomInput,
  type CreateFacilityInput,
  type CheckInInput,
  type CreateRoomBookingInput,
  type UpdateRoomBookingInput,
  type CreateEventBookingInput,
  type LateCheckoutInput,
  type CreateHousekeepingInput,
  type UpdateHousekeepingInput,
  type SettleFolioInput,
} from '@/lib/api/hotel';

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

export function useFolioSummary(roomId: string, enabled: boolean) {
  const slug = useTenantSlug();
  return useQuery({
    queryKey: ['folio-summary', slug, roomId],
    queryFn: () => hotelApi.getFolioSummary(slug, roomId),
    enabled: !!slug && !!roomId && enabled,
    staleTime: 5_000,
  });
}

export function useSettleFolio(roomId: string) {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SettleFolioInput) => hotelApi.settleFolio(slug, roomId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folio-summary', slug, roomId] });
      qc.invalidateQueries({ queryKey: ['room-folio', slug, roomId] });
      qc.invalidateQueries({ queryKey: ['hotel-rooms', slug] });
      qc.invalidateQueries({ queryKey: ['hotel-room', slug, roomId] });
      qc.invalidateQueries({ queryKey: ['room-guest', slug, roomId] });
    },
  });
}

export function useCheckIn(roomId: string) {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CheckInInput) =>
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
    mutationFn: (body: { description: string; amount: number; charge_type: string; inventory_sku?: string; quantity?: number }) =>
      hotelApi.postFolioCharge(slug, roomId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room-folio', slug, roomId] });
      qc.invalidateQueries({ queryKey: ['hotel-room', slug, roomId] });
    },
  });
}

export function useLateCheckout(roomId: string) {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LateCheckoutInput) => hotelApi.lateCheckout(slug, roomId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hotel-room', slug, roomId] });
      qc.invalidateQueries({ queryKey: ['room-guest', slug, roomId] });
      qc.invalidateQueries({ queryKey: ['room-folio', slug, roomId] });
    },
  });
}

export function useBatchCheckout() {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { room_ids: string[]; checked_out_by?: string }) => hotelApi.batchCheckout(slug, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hotel-rooms', slug] });
      qc.invalidateQueries({ queryKey: ['housekeeping', slug] });
    },
  });
}

// ─── Housekeeping ─────────────────────────────────────────────────────────────

export function useHousekeepingTasks(params?: { status?: string; room_id?: string; assigned_to?: string }) {
  const slug = useTenantSlug();
  return useQuery({
    queryKey: ['housekeeping', slug, params ?? {}],
    queryFn: () => hotelApi.listHousekeeping(slug, params),
    enabled: !!slug,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useCreateHousekeepingTask() {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateHousekeepingInput) => hotelApi.createHousekeeping(slug, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['housekeeping', slug] }),
  });
}

export function useUpdateHousekeepingTask() {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskID, body }: { taskID: string; body: UpdateHousekeepingInput }) =>
      hotelApi.updateHousekeeping(slug, taskID, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['housekeeping', slug] }),
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

export function useCreateFacility() {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateFacilityInput) => hotelApi.createFacility(slug, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facilities', slug] }),
  });
}

export function useUpdateFacility(facilityId: string) {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<CreateFacilityInput>) => hotelApi.updateFacility(slug, facilityId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facilities', slug] }),
  });
}

export function useDeleteFacility() {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (facilityId: string) => hotelApi.deleteFacility(slug, facilityId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facilities', slug] }),
  });
}

export function useInventoryBundles(enabled = true) {
  const slug = useTenantSlug();
  return useQuery({
    queryKey: ['inventory-bundles', slug],
    queryFn: () => hotelApi.listInventoryBundles(slug),
    enabled: !!slug && enabled,
    staleTime: 5 * 60_000,
  });
}

export function useBookFacility(facilityId: string) {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { guest_name: string; phone: string; session_date: string; start_time: string; end_time: string; guests_count: number; seats?: number }) =>
      hotelApi.bookFacility(slug, facilityId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['facilities', slug] });
      qc.invalidateQueries({ queryKey: ['facility-availability', slug] });
    },
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

/** Live seat availability for a facility on a given date. Only meaningful for `shared` (co-working) facilities. */
export function useFacilityAvailability(facilityId: string, date: string, enabled = true) {
  const slug = useTenantSlug();
  return useQuery({
    queryKey: ['facility-availability', slug, facilityId, date],
    queryFn: () => hotelApi.getFacilityAvailability(slug, facilityId, { date }),
    enabled: !!slug && !!facilityId && !!date && enabled,
    staleTime: 15_000,
  });
}

// ─── Multi-room (group) bookings ──────────────────────────────────────────────

export function useRoomBookings() {
  const slug = useTenantSlug();
  return useQuery({
    queryKey: ['room-bookings', slug],
    queryFn: () => hotelApi.listBookings(slug),
    enabled: !!slug,
    staleTime: 30_000,
  });
}

export function useCreateRoomBooking() {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRoomBookingInput) => hotelApi.createBooking(slug, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['room-bookings', slug] }),
  });
}

export function useUpdateRoomBooking(bookingId: string) {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateRoomBookingInput) => hotelApi.updateBooking(slug, bookingId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['room-bookings', slug] }),
  });
}

// ─── Conference / events (BEO) + meal cards ────────────────────────────────────

export function useEventBookings() {
  const slug = useTenantSlug();
  return useQuery({
    queryKey: ['event-bookings', slug],
    queryFn: () => hotelApi.listEvents(slug),
    enabled: !!slug,
    staleTime: 30_000,
  });
}

export function useEventBooking(eventId: string) {
  const slug = useTenantSlug();
  return useQuery({
    queryKey: ['event-booking', slug, eventId],
    queryFn: () => hotelApi.getEvent(slug, eventId),
    enabled: !!slug && !!eventId,
    staleTime: 15_000,
  });
}

export function useCreateEventBooking() {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateEventBookingInput) => hotelApi.createEvent(slug, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['event-bookings', slug] }),
  });
}

export function useUpdateEventBooking(eventId: string) {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<CreateEventBookingInput> & { status?: string }) => hotelApi.updateEvent(slug, eventId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event-bookings', slug] });
      qc.invalidateQueries({ queryKey: ['event-booking', slug, eventId] });
    },
  });
}

export function useGenerateMealCards(eventId: string) {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { meal_periods: string[]; delegate_refs?: string[] }) =>
      hotelApi.generateMealCards(slug, eventId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['event-booking', slug, eventId] }),
  });
}

export function useRedeemMealCard() {
  const slug = useTenantSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, body }: { code: string; body: { redeemed_by?: string; pos_order_id?: string } }) =>
      hotelApi.redeemMealCard(slug, code, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['event-bookings', slug] }),
  });
}

export function useEventReconciliation(eventId: string, enabled: boolean) {
  const slug = useTenantSlug();
  return useQuery({
    queryKey: ['event-reconciliation', slug, eventId],
    queryFn: () => hotelApi.reconcileEvent(slug, eventId),
    enabled: !!slug && !!eventId && enabled,
    staleTime: 15_000,
  });
}

// ─── Inventory master picker ────────────────────────────────────────────────────

export function useInventoryServiceItems(useCase: string, enabled = true) {
  const slug = useTenantSlug();
  return useQuery({
    queryKey: ['inventory-service-items', slug, useCase],
    queryFn: () => hotelApi.listInventoryServiceItems(slug, useCase),
    enabled: !!slug && !!useCase && enabled,
    staleTime: 5 * 60_000,
  });
}

