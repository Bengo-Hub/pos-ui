# Sprint 10: POS Dual Authentication — pos-ui

**Status:** 🔴 Not Started  
**Period:** January–February 2027  
**Last updated:** 2026-05-09  
**Goal:** Implement touchscreen PIN login for terminal-mode staff alongside the existing SSO login, enabling kitchen staff, waiters, cashiers, and bar staff to quickly authenticate and switch users on a dedicated POS terminal

---

## Context

The hotel-pos-v8.jsx design shows a PIN touchscreen as the primary login method on POS terminals. Kitchen staff, waiters, and cashiers work on shared terminals where redirecting to an SSO browser flow for every shift change is impractical. A 4–6 digit PIN assigned by a manager gives fast, secure access scoped to a single outlet/device.

SSO login (the existing flow) remains available for managers and admins who need full system access from any device.

---

## Pages to Create / Modify

```
src/app/[orgSlug]/
  login/
    page.tsx                    — MODIFIED: add "Use PIN" toggle alongside SSO
    pin/page.tsx                — NEW: PIN touchscreen login (keypad UI)
    pin/set/page.tsx            — NEW: Manager PIN management (set/reset staff PINs)
```

---

## Components

```
src/components/auth/
  PINKeypad.tsx                 — 12-button numeric keypad (0-9, backspace, submit)
  PINDots.tsx                   — Visual indicator: shows filled/empty dots for entered digits
  StaffSelector.tsx             — Grid of staff cards (name, role, avatar) to select before PIN entry
  QuickSwitchBar.tsx            — Floating bar at top of terminal: current user + "Switch User" button
  PINSetForm.tsx                — Manager form: select staff, enter new PIN (twice to confirm)
```

---

## Behaviour

### Terminal Login Page (`/login/pin`)

- Displays a grid of active staff members for the outlet (fetched from `GET /{tenant}/pos/staff`)
- Staff cards show: name, role badge (Waiter, Cashier, Kitchen, Bar, Receptionist), avatar/initials
- Tap staff card → PIN entry screen (PINDots + PINKeypad)
- PIN is 4–6 digits; submit on 4th digit if < 6 entered, or on submit tap
- On success: receive terminal token, redirect to POS home for that user's role
- On failure: shake animation + "Incorrect PIN" message; lock after 5 consecutive failures (30-second lockout)
- "Manager Login" link at bottom → existing SSO flow for admin/manager accounts

### Quick User Switch (`QuickSwitchBar`)

- Appears in the top bar of all POS terminal pages
- Shows current user's name and role
- "Switch" button → returns to staff selector (PIN screen) without full logout
- Previous user's session is closed on the device; new user's terminal token is issued

### PIN Management (`/login/pin/set`) — Manager Only

- Requires `pos.staff.manage` permission (enforced both on this page and the API endpoint)
- Staff list with "Set PIN" / "Reset PIN" buttons
- Enter new PIN twice to confirm
- PIN stored as bcrypt hash in pos-api `pos_staff_pins` table (never transmitted plain)

---

## API Endpoints (to be implemented in pos-api)

```
POST /{tenant}/pos/auth/pin          — validate PIN, return terminal token
  Body: { user_id, pin, device_id }
  Returns: { terminal_token, expires_at, user: { id, name, role, permissions } }

POST /{tenant}/pos/auth/pin/set      — set or reset a staff PIN (manager only)
  Body: { user_id, new_pin }
  Requires: pos.staff.manage permission

GET  /{tenant}/pos/staff             — list active staff for PIN selector grid
  Returns: [ { id, name, role, avatar_url, has_pin } ]
```

**Terminal token:** Short-lived JWT (4-hour expiry) signed by pos-api internal secret. Scoped to `tenant_id`, `outlet_id`, `device_id`. Carries the same permissions as the user's RBAC role within pos-api.

---

## Hooks

```
src/hooks/
  usePOSStaff()                     → GET /{t}/pos/staff
  usePINLogin()                     → POST /{t}/pos/auth/pin
  useSetPIN()                       → POST /{t}/pos/auth/pin/set
```

---

## Auth Store Changes

`src/store/auth.ts` (Zustand):

- Add `loginMode: "sso" | "pin"` to auth state
- Add `terminalToken`, `terminalUser` fields for PIN-based sessions
- `loginWithPIN(userId, pin, deviceId)` action — calls `usePINLogin`, stores terminal token, sets `loginMode = pin`
- `quickSwitch()` action — clears `terminalToken` + `terminalUser`, navigates to PIN selector
- `terminalLogout()` action — full logout for terminal sessions (clears both SSO + terminal state)
- Terminal token stored in `sessionStorage` (not `localStorage`) — clears on browser/tab close
- SSO token unaffected by PIN operations — managers can be SSO-logged-in on the same device

---

## Login Page Routing Logic

```
/[orgSlug]/login
  → if tenant has pos.terminal_mode enabled → show "Enter PIN" as primary CTA, "Manager SSO Login" secondary
  → if tenant does not have terminal_mode  → show SSO login (current behaviour)
```

`pos.terminal_mode` is a tenant feature flag stored in the tenant config returned by auth-api.

---

## Security Considerations

- PIN is **never** stored in client state — only used for the single API request
- Terminal token does **not** refresh automatically (4-hour hard expiry)
- Failed PIN attempts are counted server-side per `(user_id, device_id)` — rate limiting prevents brute force
- PINs must be changed every 90 days (policy enforced by `has_pin_expired` flag in staff list response)
- PIN reset requires a manager (SSO session with `pos.staff.manage`) — staff cannot self-serve PIN reset

---

## Navigation Changes

- When `loginMode = pin`, the top bar shows `QuickSwitchBar` instead of the full user menu
- Manager menu (Settings, RBAC, Reports) remains hidden from PIN-only sessions unless the user's role includes `pos.settings.view`

---

## Use Cases Covered

| Use Case | Business Types |
|----------|---------------|
| Kitchen staff login without SSO browser redirect | Restaurant, bar, hotel kitchen |
| Waiter quick login at table-side terminal | Restaurant, hotel dining |
| Cashier shift start on shared terminal | All retail + hospitality |
| Manager overrides SSO login for admin tasks | All business types |
| Quick user switch mid-shift | Restaurant, hotel, salon |
| PIN reset by manager | All business types |
