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

### Services: type of service business

A `services` outlet picks its service profile on the Modules tab (printing and branding, salon and
barber, nail parlour, spa, garage, car wash, laundry, tailoring, phone repair, general). The
profile sets the till workflow and shows only the catalog services of that trade. A job profile
(printing, garage, laundry, tailoring) adds the Production Board (`/production`, module
`production`, on the `enable_kds` toggle), the job sheet on the terminal, the job-created deposit
dialog, the jobs dashboard and the job panel on Orders; its default deposit percent is set on the
same card. The Phone & Electronics Repair profile shows the Repair module. See pos-api
`docs/service-profiles.md` for the full workflow.

## Per-use-case defaults for the Cashier & Terminal policy

Resolved server-side in `pos-api internal/modules/outletpolicy` (outlet override → use-case default):

| Policy | hospitality | quick_service | retail | services |
|--------|:-:|:-:|:-:|:-:|
| `cashier_sales_visibility` | own | outlet | outlet | outlet |
| `auto_logout_after_sale` | on | on | off | off |
| `cashier_terminal_surface` | full_till | full_till | full_till | full_till |

Any outlet can override any of these from the **Cashier & Terminal** tab; "Use default" clears the
override and re-inherits the value above.

## Hiding profit and margin from cashiers (2026-10-20)

Same family as the Drafts Delete and Resume toggles: a plain boolean in the outlet settings
metadata, `hide_profit_margin_for_cashier`, set from **Cashier policy > Profit and margin**. Absent
means shown, so every tenant keeps its columns until it opts in; boi-enterprises has it on for its
outlets. "Cashier" means any user without `pos.orders.manage`, so custom non-manager roles are
covered and managers, admins, superusers and platform owners never lose the figures.

- **API** (`pos-api internal/http/middleware/profit_visibility.go`): `HideProfitForCashier` sits on
  the order read routes and the reports groups. For an affected caller it removes `profit`,
  `margin_pct`, `gross_profit`, `gross_margin_pct`, `gross_profit_growth`, `unit_cost`,
  `cost_price`, `food_cost_pct`, `total_missing_cogs` and `skus_missing_cost` from every JSON
  response at any depth, answers 403 `profit_hidden` on the profit-only documents (most profitable,
  profitability grouped, sales by hour document), and sets `ProfitHidden(ctx)` so the All Sales,
  Daily Sales and Sales by Staff documents and the daily CSV leave their profit columns out. Other
  documents that only mention profit in passing are not trimmed.
- **UI**: `useHideProfit()` drives the sales table Profit and Margin columns, the dashboard Gross
  Profit card (`GrossProfitCard`), the reports and analytics profit figures, the Profitability
  nav entry and page, and the terminal and Add Sale cost and margin columns. While settings load a
  non-manager sees none of them.
- **Applying it to a tenant**: tick the box in Cashier policy for each outlet, or PUT
  `hide_profit_margin_for_cashier: true` to `/pos/outlets/{outletID}/settings`.
