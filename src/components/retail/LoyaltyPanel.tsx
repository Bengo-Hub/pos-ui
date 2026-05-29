'use client';

import { useEffect, useState } from 'react';
import { Gift, Loader2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  useLoyaltyAccounts,
  useLoyaltyPrograms,
  useCreateLoyaltyAccount,
  useRedeemPoints,
  type LoyaltyAccount,
} from '@/hooks/useLoyalty';
import { usePermissions } from '@/hooks/usePermissions';
import { P } from '@/lib/rbac/permissions';

export interface LoyaltyState {
  accountId: string;
  customerPhone: string;
  customerName: string;
  redeemDiscount: number;
}

interface LoyaltyPanelProps {
  onStateChange: (state: LoyaltyState | null) => void;
  orderId?: string;
}

function isValidPhone(phone: string) {
  return phone.replace(/\D/g, '').length >= 9;
}

export function LoyaltyPanel({ onStateChange, orderId }: LoyaltyPanelProps) {
  const { can } = usePermissions();
  if (!can(P.LOYALTY_VIEW)) return null;

  return <LoyaltyPanelInner onStateChange={onStateChange} orderId={orderId} />;
}

function LoyaltyPanelInner({ onStateChange, orderId }: LoyaltyPanelProps) {
  const { can } = usePermissions();
  const canAdd = can(P.LOYALTY_ADD);

  const [phone, setPhone] = useState('');
  const [debouncedPhone, setDebouncedPhone] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [registerName, setRegisterName] = useState('');
  const [redeemed, setRedeemed] = useState(false);
  const [linkedAccount, setLinkedAccount] = useState<LoyaltyAccount | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedPhone(phone), 500);
    return () => clearTimeout(t);
  }, [phone]);

  const { data: accounts, isLoading: lookupLoading } = useLoyaltyAccounts(
    isValidPhone(debouncedPhone) ? debouncedPhone : undefined,
  );
  const { data: programs } = useLoyaltyPrograms();
  const program = programs?.[0];

  const createAccount = useCreateLoyaltyAccount();
  const redeemPoints = useRedeemPoints(linkedAccount?.id ?? '');

  const account: LoyaltyAccount | null = linkedAccount ?? accounts?.[0] ?? null;

  useEffect(() => {
    if (account && !redeemed) {
      onStateChange({
        accountId: account.id,
        customerPhone: account.customer_phone,
        customerName: account.customer_name,
        redeemDiscount: 0,
      });
    }
  }, [account?.id]);

  const handleRegister = () => {
    if (!registerName.trim() || !phone.trim()) return;
    createAccount.mutate(
      { customer_phone: phone.trim(), customer_name: registerName.trim() },
      {
        onSuccess: (newAcc) => {
          setLinkedAccount(newAcc as unknown as LoyaltyAccount);
          setShowRegister(false);
          toast.success(`${registerName} registered for loyalty`);
        },
        onError: () => toast.error('Failed to register loyalty account'),
      },
    );
  };

  const handleRedeem = () => {
    if (!account || !program) return;
    const pointsToRedeem = account.points_balance;
    const discountKSh = Math.floor(pointsToRedeem * program.redeem_rate);

    redeemPoints.mutate(
      { points: pointsToRedeem, order_id: orderId, notes: 'Redeemed at POS checkout' },
      {
        onSuccess: () => {
          setRedeemed(true);
          onStateChange({
            accountId: account.id,
            customerPhone: account.customer_phone,
            customerName: account.customer_name,
            redeemDiscount: discountKSh,
          });
          toast.success(`Redeemed ${pointsToRedeem} pts — KSh ${discountKSh} off`);
        },
        onError: () => toast.error('Failed to redeem points'),
      },
    );
  };

  const handleClear = () => {
    setPhone('');
    setDebouncedPhone('');
    setLinkedAccount(null);
    setShowRegister(false);
    setRegisterName('');
    setRedeemed(false);
    onStateChange(null);
  };

  const minRedeem = program?.min_redeem_points ?? 100;
  const canRedeem = !redeemed && account !== null && account.points_balance >= minRedeem;

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Gift className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-bold">Loyalty</span>
        {account && (
          <button
            type="button"
            onClick={handleClear}
            className="ml-auto p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {!account && (
        <div className="relative flex items-center gap-2">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Customer phone (e.g. 0712 345 678)"
            className="flex-1 bg-accent/10 border border-border rounded-xl py-2 px-3 text-sm focus:ring-1 focus:ring-primary outline-none"
          />
          {lookupLoading && isValidPhone(debouncedPhone) && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
          )}
        </div>
      )}

      {/* Found account */}
      {account && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">{account.customer_name}</p>
              <p className="text-xs text-muted-foreground">{account.customer_phone}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-primary">
                {account.points_balance.toLocaleString()} pts
              </p>
              {program && (
                <p className="text-xs text-muted-foreground">
                  ≈ KSh {Math.floor(account.points_balance * program.redeem_rate).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          {redeemed ? (
            <div className="text-xs text-green-600 font-semibold text-center py-1">
              ✓ Points redeemed
            </div>
          ) : canRedeem && can(P.LOYALTY_ADD) ? (
            <button
              type="button"
              disabled={redeemPoints.isPending}
              onClick={handleRedeem}
              className="w-full py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {redeemPoints.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Redeem {account.points_balance} pts (
              KSh {Math.floor(account.points_balance * (program?.redeem_rate ?? 0.01)).toLocaleString()} off)
            </button>
          ) : !canRedeem && account.points_balance > 0 ? (
            <p className="text-xs text-muted-foreground text-center">
              Need {minRedeem} pts to redeem (has {account.points_balance})
            </p>
          ) : null}
        </div>
      )}

      {/* Not found — show register option */}
      {!account && !lookupLoading && isValidPhone(debouncedPhone) && accounts !== undefined && accounts.length === 0 && canAdd && (
        <>
          {!showRegister ? (
            <button
              type="button"
              onClick={() => setShowRegister(true)}
              className="w-full py-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Register for loyalty
            </button>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                placeholder="Customer name"
                className="w-full bg-accent/10 border border-border rounded-xl py-2 px-3 text-sm focus:ring-1 focus:ring-primary outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowRegister(false)}
                  className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!registerName.trim() || createAccount.isPending}
                  onClick={handleRegister}
                  className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {createAccount.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Register
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
