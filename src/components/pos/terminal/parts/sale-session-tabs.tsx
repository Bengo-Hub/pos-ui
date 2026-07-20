'use client';

/**
 * SaleSessionTabs — the multi-cart tab strip for the retail terminal (JamPos-style Sale 1/2/3).
 *
 * Lets a busy till hold several carts at once: park a slow M-Pesa payer on their own tab, ring up the
 * next customer on a fresh tab, finalize each independently. Every tab autosaves (survives reload);
 * closing a tab that still has items prompts to Save it to Drafts (server, resumable + hard-deletable)
 * or Discard. Rendered only when cfg.multiCart (retail) — see TerminalShell.
 *
 * All state/logic lives in useTerminal().saleSessions (the sessions layer around the provider cart);
 * this component is pure presentation + the close/clear confirmations.
 */

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useTerminal } from '@/components/pos/terminal/terminal-context';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { snapshotHasItems, snapshotItemCount, type SaleSession } from '@/lib/pos/sale-session';
import { cn } from '@/lib/utils';

export function SaleSessionTabs() {
  const t = useTerminal();
  const { sessions, activeId } = t.saleSessions;
  const [closeOpen, setCloseOpen] = useState(false);
  const [clearAllOpen, setClearAllOpen] = useState(false);

  // The active tab's live cart is authoritative for it (autosave is debounced); other tabs read
  // their last-saved snapshot.
  const liveHasItems = (s: SaleSession) => (s.id === activeId ? t.cart.length > 0 : snapshotHasItems(s.snapshot));
  const liveCount = (s: SaleSession) => (s.id === activeId ? t.cartItemCount : snapshotItemCount(s.snapshot));
  const anyItems = sessions.some(liveHasItems);

  // ✕ on a tab: empty → drop it; has items → focus it, then prompt Save-to-Drafts / Discard.
  const requestClose = (s: SaleSession) => {
    if (!liveHasItems(s)) {
      t.saleSessions.discardSession(s.id);
      return;
    }
    if (s.id !== activeId) t.saleSessions.switchSession(s.id);
    setCloseOpen(true);
  };

  const saveActiveToDrafts = () => {
    setCloseOpen(false);
    // Park the (now-active) tab to the server Drafts list, then close it once saved.
    t.handlePark({ onDone: () => t.saleSessions.removeActiveSession() });
  };

  const discardActive = () => {
    setCloseOpen(false);
    t.saleSessions.removeActiveSession();
  };

  return (
    <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-card border-b border-border overflow-x-auto">
      {sessions.map((s) => {
        const active = s.id === activeId;
        const count = liveCount(s);
        return (
          <div
            key={s.id}
            onClick={() => t.saleSessions.switchSession(s.id)}
            className={cn(
              'group flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors',
              active
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-foreground border-border hover:border-primary/40',
            )}
          >
            <span>{s.label}</span>
            {count > 0 && (
              <span
                className={cn(
                  'inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-bold tabular-nums',
                  active ? 'bg-primary-foreground/20' : 'bg-primary/10 text-primary',
                )}
              >
                {count}
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                requestClose(s);
              }}
              aria-label={`Close ${s.label}`}
              className={cn(
                'h-5 w-5 rounded-md flex items-center justify-center transition-colors',
                active ? 'hover:bg-primary-foreground/20' : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
              )}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}

      <button
        onClick={() => t.saleSessions.newSession()}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-primary/50 text-primary text-xs font-bold hover:bg-primary/10 whitespace-nowrap"
      >
        <Plus className="h-3.5 w-3.5" /> New Sale
      </button>

      {sessions.length > 1 && (
        <button
          onClick={() => (anyItems ? setClearAllOpen(true) : t.saleSessions.clearAll())}
          className="ml-auto shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-destructive hover:bg-destructive/10 whitespace-nowrap"
        >
          Clear All
        </button>
      )}

      {/* Close a tab that still has items — Save to Drafts / Discard / Keep editing. */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Close this sale?</DialogTitle>
            <DialogDescription>
              This tab still has items. Save it to Drafts to resume later, or discard it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <button
              onClick={saveActiveToDrafts}
              disabled={t.createOrderPending}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-bold hover:bg-primary/90 disabled:opacity-50"
            >
              Save to Drafts
            </button>
            <button
              onClick={discardActive}
              className="w-full py-2.5 rounded-lg border border-destructive/40 text-destructive font-semibold hover:bg-destructive/5"
            >
              Discard
            </button>
            <button
              onClick={() => setCloseOpen(false)}
              className="w-full py-2 rounded-lg text-muted-foreground font-medium hover:bg-accent"
            >
              Keep editing
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={clearAllOpen}
        onOpenChange={setClearAllOpen}
        title="Clear all sale tabs?"
        description="This discards every open sale tab (including items not saved to Drafts) and starts a fresh Sale 1. This cannot be undone."
        confirmLabel="Clear all"
        variant="danger"
        onConfirm={() => {
          setClearAllOpen(false);
          t.saleSessions.clearAll();
        }}
      />
    </div>
  );
}
