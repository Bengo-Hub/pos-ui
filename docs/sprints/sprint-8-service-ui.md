# Sprint 8: Service Business UI — pos-ui

**Status:** 🔴 Not Started  
**Period:** September–October 2026  
**Goal:** Appointment calendar, walk-in queue board, staff commission dashboard, service package management, and client lookup for service-based businesses

---

## Context

Service businesses (salon, barbershop, clinic, car wash, spa) do not use a product grid as their primary POS view. Their workflow is:
1. Client arrives (appointment or walk-in)
2. Staff member is assigned a service
3. Service is performed
4. Order is created and payment collected

This sprint builds the scheduling and queue views that replace the product-first layout for service businesses.

---

## Pages to Create

```
src/app/[orgSlug]/(pos)/
  appointments/
    page.tsx                    — Day/week calendar view of all appointments
    [appointmentId]/page.tsx    — Appointment detail + status actions
    new/page.tsx                — Book appointment form
  queue/
    page.tsx                    — Walk-in queue board (like KDS but for service)
  clients/
    page.tsx                    — Client lookup / create
    [clientId]/page.tsx         — Client profile: history, packages, preferences
  packages/
    page.tsx                    — Service package catalogue + sell
    purchases/page.tsx          — List client package purchases (redeem)
  commissions/
    page.tsx                    — Staff commission summary (manager view)
```

---

## Components

```
src/components/service/
  AppointmentCalendar.tsx       — Day column grid with time slots; drag-to-move
  AppointmentCard.tsx           — Appointment block: client name, service, staff, status
  QueueBoard.tsx                — Kanban-style: Waiting | In Progress | Done columns
  QueueEntryCard.tsx            — Client name, service, elapsed wait time, assign button
  ClientSearchBar.tsx           — Phone-number lookup with instant result
  ClientProfileCard.tsx         — History, package balances, notes
  PackageCard.tsx               — Package with sessions remaining, expiry date
  CommissionTable.tsx           — Staff × service commission breakdown
  StaffAvailabilityGrid.tsx     — Which staff are free at which times (for booking)
```

---

## Behaviour

### Appointment Calendar (`/appointments`)
- Default view: today's appointments, grouped by staff column
- Week view toggleable via header pill
- Time slots from 08:00 to 20:00 in 15-minute increments
- Click empty slot → prefills "New Appointment" form with that time + staff
- Appointment colours: grey (booked), blue (checked-in), orange (in progress), green (completed), red (no-show)
- Status actions from appointment card: Check In → Start → Complete → (creates POS order automatically)

### Walk-In Queue (`/queue`)
- Three columns: Waiting / In Progress / Done
- "Add Walk-In" button → quick form: client name (optional), service, preferred staff (optional)
- Auto-assigns queue position; estimates wait time shown per card
- Assign staff → drag or tap staff name from dropdown
- Start / Complete buttons transition card across columns
- Completing creates a POS order linked to queue entry; redirects to payment

### Client Profile (`/clients/{id}`)
- Shows: visit history (last N orders), active package balances, preferences/notes (editable)
- "Book Appointment" shortcut on profile
- "Sell Package" shortcut on profile

### Package Management (`/packages`)
- Catalogue of available packages with price and session count
- "Sell" button → lookup client by phone → creates POS order for package purchase
- `/packages/purchases` — search by client phone → shows remaining sessions → "Redeem" button → creates POS order linked to package

### Commission Dashboard (`/commissions`)
- Shows: per-staff sales for selected period, services performed, commission earned (pending / paid)
- Manager-only view (requires `pos.commissions.view` permission)
- "Mark Paid" action for batch payout

---

## Hooks

```
src/hooks/
  useAppointments(date, staffId?)   → GET /{t}/pos/appointments?date=&staff_id=
  useAppointment(id)                → GET /{t}/pos/appointments/{id}
  useCreateAppointment()            → POST /{t}/pos/appointments
  useAppointmentAction()            → POST /{t}/pos/appointments/{id}/{action}
  useQueue()                        → GET /{t}/pos/queue
  useAddToQueue()                   → POST /{t}/pos/queue
  useQueueAction()                  → POST /{t}/pos/queue/{id}/{action}
  useClientLookup(phone)            → GET /{t}/pos/clients?phone=
  useClient(id)                     → GET /{t}/pos/clients/{id}
  usePackages()                     → GET /{t}/pos/packages
  usePackagePurchases(phone)        → GET /{t}/pos/packages/purchases?phone=
  useRedeemPackage()                → POST /{t}/pos/packages/purchases/{id}/redeem
  useStaffCommissions(staffId, period) → GET /{t}/pos/staff/{id}/commissions
```

---

## Navigation
- Service Mode: appointments, queue, clients, packages, commissions shown in side-nav when tenant has `service` module
- Regular POS (product grid) still accessible for walk-in cash sales

---

## Use Cases Covered

| Use Case | Business Types |
|----------|---------------|
| Book and manage appointments | Salon, clinic, spa, physiotherapy |
| Walk-in queue with real-time status | Barbershop, car wash, clinic |
| Client profile and visit history | Salon, clinic, barbershop |
| Service package sale and redemption | Gym, spa, physiotherapy |
| Staff commission dashboard | Salon, barbershop, spa |
| Service completion → auto POS order | All service businesses |
