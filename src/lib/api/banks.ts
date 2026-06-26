import { apiClient } from './client';

/** Bank list + account verification, proxied by pos-api to treasury S2S Paystack — one source of
 *  truth so the receipt payment-display bank is verified before saving. */

export interface BankOption {
  code: string;
  name: string;
}

export const banksApi = {
  list: (tenantID: string, country = 'kenya') =>
    apiClient.get<Record<string, unknown>>(`/api/v1/${tenantID}/pos/banks/${country}`),
  resolve: (tenantID: string, accountNumber: string, bankCode: string) =>
    apiClient.get<Record<string, unknown>>(`/api/v1/${tenantID}/pos/banks/resolve`, {
      account_number: accountNumber,
      bank_code: bankCode,
    }),
};
