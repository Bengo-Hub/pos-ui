import { apiClient } from './client';

export interface Room {
  id: string;
  room_number: string;
  name: string;
  room_type: string;
  floor: number;
  rate_per_night: number;
  currency?: string;
  status: 'available' | 'occupied' | 'cleaning' | 'maintenance' | 'reserved' | 'checkout';
  edges?: {
    guests?: RoomGuest[];
    folio_items?: FolioItem[];
  };
}

export interface RoomGuest {
  id: string;
  guest_name: string;
  phone: string;
  id_number: string;
  check_in_date: string;
  check_out_date: string;
  nights: number;
  total_room_charge: number;
  status: 'active' | 'checked_out';
}

export interface FolioItem {
  id: string;
  description: string;
  amount: number;
  charge_type: string;
  created_at: string;
}

export interface Facility {
  id: string;
  name: string;
  facility_type: string;
  capacity: number;
  rate_per_session: number | null;
  opening_time: string;
  closing_time: string;
  status: 'available' | 'occupied' | 'maintenance' | 'closed';
}

export interface FacilityBooking {
  id: string;
  facility_id: string;
  guest_name: string;
  phone: string;
  session_date: string;
  start_time: string;
  end_time: string;
  guests_count: number;
  status: string;
}

function hotelBase(tenantSlug: string) {
  return `/api/v1/${tenantSlug}/hotel`;
}

// ─── Rooms ──────────────────────────────────────────────────────────────────

export const hotelApi = {
  listRooms: (tenantSlug: string, status?: string) =>
    apiClient.get<{ data: Room[]; total: number }>(`${hotelBase(tenantSlug)}/rooms`, status ? { status } : {})
      .then((r) => r.data ?? []),

  getRoom: (tenantSlug: string, roomId: string) =>
    apiClient.get<Room>(`${hotelBase(tenantSlug)}/rooms/${roomId}`),

  updateRoomStatus: (tenantSlug: string, roomId: string, status: string) =>
    apiClient.patch<Room>(`${hotelBase(tenantSlug)}/rooms/${roomId}/status`, { status }),

  checkIn: (tenantSlug: string, roomId: string, body: { guest_name: string; phone: string; id_number: string; nights: number }) =>
    apiClient.post(`${hotelBase(tenantSlug)}/rooms/${roomId}/check-in`, body),

  checkOut: (tenantSlug: string, roomId: string) =>
    apiClient.post(`${hotelBase(tenantSlug)}/rooms/${roomId}/check-out`, {}),

  getRoomGuest: (tenantSlug: string, roomId: string) =>
    apiClient.get<RoomGuest | null>(`${hotelBase(tenantSlug)}/rooms/${roomId}/current-guest`),

  getRoomFolio: (tenantSlug: string, roomId: string) =>
    apiClient.get<FolioItem[]>(`${hotelBase(tenantSlug)}/rooms/${roomId}/folio`),

  postFolioCharge: (tenantSlug: string, roomId: string, body: { description: string; amount: number; charge_type: string }) =>
    apiClient.post(`${hotelBase(tenantSlug)}/rooms/${roomId}/folio`, body),

  // ─── Facilities ────────────────────────────────────────────────────────────

  listFacilities: (tenantSlug: string) =>
    apiClient.get<{ data: Facility[]; total: number }>(`${hotelBase(tenantSlug)}/facilities`)
      .then((r) => r.data ?? []),

  getFacility: (tenantSlug: string, facilityId: string) =>
    apiClient.get<Facility>(`${hotelBase(tenantSlug)}/facilities/${facilityId}`),

  bookFacility: (tenantSlug: string, facilityId: string, body: { guest_name: string; phone: string; session_date: string; start_time: string; end_time: string; guests_count: number }) =>
    apiClient.post<FacilityBooking>(`${hotelBase(tenantSlug)}/facilities/${facilityId}/book`, body),

  listFacilityBookings: (tenantSlug: string) =>
    apiClient.get<{ data: FacilityBooking[]; total: number }>(`${hotelBase(tenantSlug)}/facilities/bookings`)
      .then((r) => r.data ?? []),
};
