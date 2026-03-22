# POS UI - Implementation Plan

## Executive Summary

**System Purpose**: A high-performance, offline-capable Point of Sale (POS) frontend for BengoBox outlets. It provides a fast and intuitive interface for staff to process dine-in, takeaway, and retail orders.

**Key Capabilities**:
- **Fast Checkout**: Optimized for touchscreens and quick transaction processing.
- **Offline Mode**: Continue processing orders even when the internet is down (via local sync).
- **Table Management**: Visual floor plans for dine-in service.
- **Kitchen Display System (KDS) Integration**: Send orders directly to kitchen screens.
- **Hardware Integration**: Support for receipt printers, barcode scanners, and card terminals.

---

## Technology Stack

### Frontend Framework
- **Framework**: Next.js 15 (App Router) with React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS + Shadcn UI
- **State Management**: Zustand (Global State) + TanStack Query (Server State)
- **API Client**: Axios with interceptors for auth handling.
- **PWA**: `@ducanh2912/next-pwa` for service worker and manifest management.
- **Authentication**: SSO via `auth-ui` (OIDC/OAuth2)
- **Local Database**: Dexie.js / IndexedDB for offline order storage.

---

## Service Boundaries

### ✅ POS Operations (Owned by POS UI)
- Order entry and payment processing.
- Table and floor management.
- Shift management and cash drawer tracking.
- Local hardware integration.

### ❌ Online Ordering → **ordering-service**
- **Redirects To**: `https://ordersapp.codevertexitsolutions.com`
- **Why**: Online customer orders are managed by the ordering service.

---

## Roadmap

### Sprint 1: Foundation & Offline Core
- [x] Project scaffolding with Next.js 15/16 (App Router).
- [x] SSO integration with auth-api (PKCE, token exchange).
- [x] useMe (TanStack Query, 5 min TTL), hasRole/hasPermission, 403/404 pages, permission-based nav (platform section).
- [ ] IndexedDB setup for offline order persistence.
- [ ] Wire orders/tables/drawer/catalog to pos-api via TanStack Query when endpoints exist (see sprint-1-mvp-foundation.md "In place vs gaps").

### Sprint 2: Order Entry & Menu
- [ ] Touch-optimized menu grid.
- [ ] Cart management with modifiers.
- [ ] Payment processing interface.

### Sprint 3: Table & Shift Management
- [ ] Visual floor plan editor and viewer.
- [ ] Shift open/close workflows.
- [ ] Cash drawer reconciliation.

---

## DevOps

- **pos-ui** Helm/ArgoCD config: `devops-k8s/apps/pos-ui/` (`values.yaml`, `app.yaml`). Not modified by pos-service doc updates.
