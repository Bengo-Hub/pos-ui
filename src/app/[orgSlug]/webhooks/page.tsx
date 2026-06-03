'use client';

import { WebhooksTab } from '@/components/settings/WebhooksTab';

/**
 * Legacy /webhooks route. Webhooks now live under POS Settings → Webhooks tab;
 * this thin wrapper keeps old links working and renders the same manager.
 */
export default function WebhooksPage() {
  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Webhooks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Subscribe to POS events and receive POST callbacks. Also available under Settings → Webhooks.
        </p>
      </div>
      <WebhooksTab />
    </div>
  );
}
