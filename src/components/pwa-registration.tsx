'use client';

import { Button } from '@/components/ui/base';
import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export function PWARegistration() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
    });

    window.addEventListener('appinstalled', () => {
      setDeferredPrompt(null);
      setShowInstall(false);
      toast.success('BengoBox POS installed successfully!');
    });
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
    <div className="fixed bottom-6 left-6 right-6 md:left-auto md:w-96 z-50 animate-in fade-in slide-in-from-bottom-5">
      <div className="bg-card border border-border rounded-2xl p-4 shadow-2xl flex items-center gap-4">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
          <Download className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">Install POS</p>
          <p className="text-xs text-muted-foreground truncate">Add to home screen for quick access.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowInstall(false)}>Later</Button>
          <Button size="sm" onClick={handleInstall} className="shadow-lg shadow-primary/20">Install</Button>
        </div>
      </div>
    </div>
  );
}
