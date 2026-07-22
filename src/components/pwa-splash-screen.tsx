'use client';

/**
 * PwaSplashScreen — a brief branded cold-start overlay shown only when running installed as a
 * PWA (display-mode: standalone), so launching from the home screen icon feels like opening a
 * native app instead of a bare browser tab flashing straight to content. No app in this fleet had
 * a component-based splash before (the static appleWebApp.startupImage metadata referenced a PNG
 * that was never actually generated, so iOS just showed a blank flash) — this replaces that with
 * a real, tenant-branded overlay that works on every platform, not just iOS.
 */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTenantBranding } from '@/providers/tenant-branding-provider';

const MIN_VISIBLE_MS = 900;
const FADE_MS = 300;

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function PwaSplashScreen() {
  const { tenant } = useTenantBranding();
  const [phase, setPhase] = useState<'hidden' | 'visible' | 'fading'>('hidden');

  useEffect(() => {
    if (!isStandalone()) return;
    setPhase('visible');
    const t1 = setTimeout(() => setPhase('fading'), MIN_VISIBLE_MS);
    const t2 = setTimeout(() => setPhase('hidden'), MIN_VISIBLE_MS + FADE_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (phase === 'hidden') return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background transition-opacity duration-300 ${
        phase === 'fading' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {tenant?.logoUrl ? (
        <img src={tenant.logoUrl} alt={tenant?.orgName ?? 'Codevertex POS'} className="max-h-24 max-w-[60%] object-contain" />
      ) : (
        <p className="text-2xl font-black uppercase tracking-tight text-foreground">Codevertex POS</p>
      )}
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}
