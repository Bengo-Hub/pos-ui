'use client';

/**
 * CreateLayawayModal — the "New Layaway Plan" form (QA req 7), extracted from the layaway page:
 * - Outlet combobox defaulted to the logged-in user's outlet (was missing entirely — the
 *   backend requires outlet_id, so creation used to 400).
 * - Customer party uses the shared CustomerSearch (search by name/phone/email FIRST; the
 *   add-new form only appears when nothing matches). New customers are created as loyalty
 *   accounts, which pos-api auto-syncs to MarketFlow CRM under the tenant — same model as
 *   treasury quotations.
 * - Staff party (fund-from-salary, premium) unchanged.
 */

import { Button } from '@/components/ui/base';
import { CustomerSearch, type SelectedCustomer } from '@/components/pos/customer-search';
import { useCreateLayaway, type CreateLayawayInput, type LayawayPlan } from '@/hooks/useLayaway';
import { useStaffAdmin } from '@/hooks/useStaff';
import { useAuthStore } from '@/store/auth';
import { useOutletFilterStore } from '@/store/outlet-filter';
import { cn } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api/error-message';
import { FeatureLock, useFeatureUpgrade } from '@bengo-hub/shared-ui-lib/subscription';
import { Loader2, User, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

const STAFF_CREDIT_FEATURE = 'staff_fund_from_salary';

interface CreateLayawayModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (plan: LayawayPlan) => void;
}

export function CreateLayawayModal({ open, onClose, onCreated }: CreateLayawayModalProps) {
  const tenantId = useAuthStore((s) => s.user?.tenant_id ?? '');
  const authOutlet = useAuthStore((s) => s.outlet);
  const outlets = useOutletFilterStore((s) => s.outlets);

  // Branch options: every tenant outlet for HQ users; locked users still get their own outlet.
  const outletOptions = useMemo(() => {
    if (outlets.length > 0) return outlets;
    return authOutlet ? [{ id: authOutlet.id, code: '', name: authOutlet.name ?? 'My outlet' }] : [];
  }, [outlets, authOutlet]);

  const createLayaway = useCreateLayaway();
  const [outletId, setOutletId] = useState(() => authOutlet?.id ?? outletOptions[0]?.id ?? '');
  const [customer, setCustomer] = useState<SelectedCustomer | null>(null);
  const [partyType, setPartyType] = useState<'customer' | 'staff'>('customer');
  const [staffId, setStaffId] = useState('');
  const [fundFromSalary, setFundFromSalary] = useState(false);
  const [months, setMonths] = useState(1);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  const { data: staffResp } = useStaffAdmin(tenantId);
  const staff: any[] = Array.isArray(staffResp) ? staffResp : ((staffResp as any)?.data ?? []);
  const staffCredit = useFeatureUpgrade(STAFF_CREDIT_FEATURE);

  if (!open) return null;

  const reset = () => {
    setCustomer(null);
    setPartyType('customer');
    setStaffId('');
    setFundFromSalary(false);
    setMonths(1);
    setTotalAmount(0);
    setDepositAmount(0);
    setDueDate('');
    setNotes('');
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveOutlet = outletId || authOutlet?.id || '';
    if (!effectiveOutlet) {
      toast.error('Select the branch/outlet for this layaway');
      return;
    }
    if (!totalAmount || !depositAmount) {
      toast.error('Total and deposit amounts are required');
      return;
    }
    if (partyType === 'staff' && !staffId) {
      toast.error('Please select a staff member');
      return;
    }
    if (partyType === 'customer' && (!customer || customer.isWalkIn || !customer.accountId)) {
      toast.error('Search and select a customer (or add a new one) — walk-in layaways are not allowed');
      return;
    }

    const selectedStaff = staff.find((s: any) => s.id === staffId);
    const payload: CreateLayawayInput = {
      outlet_id: effectiveOutlet,
      customer_name: partyType === 'staff' ? (selectedStaff?.name ?? '') : (customer?.name ?? ''),
      total_amount: Number(totalAmount),
      deposit_amount: Number(depositAmount),
    };
    if (partyType === 'customer' && customer) {
      if (customer.phone) payload.customer_phone = customer.phone;
      if (customer.email) payload.customer_email = customer.email;
      payload.loyalty_account_id = customer.accountId;
    }
    if (dueDate) payload.due_date = dueDate;
    if (notes) payload.notes = notes;
    if (partyType === 'staff') {
      payload.party_type = 'staff';
      payload.staff_member_id = staffId;
      // Fund-from-salary is only sent when the tenant is entitled (the toggle is locked otherwise).
      if (fundFromSalary && !staffCredit.locked) {
        payload.fund_from_salary = true;
        payload.installment_months = Math.max(1, months);
      }
    }

    createLayaway.mutate(payload, {
      onSuccess: (plan) => {
        toast.success('Layaway plan created');
        reset();
        onCreated(plan);
      },
      onError: async (err) => toast.error(await apiErrorMessage(err, 'Failed to create layaway plan')),
    });
  };

  const inputCls =
    'w-full bg-background border border-border rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-base">New Layaway Plan</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Set up a customer payment plan</p>
          </div>
          <button onClick={close} className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          {/* Branch/outlet — defaults to the logged-in user's outlet (QA req 7a) */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
              Branch / Outlet <span className="text-destructive">*</span>
            </label>
            <select value={outletId} onChange={(e) => setOutletId(e.target.value)} className={inputCls}>
              {outletOptions.length === 0 && <option value="">— No outlet —</option>}
              {outletOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          {/* Party: existing customer vs staff member (funded from salary) */}
          <div className="grid grid-cols-2 gap-2">
            {([['customer', 'Customer', User], ['staff', 'Staff', Users]] as const).map(([val, label, Icon]) => (
              <button
                key={val}
                type="button"
                onClick={() => { setPartyType(val); if (val === 'customer') { setStaffId(''); setFundFromSalary(false); } }}
                className={cn(
                  'flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold border transition-colors',
                  partyType === val ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          {partyType === 'staff' ? (
            <>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Staff Member <span className="text-destructive">*</span>
                </label>
                <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className={inputCls}>
                  <option value="">— Select staff —</option>
                  {staff.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}{s.role ? ` · ${s.role}` : ''}</option>
                  ))}
                </select>
              </div>
              {/* Staff: fund the balance from salary (premium — visible + upgrade-gated, never hidden) */}
              <FeatureLock feature={STAFF_CREDIT_FEATURE} mode="overlay">
                <div className="rounded-xl border border-border bg-accent/20 p-3 space-y-3">
                  <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fundFromSalary}
                      onChange={(e) => setFundFromSalary(e.target.checked)}
                      className="rounded"
                    />
                    Fund from salary (recover via payroll deductions)
                  </label>
                  {fundFromSalary && (
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Spread over (payroll periods)</label>
                      <input
                        type="number"
                        min={1}
                        max={36}
                        value={months}
                        onChange={(e) => setMonths(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-28 bg-background border border-border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                  )}
                </div>
              </FeatureLock>
            </>
          ) : (
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                Customer <span className="text-destructive">*</span>
              </label>
              {/* Search-first by name/phone/email; the add-new form only appears when nothing
                  matches. New customers are CRM-synced via the loyalty-account create. */}
              <CustomerSearch
                value={customer}
                onChange={setCustomer}
                requireRealCustomer
                requiredForLabel="a layaway plan"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                Total (KES) <span className="text-destructive">*</span>
              </label>
              <input
                required type="number" min="0"
                value={totalAmount || ''}
                onChange={(e) => setTotalAmount(e.target.valueAsNumber || 0)}
                placeholder="0"
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                Deposit (KES) <span className="text-destructive">*</span>
              </label>
              <input
                required type="number" min="0"
                value={depositAmount || ''}
                onChange={(e) => setDepositAmount(e.target.valueAsNumber || 0)}
                placeholder="0"
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Due Date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes…"
              className={cn(inputCls, 'resize-none')}
            />
          </div>
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1 min-h-11" onClick={close} disabled={createLayaway.isPending}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 min-h-11" disabled={createLayaway.isPending}>
              {createLayaway.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create Plan
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
