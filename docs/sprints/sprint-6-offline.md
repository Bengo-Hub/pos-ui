# Sprint 6: Offline Mode & PWA — pos-ui

**Status:** 🔴 Not Started  
**Period:** July–August 2026  
**Goal:** IndexedDB offline order queue, SyncManager background sync, PWA install prompt, receipt printing

---

## Context

POS terminals may lose connectivity (power cuts, network issues). Orders created offline must be queued and auto-synced when connectivity restores. pos-ui is already configured as a PWA (`next-pwa`). This sprint wires the offline data layer.

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

- [ ] Audit: check if Dexie.js is in package.json — if not, `pnpm add dexie`
- [ ] Create `src/lib/db/pos-db.ts` with IndexedDB schema
- [ ] Create `src/hooks/use-online.ts` connectivity hook
- [ ] Update order creation flow to detect offline + save to IndexedDB
- [ ] Create SyncManager service worker sync handler
- [ ] Create `OfflineBanner.tsx`, `SyncStatusBadge.tsx`, `OfflineOrderList.tsx`
- [ ] Add receipt print CSS to `globals.css`
- [ ] Update `ReceiptPreview.tsx` with print button
- [ ] Create `InstallPrompt.tsx` with `beforeinstallprompt` handler
- [ ] Test: create order offline → verify in IndexedDB → reconnect → verify synced to pos-api
- [ ] Run `pnpm build` and fix all errors
