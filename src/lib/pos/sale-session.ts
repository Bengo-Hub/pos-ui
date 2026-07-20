/**
 * Sale-session model for the multi-cart retail terminal (JamPos-style Sale 1/2/3 tabs).
 *
 * A "sale session" is one open cart tab: a full snapshot of every piece of editable order state the
 * cashier builds up before payment. The terminal keeps ONE active cart in TerminalProvider; the
 * sessions layer snapshots/swaps these fields around it so several customers can be rung up in
 * parallel (a slow M-Pesa payer parked on one tab while others are served on the next).
 *
 * Pure types + helpers only — no React, no storage. The store owns persistence; the hook owns wiring.
 */

import type { CartItem } from '@/components/pos/terminal/terminal-context';
import type { LoyaltyState } from '@/components/retail/LoyaltyPanel';
import { WALK_IN_CUSTOMER, type SelectedCustomer } from '@/components/pos/customer-search';
import type { OrderSubtype } from '@/hooks/usePOS';

/** Everything that makes one cart tab distinct — snapshotted on switch, restored on return. */
export interface SaleSessionSnapshot {
  cart: CartItem[];
  manualDiscount: number;
  discountReason: string;
  orderTax: number;
  charges: Record<string, number>;
  loyaltyState: LoyaltyState | null;
  orderSubtype: OrderSubtype | null;
  deliveryInfo: { address: string; notes: string };
  pricingProfile: string;
  ageVerified: boolean;
}

/** One open Sale tab. */
export interface SaleSession {
  id: string;
  /** Display label, e.g. "Sale 1". User-facing; auto-numbered on create, renameable. */
  label: string;
  snapshot: SaleSessionSnapshot;
  createdAt: number;
  updatedAt: number;
}

/** A fresh, empty cart snapshot (a brand-new tab). */
export function emptySnapshot(): SaleSessionSnapshot {
  return {
    cart: [],
    manualDiscount: 0,
    discountReason: '',
    orderTax: 0,
    charges: {},
    loyaltyState: null,
    orderSubtype: null,
    deliveryInfo: { address: '', notes: '' },
    pricingProfile: '',
    ageVerified: false,
  };
}

/** True when a tab holds at least one cart line (drives the leave-guard + close prompt). */
export function snapshotHasItems(s: SaleSessionSnapshot | undefined | null): boolean {
  return !!s && Array.isArray(s.cart) && s.cart.length > 0;
}

/** Total unit count across a tab's cart — shown as the tab badge. */
export function snapshotItemCount(s: SaleSessionSnapshot | undefined | null): number {
  if (!s || !Array.isArray(s.cart)) return 0;
  return s.cart.reduce((sum, c) => sum + (c.quantity ?? 0), 0);
}

/**
 * Next auto-label: the lowest "Sale N" not already taken, so closing Sale 2 and opening a new tab
 * reuses "Sale 2" instead of ever-climbing numbers (matches the JamPos reference).
 */
export function nextSessionLabel(sessions: SaleSession[]): string {
  const taken = new Set(sessions.map((s) => s.label));
  for (let n = 1; n <= sessions.length + 1; n++) {
    const label = `Sale ${n}`;
    if (!taken.has(label)) return label;
  }
  return `Sale ${sessions.length + 1}`;
}

/**
 * Reconstruct the customer-picker selection from a tab's persisted loyalty state so the LoyaltyPanel
 * chip reflects who is attached to THIS tab after a switch/restore. Points balance/source are not
 * carried (re-fetched on demand); the attached customer + redeem stay intact for the sale itself.
 */
export function selectedFromLoyalty(ls: LoyaltyState | null | undefined): SelectedCustomer {
  if (!ls || !ls.customerName) return WALK_IN_CUSTOMER;
  return {
    phone: ls.customerPhone ?? '',
    name: ls.customerName,
    isWalkIn: false,
    accountId: ls.accountId || undefined,
    email: ls.customerEmail,
  };
}
