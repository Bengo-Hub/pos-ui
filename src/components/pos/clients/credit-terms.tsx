'use client';

/**
 * Customer credit terms (QA req 1) — treasury owns the AR balance + credit limit / payment
 * period; pos-api proxies them per loyalty account (/pos/clients/{accountID}/credit).
 *
 * - CreditTermsCard: client-detail-page card showing Balance Due / Credit Limit / Available /
 *   Payment Period, with an Edit form gated on pos.orders.manage (the same permission that
 *   approves credit sales — the server gates the PUT regardless).
 * - CustomerCreditHint: one-liner under the credit-sale customer picker showing available
 *   credit and the payment period for the selected customer.
 */

import { useState } from 'react';
import { CreditCard, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useClientCredit, useSetClientCredit, type ClientCredit } from '@/hooks/useClients';
import { usePermissions } from '@/hooks/usePermissions';
import { apiErrorMessage } from '@/lib/api/error-message';

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
  return (
    <p className={`text-xs px-1 ${overLimit ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
      Balance due: {fmt(num(credit.balance_due))}
      {available != null && <> · Available credit: {fmt(available)}</>}
      {credit.credit_period_days ? <> · due in {credit.credit_period_days} days</> : null}
      {overLimit && <> — this sale exceeds the available credit</>}
    </p>
  );
}

export function CreditTermsCard({ accountId }: { accountId: string }) {
  const { can } = usePermissions();
  const canManage = can('pos.orders.manage');
  const { data: credit, isLoading } = useClientCredit(accountId);
  const setCredit = useSetClientCredit(accountId);
  const [editing, setEditing] = useState(false);
  const [limit, setLimit] = useState('');
  const [period, setPeriod] = useState('');

  const available = availableCredit(credit);

  const openEdit = () => {
    setLimit(credit?.credit_limit ? String(num(credit.credit_limit)) : '');
    setPeriod(credit?.credit_period_days ? String(credit.credit_period_days) : '');
    setEditing(true);
  };

  const saveTerms = () => {
    setCredit.mutate(
      {
        credit_limit: limit === '' ? undefined : Math.max(0, parseFloat(limit) || 0),
        credit_period_days: period === '' ? undefined : Math.max(0, parseInt(period) || 0),
      },
      {
        onSuccess: () => {
          toast.success('Credit terms updated');
          setEditing(false);
        },
        onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to update credit terms')),
      },
    );
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" /> Credit
        </h3>
        {canManage && !editing && (
          <button onClick={openEdit} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
            <Pencil className="h-3 w-3" /> Edit terms
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading credit…
        </div>
      ) : editing ? (
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Credit limit (KES, 0 clears)</span>
            <input
              type="number" min={0} inputMode="decimal" value={limit}
              onChange={(e) => setLimit(e.target.value)} placeholder="e.g. 50000"
              className="mt-1 w-full bg-background border border-border rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Payment period (days, 0 clears)</span>
            <input
              type="number" min={0} value={period}
              onChange={(e) => setPeriod(e.target.value)} placeholder="e.g. 30"
              className="mt-1 w-full bg-background border border-border rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)}
              className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-accent transition-colors">
              Cancel
            </button>
            <button
              onClick={saveTerms}
              disabled={setCredit.isPending || (limit === '' && period === '')}
              className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {setCredit.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save terms
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Balance due</p>
            <p className="font-bold tabular-nums">{fmt(num(credit?.balance_due))}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Credit limit</p>
            <p className="font-bold tabular-nums">{credit?.credit_limit ? fmt(num(credit.credit_limit)) : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Available credit</p>
            <p className="font-bold tabular-nums">{available != null ? fmt(available) : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Payment period</p>
            <p className="font-bold tabular-nums">{credit?.credit_period_days ? `${credit.credit_period_days} days` : '—'}</p>
          </div>
        </div>
      )}
    </div>
  );
}
