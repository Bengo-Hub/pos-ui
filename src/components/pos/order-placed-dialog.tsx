'use client';

import { apiClient } from '@/lib/api/client';
import { useKDSStations } from '@/hooks/useKDS';
import { usePOSSettings } from '@/hooks/usePOSSettings';
import { useAuthStore } from '@/store/auth';
import { configFor, hasRealPrinter, BILL_PROFILE_ID } from '@/lib/pos/printer-stations';
import { printProfileHtml, fetchReceiptEscposHex } from '@/lib/pos/printer-discovery';
import { CheckCircle2, Loader2, Printer, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface OrderPlacedDialogProps {
  open: boolean;
  orderNumber: string;
  orderId: string;
  tenantId: string;
  orgSlug: string;
  onClose?: () => void;
}

/**
 * Print a full HTML document via a popup window, waiting for it to fully load (fonts + logo image)
 * before invoking print. Printing synchronously after document.write() is what produced the BLANK
 * print preview — the print fired before the receipt rendered.
 */
function browserPrintFullDoc(html: string) {
  if (typeof window === 'undefined') return;
  const win = window.open('', '_blank', 'width=400,height=640');
  if (!win) { window.print(); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    win.focus();
    win.print();
    win.addEventListener('afterprint', () => win.close());
    setTimeout(() => { try { win.close(); } catch { /* already closed */ } }, 1000);
  };
  win.onload = doPrint;
  // Fallback in case onload doesn't fire (cached/instant docs).
  setTimeout(doPrint, 700);
}

export function OrderPlacedDialog({ open, orderNumber, orderId, tenantId, orgSlug, onClose }: OrderPlacedDialogProps) {
  const router = useRouter();
  const { data: stationsData } = useKDSStations();
  const { data: posSettings } = usePOSSettings();
  const servedBy = useAuthStore((s) => s.user?.fullName || s.user?.email || '');
  const [printing, setPrinting] = useState(false);
  // Holds the fetched receipt HTML when NO configured printer was found — drives the
  // "print on browser?" confirmation modal instead of silently opening the browser print window.
  const [browserPrompt, setBrowserPrompt] = useState<string | null>(null);
  // Guards the one-shot auto-print so it fires once per dialog open, not on every re-render.
  const autoFiredRef = useRef(false);

  const stations = stationsData?.data ?? [];
  const kdsDestination = stations.length > 0
    ? stations.filter((s) => s.is_active !== false).map((s) => s.name).join(', ')
    : 'Kitchen';

  // Resolve the Bill/customer station printer. When one is assigned we print SILENTLY to it (via the
  // backend / QZ Tray) with no browser dialog; otherwise we ask before falling back to the browser.
  const billProfile = useMemo(
    () => configFor((posSettings as { printer_profiles?: Parameters<typeof configFor>[0] })?.printer_profiles, BILL_PROFILE_ID),
    [posSettings],
  );
  const printerConfigured = hasRealPrinter(billProfile);

  const handleLogout = useCallback(() => {
    onClose?.();
    router.replace(`/${orgSlug}/pin-login`);
  }, [onClose, router, orgSlug]);

  const handlePrint = useCallback(async () => {
    setPrinting(true);
    try {
      const q = servedBy ? `?served_by=${encodeURIComponent(servedBy)}` : '';
      const html = await apiClient.get<string>(`/api/v1/${tenantId}/pos/orders/${orderId}/receipt/html${q}`);
      if (printerConfigured) {
        // Configured printer → push the job straight to it (QZ Tray, incl. raw network by IP).
        // No browser print window at all. For a NETWORK printer, also fetch server-built ESC/POS
        // bytes so the Local Print Agent can print it silently when QZ Tray isn't installed.
        const escposHex = billProfile?.printer_type === 'network'
          ? await fetchReceiptEscposHex(tenantId, orderId, 'customer', BILL_PROFILE_ID)
          : null;
        await printProfileHtml(billProfile, `Receipt ${orderNumber}`, html as string, escposHex ?? undefined);
        handleLogout();
      } else {
        // No configured printer → DO NOT auto-open the browser print window. Ask first.
        setBrowserPrompt(html as string);
      }
    } catch {
      // Print failed silently — still log out.
      handleLogout();
    } finally {
      setPrinting(false);
    }
  }, [servedBy, tenantId, orderId, orderNumber, billProfile, printerConfigured, handleLogout]);

  // Auto-print path: only auto-prints when a printer is CONFIGURED (silent). With no printer we
  // still surface the confirmation modal rather than popping a browser dialog unexpectedly.
  useEffect(() => {
    if (!open) {
      autoFiredRef.current = false;
      setBrowserPrompt(null);
      return;
    }
    if (posSettings?.auto_print_order && !autoFiredRef.current) {
      autoFiredRef.current = true;
      handlePrint();
    }
  }, [open, posSettings, handlePrint]);

  if (!open) return null;

  // "No configured printer" confirmation — shown for both auto-print and manual print when the
  // bill station has no assigned printer. This is the modal the QA asked for.
  if (browserPrompt !== null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-card rounded-3xl border border-border shadow-2xl w-80 p-7 flex flex-col items-center gap-4">
          <AlertTriangle className="h-12 w-12 text-amber-500" strokeWidth={1.5} />
          <div className="text-center">
            <p className="text-lg font-bold font-display">No printer detected</p>
            <p className="text-sm text-muted-foreground mt-1">
              No configured receipt printer was found for this station. Print the bill using your
              browser instead?
            </p>
          </div>
          <div className="flex gap-3 w-full">
            <button
              onClick={() => { setBrowserPrompt(null); handleLogout(); }}
              className="flex-1 py-3 rounded-2xl border-2 border-border text-sm font-semibold hover:bg-accent/30 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { const h = browserPrompt; setBrowserPrompt(null); browserPrintFullDoc(h); handleLogout(); }}
              className="flex-1 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Print on Browser
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Auto-print enabled → suppress the manual popup; show only a brief printing indicator while the
  // silent job is dispatched (the confirmation modal above handles the no-printer case).
  if (posSettings?.auto_print_order) {
    return printing ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-card rounded-3xl border border-border shadow-2xl px-8 py-6 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-sm font-semibold">Printing receipt…</p>
        </div>
      </div>
    ) : null;
  }

  // Settings still loading — wait rather than flashing the manual popup before we know the setting.
  if (!posSettings) return null;

  // OK = log out (auto-print is OFF here, so OK never prints — Print Bill is the explicit print action).
  const handleOk = () => handleLogout();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card rounded-3xl border border-border shadow-2xl w-80 p-8 flex flex-col items-center gap-5">
        {/* Success icon */}
        <CheckCircle2 className="h-14 w-14 text-emerald-500" strokeWidth={1.5} />

        {/* Heading */}
        <div className="text-center">
          <p className="text-xl font-bold font-display">Order Placed!</p>
          <p className="text-sm text-muted-foreground mt-1">
            {orderNumber} → {kdsDestination}
          </p>
        </div>

        {/* Auto-logout notice */}
        <div className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <span className="text-base">🔒</span>
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Auto-logout. Shift stays active.</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 w-full">
          <button
            onClick={handlePrint}
            disabled={printing}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-border text-sm font-semibold hover:bg-accent/30 transition-colors disabled:opacity-50"
          >
            {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Print Bill
          </button>
          <button
            onClick={handleOk}
            className="flex-1 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
