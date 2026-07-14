'use client';

import { Phone, Star, Calendar, UserRound } from 'lucide-react';
import type { LoyaltyAccount } from '@/lib/api/clients';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface ClientProfileCardProps {
  account: LoyaltyAccount;
}

export function ClientProfileCard({ account }: ClientProfileCardProps) {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || '';

  // CRM-only customers (no loyalty account yet) have no account id → no detail page to open;
  // render the same card unlinked with a "customer" badge instead of points.
  const isCrmOnly = !account.id;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 font-bold text-primary text-sm">
            {account.customer_name[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm truncate">{account.customer_name}</p>
            {(account.customer_phone || account.customer_email) && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5 truncate">
                <Phone className="h-3 w-3 shrink-0" />
                {[account.customer_phone, account.customer_email].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          {isCrmOnly ? (
            <p className="text-[10px] font-semibold text-muted-foreground inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1">
              <UserRound className="h-3 w-3" />
              Not on loyalty
            </p>
          ) : (
            <>
              <p className="text-xs font-bold text-primary flex items-center gap-1 justify-end">
                <Star className="h-3 w-3" />
                {(account.points_balance ?? 0).toLocaleString()} pts
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {(account.lifetime_points ?? 0).toLocaleString()} lifetime
              </p>
            </>
          )}
        </div>
      </div>
      {account.created_at && (
        <div className="flex items-center gap-1 mt-3 text-[10px] text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {isCrmOnly ? 'Customer since' : 'Member since'}{' '}
          {new Date(account.created_at).toLocaleDateString('en-KE', { year: 'numeric', month: 'short' })}
        </div>
      )}
    </>
  );

  const cardClass = 'block bg-card border border-border rounded-2xl p-4 transition-all';

  if (isCrmOnly) {
    return <div className={cardClass}>{body}</div>;
  }

  return (
    <Link href={`/${orgSlug}/clients/${account.id}`} className={`${cardClass} hover:border-primary/40 hover:shadow-sm`}>
      {body}
    </Link>
  );
}
