'use client';

import { useCallback } from 'react';

export type AppPermissionResult = {
  notifications: NotificationPermission | 'unsupported';
  persistentStorage: 'granted' | 'denied' | 'unsupported';
};

export async function requestAppPermissions(): Promise<AppPermissionResult> {
  const result: AppPermissionResult = {
    notifications: 'unsupported',
    persistentStorage: 'unsupported',
  };

  if (typeof window === 'undefined') return result;

  if ('Notification' in window) {
    try {
      result.notifications = await Notification.requestPermission();
    } catch {
      result.notifications = 'denied';
    }
  }

  if ('storage' in navigator && 'persist' in navigator.storage) {
    try {
      const granted = await navigator.storage.persist();
      result.persistentStorage = granted ? 'granted' : 'denied';
    } catch {
      result.persistentStorage = 'denied';
    }
  }

  return result;
}

export function useAppPermissions() {
  const request = useCallback(async () => {
    return requestAppPermissions();
  }, []);

  return { requestPermissions: request };
}
