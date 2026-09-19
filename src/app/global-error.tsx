'use client';

import { isStaleChunkError, reloadOnce } from '@/components/stale-chunk-recovery';
import { useEffect } from 'react';

/**
 * Last-resort catch-all: catches a render-time error that escapes even the root layout (so
 * OrgShell/providers themselves threw), which `[orgSlug]/error.tsx` cannot see — Next.js
 * requires this file to render its own <html>/<body> since it replaces the entire root layout.
 * Kept deliberately dependency-free (no Tailwind/theme/UI-kit) since whatever broke the app is
 * exactly the kind of thing that could also be why THIS fallback fails to render — see
 * stale-chunk-recovery.tsx for the stale-bundle-after-a-deploy scenario this mainly exists for.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    if (isStaleChunkError(error)) reloadOnce();
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#fafafa', color: '#111' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
            <p style={{ fontWeight: 600, fontSize: 18, marginBottom: 8 }}>Something went wrong</p>
            <p style={{ fontSize: 14, color: '#666', marginBottom: 20 }}>
              The app hit an unexpected error. Try again, or reload if it keeps happening.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                onClick={() => reset()}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d4d4d4', background: '#fff', cursor: 'pointer' }}
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer' }}
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
