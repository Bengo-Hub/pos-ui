import { apiClient } from './client';

export interface LoyaltyAccount {
  id: string;
  tenant_id: string;
  customer_id?: string;
  customer_phone: string;
  customer_name: string;
  points_balance: number;
  lifetime_points: number;
  program_id?: string;
  created_at: string;
  updated_at: string;
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
  searchAccounts: (tenantID: string, phone?: string, name?: string) =>
    apiClient
      .get<{ data?: LoyaltyAccount[]; accounts?: LoyaltyAccount[]; total?: number } | LoyaltyAccount[]>(
        `${base(tenantID)}/loyalty/accounts`,
        { phone, name }
      )
      .then((res) => {
        const accounts = Array.isArray(res) ? res : res.data ?? res.accounts ?? [];
        const total = Array.isArray(res) ? res.length : res.total ?? accounts.length;
        return { accounts, total };
      }),

  getAccount: (tenantID: string, accountID: string) =>
    apiClient.get<LoyaltyAccount>(`${base(tenantID)}/loyalty/accounts/${accountID}`),

  getClientOrders: (tenantID: string, phone: string, page = 1, limit = 20) =>
    apiClient.get<{ data: ClientOrder[]; total: number; page: number; limit: number }>(
      `${base(tenantID)}/clients/${encodeURIComponent(phone)}/orders`,
      { page, limit }
    ),
};
