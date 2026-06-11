'use client';

/**
 * Order terminal — thin shell.
 *
 * This page used to be a ~1,500-line monolith that branched by use case via `cfg` flags inline.
 * It is now a thin shell: it resolves the outlet's use case to a terminal profile, wraps the screen
 * in <TerminalProvider> (the single source of all state + logic) and renders the matching per-use-case
 * view. Every workflow, handler and modal lives in the provider + shared terminal parts — behaviour is
 * unchanged; only the structure (monolith → shell + provider + per-use-case views) and the GoDigital
 * layout changed.
 *
 *   normalizeUseCase(outlet.use_case) → retail | pharmacy | services | quick_service | hospitality
 */

import { normalizeUseCase } from '@/lib/use-case-config';
import { useAuthStore } from '@/store/auth';
import { TerminalProvider } from '@/components/pos/terminal/terminal-context';
import { RetailTerminalView } from '@/components/pos/terminal/views/RetailTerminalView';
import { PharmacyTerminalView } from '@/components/pos/terminal/views/PharmacyTerminalView';
import { ServicesTerminalView } from '@/components/pos/terminal/views/ServicesTerminalView';
import { QuickServiceTerminalView } from '@/components/pos/terminal/views/QuickServiceTerminalView';
import { HospitalityTerminalView } from '@/components/pos/terminal/views/HospitalityTerminalView';

export default function OrderPage() {
  const outlet = useAuthStore((s) => s.outlet);
  const profile = normalizeUseCase(outlet?.use_case);

  return (
    <TerminalProvider>
      {profile === 'hospitality' ? (
        <HospitalityTerminalView />
      ) : profile === 'quick_service' ? (
        <QuickServiceTerminalView />
      ) : profile === 'pharmacy' ? (
        <PharmacyTerminalView />
      ) : profile === 'services' ? (
        <ServicesTerminalView />
      ) : (
        /* sensible default → Retail */
        <RetailTerminalView />
      )}
    </TerminalProvider>
  );
}
