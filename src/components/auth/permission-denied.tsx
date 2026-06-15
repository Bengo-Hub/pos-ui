'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';

interface PermissionDeniedPageProps {
  /** Optional human label of the thing they tried to open (e.g. "Reports"). */
  what?: string;
}

/**
 * Shown when a page IS available for the outlet's use case but the current role lacks the
 * permission to view it. Distinct from ModuleUnavailablePage (which means the use case itself
 * does not include the module). Reaching this normally requires a direct URL hit — the sidebar
 * already hides items the user has no permission for.
 */
export function PermissionDeniedPage({ what }: PermissionDeniedPageProps) {
  const { orgSlug } = useParams<{ orgSlug: string }>();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <ShieldAlert className="h-7 w-7 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-bold text-foreground font-display mb-1">Permission Required</h2>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        You don&apos;t have permission to view{' '}
        {what ? <span className="font-semibold">{what}</span> : 'this page'}. Ask a manager or
        administrator to grant you access.
      </p>
      <Link
        href={`/${orgSlug}/dashboard`}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
