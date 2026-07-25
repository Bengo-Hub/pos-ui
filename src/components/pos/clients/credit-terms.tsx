'use client';

/**
 * Customer credit hint (QA req 1) — treasury owns the AR balance + credit limit / payment
 * period; pos-api proxies them per loyalty account (/pos/clients/{accountID}/credit).
 *
 * CustomerCreditHint: one-liner under the credit-sale customer picker showing available
 * credit and the payment period for the selected customer. Credit terms are EDITED on the
 * central treasury Customers page (the POS "Clients" nav entry links there) — the old
 * per-client CreditTermsCard editor was removed with the duplicate POS clients pages.
 */

import { useClientCredit, type ClientCredit } from '@/hooks/useClients';

const fmt = (n: number) => `KES ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const num = (s?: string) => Number(s ?? 0) || 0;

function availableCredit(credit?: ClientCredit): number | null {
  if (!credit || !credit.credit_limit) return null;
  return Math.max(0, num(credit.credit_limit) - num(credit.balance_due));
}

export function CustomerCreditHint({ accountId, saleTotal }: { accountId?: string; saleTotal?: number }) {
  const { data: credit, isLoading } = useClientCredit(accountId);
  if (!accountId) return null;
  if (isLoading) return <p className="text-xs text-muted-foreground px-1">Checking credit…</p>;
  if (!credit) return null;
  const available = availableCredit(credit);
  const overLimit = available != null && typeof saleTotal === 'number' && saleTotal > available;
  // storeCredit is money the BUSINESS owes the CUSTOMER (e.g. from a return) — a completely
  // different figure from "Available credit" above (which is borrowing headroom against the
  // credit limit). Never conflate the two labels.
  const storeCredit = num(credit.store_credit_balance);
  return (
    <p className={`text-xs px-1 ${overLimit ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
      Balance due: {fmt(num(credit.balance_due))}
      {available != null && <> · Available credit: {fmt(available)}</>}
      {credit.credit_period_days ? <> · due in {credit.credit_period_days} days</> : null}
      {overLimit && <> — this sale exceeds the available credit</>}
      {storeCredit > 0 && (
        <span className="text-emerald-600 font-medium"> · Store credit available: {fmt(storeCredit)}</span>
      )}
    </p>
  );
}
