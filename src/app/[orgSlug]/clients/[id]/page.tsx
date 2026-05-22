'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Phone, Star, Gift, Calendar } from 'lucide-react';
import { ModuleGate } from '@/components/auth/module-gate';
import { ModuleUnavailablePage } from '@/components/auth/module-unavailable';
import { useClient } from '@/hooks/useClients';

function fmt(n: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n);
}

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params?.orgSlug as string) || '';
  const accountID = (params?.id as string) || '';

  const { data: account, isLoading } = useClient(accountID);

  return (
    <ModuleGate moduleKey="loyalty" fallback={<ModuleUnavailablePage moduleKey="loyalty" />}>
      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Clients
        </button>

        {isLoading ? (
          <div className="space-y-3">
            <div className="h-24 rounded-2xl bg-muted animate-pulse" />
            <div className="h-32 rounded-2xl bg-muted animate-pulse" />
          </div>
        ) : !account ? (
          <div className="text-center py-12 text-muted-foreground">Client not found</div>
        ) : (
          <>
            {/* Profile header */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xl">
                  {account.customer_name[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="font-bold text-lg truncate">{account.customer_name}</h1>
                  {account.customer_phone && (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                      <Phone className="h-3.5 w-3.5" />
                      {account.customer_phone}
                    </p>
                  )}
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                    <Calendar className="h-3 w-3" />
                    Member since {new Date(account.created_at).toLocaleDateString('en-KE', { dateStyle: 'medium' })}
                  </p>
                </div>
              </div>
            </div>

            {/* Loyalty stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-2xl p-4 text-center">
                <Star className="h-5 w-5 text-primary mx-auto mb-1" />
                <p className="text-xl font-bold tabular-nums">{account.points_balance.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Available Points</p>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4 text-center">
                <Gift className="h-5 w-5 text-primary mx-auto mb-1" />
                <p className="text-xl font-bold tabular-nums">{account.lifetime_points.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Lifetime Points</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => router.push(`/${orgSlug}/order`)}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Start New Order
              </button>
              <button
                type="button"
                onClick={() => router.push(`/${orgSlug}/appointments`)}
                className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors"
              >
                Book Appointment
              </button>
            </div>
          </>
        )}
      </div>
    </ModuleGate>
  );
}
