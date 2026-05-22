'use client';

import { useState } from 'react';
import { Users } from 'lucide-react';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { ClientSearchBar } from '@/components/service/ClientSearchBar';
import { ClientProfileCard } from '@/components/service/ClientProfileCard';
import { useClientSearch } from '@/hooks/useClients';

export default function ClientsPage() {
  const [query, setQuery] = useState('');

  const isPhone = /^\d/.test(query);
  const { data, isLoading } = useClientSearch(
    isPhone ? query : undefined,
    !isPhone ? query : undefined
  );

  const accounts = data?.accounts ?? [];

  return (
    <ModuleGate moduleKey="loyalty" fallback={<ModuleUnavailablePage moduleKey="loyalty" />}>
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none">Client Profiles</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Search by phone or name</p>
          </div>
        </div>

        <ClientSearchBar value={query} onChange={setQuery} />

        {query.length < 2 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground/40 gap-3">
            <Users className="h-10 w-10" />
            <p className="text-sm">Enter at least 2 characters to search</p>
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground/40 gap-2">
            <p className="text-sm">No clients found for "{query}"</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {accounts.map((account) => (
              <ClientProfileCard key={account.id} account={account} />
            ))}
          </div>
        )}
      </div>
    </ModuleGate>
  );
}
