# Sprint 3: Tables, Shifts & Cash Drawer — pos-ui

**Status:** 🔴 Not Started  
**Period:** June 2026  
**Goal:** Floor plan view, table assignment/release, shift open/close, cash drawer management

---

## Context

Waiters use the tables view to assign orders to tables and track table status. Managers open/close shifts and manage the cash drawer. The `hotel-pos-v8.jsx` design shows a grid-based floor plan with table status colors and a shift controls panel.

---

## Pages to Create

```
src/app/[orgSlug]/(pos)/
  tables/page.tsx             — Floor plan with table grid
  drawer/page.tsx             — Cash drawer open/close/events
  shifts/page.tsx             — Shift open/close + float entry
  sessions/page.tsx           — Session history list
```

---

## Components to Create

```
src/components/tables/
  FloorPlan.tsx               — Section tabs + table grid
  TableCard.tsx               — Individual table card (status color, order badge)
  TableAssignModal.tsx        — Link table to open order
  SectionTabs.tsx             — Filter by section (main_hall, bar, outdoor, vip)

src/components/drawer/
  DrawerStatus.tsx            — Current drawer state (open/closed, balance)
  DrawerOpenModal.tsx         — Float entry on open
  DrawerCloseModal.tsx        — Final count on close
  DrawerEventList.tsx         — Skim, drop, shortage events

src/components/shifts/
  ShiftCard.tsx               — Current shift summary (device, cashier, start time, float)
  ShiftOpenModal.tsx          — Device + float entry to open shift
  ShiftCloseModal.tsx         — Cash count + notes on close
  ShiftHistory.tsx            — Past sessions list
```

---

## API Hooks (TanStack Query)

```typescript
// src/hooks/pos/
useSections()                          → GET /{t}/pos/sections
useTables(sectionId?)                  → GET /{t}/pos/tables
useAssignTable(tableId)                → POST /{t}/pos/tables/{id}/assign
useReleaseTable(tableId)               → POST /{t}/pos/tables/{id}/release
useCurrentDrawer()                     → GET /{t}/pos/drawers/current
useOpenDrawer()                        → POST /{t}/pos/drawers/open
useCloseDrawer()                       → POST /{t}/pos/drawers/close
useCurrentSession()                    → GET /{t}/pos/devices/{deviceId}/sessions/current
useOpenSession()                       → POST /{t}/pos/devices/{deviceId}/sessions/open
useCloseSession()                      → POST /{t}/pos/devices/{deviceId}/sessions/close
useSessions()                          → GET /{t}/pos/devices/{deviceId}/sessions
```

---

## Table Status Colors

| Status | Color |
|--------|-------|
| available | Green (#22c55e) |
| occupied | Red (#ef4444) |
| reserved | Amber (#f59e0b) |
| cleaning | Blue (#3b82f6) |

---

## Shift Workflow

```
1. Staff arrives → POST /sessions/open {device_id, opening_float}
2. During shift: orders flow normally
3. End of shift → POST /sessions/close {closing_amount, notes}
   → pos-api calculates variance, publishes pos.drawer.closed event
   → treasury-api creates ledger entry
4. Manager reviews session summary (total sales, refunds, variance)
```

---

## Permission Gates

| Action | Required Permission |
|--------|-------------------|
| View floor plan | `pos.tables.view` |
| Assign/release table | `pos.tables.change` |
| View drawer | `pos.drawer.view` |
| Open/close drawer | `pos.drawer.manage` |
| Open/close shift | `pos.sessions.manage` |

---

## Tasks

- [ ] Create `src/app/[orgSlug]/(pos)/tables/page.tsx`
- [ ] Create `src/app/[orgSlug]/(pos)/drawer/page.tsx`
- [ ] Create `src/app/[orgSlug]/(pos)/shifts/page.tsx`
- [ ] Create `FloorPlan.tsx`, `TableCard.tsx`, `TableAssignModal.tsx`
- [ ] Create `DrawerStatus.tsx`, `DrawerOpenModal.tsx`, `DrawerCloseModal.tsx`
- [ ] Create `ShiftCard.tsx`, `ShiftOpenModal.tsx`, `ShiftCloseModal.tsx`
- [ ] Create TanStack Query hooks for tables, drawer, sessions
- [ ] Wire device ID from user session / localStorage
- [ ] Test: open shift → assign table → create order → close drawer
- [ ] Run `pnpm build` and fix all errors
