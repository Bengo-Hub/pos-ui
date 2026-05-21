'use client';

import { useLoyaltyAccounts, useCreateLoyaltyAccount, type LoyaltyAccount } from '@/hooks/useLoyalty';
import { cn } from '@/lib/utils';
import { Gift, Loader2, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

export default function LoyaltyPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ customer_name: '', customer_phone: '' });

  const { data: accounts = [], isLoading } = useLoyaltyAccounts(search || undefined);
  const createMutation = useCreateLoyaltyAccount();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customer_name || !form.customer_phone) {
      toast.error('Name and phone are required');
      return;
    }
    try {
      await createMutation.mutateAsync(form);
      toast.success('Account created');
      setShowCreate(false);
      setForm({ customer_name: '', customer_phone: '' });
    } catch {
      toast.error('Failed to create account');
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Loyalty Accounts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage customer points and rewards</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Account
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by phone number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="mb-5 p-4 rounded-2xl border border-border bg-card space-y-3"
        >
          <p className="text-sm font-semibold">New Loyalty Account</p>
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Customer name"
              value={form.customer_name}
              onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              placeholder="Phone number"
              value={form.customer_phone}
              onChange={(e) => setForm((f) => ({ ...f, customer_phone: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
          <Gift className="h-10 w-10 opacity-30" />
          <p className="font-medium">No loyalty accounts found</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Customer</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Phone</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Balance</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Lifetime</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-accent/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{acc.customer_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{acc.customer_phone}</td>
                  <td className="px-4 py-3 text-right font-semibold text-primary">
                    {acc.points_balance.toLocaleString()} pts
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {acc.lifetime_points.toLocaleString()} pts
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/${orgSlug}/loyalty/${acc.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
