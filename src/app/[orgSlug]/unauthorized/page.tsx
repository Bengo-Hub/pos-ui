'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ShieldX } from 'lucide-react';

export default function UnauthorizedPage() {
  const params = useParams();
  const orgSlug = params?.orgSlug as string;
  const base = orgSlug ? `/${orgSlug}` : '';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <ShieldX className="h-16 w-16 text-destructive mb-4" />
      <h1 className="text-2xl font-semibold mb-2">Access denied</h1>
      <p className="text-muted-foreground text-center max-w-md mb-6">
        You don&apos;t have permission to view this page. Contact your administrator if you believe this is an error.
      </p>
      <Link
        href={base || '/'}
        className="text-primary hover:underline font-medium"
      >
        Return to home
      </Link>
    </div>
  );
}
