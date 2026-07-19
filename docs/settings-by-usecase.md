# POS Settings — categorization by section & use case

The POS Settings page (`src/app/[orgSlug]/settings/page.tsx`) groups its tabs into labeled
sections. Tabs are filtered by permission (`requirePermission`) and, where noted, by whether the
outlet's module is enabled (`requireModule`) — a use-case-specific tab simply doesn't appear on an
outlet that lacks the module. Nothing here is a hard per-use-case fork; it's permission + module
gating over one shared page.

## Shared across every use case

### General & Localization
| Tab | Purpose | Gate |
|-----|---------|------|
| Outlet Config | Currency, returns policy | `pos.config.*` |
| Display | Idle-screen screensavers | `pos.config.*` |
| Tax | Treasury tax codes + legacy fallback | `pos.config.*` |

### Sales & Payments
| Tab | Purpose | Gate |
|-----|---------|------|
| **Cashier & Terminal** | **Sales visibility (own/outlet), auto-logout after sale, hospitality-cashier menu surface — per outlet, with per-use-case defaults** | `pos.config.*` |
| Receipt & Printing | Receipt format + printer profiles | `pos.config.*` |
| Payment Display | Paybill / till / bank details on receipts | `pos.config.*` |
| Card Terminal | PDQ / card-terminal mode, approval ref | `pos.config.*` |

### Team & Security
| Tab | Purpose | Gate |
|-----|---------|------|
| Team | Staff, base roles, **extra (additive) roles** — incl. making a waiter a "super waiter" (floor_supervisor) | `pos.users.*` |
| Loss Prevention | Audit trail + per-cashier exceptions | `pos.config.manage` / `pos.reports.*` |
| Backups | Daily automatic backups + retention | `pos.config.*` |

### Platform (owner / account)
| Tab | Purpose | Gate |
|-----|---------|------|
| Subscription | Plan, limits, features (view only) | `pos.config.*` |
| Devices | POS terminals linked to the outlet (view only) | `pos.config.*` |
| Platform | Admin / tenant management | platform-owner only |

## Use-Case Modules (surfaced only for a matching outlet)

| Tab | Surfaces for | `requireModule` |
|-----|--------------|-----------------|
| Modules | all (this is where the outlet's use_case is chosen) | — |
| Shifts | all (float rules / shift visibility) | — |
| KDS Stations | hospitality, quick_service | `kds` |
| Tables | hospitality | `tables` |
| Loyalty | retail, services | `loyalty` |
| Delivery Channels | outlets with online ordering | `online_orders` |
| Booking Policy | hospitality (hotel) | `hotel` |

## Per-use-case defaults for the Cashier & Terminal policy

Resolved server-side in `pos-api internal/modules/outletpolicy` (outlet override → use-case default):

| Policy | hospitality | quick_service | retail | pharmacy | services |
|--------|:-:|:-:|:-:|:-:|:-:|
| `cashier_sales_visibility` | own | outlet | outlet | outlet | outlet |
| `auto_logout_after_sale` | on | on | off | off | off |
| `cashier_terminal_surface` | full_till | full_till | full_till | full_till | full_till |

Any outlet can override any of these from the **Cashier & Terminal** tab; "Use default" clears the
override and re-inherits the value above.
