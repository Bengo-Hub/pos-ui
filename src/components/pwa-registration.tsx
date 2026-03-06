'use client';

import { Button } from '@/components/ui/base';
import { Download } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const PWA_DISMISS_KEY = 'pos-ui-pwa-install-dismissed';
const RE_PROMPT_MS = 30 * 60 * 1000; // Re-prompt at least once every 30 min if not installed

function wasDismissedRecently(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = localStorage.getItem(PWA_DISMISS_KEY);
  if (!raw) return false;
  const ts = parseInt(raw, 10);
  return !Number.isNaN(ts) && Date.now() - ts < RE_PROMPT_MS;
}

export function PWARegistration() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstall, setShowInstall] = useState(false);
  const promptRef = useRef<any>(null);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      promptRef.current = e;
      setDeferredPrompt(e);
      if (!wasDismissedRecently()) setShowInstall(true);
    });

    window.addEventListener('appinstalled', () => {
      setDeferredPrompt(null);
      setShowInstall(false);
      toast.success('BengoBox POS installed successfully!');
    });

    const interval = setInterval(() => {
      if (!wasDismissedRecently() && promptRef.current) setShowInstall(true);
    }, RE_PROMPT_MS);
    return () => clearInterval(interval);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowInstall(false);
    }
  };

  if (!showInstall) return null;

  return (
    <div
      className="fixed bottom-4 left-3 right-3 sm:left-4 sm:right-4 md:left-auto md:right-4 md:w-96 z-50 animate-in fade-in slide-in-from-bottom-5 max-w-full"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 0.5rem)" }}
    >
      <div className="bg-card border border-border rounded-2xl p-4 shadow-2xl flex flex-wrap items-center gap-3 sm:gap-4">
        <div className="h-10 w-10 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <Download className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold sm:text-base">Install POS</p>
          <p className="text-xs text-muted-foreground truncate sm:text-sm">Add to home screen for quick access.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            variant="ghost"
            size="sm"
            className="min-h-[44px] flex-1 sm:flex-none touch-manipulation"
            onClick={() => {
              setShowInstall(false);
              if (typeof window !== 'undefined') localStorage.setItem(PWA_DISMISS_KEY, Date.now().toString());
            }}
          >
            Later
          </Button>
          <Button size="sm" onClick={handleInstall} className="shadow-lg shadow-primary/20 min-h-[44px] touch-manipulation flex-1 sm:flex-none">Install</Button>
        </div>
      </div>
    </div>
  );
}
