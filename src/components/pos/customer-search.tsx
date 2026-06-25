'use client';

/**
 * CustomerSearch — a rich, phone-first customer picker (same UX as the POS loyalty field).
 *
 * Type a phone → it searches the tenant's CRM/loyalty customers (debounced, format-normalized) and
 * shows matches. Pick one to attach it. If none match, an "Add new customer" inline form creates the
 * contact (loyalty account → synced to MarketFlow CRM) and selects it. When nothing is chosen the
 * field falls back to the seeded **Walk-in Customer** (anonymous) — so every sale has a customer.
 *
 * Emits the selected customer (or the walk-in sentinel) via onChange. Parents that need a real
 * debtor (e.g. credit sales) should disallow walk-in via `requireRealCustomer`.
 */

import { useEffect, useState } from 'react';
import { Loader2, UserPlus, UserRound, X, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useClientSearch, useCreateLoyaltyAccount } from '@/hooks/useClients';
import { apiErrorMessage } from '@/lib/api/error-message';
import { normalizeKePhone, nationalSubscriberDigits, isUsablePhone } from '@/lib/phone';

export interface SelectedCustomer {
  phone: string;
  name: string;
  isWalkIn: boolean;
}

export const WALK_IN_CUSTOMER: SelectedCustomer = {
  phone: '',
  name: 'Walk-in Customer',
  isWalkIn: true,
};

interface CustomerSearchProps {
  value: SelectedCustomer | null;
  onChange: (c: SelectedCustomer) => void;
  /** When true, the walk-in fallback is not offered (e.g. credit sales need a real debtor). */
  requireRealCustomer?: boolean;
}

export function CustomerSearch({ value, onChange, requireRealCustomer = false }: CustomerSearchProps) {
  const [phone, setPhone] = useState('');
  const [debounced, setDebounced] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(phone), 400);
    return () => clearTimeout(t);
  }, [phone]);

  // Search the CRM/loyalty customers by the 9-digit national number so any stored format matches.
  const { data, isLoading } = useClientSearch(
    isUsablePhone(debounced) ? nationalSubscriberDigits(debounced) || debounced.trim() : undefined,
  );
  const matches = data?.accounts ?? [];
  const createAccount = useCreateLoyaltyAccount();

  const selected = value && !value.isWalkIn ? value : null;

  const select = (c: SelectedCustomer) => {
    setPhone('');
    setDebounced('');
    setShowAdd(false);
    setNewName('');
    onChange(c);
  };

  const handleAdd = () => {
    const p = normalizeKePhone(phone);
    if (!newName.trim() || !p) return;
    createAccount.mutate(
      { customer_name: newName.trim(), customer_phone: p },
      {
        onSuccess: () => {
          toast.success(`${newName.trim()} added`);
          select({ phone: p, name: newName.trim(), isWalkIn: false });
        },
        onError: async (e) => toast.error(await apiErrorMessage(e, 'Failed to add customer')),
      },
    );
  };

  // ── Selected customer chip ────────────────────────────────────────────────
  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <UserRound className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{selected.name}</p>
            {selected.phone && <p className="text-xs text-muted-foreground truncate">{selected.phone}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={() => select(requireRealCustomer ? { phone: '', name: '', isWalkIn: false } : WALK_IN_CUSTOMER)}
          className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
          aria-label="Change customer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const showNotFound =
    isUsablePhone(debounced) && !isLoading && matches.length === 0;

  return (
    <div className="space-y-2">
      {/* Current default: Walk-in (shown so the cashier sees who the sale is attributed to). */}
      {value?.isWalkIn && !requireRealCustomer && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
          <UserRound className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-sm font-medium">Walk-in Customer</p>
          <span className="text-xs text-muted-foreground ml-auto">default — search to change</span>
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Search customer by phone (e.g. 0712 345 678)"
          className="w-full bg-background border border-border rounded-xl py-2.5 pl-10 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {isLoading && isUsablePhone(debounced) && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Matches */}
      {matches.length > 0 && (
        <div className="rounded-xl border border-border bg-card divide-y divide-border max-h-44 overflow-y-auto">
          {matches.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => select({ phone: c.customer_phone, name: c.customer_name, isWalkIn: false })}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent transition-colors"
            >
              <UserRound className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium truncate flex-1">{c.customer_name}</span>
              <span className="text-xs text-muted-foreground">{c.customer_phone}</span>
            </button>
          ))}
        </div>
      )}

      {/* Not found → add new customer */}
      {showNotFound && (
        showAdd ? (
          <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Customer name"
              className="w-full bg-background border border-border rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <p className="text-xs text-muted-foreground">Phone: {normalizeKePhone(phone)}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newName.trim() || createAccount.isPending}
                onClick={handleAdd}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {createAccount.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Add customer
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="w-full py-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add &ldquo;{normalizeKePhone(phone)}&rdquo; as a new customer
          </button>
        )
      )}

      {requireRealCustomer && !showNotFound && matches.length === 0 && (
        <p className="text-xs text-amber-600 px-1">A customer is required for a credit sale.</p>
      )}
    </div>
  );
}
