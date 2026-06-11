'use client';

/**
 * TerminalShell — the shared GoDigital back-office layout chrome every per-use-case view composes:
 * a left menu panel (header band + product grid) and the right cart panel, plus the modal host.
 *
 * The per-use-case differences (order-type, courses, pricing profile, scale, manager override, etc.)
 * are driven by the terminal config (cfg) inside the shared parts — exactly as the original monolith
 * gated them — so every view gets identical, behaviour-preserving wiring. Views exist so the page can
 * link a named component per use case and so any future vertical-specific chrome lives in one place.
 */

import { TerminalHeader } from '@/components/pos/terminal/parts/terminal-header';
import { TerminalProductGrid } from '@/components/pos/terminal/parts/terminal-product-grid';
import { TerminalCart } from '@/components/pos/terminal/parts/terminal-cart';
import { TerminalModals } from '@/components/pos/terminal/parts/terminal-modals';

export function TerminalShell() {
  return (
    <div className="flex flex-col lg:flex-row overflow-hidden bg-background" style={{ height: 'calc(100vh - 80px)' }}>
      {/* ── Left Panel: Menu (60%) ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden min-h-0">
        <TerminalHeader />
        <TerminalProductGrid />
      </div>

      {/* ── Right Panel: Cart (+ mobile sticky bar / bottom sheet) ── */}
      <TerminalCart />

      {/* ─── Modals ─── */}
      <TerminalModals />
    </div>
  );
}
