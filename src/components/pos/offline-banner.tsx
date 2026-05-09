'use client';

import { useOnline } from '@/hooks/use-online';
import { WifiOff } from 'lucide-react';

export function OfflineBanner() {
  const online = useOnline();

  if (online) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-destructive-foreground text-sm font-semibold">
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>Offline — cash payments and manual mobile payments only. Orders will sync when connection is restored.</span>
    </div>
  );
}
