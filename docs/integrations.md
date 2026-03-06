# pos-ui -- Integrations

**Canonical tenant**: `urban-loft` | **Active outlet**: Busia

---

## Backend API (pos-api)

**Base URL**: `NEXT_PUBLIC_POS_API_URL` (default: `https://posapi.codevertexitsolutions.com/api/v1`)

### Request conventions

All requests include:

```
Authorization: Bearer {accessToken}
X-Tenant-Slug: urban-loft
X-Tenant-ID: {tenantId}
X-Outlet-ID: {outletId}
Content-Type: application/json
```

Tenant slug from `NEXT_PUBLIC_TENANT_SLUG`. Outlet ID from `NEXT_PUBLIC_OUTLET_ID`. Access token from Zustand auth store.

### Endpoint mapping

| UI feature | Method | Endpoint | Notes |
|-----------|--------|----------|-------|
| Menu grid | GET | `/{t}/pos/catalog/items` | Category filter, search, pagination |
| Categories | GET | `/{t}/pos/catalog/categories` | For tab list |
| Create order | POST | `/{t}/pos/orders` | Lines + modifiers in body |
| Order list | GET | `/{t}/pos/orders` | Filter by status, date, outlet |
| Order detail | GET | `/{t}/pos/orders/{id}` | Lines, modifiers, payments |
| Update status | PUT | `/{t}/pos/orders/{id}/status` | Status transition |
| Add line | POST | `/{t}/pos/orders/{id}/lines` | Single line item |
| Update line | PUT | `/{t}/pos/orders/{id}/lines/{lineId}` | Quantity, modifiers |
| Remove line | DELETE | `/{t}/pos/orders/{id}/lines/{lineId}` | |
| Record payment | POST | `/{t}/pos/orders/{id}/payments` | Tender type + amount |
| List payments | GET | `/{t}/pos/orders/{id}/payments` | |
| Open drawer | POST | `/{t}/pos/drawers/open` | Float amount |
| Close drawer | POST | `/{t}/pos/drawers/close` | Counted amount |
| Current drawer | GET | `/{t}/pos/drawers/current` | Active drawer for outlet |
| Table list | GET | `/{t}/pos/tables` | Floor plan data |
| Assign table | POST | `/{t}/pos/tables/{id}/assign` | Order ID in body |
| Release table | POST | `/{t}/pos/tables/{id}/release` | |
| My roles | GET | `/{t}/users/me/roles` | For action gating |
| Roles | GET | `/{t}/roles` | Available roles |

### Pagination

All list endpoints accept `page` and `per_page`. Catalog default: 50 items. Orders default: 20.

---

## Auth service (SSO)

**SSO URL**: `NEXT_PUBLIC_SSO_URL` (default: `https://sso.codevertexitsolutions.com`)
**Auth UI URL**: `NEXT_PUBLIC_AUTH_UI_URL` (default: `https://accounts.codevertexitsolutions.com`)
**Client ID**: `NEXT_PUBLIC_SSO_CLIENT_ID` (default: `pos-ui`)

### Flow

1. Check Zustand auth store for valid token
2. If absent/expired, redirect to auth-ui with PKCE params
3. Auth-ui handles login against auth-service
4. Callback receives code, exchanges for tokens
5. Tokens stored in Zustand (persisted to localStorage key `pos-ui-auth`)
6. Axios interceptor attaches Bearer token + tenant/outlet headers
7. On 401: attempt refresh; on failure, redirect to login
8. Session duration: 8 hours (aligned with shift length)

### Token claims used

| Claim | Usage |
|-------|-------|
| `sub` | User ID (for drawer, shift ownership) |
| `tenant_id` | API path parameter |
| `roles` | Action gating (void requires supervisor) |
| `name` | Display in header |

### Supervisor override

Certain actions (void order, refund, drawer close) require elevated permissions. If current user lacks the role:

1. Show "Supervisor Authorization Required" dialog
2. Supervisor enters credentials (separate auth call)
3. Action proceeds with supervisor's token for that single request
4. Audit log captures both cashier and supervisor IDs

---

## Treasury service (payments)

**Not directly called by pos-ui**. Payment flow:

1. pos-ui sends payment to pos-api (`POST /orders/{id}/payments`)
2. pos-api handles cash locally; for card/mobile, calls treasury-api
3. Treasury processes payment, publishes `treasury.payment.success`
4. pos-api subscriber updates payment status
5. pos-ui polls or receives status via TanStack Query refetch

### Payment types for MVP

| Type | Flow | MVP status |
|------|------|-----------|
| Cash | Immediate (pos-api calculates change) | Must-have |
| Card | pos-api -> treasury-api -> payment gateway | Stretch |
| Mobile Money (M-Pesa) | pos-api -> treasury-api -> STK push | Stretch |
| Split | Multiple tenders, same order | Must-have (cash + cash) |

---

## Offline storage (Dexie.js)

### IndexedDB tables

| Table | Purpose | Sync strategy |
|-------|---------|--------------|
| `catalog_items` | Cached menu for offline use | Full refresh on reconnect |
| `offline_orders` | Orders created while offline | Push to pos-api on reconnect |
| `pending_payments` | Cash payments recorded offline | Push with order sync |

### Sync manager

```typescript
// On reconnect
const pendingOrders = await db.offline_orders.toArray();
for (const order of pendingOrders) {
  const response = await api.post(`/${tenant}/pos/orders`, order);
  if (response.ok) {
    await db.offline_orders.delete(order.id);
  }
}
```

Conflict resolution: server-assigned order numbers replace client-side temporary IDs.

---

## Cross-service redirects

| Trigger | Target | URL pattern |
|---------|--------|-------------|
| "View in staff portal" | cafe-website | `https://theurbanloftcafe.com/staff/orders` |
| Delivery order tracking | logistics tracking | `https://logisticsapi.codevertexitsolutions.com/tracking/{taskId}` |

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_POS_API_URL` | `https://posapi.codevertexitsolutions.com/api/v1` | Backend API |
| `NEXT_PUBLIC_SSO_URL` | `https://sso.codevertexitsolutions.com` | Auth service |
| `NEXT_PUBLIC_AUTH_UI_URL` | `https://accounts.codevertexitsolutions.com` | Auth UI |
| `NEXT_PUBLIC_SSO_CLIENT_ID` | `pos-ui` | OIDC client ID |
| `NEXT_PUBLIC_TENANT_SLUG` | `urban-loft` | Canonical tenant |
| `NEXT_PUBLIC_TENANT_ID` | (from auth) | Tenant UUID |
| `NEXT_PUBLIC_OUTLET_ID` | (config) | Active outlet UUID (Busia) |
