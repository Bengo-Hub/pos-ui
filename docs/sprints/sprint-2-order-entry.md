# Sprint 2: Order Entry — pos-ui

**Status:** 🔴 Not Started  
**Period:** May–June 2026  
**Goal:** Main POS terminal page — menu grid, cart panel, modifier selection, payment modal, order submission to pos-api

---

## Context

The primary POS terminal screen. Cashiers and waiters use this for order creation. The `hotel-pos-v8.jsx` design shows a split-view layout: category tabs + 4-column item grid on the left, cart panel on the right. Touch-optimized with 44px tap targets.

---

## Pages to Create

```
src/app/[orgSlug]/(pos)/
  page.tsx                    — Main POS terminal (menu grid + cart)
  orders/page.tsx             — Open orders list
  orders/[id]/page.tsx        — Order detail + payment
```

---

## Components to Create

```
src/components/pos/
  MenuGrid.tsx                — Category tabs + item grid (4-col, touch-optimized)
  CategoryTabs.tsx            — Horizontal scroll category filter
  CartPanel.tsx               — Line items, qty controls, notes, discount input
  CartLineItem.tsx            — Single cart line with qty +/- and remove
  PaymentModal.tsx            — Tender selection (cash/card/mpesa/room-charge/split)
  TenderButton.tsx            — Individual payment method button
  OrderStatusBadge.tsx        — Status chip (draft|open|completed|voided)
  ModifierSheet.tsx           — Bottom sheet for modifier group selection
  ModifierOption.tsx          — Single modifier option (checkbox/radio)
  DiscountInput.tsx           — Promo code + amount/percentage discount entry
  ReceiptPreview.tsx          — Post-payment receipt display
```

---

## API Hooks (TanStack Query)

```typescript
// src/hooks/pos/
useMenu(categoryId?: string)       → GET /{t}/pos/catalog/items
useCategories()                    → GET /{t}/pos/catalog/categories
useModifierGroups(itemId: string)  → GET /{t}/pos/catalog/items/{id}/modifiers
useCreateOrder()                   → POST /{t}/pos/orders
useAddOrderLine(orderId)           → POST /{t}/pos/orders/{id}/lines
useUpdateOrderLine(orderId, lineId)→ PATCH /{t}/pos/orders/{id}/lines/{lineId}
useRemoveOrderLine(orderId)        → DELETE /{t}/pos/orders/{id}/lines/{lineId}
useApplyDiscount(orderId)          → POST /{t}/pos/orders/{id}/discount
useRecordPayment(orderId)          → POST /{t}/pos/orders/{id}/payments
useOrderPayments(orderId)          → GET /{t}/pos/orders/{id}/payments
useOrders(status?)                 → GET /{t}/pos/orders
useOrder(orderId)                  → GET /{t}/pos/orders/{id}
```

---

## Payment Flow

```
1. Cashier taps "Charge" → PaymentModal opens
2. Select tender type:
   - Cash: enter amount received → auto-calc change → submit
   - Card/M-Pesa: POST payment → pos-api creates treasury intent
     → returns {status: "pending", intent_id, checkout_url|mpesa_request_id}
     → show STK push waiting screen / Paystack redirect
     → poll GET /{t}/pos/orders/{id}/payments every 3s for status change
   - Room Charge: select room + guest → add to room folio immediately
   - Split: multiple tenders until total covered
3. On completion: show receipt preview → option to print or close
```

---

## State Management

Use local React state (no Zustand needed for MVP):
```typescript
interface CartState {
  orderId: string | null       // null = draft not yet created
  lines: CartLine[]
  discountCode: string
  discountAmount: number
  tendersApplied: Tender[]
}
```

Order is created in pos-api on first `useCreateOrder()` call (when first item added to cart). Subsequent line mutations call pos-api directly.

---

## Permission Gates

| Action | Required Permission |
|--------|-------------------|
| View menu | `pos.catalog.view` |
| Create order | `pos.orders.create` |
| Apply discount | `pos.orders.discount` |
| Record payment | `pos.payments.create` |
| View orders list | `pos.orders.view` |

---

## Offline Behaviour (Carry-forward to Sprint 6)

For MVP: online-only. If pos-api unreachable show toast "Connection lost — please retry."  
Offline queue implementation deferred to Sprint 6 (IndexedDB + SyncManager).

---

## Tasks

- [ ] Create `src/app/[orgSlug]/(pos)/page.tsx` — main POS terminal
- [ ] Create `src/app/[orgSlug]/(pos)/orders/page.tsx`
- [ ] Create `src/app/[orgSlug]/(pos)/orders/[id]/page.tsx`
- [ ] Create `MenuGrid.tsx`, `CategoryTabs.tsx`, `CartPanel.tsx`, `CartLineItem.tsx`
- [ ] Create `PaymentModal.tsx`, `TenderButton.tsx`, `ModifierSheet.tsx`
- [ ] Create `src/hooks/pos/use-menu.ts`, `use-orders.ts`, `use-payments.ts`
- [ ] Wire all hooks to pos-api base URL from env
- [ ] Add permission gates per action
- [ ] Test: create order, add items, apply modifier, apply discount, record cash payment
- [ ] Run `pnpm build` and fix all errors
