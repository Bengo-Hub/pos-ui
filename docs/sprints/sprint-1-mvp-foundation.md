# Sprint 1 -- MVP Foundation

**Timeline**: March 3 - March 17, 2026
**Goal**: Scaffold pos-ui and deliver a functional touch-optimized POS terminal for order entry, cash payments, and cash drawer management. Ship as part of BengoBox MVP.

**Progress (March 6, 2026):** Full Next.js 16 app scaffold complete. SSO/PKCE, [orgSlug] routes, dashboard, order entry (touch-optimized 44px targets), orders list, tables, cash drawer, settings, platform admin. Production domain pos.codevertexitsolutions.com; values.yaml already existed. **Remaining:** Wire to posapi; deploy.

---

## Prerequisites

- pos-api Sprint 1 deliverables (catalog, orders, payments, drawers) must be in progress or complete
- Auth-service SSO operational
- Tenant `urban-loft` and Busia outlet configured in pos-api

---

## Deliverables

### D1: Project scaffold and auth (Days 1-2)

- [ ] Initialize Next.js 15 project (App Router, TypeScript)
- [ ] Install and configure: Tailwind CSS, Shadcn UI, Zustand, TanStack Query, Axios, Dexie.js, React Hook Form, Zod
- [ ] PWA configuration (@ducanh2912/next-pwa)
- [ ] Environment config (`NEXT_PUBLIC_POS_API_URL`, `NEXT_PUBLIC_TENANT_SLUG`, `NEXT_PUBLIC_OUTLET_ID`, SSO vars)
- [ ] Axios client with auth interceptor, tenant/outlet headers, retry logic
- [ ] OIDC login flow (redirect to auth-ui, callback, token exchange)
- [ ] Token refresh interceptor (refresh 5 min before expiry)
- [ ] Auth middleware (redirect unauthenticated users)
- [ ] Zustand auth store (persisted to localStorage `pos-ui-auth`)
- [ ] POS shell layout (header bar with outlet name, user, clock)

### D2: Menu grid and catalog (Days 2-4)

- [ ] `useMenuItems()` hook (TanStack Query, fetches from pos-api catalog endpoint)
- [ ] `useCategories()` hook
- [ ] Category tabs (horizontal scroll, "All" default)
- [ ] Item grid (3-column on landscape tablet, 2-column portrait)
- [ ] MenuItemCard component (image, name, price, availability indicator)
- [ ] Search bar with debounced filtering
- [ ] Loading skeleton (12 placeholder cards)
- [ ] Empty state ("No items found")
- [ ] IndexedDB cache: store catalog on successful fetch, serve from cache if offline

### D3: Cart and order creation (Days 4-6)

- [ ] Zustand cart store: items, quantities, modifiers, notes, order type
- [ ] Cart panel component (right side on landscape, bottom drawer on portrait)
- [ ] Order type selector (Dine-in, Takeaway)
- [ ] Tap item to add to cart (increment if already in cart)
- [ ] ModifierSheet (bottom sheet): modifier groups, required validation, quantity, special instructions
- [ ] CartLineItem component: name, modifiers, quantity (+/-), line total, swipe to remove
- [ ] Totals calculation (subtotal, tax at 16%, service charge for dine-in, total)
- [ ] "Pay" button (disabled if cart empty)
- [ ] "Clear" button with confirmation dialog
- [ ] "Hold" button (save order as draft -- open status)
- [ ] Order creation: POST to pos-api, clear cart on success, show order number toast

### D4: Payment processing (Days 6-8)

- [ ] Payment modal (fullscreen overlay)
- [ ] Cash payment flow:
  - Quick amount buttons (exact, round up)
  - Custom numpad for manual entry
  - Change due calculation and display
  - "Complete" button finalizes order
- [ ] Split payment flow (cash + cash for MVP):
  - First amount input
  - Remaining balance shown
  - Second amount input
  - Complete when balance = 0
- [ ] Payment confirmation screen (order number, total, payment method, change)
- [ ] Post-payment: order status updated to `completed`, cart cleared
- [ ] Card/mobile money placeholder buttons (show "Coming soon" or "Not available" for MVP)

### D5: Cash drawer management (Days 8-9)

- [ ] Drawer page (`/drawer`)
- [ ] Open drawer: float amount input (numpad), confirm, calls pos-api
- [ ] Active drawer status display (current balance, event count)
- [ ] Drawer events log (scrollable list)
- [ ] Close drawer: counted amount input, variance calculation, confirm
- [ ] Variance warning (red highlight if |variance| > KES 500)
- [ ] Block order creation if no drawer is open (prompt to open drawer)
- [ ] Zustand drawer store (current drawer ID, status)

### D6: Order management (Days 9-10)

- [ ] Orders page (`/orders`)
- [ ] Tabs: Open Orders, Completed Today
- [ ] Order list with status badge, order number, type, total, time
- [ ] Tap to view order detail (lines, payments, status timeline)
- [ ] Table selector for dine-in orders (dropdown from pos-api tables endpoint)

### D7: Polish and deploy (Days 10-12)

- [ ] Responsive layout testing (10" tablet landscape + portrait)
- [ ] Touch interaction testing (tap targets, swipe gestures)
- [ ] Error boundaries and error toast messages
- [ ] Loading states on all data fetches
- [ ] 404 and error pages
- [ ] Dockerfile and build.sh
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Production environment config
- [ ] Deploy to production URL
- [ ] End-to-end smoke test (login -> browse menu -> add to cart -> pay cash -> close drawer)

---

## API dependencies (pos-api)

| Endpoint | Required by | Priority |
|----------|-------------|----------|
| `GET /{t}/pos/catalog/items` | D2 | P0 |
| `GET /{t}/pos/catalog/categories` | D2 | P0 |
| `POST /{t}/pos/orders` | D3 | P0 |
| `GET /{t}/pos/orders` | D6 | P0 |
| `GET /{t}/pos/orders/{id}` | D6 | P0 |
| `PUT /{t}/pos/orders/{id}/status` | D3 | P0 |
| `POST /{t}/pos/orders/{id}/payments` | D4 | P0 |
| `POST /{t}/pos/drawers/open` | D5 | P0 |
| `POST /{t}/pos/drawers/close` | D5 | P0 |
| `GET /{t}/pos/drawers/current` | D5 | P0 |
| `GET /{t}/pos/tables` | D6 | P1 |

---

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| pos-api catalog endpoint not ready | No menu to display | Hard-code seed catalog data as fallback |
| pos-api order endpoint not ready | Cannot create orders | Mock API responses for development |
| Treasury integration not ready | No card/mobile payments | Cash-only for MVP (explicit "Coming soon" on other tenders) |
| Tablet touch testing insufficient | Poor UX on real hardware | Test on Chrome DevTools device emulation + one physical tablet |
| Offline mode complexity | Risk of data loss | Defer full offline to post-MVP; show "offline" banner, block order creation |

---

## Definition of done

- [ ] Login flow functional (SSO -> pos-ui -> authenticated)
- [ ] Menu grid displays catalog items from pos-api
- [ ] Cart: add, remove, modify items with correct totals
- [ ] Cash payment: amount entry, change calculation, order completion
- [ ] Cash drawer: open with float, close with counted amount, variance shown
- [ ] Order list: view open and completed orders
- [ ] Tablet layout verified (landscape and portrait)
- [ ] Deployed to production URL
- [ ] No console errors in production build
