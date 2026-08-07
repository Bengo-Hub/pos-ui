/**
 * Currency API — proxied through pos-api to treasury's centralized, KES-pivoted conversion
 * service (see internal/modules/treasury/client.go ConvertCurrency/ListSupportedCurrencies).
 */
import { apiClient } from './client';

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  decimal_places: number;
}

export interface ConvertCurrencyResponse {
  from: string;
  to: string;
  amount: string;
  converted: string;
}

export function listSupportedCurrencies(tenantID: string): Promise<{ currencies: CurrencyInfo[] }> {
  return apiClient.get<{ currencies: CurrencyInfo[] }>(`/api/v1/${tenantID}/pos/currency/currencies`);
}

export function convertCurrency(tenantID: string, from: string, to: string, amount: number | string): Promise<ConvertCurrencyResponse> {
  return apiClient.get<ConvertCurrencyResponse>(`/api/v1/${tenantID}/pos/currency/convert`, { from, to, amount: String(amount) });
}
