'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/base';
import { Download, Share, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTenantBranding } from '@/providers/tenant-branding-provider';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'pos_pwa_install_dismissed_until';
const RE_PROMPT_MS = 24 * 60 * 60 * 1000; // 24 hours

function isDismissedRecently(): boolean {
  if (typeof window === 'undefined') return false;
  const until = parseInt(localStorage.getItem(DISMISS_KEY) ?? '0', 10);
  return Date.now() < until;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream;
}

async function requestPermissions() {
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
}

export function PWARegistration() {
  const { tenant } = useTenantBranding();
  const params = useParams();
  const orgSlug = params?.orgSlug as string | undefined;
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);

  // Inject the tenant-specific manifest link into <head> so the browser uses
  // the dynamic manifest (with tenant logo, start_url=/{orgSlug}/) when
  // evaluating PWA install criteria and capturing the app icon on install.
  useEffect(() => {
    if (!orgSlug) return;
    const href = `/${orgSlug}/manifest.webmanifest`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    if (link.href !== new URL(href, window.location.href).href) {
      link.href = href;
    }
  }, [orgSlug]);

  const appName = tenant?.orgName ? `${tenant.orgName} POS` : 'BengoBox POS';
  const logoUrl = tenant?.logoUrl;

  useEffect(() => {
    if (isStandalone() || isDismissedRecently()) return;

    if (isIOS()) {
      setIos(true);
      setTimeout(() => setVisible(true), 3000);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      promptRef.current = e as BeforeInstallPromptEvent;
      if (!isDismissedRecently()) setTimeout(() => setVisible(true), 3000);
    };

    const onInstalled = () => {
      setVisible(false);
      toast.success(`${appName} installed!`);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    const timer = setInterval(() => {
      if (!isDismissedRecently() && promptRef.current) setVisible(true);
    }, RE_PROMPT_MS);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      clearInterval(timer);
    };
  }, [appName]);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + RE_PROMPT_MS));
    setVisible(false);
  };

  const install = async () => {
    if (!promptRef.current) return;
    promptRef.current.prompt();
    const { outcome } = await promptRef.current.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
      await requestPermissions();
    }
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] animate-slide-up"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl shadow-black/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <div className="h-11 w-11 rounded-xl overflow-hidden border border-border shrink-0 flex items-center justify-center bg-primary/8">
            {logoUrl ? (
              <img src={logoUrl} alt={appName} className="h-full w-full object-contain p-1" />
            ) : ios ? (
              <Share className="h-5 w-5 text-primary" />
            ) : (
              <Download className="h-5 w-5 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight">Install {appName}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              {ios
                ? 'Add to your Home Screen for offline access.'
                : 'Full offline support — orders, payments & drawer.'}
            </p>
          </div>
          <button
            onClick={dismiss}
            className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-accent shrink-0 transition-colors -mt-1 -mr-1"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {ios ? (
          /* iOS instructions */
          <ol className="px-4 pb-4 space-y-2 text-xs text-muted-foreground">
            <li className="flex items-center gap-2.5">
              <span className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
              Tap <Share className="h-3.5 w-3.5 inline mx-0.5 text-primary shrink-0" /> <strong className="text-foreground">Share</strong> in Safari
            </li>
            <li className="flex items-center gap-2.5">
              <span className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
              Tap <strong className="text-foreground">"Add to Home Screen"</strong>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
              Tap <strong className="text-foreground">"Add"</strong>
            </li>
          </ol>
        ) : (
          /* Android / Chrome install actions */
          <div className="flex items-center gap-2 px-4 pb-4">
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 text-muted-foreground"
              onClick={dismiss}
            >
              Later
            </Button>
            <Button
              size="sm"
              className="flex-1 shadow-md shadow-primary/20"
              onClick={install}
            >
              Install
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
