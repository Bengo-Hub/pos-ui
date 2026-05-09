# Sprint 9: Reports & Analytics UI — pos-ui

**Status:** 🟡 Basic scaffold exists — API hooks not wired  
**Period:** November–December 2026  
**Last updated:** 2026-05-09  
**Goal:** Manager-facing reports dashboard — EOD reconciliation, sales trends, staff performance, and export

---

## Context

Business owners and managers need actionable numbers without going to a separate BI tool. Reports should be embedded in the POS terminal app and accessible to users with `pos.reports.view` permission.

---

## Pages to Create

```
src/app/[orgSlug]/(pos)/
  reports/
    page.tsx                    — Reports home (quick stats + navigation to report types)
    sales/page.tsx              — Sales summary with charts (date range selector)
    eod/page.tsx                — End-of-day report list
    eod/[date]/page.tsx         — Single EOD report detail + close action
    shifts/page.tsx             — Shift reports list
    shifts/[sessionId]/page.tsx — Shift detail (drawer reconciliation)
    staff/page.tsx              — Staff performance + commissions
    stock/page.tsx              — Stock consumption + low-stock alerts
    tax/page.tsx                — Tax collected report (VAT/KRA)
```

---

## Components

```
src/components/reports/
  KPICard.tsx                   — Single metric tile (revenue, orders, avg basket)
  SalesLineChart.tsx            — Revenue over time (daily/weekly/monthly toggle)
  CategoryPieChart.tsx          — Revenue split by product category
  HourlyHeatmap.tsx             — Orders by hour of day × day of week
  TopItemsTable.tsx             — Sortable table: item, quantity sold, revenue
  StaffPerformanceTable.tsx     — Per-staff: services, revenue, commissions
  DrawerReconciliation.tsx      — Expected vs actual cash + variance
  EODSummaryCard.tsx            — Single day: gross, discounts, refunds, net, by tender
  ExportButton.tsx              — Triggers CSV or PDF download
  DateRangePicker.tsx           — Preset shortcuts (today, this week, this month, custom)
```

---

## Behaviour

### Reports Home (`/reports`)
- Four KPI cards: today's revenue, order count, avg basket, top category
- Quick links to each report type
- "Close Day" button (visible only to users with `pos.reports.eod_close`) — opens confirmation then calls EOD close API

### Sales Summary (`/reports/sales`)
- Date range picker (defaults to last 7 days)
- Line chart: revenue per day
- Category pie chart
- Hourly heatmap
- Tender split bar chart
- "Export CSV" button

### EOD Report (`/reports/eod`)
- List of past EOD reports with status (open / closed)
- Today's row shows "Close Day" button if still open
- Click row → detail page

### EOD Detail (`/reports/eod/[date]`)
- Full reconciliation: gross, discounts, refunds, tax, net per tender type
- Cash reconciliation: expected vs declared (from drawer close)
- Order count, refund count, void count
- "Export PDF" button

### Shift Report (`/reports/shifts/[sessionId]`)
- Cashier name, device, open/close times
- Sales by tender, total void amount, total refund amount
- Cash expected (from sales) vs cash declared (from drawer close event)
- Discrepancy amount highlighted in red if > threshold

---

## Hooks

```
src/hooks/
  useSalesSummary(from, to)         → GET /{t}/pos/reports/sales/summary
  useSalesByItem(from, to)          → GET /{t}/pos/reports/sales/by-item
  useSalesByHour(date)              → GET /{t}/pos/reports/sales/by-hour
  useEODReports()                   → GET /{t}/pos/reports/eod
  useEODReport(date)                → GET /{t}/pos/reports/eod/{date}
  useCloseEOD()                     → POST /{t}/pos/reports/eod/close
  useShiftReports()                 → GET /{t}/pos/reports/shifts
  useShiftReport(sessionId)         → GET /{t}/pos/reports/shifts/{sessionId}
  useStaffReport(staffId, from, to) → GET /{t}/pos/reports/staff/{id}
  useStockConsumption(from, to)     → GET /{t}/pos/reports/stock/consumption
  useTaxReport(from, to)            → GET /{t}/pos/reports/tax
```

---

## Charts Library
- Use `recharts` (already common in Next.js stacks) — `LineChart`, `BarChart`, `PieChart`, `ResponsiveContainer`
- `HourlyHeatmap`: custom CSS grid (7 days × 24 hours), colour-coded by order volume bucket

---

## Use Cases Covered

| Report | Business Types |
|--------|---------------|
| Daily revenue trend | All business types |
| End-of-day reconciliation | All business types |
| Cash drawer reconciliation | Retail, restaurant, hotel |
| Top-selling items | Retail, restaurant, pharmacy |
| Staff commission report | Salon, service businesses |
| Hourly traffic heatmap | Restaurant, bar, retail |
| Tax collection summary | All (VAT/KRA compliance) |
| Stock consumption | Restaurant, pharmacy, retail |
