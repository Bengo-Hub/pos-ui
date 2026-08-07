'use client';

import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';

import { useLoyaltyAccounts, useCreateLoyaltyAccount } from '@/hooks/useLoyalty';
import { Gift, Plus, Search } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { DataTable } from '@bengo-hub/shared-ui-lib/data-table';
import { buildLoyaltyColumns } from './loyalty-columns';

function LoyaltyPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ customer_name: '', customer_phone: '' });

  const { data: accounts = [], isLoading } = useLoyaltyAccounts(search || undefined);
  const createMutation = useCreateLoyaltyAccount();
  const columns = useMemo(() => buildLoyaltyColumns({ orgSlug }), [orgSlug]);

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
    } catch (e) {
      toast.error(await apiErrorMessage(e, 'Failed to create account'));
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

      <DataTable
        columns={columns}
        rows={accounts}
        rowKey={(acc) => acc.id}
        loading={isLoading}
        storageKey="loyalty-col-prefs"
        emptyState={
          <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Gift className="h-10 w-10 opacity-30" />
            <p className="font-medium">No loyalty accounts found</p>
          </div>
        }
      />
    </div>
  );
}

export default function LoyaltyPageGated() {
  return (
    <ModuleGate moduleKey="loyalty" fallback={<ModuleUnavailablePage moduleKey="loyalty" />}>
      <LoyaltyPage />
    </ModuleGate>
  );
}
