/**
 * Hotel desk tenders (folio settlement and pay-upfront check-in). The desk takes the same manual
 * codes as the till, with the same checks (pos-api handlers.checkDeskTender): an M-Pesa code must
 * be present, MTN MoMo and Airtel Money IDs need the transaction ID shape, Other needs a label.
 * MTN and Airtel show only where the outlet has that network's number (owner decision 2026-11-12).
 */

import { isValidManualCode, isValidPaymentLabel, outletOffersNetwork, PAYMENT_LABEL_MAX } from '@/lib/pos/terminal-actions';

export type HotelTenderKey = 'cash' | 'card_manual' | 'mpesa' | 'mtn_momo_manual' | 'airtel_money_manual' | 'other_manual';

type NetworkSettings = { mtn_momo_number?: string | null; airtel_money_number?: string | null } | null | undefined;

/** The desk tenders in display order for this outlet. */
export function hotelTenderKeys(settings: NetworkSettings): HotelTenderKey[] {
  const keys: HotelTenderKey[] = ['cash', 'card_manual', 'mpesa'];
  if (outletOffersNetwork('mtn_momo_manual', settings)) keys.push('mtn_momo_manual');
  if (outletOffersNetwork('airtel_money_manual', settings)) keys.push('airtel_money_manual');
  keys.push('other_manual');
  return keys;
}

/** What the desk must capture besides the amount. */
export function hotelTenderNeeds(method: string): 'code' | 'label' | 'none' {
  if (method === 'mpesa' || method === 'mtn_momo_manual' || method === 'airtel_money_manual') return 'code';
  if (method === 'other_manual') return 'label';
  return 'none';
}

const NETWORK: Record<string, { tender: 'mpesa_manual' | 'mtn_momo_manual' | 'airtel_money_manual'; name: string }> = {
  mpesa: { tender: 'mpesa_manual', name: 'M-Pesa' },
  mtn_momo_manual: { tender: 'mtn_momo_manual', name: 'MTN MoMo' },
  airtel_money_manual: { tender: 'airtel_money_manual', name: 'Airtel Money' },
};

/** The message to show before sending, or null when the payment can be sent. */
export function hotelTenderError(method: string, reference: string, label: string): string | null {
  const need = hotelTenderNeeds(method);
  if (need === 'code') {
    const n = NETWORK[method];
    if (!reference.trim()) return `Enter the ${n.name} transaction code.`;
    if (!isValidManualCode(n.tender, reference)) {
      return `${n.name} transaction ID must be 6 to 30 letters or digits (dots and dashes allowed).`;
    }
  }
  if (need === 'label' && !isValidPaymentLabel(label)) {
    return `Say how the guest paid (2 to ${PAYMENT_LABEL_MAX} characters).`;
  }
  return null;
}
