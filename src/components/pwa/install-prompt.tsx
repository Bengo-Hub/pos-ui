'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/base';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'pos_pwa_install_dismissed';

async function requestAppPermissions(): Promise<void> {
  // Push notifications — required for order-ready alerts and KDS call-waiter
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }

  // Persistent storage — prevents the browser from evicting IndexedDB (offline queue)
  if (navigator.storage && navigator.storage.persist) {
    await navigator.storage.persist();
  }

  // Camera — required for barcode/QR scanning on retail/pharmacy use cases
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Release the stream immediately — we only needed the permission grant
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // User denied camera — non-fatal, barcode scan will fall back to manual entry
    }
  }
}

export function InstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    // Already installed as a standalone app — don't show the prompt
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!visible || !prompt) return null;

  const handleInstall = async () => {
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
      // Request all permissions the app needs after the user opts in
      await requestAppPermissions();
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-border bg-card shadow-2xl p-4 flex items-start gap-3">
      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Download className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm">Install POS App</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Install for full offline support — orders, payments, and drawer work without internet.
        </p>
        <div className="flex gap-2 mt-3">
          <Button size="sm" onClick={handleInstall} className="flex-1">
            Install
          </Button>
          <Button size="sm" variant="outline" onClick={handleDismiss}>
            Not now
          </Button>
        </div>
      </div>
      <button
        onClick={handleDismiss}
        className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-accent shrink-0 -mt-1 -mr-1"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
