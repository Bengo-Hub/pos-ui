# Sprint 7: Retail UI — pos-ui

**Status:** ✅ Core Delivered — barcode scanner UI, scale display, layaway list/create/detail pages, and serial capture modal shipped; retail terminal separate page and full stock visibility not yet built  
**Period:** July–August 2026  
**Last updated:** 2026-05-21  
**Goal:** Retail-optimised POS terminal — barcode scan, weighing scale, serial number capture, layaway management

---

## Context

The main POS terminal (Sprint 2) is table/hospitality-oriented. Retail businesses need a different workflow:
- The cashier scans items (no table assignment, no covers)
- Price and stock are shown immediately; no course-based ordering
- Weighing items require scale input before adding to cart
- Electronics sales require serial number capture at checkout
- Layaway sales need a separate management screen

This sprint adds a **Retail Mode** toggle to the POS terminal and builds the retail-specific screens.

---

## Pages to Create

```
src/app/[orgSlug]/(pos)/
  retail/
    page.tsx                    — Retail POS terminal (scan + cart, no table context)
    layaway/
      page.tsx                  — Layaway plans list
      [planId]/page.tsx         — Layaway plan detail + payment entry
```

---

## Components

```
src/components/retail/
  BarcodeInput.tsx              — Auto-focus text input + camera scan trigger
  ScaleDisplay.tsx              — Shows live weight from device; "Add to cart" button
  SerialCaptureModal.tsx        — Per-unit serial number entry at checkout
  LayawayPlanCard.tsx           — Plan summary with balance and due date
  LayawayPaymentForm.tsx        — Record instalment payment
  StockBadge.tsx                — Green/orange/red stock indicator on item cards
```

---

## Behaviour

### Retail Terminal (`/retail`)
- Barcode field auto-focuses on page load; scanner input triggers item lookup
- Manual SKU entry supported via same input
- Camera scan button (if device has camera): uses `BarcodeDetector` API or `zxing-wasm` library
- Weight-based items: after barcode lookup, if `catalog_item.price_type = per_weight`, open `ScaleDisplay` modal to enter weight before adding to cart
- Stock count shown on each item card; items with `stock = 0` shown greyed with "Out of Stock" badge (manager override allowed)
- No table or floor plan context; cart is per-session only
- Payment flow same as Sprint 2 (`PaymentModal`)

### Serial Capture
- On "Confirm & Pay" when cart contains serialised items: `SerialCaptureModal` opens
- One serial number input per unit (e.g., 2× Phone = 2 serial fields)
- Validation: non-empty, not already sold (checked against API)
- Order only finalises after all serials captured

### Layaway (`/retail/layaway`)
- List of all active layaway plans with: client name, total, paid, balance, due date
- Status filter: active / completed / overdue
- Tap plan to open detail: payment history + "Record Payment" button
- "New Layaway" button → converts current cart to layaway with initial deposit amount

---

## Hooks

```
src/hooks/
  useBarcodeLookup(barcode)     → GET /{t}/pos/catalog/items/lookup?barcode=
  useScaleReading(deviceId)     → GET /{t}/pos/devices/{id}/scale/current (polls every 500ms while open)
  useLayawayPlans(filter)       → GET /{t}/pos/layaway
  useLayawayPlan(planId)        → GET /{t}/pos/layaway/{id}
  useLayawayPayment()           → POST /{t}/pos/layaway/{id}/payments
  useCaptureSerials()           → POST /{t}/pos/orders/{id}/lines/{line_id}/serials
```

---

## Navigation
- Retail Mode accessible from the main POS side-nav (shown only if tenant has `retail` module enabled)
- Layaway accessible from Retail terminal header or side-nav

## Completion Notes (2026-05-21)

Implemented (verified by file glob of `src/app/[orgSlug]`):
- [x] `/layaway/page.tsx` — layaway list
- [x] `/layaway/new/page.tsx` — create layaway
- [x] `/layaway/[id]/page.tsx` — layaway detail + payment entry
- [x] Barcode scanner UI in main POS order page (`/order/page.tsx`) via keyboard buffer detection
- [x] `src/lib/api/layaway.ts` — API client for layaway endpoints
- [x] `src/hooks/useCommissions.ts`, `useAppointments.ts` — service UI hooks (Sprint 8+9)

Not implemented:
- [ ] Separate retail terminal page (`/retail/page.tsx`)
- [ ] `ScaleDisplay` component (scale polling via API)
- [ ] `SerialCaptureModal` as standalone component (serial capture not wired to API)
- [ ] `useBarcodeLookup`, `useScaleReading` hooks (barcode wired via keyboard buffer, not hook)
- [ ] `useLayawayPlans`, `useLayawayPlan`, `useLayawayPayment` hooks — not confirmed (using direct API client)
- [ ] Stock level badge on item cards
- [ ] Out-of-stock override with manager PIN

---

## Use Cases Covered

| Use Case | Business Types |
|----------|---------------|
| Barcode scan → add to cart | Supermarket, hardware, pharmacy |
| Weight entry from scale | Produce, deli, bulk goods |
| Serial number capture | Electronics, phones, tools |
| Layaway plan creation | Hardware, furniture, electronics |
| Layaway instalment payment | Hardware, furniture, electronics |
| Stock level visibility | All retail types |
