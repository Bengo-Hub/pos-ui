'use client';

/**
 * CustomerSearch — a rich customer picker that searches by NAME, PHONE or EMAIL (QA req 2).
 *
 * Type anything → the query is classified (contains "@" = email, mostly digits = phone, else
 * name) and searched against the tenant's CRM/loyalty customers (debounced, phone
 * format-normalized). Pick a match to attach it. If none match, an "Add new customer" inline
 * form creates the contact (loyalty account → synced to MarketFlow CRM) and selects it. When
 * nothing is chosen the field falls back to the seeded **Walk-in Customer** (anonymous) — so
 * every sale has a customer.
 *
 * Emits the selected customer (or the walk-in sentinel) via onChange. Parents that need a real
 * debtor (credit sales, layaway, quotations) should disallow walk-in via `requireRealCustomer`.
 */

import { useEffect, useState } from 'react';
import { Loader2, UserPlus, UserRound, X, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useClientSearch, useClientCredit, useClientCreditByIdentifier, useCreateLoyaltyAccount } from '@/hooks/useClients';
import { classifySearchQuery, type LoyaltyAccount } from '@/lib/api/clients';
import { apiErrorMessage } from '@/lib/api/error-message';
import { normalizeKePhone, nationalSubscriberDigits } from '@/lib/phone';

export interface SelectedCustomer {
  phone: string;
  name: string;
  isWalkIn: boolean;
  /** Loyalty account id — set when picked from search or newly created (layaway needs it). */
  accountId?: string;
  email?: string;
  /** CRM contact id (marketflow) — set even for a CRM-only match with NO loyalty account, so the
   *  customer's real AR balance can still be looked up (treasury keys on this, not on accountId). */
  crmContactId?: string;
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
  /** Context shown when a real customer is required (default "a credit sale"). */
  requiredForLabel?: string;
  /**
   * Surfaces the FULL matched account row (points balance, CRM source, …) alongside onChange —
   * the terminal LoyaltyPanel needs it to offer points/redeem without a second lookup.
   * Called with null when the selection reverts to walk-in / is cleared.
   */
  onSelectAccount?: (account: LoyaltyAccount | null) => void;
  /** 'row' places the walk-in chip and the search input side-by-side on md+ (full-width
   *  terminal card); default 'stack' keeps the vertical layout for narrow panels/forms. */
  layout?: 'stack' | 'row';
}

export function CustomerSearch({ value, onChange, requireRealCustomer = false, requiredForLabel = 'a credit sale', onSelectAccount, layout = 'stack' }: CustomerSearchProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  // Classify the free-text query into name / phone / email; phones search by the 9-digit
  // national number so any stored format matches.
  const params = classifySearchQuery(debounced);
  const searchActive = debounced.trim().length >= 2;
  const { data, isLoading } = useClientSearch(
    searchActive && params.phone ? nationalSubscriberDigits(params.phone) || params.phone.trim() : undefined,
    searchActive ? params.name : undefined,
    searchActive ? params.email : undefined,
  );
  const matches = data?.accounts ?? [];
  const createAccount = useCreateLoyaltyAccount();

  const selected = value && !value.isWalkIn ? value : null;

  // Account balances for the attached customer (treasury AR via the pos proxy): outstanding
  // balance (debit), credit limit and payment period. Prefer the loyalty-account-keyed lookup
  // when there IS a loyalty account; otherwise fall back to the identifier-based lookup (CRM
  // contact id or phone) so a customer with no loyalty account yet — the common case — still
  // shows their real balance instead of an empty row.
  const { data: accountCredit } = useClientCredit(selected?.accountId);
  const { data: identifierCredit } = useClientCreditByIdentifier(
    selected?.accountId ? undefined : selected?.crmContactId,
    selected?.accountId ? undefined : selected?.phone,
  );
  const credit = accountCredit ?? identifierCredit;

  const select = (c: SelectedCustomer) => {
    setQuery('');
    setDebounced('');
    setShowAdd(false);
    setNewName('');
    setNewPhone('');
    setNewEmail('');
    onChange(c);
  };

  const openAdd = () => {
    // Seed the add-new form from whatever was typed: a phone query prefills the phone, a
    // name query prefills the name, an email query prefills the email.
    setNewPhone(params.phone ? normalizeKePhone(params.phone) : '');
    setNewName(params.name ?? '');
    setNewEmail(params.email ?? '');
    setShowAdd(true);
  };

  const handleAdd = () => {
    const p = normalizeKePhone(newPhone);
    if (!newName.trim() || !p) return;
    createAccount.mutate(
      {
        customer_name: newName.trim(),
        customer_phone: p,
        ...(newEmail.trim() ? { customer_email: newEmail.trim() } : {}),
      },
      {
        onSuccess: (res) => {
          toast.success(`${newName.trim()} added`);
          onSelectAccount?.({
            id: res?.id ?? '',
            tenant_id: '',
            customer_phone: p,
            customer_name: newName.trim(),
            customer_email: newEmail.trim() || undefined,
            points_balance: 0,
            lifetime_points: 0,
            created_at: '',
            updated_at: '',
          });
          select({
            phone: p,
            name: newName.trim(),
            isWalkIn: false,
            accountId: res?.id,
            email: newEmail.trim() || undefined,
          });
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
            {(selected.phone || selected.email) && (
              <p className="text-xs text-muted-foreground truncate">
                {[selected.phone, selected.email].filter(Boolean).join(' · ')}
              </p>
            )}
            {credit && (() => {
              const due = parseFloat(credit.balance_due || '0');
              const limit = parseFloat(credit.credit_limit || '0');
              return (
                <p className="text-xs truncate">
                  <span className={due > 0 ? 'text-amber-600 font-semibold' : due < 0 ? 'text-emerald-600 font-semibold' : 'text-muted-foreground'}>
                    {due > 0
                      ? `Owes ${credit.currency || 'KES'} ${due.toLocaleString()}`
                      : due < 0
                        ? `Credit ${credit.currency || 'KES'} ${Math.abs(due).toLocaleString()}`
                        : 'No balance due'}
                  </span>
                  {limit > 0 && (
                    <span className="text-muted-foreground"> · limit {(credit.currency || 'KES')} {limit.toLocaleString()}</span>
                  )}
                  {typeof credit.credit_period_days === 'number' && credit.credit_period_days > 0 && (
                    <span className="text-muted-foreground"> · {credit.credit_period_days}d terms</span>
                  )}
                </p>
              );
            })()}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onSelectAccount?.(null);
            select(requireRealCustomer ? { phone: '', name: '', isWalkIn: false } : WALK_IN_CUSTOMER);
          }}
          className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
          aria-label="Change customer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const showNotFound = searchActive && !isLoading && matches.length === 0;

  return (
    <div className="space-y-2">
      {/* Walk-in default chip + search input: stacked by default, side-by-side in 'row' layout. */}
      <div className={layout === 'row' ? 'flex flex-col md:flex-row gap-2' : 'space-y-2'}>
        {/* Current default: Walk-in (shown so the cashier sees who the sale is attributed to). */}
        {value?.isWalkIn && !requireRealCustomer && (
          <div className={`flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 min-w-0 ${layout === 'row' ? 'md:flex-1' : ''}`}>
            <UserRound className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-sm font-medium whitespace-nowrap">Walk-in Customer</p>
            <span className="text-xs text-muted-foreground ml-auto truncate">default — search to change</span>
          </div>
        )}
        <div className={`relative min-w-0 ${layout === 'row' ? 'md:flex-1' : ''}`}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, phone or email"
            className="w-full bg-background border border-border rounded-xl py-2.5 pl-10 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {isLoading && searchActive && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Matches */}
      {matches.length > 0 && (
        <div className="rounded-xl border border-border bg-card divide-y divide-border max-h-44 overflow-y-auto">
          {matches.map((c) => (
            <button
              // CRM-only rows (source 'crm') have no loyalty account id — key on the CRM id/phone.
              key={c.id || c.crm_contact_id || c.customer_phone}
              type="button"
              onClick={() => {
                onSelectAccount?.(c);
                select({
                  phone: c.customer_phone,
                  name: c.customer_name,
                  isWalkIn: false,
                  accountId: c.id || undefined,
                  email: c.customer_email || undefined,
                  crmContactId: c.crm_contact_id || undefined,
                });
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent transition-colors"
            >
              <UserRound className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium truncate flex-1">{c.customer_name}</span>
              <span className="text-xs text-muted-foreground truncate">
                {[c.customer_phone, c.customer_email].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Not found → add new customer (search-first: this only appears after no match) */}
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
            <input
              type="tel"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="Phone (e.g. 0712 345 678)"
              className="w-full bg-background border border-border rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Email (optional)"
              className="w-full bg-background border border-border rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
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
                disabled={!newName.trim() || !normalizeKePhone(newPhone) || createAccount.isPending}
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
            onClick={openAdd}
            className="w-full py-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
          >
            <UserPlus className="h-3.5 w-3.5" />
            No match — add &ldquo;{debounced.trim()}&rdquo; as a new customer
          </button>
        )
      )}

      {requireRealCustomer && !showNotFound && matches.length === 0 && (
        <p className="text-xs text-amber-600 px-1">A customer is required for {requiredForLabel}.</p>
      )}
    </div>
  );
}
