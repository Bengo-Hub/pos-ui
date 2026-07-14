import { apiClient } from './client';

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

export interface LoyaltyTransaction {
  id: string;
  account_id: string;
  type: string;
  points: number;
  order_id?: string;
  created_at: string;
}

export interface ClientOrder {
  id: string;
  order_number?: number;
  total_amount: string;
  status: string;
  order_subtype?: string;
  created_at: string;
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

  getAccount: (tenantID: string, accountID: string) =>
    apiClient.get<LoyaltyAccount>(`${base(tenantID)}/loyalty/accounts/${accountID}`),

  // Customer DIRECTORY — CRM-backed (every known customer, loyalty member or not), paginated.
  // q filters by name/phone/email substring; empty q lists everyone newest-first.
  listCustomers: (tenantID: string, q: string | undefined, page = 1, limit = 24) =>
    apiClient.get<{ data: LoyaltyAccount[]; total: number; page: number; limit: number }>(
      `${base(tenantID)}/customers`,
      { ...(q ? { q } : {}), page, limit },
    ),

  // Loyalty MEMBERS listing (paginated) — the same /loyalty/accounts endpoint the picker uses,
  // without search params it lists every account.
  listLoyaltyMembers: (tenantID: string, params: CustomerSearchParams | undefined, page = 1, limit = 24) =>
    apiClient.get<{ data: LoyaltyAccount[]; total: number; page: number; limit: number }>(
      `${base(tenantID)}/loyalty/accounts`,
      { ...(params?.phone ? { phone: params.phone } : {}), ...(params?.name ? { name: params.name } : {}), ...(params?.email ? { email: params.email } : {}), page, limit },
    ),

  getClientOrders: (tenantID: string, phone: string, page = 1, limit = 20) =>
    apiClient.get<{ data: ClientOrder[]; total: number; page: number; limit: number }>(
      `${base(tenantID)}/clients/${encodeURIComponent(phone)}/orders`,
      { page, limit }
    ),
};
