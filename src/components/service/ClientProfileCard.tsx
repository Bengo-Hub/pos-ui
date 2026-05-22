'use client';

import { Phone, Star, Calendar } from 'lucide-react';
import type { LoyaltyAccount } from '@/lib/api/clients';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface ClientProfileCardProps {
  account: LoyaltyAccount;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n);
}

export function ClientProfileCard({ account }: ClientProfileCardProps) {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || '';

  return (
    <Link
      href={`/${orgSlug}/clients/${account.id}`}
      className="block bg-card border border-border rounded-2xl p-4 hover:border-primary/40 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 font-bold text-primary text-sm">
            {account.customer_name[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm truncate">{account.customer_name}</p>
            {account.customer_phone && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                <Phone className="h-3 w-3" />
                {account.customer_phone}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-bold text-primary flex items-center gap-1 justify-end">
            <Star className="h-3 w-3" />
            {account.points_balance.toLocaleString()} pts
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {account.lifetime_points.toLocaleString()} lifetime
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 mt-3 text-[10px] text-muted-foreground">
        <Calendar className="h-3 w-3" />
        Member since {new Date(account.created_at).toLocaleDateString('en-KE', { year: 'numeric', month: 'short' })}
      </div>
    </Link>
  );
}
