'use client';

/**
 * LoyaltyPanel — the terminal's customer + loyalty capture step.
 *
 * Customer attach REUSES the Add-Sale CustomerSearch picker verbatim (list of name/phone/email
 * matches, pick one, chip with an X to remove/replace, Walk-in Customer as the default) so the
 * till and back-office behave identically. Any known customer is attachable — loyalty membership
 * is NOT required; CRM-only matches attach the same way and get a one-tap "Register" for loyalty.
 *
 * Loyalty extras (points balance, redeem, register) layer on top of the selected customer and
 * self-gate on the loyalty permissions; the customer picker itself is available to every role.
 */

import { useEffect, useRef, useState } from 'react';
import { Gift, Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { CustomerSearch, WALK_IN_CUSTOMER, type SelectedCustomer } from '@/components/pos/customer-search';
import { useLoyaltyPrograms, useCreateLoyaltyAccount, useRedeemPoints, useLoyaltyAccount } from '@/hooks/useLoyalty';
import type { LoyaltyAccount } from '@/lib/api/clients';
import { usePermissions } from '@/hooks/usePermissions';
import { P } from '@/lib/rbac/permissions';
import { normalizeKePhone } from '@/lib/phone';

export interface LoyaltyState {
  accountId: string;
  customerPhone: string;
  customerName: string;
  customerEmail?: string;
  redeemDiscount: number;
}

interface LoyaltyPanelProps {
  onStateChange: (state: LoyaltyState | null) => void;
  orderId?: string;
  /** 'row' spreads the picker horizontally (full-width card under the terminal search bar);
   *  default 'stack' keeps the compact vertical layout (side panels, Add Sale). */
  layout?: 'stack' | 'row';
  /** Seed the picker with a previously-attached customer — used by the multi-cart terminal so a
   *  restored/switched Sale tab shows the customer already on that cart. The panel is keyed by the
   *  caller (customerResetSeq) so this initializer re-runs on each switch. Only the chip is seeded;
   *  the live loyaltyState is still driven by the provider, so no onStateChange fires on mount. */
  initialSelected?: SelectedCustomer | null;
}

export function LoyaltyPanel({ onStateChange, orderId, layout = 'stack', initialSelected = null }: LoyaltyPanelProps) {
  const { can } = usePermissions();
  const canLoyalty = can(P.LOYALTY_VIEW);
  const canAdd = can(P.LOYALTY_ADD);

  const [selected, setSelected] = useState<SelectedCustomer>(
    initialSelected && !initialSelected.isWalkIn ? initialSelected : WALK_IN_CUSTOMER,
  );
  // Full matched loyalty/CRM row for the selection (points balance, source) — null for
  // walk-in or when the customer was keyed in manually. CustomerSearch fires onSelectAccount
  // synchronously right before onChange, so a ref carries the fresh row into handleChange
  // (state alone would be one render stale and could emit the PREVIOUS customer's account id).
  const accountRef = useRef<LoyaltyAccount | null>(null);
  const [account, setAccount] = useState<LoyaltyAccount | null>(null);
  const [redeemed, setRedeemed] = useState(false);

  const { data: programs } = useLoyaltyPrograms();
  const program = programs?.[0];
  const createAccount = useCreateLoyaltyAccount();
  const redeemPoints = useRedeemPoints(account?.id ?? '');

  // A restored/switched Sale tab seeds only the chip (selected.accountId) — not the full
  // `account` row — so re-hydrate it here. Without this, a customer who already has a loyalty
  // account reads as `hasLoyaltyAccount = false` after a tab switch, which wrongly shows
  // "Register" again (and used to error on submit before the account already-exists case was
  // made idempotent server-side).
  const needsHydration = !account && !!selected.accountId && !selected.isWalkIn;
  const { data: hydrated } = useLoyaltyAccount(needsHydration ? selected.accountId! : '');
  useEffect(() => {
    if (hydrated?.account) {
      accountRef.current = hydrated.account;
      setAccount(hydrated.account);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated?.account]);

  const emit = (c: SelectedCustomer, acc: LoyaltyAccount | null, redeemDiscount = 0) => {
    if (c.isWalkIn || !c.name) {
      onStateChange(null);
      return;
    }
    onStateChange({
      accountId: acc?.id || c.accountId || '',
      customerPhone: c.phone,
      customerName: c.name,
      customerEmail: c.email,
      redeemDiscount,
    });
  };

  const handleChange = (c: SelectedCustomer) => {
    const acc = c.isWalkIn ? null : accountRef.current;
    setSelected(c);
    setRedeemed(false);
    setAccount(acc);
    emit(c, acc);
  };

  // Register the attached CRM-only customer for loyalty (keeps them attached, now with an account).
  const handleRegister = () => {
    const phone = normalizeKePhone(selected.phone);
    if (!selected.name || !phone) return;
    createAccount.mutate(
      { customer_phone: phone, customer_name: selected.name },
      {
        onSuccess: (newAcc) => {
          const acc = newAcc as unknown as LoyaltyAccount;
          accountRef.current = acc;
          setAccount(acc);
          const next = { ...selected, accountId: acc.id };
          setSelected(next);
          emit(next, acc);
          toast.success(`${selected.name} registered for loyalty`);
        },
        onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to register loyalty account')),
      },
    );
  };

  const handleRedeem = () => {
    if (!account?.id || !program) return;
    const pointsToRedeem = account.points_balance ?? 0;
    const discountKSh = Math.floor(pointsToRedeem * (program.redeem_rate ?? 0));
    redeemPoints.mutate(
      { points: pointsToRedeem, order_id: orderId, notes: 'Redeemed at POS checkout' },
      {
        onSuccess: () => {
          setRedeemed(true);
          emit(selected, account, discountKSh);
          toast.success(`Redeemed ${pointsToRedeem} pts — KSh ${discountKSh} off`);
        },
        onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to redeem points')),
      },
    );
  };

  const minRedeem = program?.min_redeem_points ?? 100;
  // Also true while the hydrate-on-restore query above is in flight (selected.accountId is only
  // ever populated for a real loyalty account — never for a CRM-only match, see CustomerSearch),
  // so the Register button doesn't flash on before the account row loads.
  const hasLoyaltyAccount = !!(account?.id || selected.accountId) && account?.source !== 'crm';
  const canRedeem = !redeemed && hasLoyaltyAccount && (account?.points_balance ?? 0) >= minRedeem;

  const row = layout === 'row';
  return (
    <div className="bg-card border border-border rounded-2xl p-3 space-y-2 min-w-0">
      <div className={row ? 'flex flex-col md:flex-row md:items-start gap-2' : 'space-y-2'}>
        <div className={row ? 'flex items-center gap-2 shrink-0 md:pt-2.5' : 'flex items-center gap-2'}>
          <Gift className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-bold">Customer</span>
          {canLoyalty && hasLoyaltyAccount && (
            <span className="ml-auto md:ml-1 text-xs text-muted-foreground whitespace-nowrap">
              {(account?.points_balance ?? 0).toLocaleString()} pts
            </span>
          )}
        </div>

        {/* Same picker as Add Sale: walk-in default chip, match list, selected chip w/ X to replace. */}
        <div className="flex-1 min-w-0">
          <CustomerSearch
            value={selected}
            onChange={handleChange}
            layout={layout}
            // Fires right before onChange with the raw match row; handleChange reads it via the ref.
            onSelectAccount={(acc) => { accountRef.current = acc; }}
          />
        </div>
      </div>

      {/* Loyalty layer for the attached customer (self-gated on loyalty permissions). */}
      {canLoyalty && !selected.isWalkIn && selected.name && (
        <div className="flex items-center justify-between gap-2 px-1 text-xs">
          {hasLoyaltyAccount ? (
            redeemed ? (
              <span className="font-semibold text-green-600">✓ points redeemed</span>
            ) : canRedeem && canAdd ? (
              <button
                type="button"
                disabled={redeemPoints.isPending}
                onClick={handleRedeem}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-2 py-1 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {redeemPoints.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                Redeem KSh {Math.floor((account?.points_balance ?? 0) * (program?.redeem_rate ?? 0.01)).toLocaleString()}
              </button>
            ) : (
              <span className="text-muted-foreground">
                {(account?.points_balance ?? 0) > 0 ? `need ${minRedeem} pts to redeem` : 'loyalty member'}
              </span>
            )
          ) : (
            <>
              <span className="text-muted-foreground">customer (no loyalty)</span>
              {canAdd && normalizeKePhone(selected.phone) && (
                <button
                  type="button"
                  disabled={createAccount.isPending}
                  onClick={handleRegister}
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2 py-1 font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
                >
                  {createAccount.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                  Register
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
