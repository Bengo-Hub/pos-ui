'use client';

import { useEffect, useState } from 'react';
import { Gift, Loader2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
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

// normalizeKePhone strips spaces/symbols and unifies Kenyan formats to a canonical local 0-number,
// so "+254 792 548766", "254792548766", "792548766" and "0792 548 766" all become "0792548766".
// Used for the loyalty search query and for storing new accounts (the backend matches by the last 9
// digits regardless, but this keeps stored data clean and consistent).
function normalizeKePhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('254')) return '0' + d.slice(3);
  if (d.length === 9 && (d.startsWith('7') || d.startsWith('1'))) return '0' + d;
  return d;
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
  const [registerPhone, setRegisterPhone] = useState('');
  const [redeemed, setRedeemed] = useState(false);
  const [linkedAccount, setLinkedAccount] = useState<LoyaltyAccount | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedPhone(phone), 500);
    return () => clearTimeout(t);
  }, [phone]);

  // Free-text lookup (QA req 2): the query is classified into phone / name / email by the
  // shared classifier inside useLoyaltyAccounts; phones are normalized to the local format.
  const searchQuery = debouncedPhone.trim();
  const searchActive = searchQuery.length >= 2 && (!/^[\d\s+\-()]+$/.test(searchQuery) || isValidPhone(searchQuery));
  const { data: accounts, isLoading: lookupLoading } = useLoyaltyAccounts(
    searchActive ? (isValidPhone(searchQuery) && /^[\d\s+\-()]+$/.test(searchQuery) ? normalizeKePhone(searchQuery) : searchQuery) : undefined,
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
    // CRM-only rows all share id '' — key the effect on phone too so switching between two
    // CRM matches still re-attaches the right customer.
  }, [account?.id, account?.customer_phone]);

  const handleRegister = () => {
    const p = normalizeKePhone(registerPhone || phone);
    if (!registerName.trim() || !isValidPhone(p)) return;
    createAccount.mutate(
      { customer_phone: p, customer_name: registerName.trim() },
      {
        onSuccess: (newAcc) => {
          setLinkedAccount(newAcc as unknown as LoyaltyAccount);
          setShowRegister(false);
          toast.success(`${registerName} registered for loyalty`);
        },
        onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to register loyalty account')),
      },
    );
  };

  const handleRedeem = () => {
    if (!account || !program) return;
    const pointsToRedeem = account.points_balance ?? 0;
    const discountKSh = Math.floor(pointsToRedeem * (program.redeem_rate ?? 0));

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
        onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to redeem points')),
      },
    );
  };

  const handleClear = () => {
    setPhone('');
    setDebouncedPhone('');
    setLinkedAccount(null);
    setShowRegister(false);
    setRegisterName('');
    setRegisterPhone('');
    setRedeemed(false);
    onStateChange(null);
  };

  const minRedeem = program?.min_redeem_points ?? 100;
  const canRedeem = !redeemed && account !== null && (account.points_balance ?? 0) >= minRedeem;

  return (
    <div className="bg-card border border-border rounded-2xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Gift className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-bold">Loyalty</span>
        {account && (
          <button
            type="button"
            onClick={handleClear}
            className="ml-auto p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            aria-label="Clear loyalty customer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Phone is the only persistent control — no customer cards (keeps the panel compact as the
          loyalty base grows). A matched customer attaches to the order and shows as one compact line. */}
      <div className="relative flex items-center gap-2">
        <input
          type="text"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Customer phone, name or email"
          className="flex-1 bg-accent/10 border border-border rounded-xl py-2 px-3 text-sm focus:ring-1 focus:ring-primary outline-none"
        />
        {lookupLoading && searchActive && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
        )}
      </div>

      {/* Matched customer — compact one-liner (name · points) with inline redeem when eligible.
          CRM-only matches (customer exists in the CRM but has no loyalty account yet) attach to
          the sale the same way and offer one-tap loyalty registration instead of points. */}
      {account && (
        <div className="flex items-center justify-between gap-2 px-1 text-xs">
          <span className="min-w-0 truncate">
            <span className="font-semibold text-foreground">{account.customer_name}</span>
            {account.source === 'crm' || !account.id ? (
              <span className="text-muted-foreground"> · customer (no loyalty)</span>
            ) : (
              <span className="text-muted-foreground"> · {(account.points_balance ?? 0).toLocaleString()} pts</span>
            )}
          </span>
          {(account.source === 'crm' || !account.id) && canAdd ? (
            <button
              type="button"
              onClick={() => {
                setRegisterName(account.customer_name);
                setRegisterPhone(normalizeKePhone(account.customer_phone));
                setShowRegister(true);
                setLinkedAccount(null);
              }}
              className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2 py-1 font-semibold text-primary hover:bg-primary/10"
            >
              <UserPlus className="h-3 w-3" />
              Register
            </button>
          ) : redeemed ? (
            <span className="shrink-0 font-semibold text-green-600">✓ redeemed</span>
          ) : canRedeem && can(P.LOYALTY_ADD) ? (
            <button
              type="button"
              disabled={redeemPoints.isPending}
              onClick={handleRedeem}
              className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-primary px-2 py-1 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {redeemPoints.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Redeem KSh {Math.floor((account.points_balance ?? 0) * (program?.redeem_rate ?? 0.01)).toLocaleString()}
            </button>
          ) : (account.points_balance ?? 0) > 0 ? (
            <span className="shrink-0 text-muted-foreground">need {minRedeem} pts</span>
          ) : null}
        </div>
      )}

      {/* No match — quick register (part of the loyalty + ordering workflow). */}
      {!showRegister && !account && !lookupLoading && searchActive && accounts !== undefined && accounts.length === 0 && canAdd && (
        <button
          type="button"
          onClick={() => {
            // Seed the form from the query: a phone query prefills the phone field.
            if (/^[\d\s+\-()]+$/.test(searchQuery)) setRegisterPhone(normalizeKePhone(searchQuery));
            else setRegisterName(searchQuery);
            setShowRegister(true);
          }}
          className="w-full py-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Register for loyalty
        </button>
      )}

      {/* Register form — reachable from "no match" AND from a CRM-only match (prefilled). */}
      {showRegister && canAdd && (
        <div className="space-y-2">
          <input
            type="text"
            value={registerName}
            onChange={(e) => setRegisterName(e.target.value)}
            placeholder="Customer name"
            className="w-full bg-accent/10 border border-border rounded-xl py-2 px-3 text-sm focus:ring-1 focus:ring-primary outline-none"
          />
          <input
            type="tel"
            value={registerPhone}
            onChange={(e) => setRegisterPhone(e.target.value)}
            placeholder="Phone (e.g. 0712 345 678)"
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
              disabled={!registerName.trim() || !isValidPhone(normalizeKePhone(registerPhone || phone)) || createAccount.isPending}
              onClick={handleRegister}
              className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {createAccount.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Register
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
