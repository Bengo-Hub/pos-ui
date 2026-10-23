'use client';

import { useSyncExternalStore } from 'react';
import { getClientId, getDeviceName, guessDeviceKind, subscribeDeviceIdentity } from '@/lib/device-identity';

const noopSubscribe = () => () => {};

/** This browser's client id, saved name and kind; empty during server render. */
export function useDeviceIdentity() {
  const clientId = useSyncExternalStore(noopSubscribe, getClientId, () => '');
  const name = useSyncExternalStore(subscribeDeviceIdentity, () => getDeviceName() ?? '', () => '');
  const kind = useSyncExternalStore(noopSubscribe, guessDeviceKind, () => 'computer' as const);
  return { clientId, name, kind };
}
