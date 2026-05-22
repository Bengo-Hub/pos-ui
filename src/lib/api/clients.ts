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

function base(tenantID: string) {
  return `/api/v1/${tenantID}/pos`;
}

export const clientsApi = {
  searchAccounts: (tenantID: string, phone?: string, name?: string) =>
    apiClient.get<{ accounts: LoyaltyAccount[]; total: number }>(
      `${base(tenantID)}/loyalty/accounts`,
      { phone, name }
    ),

  getAccount: (tenantID: string, accountID: string) =>
    apiClient.get<LoyaltyAccount>(`${base(tenantID)}/loyalty/accounts/${accountID}`),
};
