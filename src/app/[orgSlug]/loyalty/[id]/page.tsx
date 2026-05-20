'use client';

import { useLoyaltyAccount, useEarnPoints, useRedeemPoints, type LoyaltyTransaction } from '@/hooks/useLoyalty';
import { cn } from '@/lib/utils';
import { ArrowLeft, Gift, Loader2, Minus, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

function txColor(type: string) {
  if (type === 'earn') return 'text-green-400';
  if (type === 'redeem') return 'text-red-400';
  return 'text-muted-foreground';
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function LoyaltyAccountDetailPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const id = params?.id as string;

  const { data, isLoading } = useLoyaltyAccount(id);
  const earn = useEarnPoints(id);
  const redeem = useRedeemPoints(id);

  const [earnPoints, setEarnPoints] = useState('');
  const [redeemPoints, setRedeemPoints] = useState('');

  async function handleEarn(e: React.FormEvent) {
    e.preventDefault();
    const pts = parseInt(earnPoints);
    if (!pts || pts <= 0) { toast.error('Enter a positive number'); return; }
    try {
      await earn.mutateAsync({ points: pts });
      toast.success(`${pts} points earned`);
      setEarnPoints('');
    } catch {
      toast.error('Failed to earn points');
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
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to redeem points');
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
        {transactions.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
            No transactions yet
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/20">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Type</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Points</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Balance After</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-accent/20 transition-colors">
                  <td className={cn('px-4 py-2.5 font-medium capitalize', txColor(tx.type_field))}>
                    {tx.type_field}
                  </td>
                  <td className={cn('px-4 py-2.5 text-right font-semibold', tx.points > 0 ? 'text-green-400' : 'text-red-400')}>
                    {tx.points > 0 ? '+' : ''}{tx.points}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">
                    {tx.balance_after.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{formatDate(tx.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
