# Sprint 4: Hotel Module — pos-ui

**Status:** 🟡 Scaffold done — API hooks not wired  
**Period:** April–May 2026  
**Last updated:** 2026-05-09  
**Goal:** Rooms grid, check-in/out, room folio, facilities booking — role-gated to receptionist and admin

---

## Context

The `hotel-pos-v8.jsx` design shows a full hotel management UI as part of the POS system:
- Room grid with 6 status types and color coding
- Check-in modal: guest name, phone, ID, auto room charge calculation
- Room folio: per-stay charge history grouped by type
- Check-out: folio summary + payment settlement
- Facilities: pool, gym, conference, spa, kids area with session booking

This requires Sprint 3 of pos-api (hotel module schemas + endpoints) to be complete first.

---

## Pages to Create

```
src/app/[orgSlug]/(pos)/
  hotel/page.tsx                     — Hotel overview (room grid + occupancy summary)
  hotel/rooms/page.tsx               — Full rooms list with status filter
  hotel/rooms/[id]/page.tsx          — Room detail: current guest, folio, check-in/out
  hotel/facilities/page.tsx          — Facilities with today's bookings
  hotel/facilities/[id]/page.tsx     — Facility detail + booking form
```

---

## Components to Create

```
src/components/hotel/
  RoomGrid.tsx                       — Status-colored room cards in grid layout
  RoomCard.tsx                       — Single room card (number, type, status, rate)
  RoomStatusBadge.tsx                — Status chip with color
  CheckInModal.tsx                   — Guest name, phone, ID, nights, room charge preview
  CheckOutModal.tsx                  — Folio summary + tender selection for settlement
  FolioPanel.tsx                     — Charge history grouped by type
  FolioItem.tsx                      — Single folio line (type, description, amount)
  AddFolioChargeModal.tsx            — Post manual charge to room folio
  FacilityCard.tsx                   — Facility status + capacity + rate
  BookFacilityModal.tsx              — Session date, time, guests count, amount
  BookingList.tsx                    — Today's bookings for a facility
  OccupancySummary.tsx               — Counts: available, occupied, cleaning, maintenance
```

---

## API Hooks (TanStack Query)

```typescript
// src/hooks/hotel/
useRooms(status?, floor?)            → GET /{t}/hotel/rooms
useRoom(roomId)                      → GET /{t}/hotel/rooms/{id}
useCheckIn(roomId)                   → POST /{t}/hotel/rooms/{id}/check-in
useCheckOut(roomId)                  → POST /{t}/hotel/rooms/{id}/check-out
useUpdateRoomStatus(roomId)          → PATCH /{t}/hotel/rooms/{id}/status
useRoomFolio(roomId)                 → GET /{t}/hotel/rooms/{id}/folio
usePostFolioCharge(roomId)           → POST /{t}/hotel/rooms/{id}/folio
useFacilities()                      → GET /{t}/hotel/facilities
useFacility(facilityId)              → GET /{t}/hotel/facilities/{id}
useBookFacility(facilityId)          → POST /{t}/hotel/facilities/{id}/book
useUpdateBooking(bookingId)          → PATCH /{t}/hotel/facilities/bookings/{id}
useFacilityBookings(date?)           → GET /{t}/hotel/facilities/bookings
```

---

## Room Status Colors

| Status | Color | Icon |
|--------|-------|------|
| available | Green (#22c55e) | Bed |
| occupied | Red (#ef4444) | Person |
| cleaning | Blue (#3b82f6) | Broom |
| maintenance | Orange (#f97316) | Wrench |
| reserved | Amber (#f59e0b) | Calendar |
| checkout | Gray (#6b7280) | Door |

---

## Check-In Flow

```
1. Receptionist selects available room → Check In button
2. CheckInModal: enter guest_name, phone, id_number, nights
3. Preview: auto-calc check_out_date = check_in + nights
4. Preview: total_room_charge = rate_per_night × nights
5. POST /{t}/hotel/rooms/{id}/check-in
6. Room status → occupied, RoomGuest created, RoomFolioItem for room charge added
```

---

## Check-Out Flow

```
1. Receptionist selects occupied room → Check Out button
2. FolioPanel: shows all charges (room, food, minibar, etc.)
3. Total folio amount displayed
4. Settlement: select payment method (Cash/Card/M-Pesa)
   → for non-cash: pos-api creates treasury intent (treasury integration, Sprint 6)
5. POST /{t}/hotel/rooms/{id}/check-out
6. Room status → cleaning, RoomGuest.status → checked_out
```

---

## Permission Gates

Tabs gated to `receptionist` and `pos_admin` / `store_manager` roles:
```typescript
// Only show hotel nav items if user has pos.hotel.view
const { hasPermission } = useMe()
if (!hasPermission('pos.hotel.view')) return null
```

---

## Room Service Orders

When creating a POS order for a room service item:
- Order subtype: `room_service`
- Link `room_id` + `room_guest_id` to order
- On order completion: automatically post `RoomFolioItem` charge to room folio

---

## Tasks

- [x] Create `hotel/page.tsx` with OccupancySummary + RoomGrid
- [x] Create `hotel/rooms/page.tsx` with status filter tabs
- [x] Create `hotel/rooms/[id]/page.tsx` with folio and check-in/out actions
- [x] Create `hotel/facilities/page.tsx` and `hotel/facilities/[id]/page.tsx`
- [x] Create all hotel components (scaffold — using mock data)
- [ ] Create TanStack Query hooks for all hotel endpoints (`useHotelRooms`, `useRoom`, `useCheckIn`, `useCheckOut`, `useFacilities`, `useBookFacility` — not yet implemented)
- [x] Gate hotel nav items behind `pos.hotel.view` permission
- [ ] Test check-in → folio charge → check-out flow (blocked by hook wiring)
- [ ] Run `pnpm build` and fix all errors (pending after hooks wired)

## Remaining Work (as of 2026-05-09)

Pages exist at `hotel/page.tsx`, `hotel/rooms/page.tsx`, `hotel/rooms/[roomId]/page.tsx`, `hotel/facilities/page.tsx` but are scaffolded with mock data. The following hooks must be implemented and wired:

- [ ] `useHotelRooms(status?, floor?)` → `GET /{t}/hotel/rooms`
- [ ] `useRoom(roomId)` → `GET /{t}/hotel/rooms/{id}`
- [ ] `useCheckIn(roomId)` → `POST /{t}/hotel/rooms/{id}/check-in`
- [ ] `useCheckOut(roomId)` → `POST /{t}/hotel/rooms/{id}/check-out`
- [ ] `useRoomFolio(roomId)` → `GET /{t}/hotel/rooms/{id}/folio`
- [ ] `usePostFolioCharge(roomId)` → `POST /{t}/hotel/rooms/{id}/folio`
- [ ] `useFacilities()` → `GET /{t}/hotel/facilities`
- [ ] `useBookFacility(facilityId)` → `POST /{t}/hotel/facilities/{id}/book`
- [ ] `useFacilityBookings(date?)` → `GET /{t}/hotel/facilities/bookings`
