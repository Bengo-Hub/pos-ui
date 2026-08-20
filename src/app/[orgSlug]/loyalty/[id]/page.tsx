'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

import { useLoyaltyAccount, useEarnPoints, useRedeemPoints, useReferrals, useCreateReferral } from '@/hooks/useLoyalty';
import { ArrowLeft, Gift, Loader2, Minus, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { DataTable } from '@bengo-hub/shared-ui-lib/data-table';
import { PhoneInputField } from '@bengo-hub/shared-ui-lib/contact';
import { buildLoyaltyTransactionColumns, buildReferralColumns } from './loyalty-detail-columns';

function LoyaltyAccountDetailPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const id = params?.id as string;

  const { data, isLoading } = useLoyaltyAccount(id);
  const earn = useEarnPoints(id);
  const redeem = useRedeemPoints(id);

  const [earnPoints, setEarnPoints] = useState('');
  const [redeemPoints, setRedeemPoints] = useState('');

  const { data: referrals = [] } = useReferrals(id);
  const createReferral = useCreateReferral(id);
  const [referredPhone, setReferredPhone] = useState('');
  const transactionColumns = useMemo(() => buildLoyaltyTransactionColumns(), []);
  const referralColumns = useMemo(() => buildReferralColumns(), []);

  async function handleRefer(e: React.FormEvent) {
    e.preventDefault();
    const phone = referredPhone.trim();
    if (!phone) { toast.error("Enter the friend's phone"); return; }
    try {
      await createReferral.mutateAsync({ referred_phone: phone });
      toast.success('Referral created');
      setReferredPhone('');
    } catch (err) {
      toast.error(await apiErrorMessage(err, 'Failed to create referral'));
    }
  }

  async function handleEarn(e: React.FormEvent) {
    e.preventDefault();
    const pts = parseInt(earnPoints);
    if (!pts || pts <= 0) { toast.error('Enter a positive number'); return; }
    try {
      await earn.mutateAsync({ points: pts });
      toast.success(`${pts} points earned`);
      setEarnPoints('');
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to earn points'));
    }
  }

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    const pts = parseInt(redeemPoints);
    if (!pts || pts <= 0) { toast.error('Enter a positive number'); return; }
    try {
      await redeem.mutateAsync({ points: pts });
      toast.success(`${pts} points redeemed`);
      setRedeemPoints('');
    } catch (err) {
      toast.error(await apiErrorMessage(err, 'Failed to redeem points'));
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading…</span>
      </div>
    );
  }

  const account = data?.account;
  const transactions = data?.transactions ?? [];

  if (!account) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Account not found.{' '}
        <Link href={`/${orgSlug}/loyalty`} className="text-primary underline">Back</Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <Link href={`/${orgSlug}/loyalty`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Loyalty
      </Link>

      {/* Account header */}
      <div className="rounded-2xl border border-border bg-card p-5 flex items-center gap-5">
        <div className="h-14 w-14 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
          <Gift className="h-7 w-7 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-lg font-bold">{account.customer_name}</p>
          <p className="text-sm text-muted-foreground">{account.customer_phone}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-3xl font-bold text-primary">{account.points_balance.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">points balance</p>
          <p className="text-xs text-muted-foreground mt-0.5">{account.lifetime_points.toLocaleString()} lifetime</p>
        </div>
      </div>

      {/* Earn / Redeem */}
      <div className="grid grid-cols-2 gap-4">
        <form onSubmit={handleEarn} className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-green-500/15 flex items-center justify-center">
              <Plus className="h-4 w-4 text-green-500" />
            </div>
            <p className="text-sm font-semibold">Earn Points</p>
          </div>
          <input
            type="number"
            min="1"
            placeholder="Points to earn"
            value={earnPoints}
            onChange={(e) => setEarnPoints(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={earn.isPending}
            className="w-full py-2 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-60 transition-colors"
          >
            {earn.isPending ? 'Processing…' : 'Add Points'}
          </button>
        </form>

        <form onSubmit={handleRedeem} className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-red-500/15 flex items-center justify-center">
              <Minus className="h-4 w-4 text-red-500" />
            </div>
            <p className="text-sm font-semibold">Redeem Points</p>
          </div>
          <input
            type="number"
            min="1"
            placeholder="Points to redeem"
            value={redeemPoints}
            onChange={(e) => setRedeemPoints(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={redeem.isPending}
            className="w-full py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-60 transition-colors"
          >
            {redeem.isPending ? 'Processing…' : 'Redeem'}
          </button>
        </form>
      </div>

      {/* Transaction history */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold">Recent Transactions</p>
        </div>
        <div className="px-2 pb-2">
          <DataTable
            columns={transactionColumns}
            rows={transactions}
            rowKey={(tx) => tx.id}
            storageKey="loyalty-transactions-col-prefs"
            emptyText="No transactions yet"
          />
        </div>
      </div>

      {/* Referrals (refer-a-friend) */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Referrals</p>
        </div>
        <form onSubmit={handleRefer} className="flex items-center gap-2 p-4 border-b border-border">
          {/* pos-api's CreateReferral now compares by national subscriber digits as a fallback
              (matching CompleteReferral's own tolerance), so E.164 input here is safe — see the
              backend fix landed alongside this. */}
          <PhoneInputField
            value={referredPhone}
            onChange={setReferredPhone}
            className="flex-1"
          />
          <button
            type="submit"
            disabled={createReferral.isPending}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors shrink-0"
          >
            {createReferral.isPending ? '…' : 'Refer'}
          </button>
        </form>
        <div className="px-2 pb-2">
          <DataTable
            columns={referralColumns}
            rows={referrals}
            rowKey={(r) => r.id}
            storageKey="loyalty-referrals-col-prefs"
            emptyText="No referrals yet"
          />
        </div>
      </div>
    </div>
  );
}

export default function LoyaltyAccountDetailPageGated() {
  return (
    <ModuleGate moduleKey="loyalty" fallback={<ModuleUnavailablePage moduleKey="loyalty" />}>
      <LoyaltyAccountDetailPage />
    </ModuleGate>
  );
}
