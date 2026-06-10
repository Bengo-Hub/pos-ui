import { apiClient } from './client';

export interface Room {
  id: string;
  room_number: string;
  name: string;
  room_type: string;
  floor: number;
  rate_per_night: number;
  currency?: string;
  /** Ref to inventory-api SERVICE Item (use_case=HOSPITALITY_ROOM) — authoritative room-type/rate master. */
  inventory_item_id?: string | null;
  status: 'available' | 'occupied' | 'cleaning' | 'maintenance' | 'reserved' | 'checkout';
  edges?: {
    guests?: RoomGuest[];
    folio_items?: FolioItem[];
  };
}

export interface RoomGuest {
  id: string;
  guest_name: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone: string;
  nationality?: string;
  id_type?: 'national_id' | 'passport' | 'driving_licence' | 'other';
  id_number: string;
  id_document_url?: string;
  adults?: number;
  children?: number;
  child_ages?: number[];
  check_in_date: string;
  check_out_date: string;
  expected_arrival_at?: string;
  expected_departure_at?: string;
  nights: number;
  total_room_charge: number;
  status: 'active' | 'checked_out';
}

export interface CheckInInput {
  guest_name: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone: string;
  nationality?: string;
  id_type?: string;
  id_number: string;
  id_document_url?: string;
  adults?: number;
  children?: number;
  child_ages?: number[];
  nights: number;
  expected_arrival_at?: string;
  expected_departure_at?: string;
  source?: string;
  booking_id?: string;
  crm_contact_id?: string;
  checked_in_by?: string;
}

export interface BookingMeta {
  booking_type?: 'group' | 'individual';
  adults?: number;
  children?: number;
  notes?: string;
  package_inclusions?: string;
}

export interface RoomBooking {
  id: string;
  confirmation_no: string;
  lead_guest_name: string;
  email?: string;
  phone?: string;
  rooms_count: number;
  arrival_date: string;
  departure_date: string;
  market_segment?: string;
  inventory_rate_plan_bundle_id?: string | null;
  status: string;
  metadata?: BookingMeta;
}

export interface CreateRoomBookingInput {
  lead_guest_name: string;
  email?: string;
  phone?: string;
  rooms_count: number;
  arrival_date: string;
  departure_date: string;
  inventory_rate_plan_bundle_id?: string;
  market_segment?: string;
  source?: string;
  metadata?: BookingMeta;
}

export interface UpdateRoomBookingInput {
  lead_guest_name?: string;
  email?: string;
  phone?: string;
  rooms_count?: number;
  arrival_date?: string;
  departure_date?: string;
  market_segment?: string;
  status?: string;
  metadata?: BookingMeta;
}

export interface BookingUpdateResult {
  booking: RoomBooking;
  applied_fee: number;
  fee_currency: string;
}

export interface EventBooking {
  id: string;
  facility_id: string;
  inventory_bundle_id?: string;
  event_type: string;
  title: string;
  client_name: string;
  contact_phone?: string;
  contact_email?: string;
  start_at: string;
  end_at: string;
  conference_days: number;
  delegate_count: number;
  setup_style?: string;
  total_amount: number;
  status: string;
}

export interface CreateEventBookingInput {
  facility_id: string;
  inventory_bundle_id?: string;
  event_type?: string;
  title: string;
  client_name: string;
  contact_phone?: string;
  contact_email?: string;
  start_at: string;
  end_at: string;
  conference_days: number;
  delegate_count: number;
  setup_style?: string;
  deposit_amount?: number;
  total_amount?: number;
  special_requests?: string;
}

export interface MealEntitlement {
  id: string;
  delegate_ref?: string;
  conference_day: string;
  meal_period: string;
  code: string;
  status: 'issued' | 'redeemed' | 'expired' | 'void';
  redeemed_at?: string;
}

export interface ReconciliationRow {
  conference_day: string;
  meal_period: string;
  issued: number;
  redeemed: number;
}

export interface FolioItem {
  id: string;
  description: string;
  amount: number;
  charge_type: string;
  inventory_sku?: string;
  inventory_bundle_id?: string | null;
  pos_order_id?: string | null;
  created_at: string;
}

export interface FolioPayment {
  id: string;
  amount: number;
  currency: string;
  method: string;
  reference?: string;
  status: 'completed' | 'pending' | 'failed';
  created_at: string;
}

export interface FolioSummary {
  room_id: string;
  room_number: string;
  rate_per_night: number;
  guest_id: string;
  guest_name: string;
  phone?: string;
  nights: number;
  check_in_date: string;
  check_out_date: string;
  room_charge: number;
  charges_total: number;
  paid_total: number;
  balance: number;
  currency: string;
  items: FolioItem[];
  payments: FolioPayment[];
}

export interface SettleFolioInput {
  amount: number;
  method: string; // cash | card_manual | pdq | mpesa | mpesa_stk | card | wallet
  reference?: string;
  checkout?: boolean;
}

export interface SettleFolioResult {
  status: 'completed' | 'pending';
  checked_out: boolean;
  intent_id?: string;
  initiate_url?: string;
  summary: FolioSummary;
}

export interface Facility {
  id: string;
  name: string;
  facility_type: string;
  capacity: number;
  rate_per_session: number | null;
  currency?: string;
  opening_time: string;
  closing_time: string;
  /** Ref to inventory-api SERVICE Item (HOSPITALITY_FACILITY/CONFERENCE). */
  inventory_item_id?: string | null;
  setup_styles?: string[];
  divisible?: boolean;
  parent_facility_id?: string | null;
  status: 'available' | 'occupied' | 'maintenance' | 'closed';
}

export interface CreateRoomInput {
  room_number: string;
  room_type: string;
  floor: number;
  rate_per_night: number;
  name?: string;
  currency?: string;
  /** Optional link to the inventory room-type SERVICE item (authoritative rate master). */
  inventory_item_id?: string;
}

export interface CreateFacilityInput {
  name: string;
  facility_type: string;
  capacity: number;
  rate_per_session: number;
  currency?: string;
  opening_time?: string;
  closing_time?: string;
  status?: string;
}

/** Inventory package/bundle option for the conference package picker. */
export interface InventoryBundle {
  id: string;
  name: string;
  sku: string;
  package_type: string;
  price: number;
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

export interface LateCheckoutInput {
  surcharge_amount: number;
  notes?: string;
}

export interface BatchCheckoutResult {
  room_id: string;
  guest_name?: string;
  total_folio?: number;
  error?: string;
}

export interface HousekeepingTask {
  id: string;
  room_id: string;
  task_type: string; // routine_clean | checkout_clean | deep_clean | maintenance | inspection
  status: string; // pending | in_progress | completed | cancelled
  priority: string; // normal | urgent
  assigned_to?: string;
  notes?: string;
  due_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface CreateHousekeepingInput {
  room_id: string;
  task_type?: string;
  priority?: string;
  assigned_to?: string;
  notes?: string;
  due_at?: string;
}

export interface UpdateHousekeepingInput {
  status?: string;
  assigned_to?: string;
  notes?: string;
  priority?: string;
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

  createRoom: (tenantSlug: string, body: CreateRoomInput) =>
    apiClient.post<Room>(`${hotelBase(tenantSlug)}/rooms`, body),

  updateRoom: (tenantSlug: string, roomId: string, body: Partial<CreateRoomInput>) =>
    apiClient.put<Room>(`${hotelBase(tenantSlug)}/rooms/${roomId}`, body),

  deleteRoom: (tenantSlug: string, roomId: string) =>
    apiClient.delete(`${hotelBase(tenantSlug)}/rooms/${roomId}`),

  updateRoomStatus: (tenantSlug: string, roomId: string, status: string) =>
    apiClient.patch<Room>(`${hotelBase(tenantSlug)}/rooms/${roomId}/status`, { status }),

  checkIn: (tenantSlug: string, roomId: string, body: CheckInInput) =>
    apiClient.post(`${hotelBase(tenantSlug)}/rooms/${roomId}/check-in`, body),

  checkOut: (tenantSlug: string, roomId: string) =>
    apiClient.post(`${hotelBase(tenantSlug)}/rooms/${roomId}/check-out`, {}),

  getRoomGuest: (tenantSlug: string, roomId: string) =>
    apiClient.get<RoomGuest | null>(`${hotelBase(tenantSlug)}/rooms/${roomId}/current-guest`),

  getRoomFolio: (tenantSlug: string, roomId: string) =>
    apiClient.get<FolioItem[]>(`${hotelBase(tenantSlug)}/rooms/${roomId}/folio`),

  // Full checkout bill: room charge + folio + surcharges, payments taken, and outstanding balance.
  getFolioSummary: (tenantSlug: string, roomId: string) =>
    apiClient.get<FolioSummary>(`${hotelBase(tenantSlug)}/rooms/${roomId}/folio/summary`),

  // Record a folio payment (full or partial) and optionally check out when the balance clears.
  settleFolio: (tenantSlug: string, roomId: string, body: SettleFolioInput) =>
    apiClient.post<SettleFolioResult>(`${hotelBase(tenantSlug)}/rooms/${roomId}/settle`, body),

  postFolioCharge: (
    tenantSlug: string,
    roomId: string,
    body: { description: string; amount: number; charge_type: string; inventory_sku?: string; quantity?: number },
  ) => apiClient.post(`${hotelBase(tenantSlug)}/rooms/${roomId}/folio`, body),

  lateCheckout: (tenantSlug: string, roomId: string, body: LateCheckoutInput) =>
    apiClient.post<{ guest_id: string; late_checkout_approved: boolean; surcharge_amount: number }>(
      `${hotelBase(tenantSlug)}/rooms/${roomId}/late-checkout`,
      body,
    ),

  batchCheckout: (tenantSlug: string, body: { room_ids: string[]; checked_out_by?: string }) =>
    apiClient.post<{ results: BatchCheckoutResult[] }>(`${hotelBase(tenantSlug)}/rooms/batch-checkout`, body),

  // ─── Housekeeping ─────────────────────────────────────────────────────────
  listHousekeeping: (tenantSlug: string, params?: { status?: string; room_id?: string; assigned_to?: string }) =>
    apiClient
      .get<{ data: HousekeepingTask[]; total: number }>(`${hotelBase(tenantSlug)}/housekeeping`, params ?? {})
      .then((r) => r?.data ?? []),

  createHousekeeping: (tenantSlug: string, body: CreateHousekeepingInput) =>
    apiClient.post<HousekeepingTask>(`${hotelBase(tenantSlug)}/housekeeping`, body),

  updateHousekeeping: (tenantSlug: string, taskID: string, body: UpdateHousekeepingInput) =>
    apiClient.patch<HousekeepingTask>(`${hotelBase(tenantSlug)}/housekeeping/${taskID}`, body),

  // ─── Facilities ────────────────────────────────────────────────────────────

  listFacilities: (tenantSlug: string) =>
    apiClient.get<{ data: Facility[]; total: number }>(`${hotelBase(tenantSlug)}/facilities`)
      .then((r) => r.data ?? []),

  getFacility: (tenantSlug: string, facilityId: string) =>
    apiClient.get<Facility>(`${hotelBase(tenantSlug)}/facilities/${facilityId}`),

  createFacility: (tenantSlug: string, body: CreateFacilityInput) =>
    apiClient.post<Facility>(`${hotelBase(tenantSlug)}/facilities`, body),

  updateFacility: (tenantSlug: string, facilityId: string, body: Partial<CreateFacilityInput>) =>
    apiClient.patch<Facility>(`${hotelBase(tenantSlug)}/facilities/${facilityId}`, body),

  deleteFacility: (tenantSlug: string, facilityId: string) =>
    apiClient.delete(`${hotelBase(tenantSlug)}/facilities/${facilityId}`),

  listInventoryBundles: (tenantSlug: string) =>
    apiClient.get<InventoryBundle[]>(`${hotelBase(tenantSlug)}/inventory-bundles`).then((r) => r ?? []),

  bookFacility: (tenantSlug: string, facilityId: string, body: { guest_name: string; phone: string; session_date: string; start_time: string; end_time: string; guests_count: number }) =>
    apiClient.post<FacilityBooking>(`${hotelBase(tenantSlug)}/facilities/${facilityId}/book`, body),

  listFacilityBookings: (tenantSlug: string) =>
    apiClient.get<{ data: FacilityBooking[]; total: number }>(`${hotelBase(tenantSlug)}/facilities/bookings`)
      .then((r) => r.data ?? []),

  // ─── Multi-room (group) bookings ──────────────────────────────────────────

  listBookings: (tenantSlug: string) =>
    apiClient.get<RoomBooking[]>(`${hotelBase(tenantSlug)}/bookings`).then((r) => r ?? []),

  getBooking: (tenantSlug: string, id: string) =>
    apiClient.get<RoomBooking & { edges?: { guests?: RoomGuest[] } }>(`${hotelBase(tenantSlug)}/bookings/${id}`),

  createBooking: (tenantSlug: string, body: CreateRoomBookingInput) =>
    apiClient.post<RoomBooking>(`${hotelBase(tenantSlug)}/bookings`, body),

  updateBooking: (tenantSlug: string, id: string, body: UpdateRoomBookingInput) =>
    apiClient.patch<BookingUpdateResult>(`${hotelBase(tenantSlug)}/bookings/${id}`, body),

  // ─── Conference / events (BEO) + meal cards ───────────────────────────────

  listEvents: (tenantSlug: string) =>
    apiClient.get<EventBooking[]>(`${hotelBase(tenantSlug)}/events`).then((r) => r ?? []),

  getEvent: (tenantSlug: string, id: string) =>
    apiClient.get<EventBooking & { edges?: { meal_entitlements?: MealEntitlement[] } }>(`${hotelBase(tenantSlug)}/events/${id}`),

  createEvent: (tenantSlug: string, body: CreateEventBookingInput) =>
    apiClient.post<EventBooking>(`${hotelBase(tenantSlug)}/events`, body),

  updateEvent: (tenantSlug: string, id: string, body: Partial<CreateEventBookingInput> & { status?: string }) =>
    apiClient.patch<EventBooking>(`${hotelBase(tenantSlug)}/events/${id}`, body),

  generateMealCards: (tenantSlug: string, eventId: string, body: { meal_periods: string[]; delegate_refs?: string[] }) =>
    apiClient.post<{ event_booking_id: string; cards_issued: number }>(`${hotelBase(tenantSlug)}/events/${eventId}/generate-mealcards`, body),

  redeemMealCard: (tenantSlug: string, code: string, body: { redeemed_by?: string; pos_order_id?: string }) =>
    apiClient.post<MealEntitlement>(`${hotelBase(tenantSlug)}/mealcards/${code}/redeem`, body),

  reconcileEvent: (tenantSlug: string, eventId: string) =>
    apiClient.get<{ event_booking_id: string; rows: ReconciliationRow[] }>(`${hotelBase(tenantSlug)}/events/${eventId}/reconciliation`),

  // Inventory master picker — list SERVICE items by hospitality use_case for linking
  listInventoryServiceItems: (tenantSlug: string, useCase: string) =>
    apiClient.get<InventoryServiceItem[]>(`${hotelBase(tenantSlug)}/inventory-service-items`, { use_case: useCase }).then((r) => r ?? []),
};

export interface InventoryServiceItem {
  id: string;
  sku: string;
  name: string;
  image_url?: string;
}

// ─── Happy-hour promotions ────────────────────────────────────────────────────

export interface HappyHourPromotion {
  id: string;
  name: string;
  promo_kind: string;
  days_of_week?: number[];
  window_start?: string;
  window_end?: string;
  auto_apply: boolean;
  status: string;
}

export interface CreateHappyHourInput {
  name: string;
  promo_kind: 'happy_hour';
  outlet_id?: string;
  days_of_week: number[];
  window_start: string;
  window_end: string;
  auto_apply: boolean;
  scope_type?: 'all' | 'category' | 'item';
  scope_ids?: string[];
  discount_type?: 'percentage' | 'fixed_amount' | 'fixed_price';
  discount_value: number;
  max_discount?: number;
  /** Optional meal-period target for negotiated lunch/dinner rates. */
  meal_period?: 'breakfast' | 'am_break' | 'lunch' | 'pm_break' | 'dinner';
}

export const happyHourApi = {
  listActive: (tenantSlug: string) =>
    apiClient.get<HappyHourPromotion[]>(`/api/v1/${tenantSlug}/pos/promotions/happy-hour/active`).then((r) => r ?? []),

  list: (tenantSlug: string) =>
    apiClient.get<{ data: HappyHourPromotion[]; total: number }>(`/api/v1/${tenantSlug}/pos/promotions`)
      .then((r) => r.data ?? []),

  create: (tenantSlug: string, body: CreateHappyHourInput) =>
    apiClient.post<HappyHourPromotion>(`/api/v1/${tenantSlug}/pos/promotions`, body),
};
