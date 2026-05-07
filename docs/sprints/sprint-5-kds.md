# Sprint 5: KDS & Bar Display — pos-ui

**Status:** 🔴 Not Started  
**Period:** July 2026  
**Goal:** Kitchen Display System terminal view, bar display, item-level status controls — designed for full-screen kitchen/bar mounting

---

## Context

The `hotel-pos-v8.jsx` design shows KDS with:
- Separate kitchen and bar queues
- Order cards (ticket cards) with: table number, waiter name, guest count, order age timer
- Item rows with status toggle (pending → cooking → ready)
- Actions: Start All, Done, Call Waiter
- Timer: green (0–10 min) → orange (10–15 min) → red (>15 min)

KDS uses polling every 5 seconds (TanStack Query `refetchInterval`). No WebSocket for MVP.

This requires pos-api Sprint 4 (KDS HTTP endpoints) to be complete.

---

## Pages to Create

```
src/app/[orgSlug]/(pos)/
  kds/page.tsx                — Kitchen display (full-screen, auto-refresh 5s)
  bar/page.tsx                — Bar display (same layout, bar-station-filtered)
```

---

## Components to Create

```
src/components/kds/
  KDSBoard.tsx                — Full-screen ticket grid layout
  KDSTicketCard.tsx           — Individual order card with all item rows
  KDSItemRow.tsx              — Single item: name, qty, status toggle
  KDSTimer.tsx                — Elapsed time badge (color-coded by age)
  KDSActionBar.tsx            — Start All, Done, Call Waiter buttons
  KDSStationFilter.tsx        — Station selector (kitchen | bar | all)
  KDSEmpty.tsx                — Empty state "No pending orders"
```

---

## API Hooks (TanStack Query)

```typescript
// src/hooks/kds/
useKitchenQueue()                    → GET /{t}/pos/kds/kitchen   (refetchInterval: 5000)
useBarQueue()                        → GET /{t}/pos/kds/bar        (refetchInterval: 5000)
useKDSTickets(stationId?, status?)   → GET /{t}/pos/kds/tickets    (refetchInterval: 5000)
useStartTicket(ticketId)             → POST /{t}/pos/kds/tickets/{id}/start
useReadyTicket(ticketId)             → POST /{t}/pos/kds/tickets/{id}/ready
useServeTicket(ticketId)             → POST /{t}/pos/kds/tickets/{id}/serve
useVoidTicket(ticketId)              → POST /{t}/pos/kds/tickets/{id}/void
useCallWaiter(ticketId)              → POST /{t}/pos/kds/tickets/{id}/call-waiter
useKDSStations()                     → GET /{t}/pos/kds/stations
```

---

## KDS Ticket Card Layout

```
┌─────────────────────────────────────────┐
│ #042  Table 5  Waiter: Alice    [12:34]  │  ← order number, table, waiter, age timer
│─────────────────────────────────────────│
│ ✓ Grilled Chicken x1      [COOKING]     │
│ ○ Caesar Salad x2         [PENDING]     │
│ ✓ Pasta Carbonara x1      [READY]       │
│─────────────────────────────────────────│
│  [Start All]  [Done]  [Call Waiter]     │
└─────────────────────────────────────────┘
```

---

## Timer Color Logic

```typescript
function getTimerColor(receivedAt: string): string {
  const mins = (Date.now() - new Date(receivedAt).getTime()) / 60000
  if (mins < 10) return 'text-green-500'
  if (mins < 15) return 'text-orange-500'
  return 'text-red-500 animate-pulse'
}
```

---

## Ticket Status State Machine

```
pending → in_progress → ready → served
                              ↓
                            voided (if order cancelled)
```

- "Start All" → ticket status: `in_progress`, all items: `cooking`
- "Done" → ticket status: `ready`
- "Serve" (waiter action) → ticket status: `served`

---

## Full-Screen Mode

KDS pages designed for dedicated display devices:
- No sidebar, no top nav
- Black background, white text
- Auto-refresh without user interaction
- Touch-friendly buttons (min 64px height)
- Font size larger than regular UI (text-lg / text-xl base)

```typescript
// layout.tsx for KDS — stripped layout with no nav
export default function KDSLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-gray-950 text-white">{children}</div>
}
```

---

## Permission Gates

| Action | Required Permission |
|--------|-------------------|
| View kitchen/bar queue | `pos.kds.view` |
| Start, mark ready, serve, call-waiter | `pos.kds.change` |
| Void ticket | `pos.kds.manage` |

Roles with access: `kitchen` (kitchen queue), `bar` (bar queue), `waiter` (all queues, serve action), `pos_admin`, `store_manager`.

---

## Tasks

- [ ] Create `src/app/[orgSlug]/(pos)/kds/page.tsx` with stripped layout
- [ ] Create `src/app/[orgSlug]/(pos)/bar/page.tsx`
- [ ] Create KDS-specific layout with no nav
- [ ] Create `KDSBoard.tsx`, `KDSTicketCard.tsx`, `KDSItemRow.tsx`, `KDSTimer.tsx`
- [ ] Create `KDSActionBar.tsx` with Start All, Done, Call Waiter
- [ ] Create all KDS hooks with `refetchInterval: 5000`
- [ ] Implement timer color logic
- [ ] Gate actions by permission
- [ ] Test: create order → verify ticket appears in kitchen queue → mark cooking → mark ready
- [ ] Run `pnpm build` and fix all errors
