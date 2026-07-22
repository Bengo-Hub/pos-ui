'use client';

import { PwaInstallPrompt } from '@bengo-hub/shared-ui-lib/offline';
import { toast } from 'sonner';
import { useTenantBranding } from '@/providers/tenant-branding-provider';

const DISMISS_KEY = 'pos_pwa_install_dismissed_until';

async function requestPermissions(appName: string) {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  if (navigator.storage?.persist) {
    await navigator.storage.persist();
  }
  if (navigator.mediaDevices?.getUserMedia) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      s.getTracks().forEach((t) => t.stop());
    } catch { /* non-fatal */ }
  }
  toast.success(`${appName} installed!`);
}

export function PWARegistration() {
  const { tenant } = useTenantBranding();

  // The tenant-specific manifest link is emitted server-side via
  // generateMetadata in [orgSlug]/layout.tsx (and kept in sync on SPA nav by
  // ManifestInjector in org-shell), so the browser already has the correct
  // tenant manifest when evaluating install criteria and capturing the icon.

  // App name = tenant's first word + service, e.g. "Urban POS". Keeps installed
  // apps distinguishable when several Bengo apps are installed for one tenant.
  const tenantFirstWord = tenant?.orgName?.trim().split(/\s+/)[0];
  const appName = tenantFirstWord ? `${tenantFirstWord} POS` : 'Codevertex POS';

  return (
    <PwaInstallPrompt
      appName={appName}
      logoUrl={tenant?.logoUrl}
      tagline="Full offline support — orders, payments & drawer."
      dismissKey={DISMISS_KEY}
      onInstalled={() => requestPermissions(appName)}
    />
  );
}
