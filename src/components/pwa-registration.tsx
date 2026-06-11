'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);

  // The tenant-specific manifest link is emitted server-side via
  // generateMetadata in [orgSlug]/layout.tsx (and kept in sync on SPA nav by
  // ManifestInjector in org-shell), so the browser already has the correct
  // tenant manifest when evaluating install criteria and capturing the icon.

  // App name = tenant's first word + service, e.g. "Urban POS". Keeps installed
  // apps distinguishable when several Bengo apps are installed for one tenant.
  const tenantFirstWord = tenant?.orgName?.trim().split(/\s+/)[0];
  const appName = tenantFirstWord ? `${tenantFirstWord} POS` : 'BengoBox POS';
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
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 animate-slide-up sm:inset-x-auto sm:right-4 sm:justify-end"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1rem)' }}
    >
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-border/60 bg-card/95 shadow-2xl shadow-black/25 ring-1 ring-black/5 backdrop-blur-xl">
        {/* Brand accent strip */}
        <div className="h-1 w-full bg-gradient-to-r from-primary/70 via-primary to-primary/70" />

        {/* Header */}
        <div className="flex items-start gap-3.5 px-4 pt-4 pb-3">
          <div className="relative shrink-0">
            <div className="absolute inset-0 -z-10 rounded-2xl bg-primary/25 blur-md" aria-hidden />
            <div className="h-12 w-12 rounded-2xl overflow-hidden ring-1 ring-border bg-white shadow-sm flex items-center justify-center">
              {logoUrl ? (
                <img src={logoUrl} alt={appName} className="h-full w-full object-contain p-1" />
              ) : ios ? (
                <Share className="h-5 w-5 text-primary" />
              ) : (
                <Download className="h-5 w-5 text-primary" />
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="font-semibold text-[0.95rem] leading-tight tracking-tight">Install {appName}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-snug">
              {ios
                ? 'Add to your Home Screen for offline access.'
                : 'Full offline support — orders, payments & drawer.'}
            </p>
          </div>
          <button
            onClick={dismiss}
            className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-accent shrink-0 transition-colors -mt-0.5 -mr-1 text-muted-foreground"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
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
              className="flex-1 gap-1.5 bg-gradient-to-b from-primary to-primary/90 shadow-lg shadow-primary/25"
              onClick={install}
            >
              <Download className="h-4 w-4" />
              Install
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
