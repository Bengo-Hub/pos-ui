'use client';

/**
 * Terminal modal host — every dialog/overlay the order terminal can raise:
 * Add Expense, Register Details, Recent Transactions, Sell Return, Calculator (toolbar-opened),
 * Parked Sales, Modifier, Split Payment, Void Order, Receipt preview, Order Placed,
 * Manager PIN override (out-of-stock), Age Verification and Serial Number prompts.
 *
 * Extracted verbatim from the monolith order page; all gating reads from useTerminal()/cfg.
 */

import { Button } from '@/components/ui/base';
import { ModifierModal } from '@/components/pos/modifier-modal';
import { VariantPickerModal } from '@/components/pos/terminal/parts/variant-picker-modal';
import { SplitPaymentModal } from '@/components/pos/split-payment-modal';
import { VoidOrderModal } from '@/components/pos/void-order-modal';
import { AddExpenseModal } from '@/components/pos/add-expense-modal';
import { ParkedSalesModal } from '@/components/pos/parked-sales-modal';
import { HeldItemsPanel } from '@/components/pos/held-items-panel';
import { ReceiptPreview } from '@/components/pos/receipt-preview';
import { CalculatorOverlay } from '@/components/pos/calculator-overlay';
import { ApprovalDialog } from '@/components/pos/approval-dialog';
import { VoidApprovalDialog } from '@/components/pos/void-approval-dialog';
import { ChargesModal } from '@/components/pos/charges-modal';
import { ApplyDiscountModal } from '@/components/pos/discounts/apply-discount-modal';
import { OrderTaxModal } from '@/components/pos/order-tax-modal';
import { LinePriceModal } from '@/components/pos/line-price-modal';
import { OrderPlacedDialog } from '@/components/pos/order-placed-dialog';
import { RegisterDetailsModal, RecentTransactionsModal, SellReturnModal } from '@/components/pos/terminal/toolbar-modals';
import { resolveBillProfile } from '@/lib/pos/printer-stations';
import { VOID_SELF_ROLES } from '@/lib/pos/rbac-constants';
import { useTerminal } from '@/components/pos/terminal/terminal-context';
import { rbacApi } from '@/lib/api/rbac';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

export function TerminalModals() {
  const t = useTerminal();
  const { cfg } = t;
  const queryClient = useQueryClient();

  // Manager-PIN step-up state for voiding an order when the cashier is not a manager.
  const [pendingVoidReason, setPendingVoidReason] = useState<string | null>(null);

  async function finalizeVoid(reason: string, approval?: { approvalToken?: string; voidCode?: string }) {
    await t.voidOrderMutateAsync({ orderId: t.currentOrderId, reason, approvalToken: approval?.approvalToken, voidCode: approval?.voidCode });
    toast.success(`Order #${t.currentOrderNumber} voided`);
    t.setCurrentOrderId('');
    t.setCurrentOrderNumber('');
    t.clearCart();
  }

  return (
    <>
      <AddExpenseModal open={t.expenseOpen} onClose={() => t.setExpenseOpen(false)} />
      <RegisterDetailsModal open={t.registerOpen} onClose={() => t.setRegisterOpen(false)} />
      <RecentTransactionsModal open={t.recentOpen} onClose={() => t.setRecentOpen(false)} orgSlug={t.orgSlug} />
      <SellReturnModal open={t.sellReturnOpen} onClose={() => t.setSellReturnOpen(false)} orgSlug={t.orgSlug} />
      {/* Calculator is opened from the toolbar action (pos-toolbar "Calculator"); the previous
          floating FAB was a duplicate entry point and has been removed. */}
      {cfg.showCalculator && t.calcOpen && <CalculatorOverlay onClose={() => t.setCalcOpen(false)} />}

      {t.parkedOpen && <ParkedSalesModal onClose={() => t.setParkedOpen(false)} onResume={t.handleResumeParked} />}

      {/* Hospitality Parked Items (set-aside/upsell pool) — claim into any active bill or void
          with manager approval. Same panel the My Bills tab and shift-close guard use. */}
      {t.heldItemsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => t.setHeldItemsOpen(false)}>
          <div
            className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 pt-4 pb-3 border-b border-border flex items-center justify-between">
              <h3 className="text-base font-bold">Parked Items</h3>
              <button
                onClick={() => t.setHeldItemsOpen(false)}
                className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-accent"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto min-h-0">
              <HeldItemsPanel />
            </div>
          </div>
        </div>
      )}

      {t.variantItem && (
        <VariantPickerModal
          open
          onClose={() => t.setVariantItem(null)}
          item={t.variantItem}
          onConfirm={(variant, qty) => t.handleVariantChosen(t.variantItem!, variant, qty)}
        />
      )}

      {t.modifierItem && (
        <ModifierModal
          open
          onClose={() => t.setModifierItem(null)}
          itemName={t.modifierItem.name}
          basePrice={t.modifierItem.price}
          modifierGroups={t.modifierItem.modifierGroups ?? []}
          onConfirm={(selections, qty) => {
            t.addItemToCart(t.modifierItem!, selections, qty);
            t.setModifierItem(null);
          }}
        />
      )}

      <SplitPaymentModal
        open={t.paymentOpen}
        onClose={() => { t.setPaymentOpen(false); t.setResumeTotal(null); }}
        orderId={t.currentOrderId}
        orderNumber={t.currentOrderNumber}
        total={t.resumeTotal ?? t.total}
        tenantSlug={t.user?.tenant_slug ?? ''}
        tenantId={t.user?.tenant_id ?? ''}
        orderLines={t.currentOrderLines}
        isHospitality={t.isHospitality}
        customerCreditAvailable={t.customerCreditAvailable}
        loyaltyAccount={t.loyaltyRedeemInfo}
        onPaymentConfirmed={t.handlePaymentConfirmed}
        onLinesChanged={() => {
          // A line was replaced — refresh the snapshot with fresh server line ids IN PLACE so the
          // split modal stays open and keeps working (closing mid-flow was reported as a bug).
          void t.refreshCurrentOrderLines();
          queryClient.invalidateQueries({ queryKey: ['pos-orders'] });
        }}
      />

      <VoidOrderModal
        open={t.voidOpen}
        orderId={t.currentOrderId}
        orderNumber={t.currentOrderNumber}
        onClose={() => t.setVoidOpen(false)}
        onConfirm={async (reason) => {
          const role = (t.user?.roles?.[0] ?? '') as string;
          if (VOID_SELF_ROLES.includes(role)) {
            await finalizeVoid(reason);
          } else {
            // Cashier: require a manager PIN step-up before voiding.
            t.setVoidOpen(false);
            setPendingVoidReason(reason);
          }
        }}
      />

      <ApplyDiscountModal
        open={t.discountOpen}
        subtotal={t.subtotal}
        currentAmount={t.manualDiscount}
        currentReason={t.discountReason}
        onApply={t.applyDiscount}
        onClose={() => t.setDiscountOpen(false)}
      />

      <OrderTaxModal
        open={t.orderTaxOpen}
        subtotal={t.subtotal}
        currentAmount={t.orderTax}
        onApply={t.applyOrderTax}
        onClose={() => t.setOrderTaxOpen(false)}
      />

      <ChargesModal
        open={t.chargesOpen}
        current={t.charges}
        onApply={t.applyCharges}
        onClose={() => t.setChargesOpen(false)}
      />

      {/* Manager approval for over-limit discount / price override / order adjustment. Reuses the
          SAME 3-mode dialog as hospitality voids (scan card · PIN · one-time code the manager
          generated remotely) — retail managers get the OTP/code path too, not just live PIN. */}
      {t.pendingApprovalAction && (
        <ApprovalDialog
          open
          action={t.pendingApprovalAction}
          description={
            t.pendingApprovalAction === 'price.override'
              ? 'A manager must approve this price override.'
              : t.pendingApprovalAction === 'order.adjustment'
                ? 'A manager must approve this order adjustment.'
                : 'A manager must approve this discount.'
          }
          confirmLabel="Approve"
          onClose={() => t.setPendingApprovalAction(null)}
          onApproved={t.confirmApproval}
        />
      )}

      <LinePriceModal
        open={t.priceEditIndex !== null}
        item={t.priceEditIndex !== null ? t.cart[t.priceEditIndex] : null}
        canDiscount={t.can('pos.orders.manage')}
        requireApprovalBelowBase={t.posSettings?.require_approval_below_base ?? true}
        onApply={(price, reason) => t.priceEditIndex !== null && t.setLinePrice(t.priceEditIndex, price, reason)}
        onClose={() => t.setPriceEditIndex(null)}
      />

      <VoidApprovalDialog
        open={pendingVoidReason !== null}
        orderNumber={t.currentOrderNumber}
        onClose={() => setPendingVoidReason(null)}
        onApproved={async (approval) => {
          const reason = pendingVoidReason ?? '';
          setPendingVoidReason(null);
          await finalizeVoid(reason, approval);
        }}
      />

      <ReceiptPreview
        receipt={t.receiptData}
        open={t.receiptOpen}
        onClose={t.handleReceiptClose}
        printerProfile={resolveBillProfile((t.posSettings as any)?.printer_profiles)}
        tenantId={t.user?.tenant_id ?? ''}
        orderId={t.receiptOrderId}
        // When a Local Print Agent is online, payment finalization already enqueued the receipt on
        // the SERVER print queue — client auto-printing it again would double-print.
        autoPrint={Boolean((t.posSettings as any)?.auto_print_order) && !(t.posSettings as any)?.print_agent_online}
      />

      <OrderPlacedDialog
        open={t.orderPlacedOpen}
        orderNumber={t.orderPlacedNumber}
        orderId={t.orderPlacedId}
        tenantId={t.user?.tenant_id ?? ''}
        orgSlug={t.orgSlug}
        onClose={() => t.setOrderPlacedOpen(false)}
        autoLogout={t.autoLogoutAfterSale}
      />

      {/* Manager override — out-of-stock add interception (retail/pharmacy). Same 3-mode dialog as
          hospitality (scan · PIN · one-time code): scan/PIN do a live audited step-up; the code
          path lets an off-site manager authorise by sharing a one-time code. */}
      {t.pendingOverride && (
        <ApprovalDialog
          open
          action="catalog.oos_override"
          description={`A manager must approve to override out-of-stock for ${t.pendingOverride.name}.`}
          confirmLabel="Approve override"
          onClose={() => t.setPendingOverride(null)}
          onApproved={async (approval) => {
            const item = t.pendingOverride!;
            // scan/PIN already did a live step-up (verified). The one-time CODE path is not yet
            // verified — redeem it server-side before allowing the out-of-stock add.
            if (approval.code && !approval.approvalToken) {
              try {
                const res = await rbacApi.verifyApprovalCode(
                  t.user?.tenant_id ?? '', 'catalog.oos_override', approval.code,
                  t.outlet?.id ?? '',
                );
                if (!res?.approved) { toast.error('Invalid or expired approval code'); return; }
              } catch { toast.error('Invalid or expired approval code'); return; }
            }
            t.setPendingOverride(null);
            // Override approved — continue the normal add flow (serial/modifier/age still apply).
            if (item.requiresAgeVerification || item.trackSerialNumber || item.modifierGroups?.length) {
              t.proceedWithItem(item);
            } else {
              t.addItemToCart(item);
            }
          }}
        />
      )}

      {/* Age Verification */}
      {t.agePrompt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm p-6 shadow-2xl text-center">
            <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
            </div>
            <h3 className="text-lg font-bold mb-2">Age Verification Required</h3>
            <p className="text-sm text-muted-foreground mb-6">
              <strong>{t.agePrompt.item.name}</strong> requires age verification. Confirm customer is 18+?
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 min-h-12" onClick={() => t.setAgePrompt(null)}>
                Cancel
              </Button>
              <Button className="flex-1 min-h-12" onClick={t.agePrompt.callback}>
                Confirm 18+
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Serial Number */}
      {t.serialPrompt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-1">Serial Number Required</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Enter serial number for <strong>{t.serialPrompt.item.name}</strong>
            </p>
            <input
              value={t.serialInput}
              onChange={(e) => t.setSerialInput(e.target.value)}
              placeholder="Enter serial number…"
              className="w-full bg-background border border-border rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 mb-4 font-mono"
              autoFocus
            />
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 min-h-12"
                onClick={() => {
                  t.setSerialPrompt(null);
                  t.setSerialInput('');
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 min-h-12"
                disabled={!t.serialInput.trim()}
                onClick={() => {
                  t.serialPrompt!.callback(t.serialInput.trim());
                  t.setSerialInput('');
                }}
              >
                Add Item
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
