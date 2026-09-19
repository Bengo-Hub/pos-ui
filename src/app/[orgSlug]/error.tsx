'use client';

import { Button, Card, CardContent } from '@/components/ui/base';
import { isStaleChunkError, reloadOnce } from '@/components/stale-chunk-recovery';
import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';

/**
 * Catches any render-time error inside a tenant route that no inner try/catch or query
 * error-state handled — with no error boundary anywhere in the app this was previously an
 * unrecoverable blank/broken screen (Next's built-in fallback). Most of those crashes are the
 * stale-bundle-after-a-deploy scenario documented in stale-chunk-recovery.tsx (a long-open tab's
 * runtime requests a chunk the now-redeployed server no longer has, surfacing several retries
 * later as React's own "Maximum update depth exceeded" rather than the original fetch failure)
 * — auto-reload once for that signature so the user never sees this screen for it. Anything
 * else still lands here with a real recovery option instead of a dead page.
 */
export default function OrgSegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    if (isStaleChunkError(error)) reloadOnce();
  }, [error]);

  return (
    <div className="p-6 flex items-center justify-center min-h-100">
      <Card className="max-w-md w-full">
        <CardContent className="p-6 text-center space-y-4">
          <AlertTriangle className="h-10 w-10 mx-auto text-destructive/60" />
          <div className="space-y-1">
            <p className="font-semibold">Something went wrong</p>
            <p className="text-sm text-muted-foreground">
              This page hit an unexpected error. Try again, or reload if it keeps happening.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" onClick={() => reset()}>Try again</Button>
            <Button onClick={() => window.location.reload()}>Reload page</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
