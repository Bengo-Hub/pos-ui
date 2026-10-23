// Labels + colour bands for the actions the audit log records (pos-api internal/audit callers).
export const ACTION_META: Record<string, { label: string; cls: string }> = {
  'order.void': { label: 'Void', cls: 'bg-red-500/15 text-red-500' },
  'order.delete': { label: 'Sale deleted', cls: 'bg-red-500/15 text-red-500' },
  'order.draft_deleted': { label: 'Draft deleted', cls: 'bg-orange-500/15 text-orange-500' },
  'order.line_remove': { label: 'Line removed', cls: 'bg-orange-500/15 text-orange-500' },
  'order.line_qty_decrease': { label: 'Qty reduced', cls: 'bg-orange-500/15 text-orange-500' },
  'order.line_price_edit': { label: 'Price edited', cls: 'bg-orange-500/15 text-orange-500' },
  'price.override': { label: 'Price override', cls: 'bg-orange-500/15 text-orange-500' },
  'order.discount_override': { label: 'Discount override', cls: 'bg-orange-500/15 text-orange-500' },
  'order.edit_reduce': { label: 'Sale reduced', cls: 'bg-orange-500/15 text-orange-500' },
  'order.edit_increase': { label: 'Sale increased', cls: 'bg-blue-500/15 text-blue-500' },
  'order.edit_mixed': { label: 'Sale edited', cls: 'bg-blue-500/15 text-blue-500' },
  'order.sale_info_updated': { label: 'Sale info edited', cls: 'bg-blue-500/15 text-blue-500' },
  'order.complimentary': { label: 'Complimentary', cls: 'bg-amber-500/15 text-amber-500' },
  'order.complimentary_code_issued': { label: 'Comp code issued', cls: 'bg-amber-500/15 text-amber-500' },
  'order.reversal': { label: 'Reversal', cls: 'bg-red-500/15 text-red-500' },
  'order.offline_sync': { label: 'Offline sale synced', cls: 'bg-purple-500/15 text-purple-500' },
  'return.refund': { label: 'Refund', cls: 'bg-red-500/15 text-red-500' },
  'return.approved': { label: 'Return approved', cls: 'bg-blue-500/15 text-blue-500' },
  'return.completed': { label: 'Return completed', cls: 'bg-blue-500/15 text-blue-500' },
  'return.rejected': { label: 'Return rejected', cls: 'bg-muted text-muted-foreground' },
  'receipt.reprint': { label: 'Reprint', cls: 'bg-amber-500/15 text-amber-500' },
  'drawer.no_sale': { label: 'No-sale', cls: 'bg-yellow-500/15 text-yellow-600' },
  'drawer.pay_in': { label: 'Pay-in', cls: 'bg-blue-500/15 text-blue-500' },
  'drawer.pay_out': { label: 'Pay-out', cls: 'bg-red-500/15 text-red-500' },
  'drawer.cash_drop': { label: 'Cash drop', cls: 'bg-blue-500/15 text-blue-500' },
  'auth.step_up': { label: 'Approval (PIN)', cls: 'bg-green-500/15 text-green-600' },
  'auth.step_up_card': { label: 'Approval (card)', cls: 'bg-green-500/15 text-green-600' },
  'auth.pin_login': { label: 'PIN sign-in', cls: 'bg-slate-500/15 text-slate-500' },
  'auth.pin_failed': { label: 'Failed PIN', cls: 'bg-red-500/15 text-red-500' },
};

export function actionMeta(action: string) {
  return ACTION_META[action] ?? { label: action, cls: 'bg-muted text-muted-foreground' };
}

/** Action filter groups for the trail's dropdown (values are comma lists). */
export const ACTION_FILTERS: { label: string; value: string }[] = [
  { label: 'All actions', value: '' },
  { label: 'Voids, deletes & reversals', value: 'order.void,order.delete,order.draft_deleted,order.reversal' },
  { label: 'Line removals & reductions', value: 'order.line_remove,order.line_qty_decrease,order.edit_reduce' },
  { label: 'Price & discount changes', value: 'order.line_price_edit,price.override,order.discount_override' },
  { label: 'Complimentary', value: 'order.complimentary,order.complimentary_code_issued' },
  { label: 'Returns & refunds', value: 'return.refund,return.approved,return.completed,return.rejected' },
  { label: 'Approvals', value: 'auth.step_up,auth.step_up_card' },
  { label: 'Sign-ins', value: 'auth.pin_login' },
  { label: 'Failed PINs', value: 'auth.pin_failed' },
  { label: 'Offline sales', value: 'order.offline_sync' },
  { label: 'Sale edits', value: 'order.edit_mixed,order.edit_increase,order.sale_info_updated' },
];

/** The zero user id: failed PINs that matched no staff member are recorded against it. */
export const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export function actorLabel(id: string | undefined, name: string | undefined): string {
  if (name) return name;
  if (!id || id === NIL_UUID) return 'Unknown PIN';
  return id.slice(0, 8);
}
