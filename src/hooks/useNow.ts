'use client';

import { useEffect, useState } from 'react';

/**
 * Returns Date.now() and re-renders on an interval so relative "elapsed" timers tick live.
 * Default cadence is 1s — pass a larger interval for boards that don't need per-second updates.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
