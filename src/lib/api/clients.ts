import { apiClient } from './client';

// NOTE: the customer DIRECTORY (list/manage/balances/credit terms) is centralized on the
// treasury Customers page — POS links out to it from the nav. This module only backs the
// in-terminal customer picker (search + quick-create via loyalty accounts).

export interface LoyaltyAccount {
  /** Empty string for CRM-only rows merged into search results (source === 'crm'). */
  id: string;
  tenant_id: string;
  customer_id?: string;
  customer_phone: string;
  customer_name: string;
  customer_email?: string;
  crm_contact_id?: string;
  points_balance: number;
  lifetime_points: number;
  program_id?: string;
  created_at: string;
  updated_at: string;
  /** 'crm' — a CRM contact with no loyalty account yet (search merge); undefined — real loyalty account. */
  source?: string;
}

/** Search params for the customer picker — the backend matches each as a substring. */
export interface CustomerSearchParams {
  phone?: string;
  name?: string;
  email?: string;
}

/**
 * classifySearchQuery routes one free-text query to the right search param (QA req 2:
 * search by name, phone OR email everywhere): contains "@" → email; mostly digits with
 * ≥7 of them → phone; anything else → name.
 */
export function classifySearchQuery(q: string): CustomerSearchParams {
  const query = q.trim();
  if (!query) return {};
  if (query.includes('@')) return { email: query };
  const digits = query.replace(/\D/g, '');
  if (digits.length >= 7 && /^[\d\s+\-()]+$/.test(query)) return { phone: query };
  return { name: query };
}

function base(tenantID: string) {
  return `/api/v1/${tenantID}/pos`;
}

export const clientsApi = {
  // The loyalty-accounts list endpoint returns a paginated envelope `{ data, total, page, limit }`
  // (NOT `{ accounts }`). Read `data` (falling back to `accounts`/array) and re-expose it as
  // `accounts` so callers get a stable shape — reading `.accounts` off the raw envelope always
  // yielded undefined, which is why customer search reported "not found" for real customers.
  searchAccounts: (tenantID: string, phone?: string, name?: string, email?: string) =>
    apiClient
      .get<{ data?: LoyaltyAccount[]; accounts?: LoyaltyAccount[]; total?: number } | LoyaltyAccount[]>(
        `${base(tenantID)}/loyalty/accounts`,
        { phone, name, email }
      )
      .then((res) => {
        const accounts = Array.isArray(res) ? res : res.data ?? res.accounts ?? [];
        const total = Array.isArray(res) ? res.length : res.total ?? accounts.length;
        return { accounts, total };
      }),
};
