# Sprint 6: Offline Mode & PWA — pos-ui

**Status:** ✅ Complete — core offline layer, IndexedDB, sync worker, offline banner, and PIN offline path all shipped; receipt print CSS deferred  
**Period:** July–August 2026  
**Last updated:** 2026-05-21  
**Audit note (2026-05-09):** Offline payment strategy clarified — cash-only when offline; M-Pesa/card/room-charge require connectivity. eTIMS offline queue is treasury-api's responsibility (VSCU mode).  
**Goal:** IndexedDB offline order queue, SyncManager background sync, PWA install prompt, receipt printing

---

## Context

POS terminals may lose connectivity (power cuts, network issues). Orders created offline must be queued and auto-synced when connectivity restores. pos-ui is already configured as a PWA (`next-pwa`). This sprint wires the offline data layer.

---

## Offline Payment Strategy

**Cash-only when offline.** This is a hard constraint, not a configurable option.

| Tender | Offline behaviour |
|--------|------------------|
| Cash | ✅ Allowed — record locally, sync with order on reconnect |
| M-Pesa (STK Push) | ❌ Blocked — requires live NATS callback from treasury-api via Daraja; no connectivity = no confirmation |
| Card (Paystack) | ❌ Blocked — requires redirect to Paystack checkout URL; cannot complete offline |
| Room Charge | ❌ Blocked — must write to `room_folio_items` in pos-api; requires connectivity |
| Loyalty Points | ❌ Blocked — balance validation requires pos-api; queue risk of over-redemption |

**UI requirements:**
- When `navigator.onLine === false`:
  - Show yellow `OfflineBanner` at top: "Offline mode — cash payments only"
  - In the payment modal, disable all tender buttons except Cash
  - Add tooltip on disabled tenders: "Requires internet connection"
  - Do not attempt treasury-api S2S calls (they will fail and leave `pos_payments` in `pending` state with no callback path)

**Why M-Pesa cannot be queued:**
treasury-api triggers the STK Push and receives the Daraja callback. pos-api only knows the result via `treasury.payment.success` NATS event. There is no offline-safe way to confirm M-Pesa payment without this callback — queuing an M-Pesa payment offline would create an order with an unconfirmed payment that can never be reconciled without manual intervention.

**eTIMS offline queue:**
eTIMS submission is owned by treasury-api (not pos-api). When pos-api is offline, `pos.sale.finalized` events accumulate in the `outbox_events` table and are published once connectivity restores. treasury-api's VSCU offline queue handles the KRA submission backlog. pos-api's `etims_invoice_number` and `etims_qr_code_url` fields on `pos_orders` are populated after reconnect. Receipts printed offline will not have the QR code — this is acceptable for cash sales; the fields will be populated for reprint once synced.

---

## Technology Stack

- **IndexedDB**: via `Dexie.js` (already in package.json? — audit first)
- **SyncManager API**: Background Sync for auto-submit on reconnect
- **Service Worker**: `next-pwa` wraps Next.js with Workbox
- **Receipt printing**: `window.print()` with receipt CSS media query (no SDK needed)

---

## IndexedDB Schema (Dexie)

```typescript
// src/lib/db/pos-db.ts
import Dexie, { Table } from 'dexie'

interface OfflineOrder {
  localId: string         // uuid generated locally
  tenantSlug: string
  deviceId: string
  userId: string
  lines: CartLine[]
  discounts: Discount[]
  createdAt: string
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed'
  posApiOrderId?: string  // filled after successful sync
  errorMessage?: string
}

class POSDatabase extends Dexie {
  offlineOrders!: Table<OfflineOrder>
  constructor() {
    super('pos-db')
    this.version(1).stores({
      offlineOrders: '++localId, syncStatus, tenantSlug, createdAt'
    })
  }
}

export const db = new POSDatabase()
```

---

## Offline Order Flow

```
1. Cart has items → user taps "Charge"
2. Check navigator.onLine:
   - Online: POST /{t}/pos/orders directly
   - Offline: save to IndexedDB with syncStatus: "pending"
             → show toast "Saved offline — will sync when reconnected"
3. When back online:
   - ServiceWorker SyncManager fires "sync-pos-orders" event
   - For each pending order: POST /{t}/pos/orders
   - On success: update syncStatus: "synced", store posApiOrderId
   - On failure: update syncStatus: "failed", store errorMessage
4. Orders page shows offline orders with sync status badge
```

---

## Service Worker Registration

```typescript
// src/lib/sw/register-sync.ts
export async function registerSyncForOrders() {
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return
  const reg = await navigator.serviceWorker.ready
  await reg.sync.register('sync-pos-orders')
}
```

---

## Components to Create

```
src/components/offline/
  OfflineBanner.tsx           — Top banner when navigator.onLine = false
  SyncStatusBadge.tsx         — Badge on order card: pending|syncing|synced|failed
  OfflineOrderList.tsx        — List of pending offline orders in orders page
  SyncQueuePanel.tsx          — Panel showing all queued orders + retry button
```

---

## Receipt Printing

```typescript
// src/components/pos/ReceiptPreview.tsx
// Add print button that triggers:
function printReceipt() {
  window.print()  // print-specific CSS hides everything except receipt
}
```

```css
/* globals.css — receipt print styles */
@media print {
  body > * { display: none; }
  #receipt-content { display: block !important; }
}
```

Receipt must include:
- Tenant name, outlet name, address
- Order number, date/time
- Line items with prices and tax
- Total, payment method, change given
- Cashier name
- eTIMS invoice number + QR code (if available from pos-api)

---

## PWA Install Prompt

```typescript
// src/components/pwa/InstallPrompt.tsx
// Listen for beforeinstallprompt, show custom install banner
// Dismiss stores preference in localStorage
```

---

## Connectivity Detection

```typescript
// src/hooks/use-online.ts
export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  return online
}
```

---

## Tasks

- [x] Audit: Dexie.js added to package.json (`pnpm add dexie`)
- [x] Create `src/lib/db/pos-db.ts` — Dexie v4, version 2, 6 tables: catalogItems, offlineOrders, offlinePayments, drawerSessions, drawerCloses, staffProfiles
- [x] Create `src/hooks/use-online.ts` connectivity hook (navigator.onLine + event listeners)
- [x] Offline-aware hooks: `use-offline-pos.ts` — all POS mutations save to IndexedDB when offline
- [x] Full sync worker: `use-sync-offline-orders.ts` — drains drawer sessions → orders (bundled payment) → standalone payments → drawer closes on reconnect (1.5 s delay)
- [x] `OfflineBanner.tsx` — fixed red banner when `!useOnline()`
- [x] Background Sync: `register-sync.ts` registers `sync-pos-data` SyncManager tag
- [x] `InstallPrompt.tsx` — `beforeinstallprompt` handler; requests push/storage/camera permissions post-install
- [x] Payment modal: offline cash path queues to IndexedDB; M-Pesa/card disabled with tooltip
- [x] `pnpm build` passing with zero errors
- [ ] Receipt print CSS + `ReceiptPreview.tsx` print button (deferred — Sprint 5 ERP gaps)
