# Retail POS — Register UX Design (Retail POS Revamp)

**Created:** 2026-06-07 · **Driver:** `/.claude/plans/_audit-parts/retail-pos-audit-and-roadmap-2026-06-07.md`
**Audits:** `/.claude/plans/_audit-parts/retail-pos-competitive-audit-{jampos,godigital}.md`

> Target: a fast, keyboard-first **retail** register that matches/*beats* jampos & godigital, built
> on existing pos-ui primitives (`order/page.tsx`, `split-payment-modal.tsx`, `payment-modal.tsx`),
> shared apiClient + TanStack hooks, shadcn/base-ui, sonner toasts, ConfirmDialog (per memory UI
> uniformity rules). Tenders, refunds, AR, store-credit all route to **treasury-api**.

## Surfaces to build (Phase 2)
1. **Multi-tab parked sales** — up to N named tabs (Sale 1..N), suspend/resume list, per-tab
   store/customer; backed by pos-api hold/resume endpoints; persists offline.
2. **Pricing-profile selector** — Retail/Wholesale (and tenant tiers) at cart; resolves price via
   `GET /pricing/resolve?profile=&item=&qty=` (pos-api → inventory tier/price_book). Show W.Price.
3. **Customer** — in-register search/create via marketflow S2S; binds `crm_contact_id` (loyalty/AR).
4. **Tenders** in payment modal — cash (+change), M-Pesa **STK** (deterministic) and **C2B**
   (cashier modal: amount prepopulated → poll candidates → claim; see research Part 1), **card**
   (Paystack hosted; PDQ optional later), **cheque**, **bank transfer**, **advance/store-credit**
   (treasury `wallet`), loyalty redemption, **split/multi-tender** with live Change/Balance.
5. **Credit Sale** — finalize `tender=on_account` → treasury `customer_balance` (AR); guarded by
   customer credit limit; appears in Debt/AR view + dunning.
6. **Return-by-Invoice** — lookup prior sale by order/invoice no. → select lines+qty+reason →
   choose compensation (refund to original tender / **store credit** / exchange / AR credit note);
   manager override; emits eTIMS credit note via treasury.
7. **Add Expense** from register → treasury `expense` S2S (petty cash at till).
8. **Close register / Z-report** — tender breakdown (Sell vs Expense), credit sales, refunds,
   per-SKU products-sold (from `daily_closing`).
9. **Polish** — product grid by **Brand** (not just Category), keyboard shortcuts (`Pay`=Enter,
   express checkout), on-screen calculator, Bulk-SMS launcher (Phase 3), Quotation (treasury).

## Compensation decision tree (returns) — see research Part 2
proof-of-purchase? → reason (defect ⇒ refund original tender + scrap; change-of-mind ⇒ policy) →
window + resaleable? → replacement? (exchange even / pay-up / refund-down) → account customer? (AR
credit note) → retention? (store credit) → else refund to original tender.

## Service split
pos-ui (surfaces) → pos-api (cart/pricing/return/credit-sale/hold) → treasury (money, wallet, AR,
credit notes, eTIMS) · inventory (stock/restock) · marketflow (customer) · notifications (SMS).

## Use-case scoping (retail only) — 2026-06-07
This register is the **retail** use-case surface. Hide hospitality controls (course/station/modifier,
kitchen-order unless the outlet enables it), show only retail product categories/filters, and source
category/tax/UOM options from the retail taxonomy. Driven by per-outlet `useCaseConfig` (see
`inventory-service/inventory-ui/docs/use-case-pages.md`). Gate every action as `permission AND use_case`.