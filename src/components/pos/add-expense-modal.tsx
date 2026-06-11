'use client';

import { useMemo, useState } from 'react';
import { Receipt, Store, CreditCard, X } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import {
  useAddExpense,
  useExpenseCategories,
  useExpenseAccounts,
} from '@/hooks/usePOS';

interface AddExpenseModalProps {
  open: boolean;
  onClose: () => void;
}

const inputClass =
  'w-full mt-1 bg-background border border-border rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60';
const labelClass = 'text-xs font-medium text-muted-foreground';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// AddExpenseModal records an expense from the register (the GoDigital "Add Expense" flow).
// It posts straight to treasury via pos-api; money never moves through the till here.
// The form mirrors GoDigital: location, category, reference, date, "expense for", tax,
// total, note, and a payment block. Dropdown data (categories/accounts) is loaded from
// treasury and degrades gracefully (optional) when nothing is configured.
export function AddExpenseModal({ open, onClose }: AddExpenseModalProps) {
  const outlet = useAuthStore((s) => s.outlet);

  // Core fields
  const [categoryId, setCategoryId] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [date, setDate] = useState(todayISO());
  const [expenseFor, setExpenseFor] = useState('');
  const [taxRate, setTaxRate] = useState(''); // percent
  const [total, setTotal] = useState('');
  const [note, setNote] = useState('');

  // Payment block
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paidOn, setPaidOn] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [accountId, setAccountId] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  const addExpense = useAddExpense();
  const categories = useExpenseCategories();
  const accounts = useExpenseAccounts();

  const totalNum = parseFloat(total) || 0;
  const taxRateNum = parseFloat(taxRate) || 0;
  // Treasury treats `amount` as the net and computes total = amount + tax. The GoDigital
  // "Total amount" is the gross the cashier enters; derive the tax portion from the rate so
  // amount = total / (1 + rate) and the stored total matches what was typed.
  const taxAmount = useMemo(
    () => (taxRateNum > 0 ? +(totalNum - totalNum / (1 + taxRateNum / 100)).toFixed(2) : 0),
    [totalNum, taxRateNum],
  );
  const netAmount = useMemo(() => +(totalNum - taxAmount).toFixed(2), [totalNum, taxAmount]);

  if (!open) return null;

  function reset() {
    setCategoryId('');
    setReferenceNo('');
    setDate(todayISO());
    setExpenseFor('');
    setTaxRate('');
    setTotal('');
    setNote('');
    setPaymentAmount('');
    setPaidOn(todayISO());
    setPaymentMethod('cash');
    setAccountId('');
    setPaymentNote('');
  }

  async function handleSubmit() {
    if (!note.trim() || !(totalNum > 0)) {
      toast.error('Enter an expense note and a positive total amount');
      return;
    }
    try {
      await addExpense.mutateAsync({
        description: note.trim(),
        amount: netAmount > 0 ? netAmount : totalNum,
        tax_amount: taxAmount,
        tax_rate: taxRateNum || undefined,
        category_id: categoryId || undefined,
        reference_no: referenceNo.trim() || undefined,
        expense_date: date || undefined,
        account_id: accountId || undefined,
        expense_for: expenseFor.trim() || undefined,
        payment_method: paymentMethod || undefined,
        paid_on: paidOn || undefined,
        payment_note: paymentNote.trim() || undefined,
        payment_amount: parseFloat(paymentAmount) || undefined,
      });
      toast.success('Expense recorded');
      reset();
      onClose();
    } catch {
      toast.error('Failed to record expense');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-border shrink-0">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Receipt className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-base">Add Expense</h2>
            <p className="text-xs text-muted-foreground">Records an expense to the books</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="overflow-y-auto p-5 space-y-5">
          {/* Business Location (read-only, current outlet) */}
          <div>
            <label className={labelClass}>Business Location</label>
            <div className="mt-1 flex items-center gap-2 bg-muted/50 border border-border rounded-xl py-2.5 px-3 text-sm">
              <Store className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">{outlet?.name || 'Current outlet'}</span>
            </div>
          </div>

          {/* Category + Reference */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Expense Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={cn(inputClass, 'appearance-none')}
                disabled={categories.isLoading}
              >
                <option value="">
                  {categories.isLoading
                    ? 'Loading…'
                    : (categories.data?.length ?? 0) === 0
                      ? 'No categories configured'
                      : 'Select a category'}
                </option>
                {categories.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Reference No</label>
              <input
                type="text"
                placeholder="Leave empty to autogenerate"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Date + Expense for */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Expense for (optional)</label>
              <input
                type="text"
                placeholder="e.g. supplier / staff name"
                value={expenseFor}
                onChange={(e) => setExpenseFor(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Tax + Total */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Applicable Tax (%)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Total amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                className={inputClass}
              />
              {taxAmount > 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Net {netAmount.toFixed(2)} + tax {taxAmount.toFixed(2)}
                </p>
              )}
            </div>
          </div>

          {/* Expense note */}
          <div>
            <label className={labelClass}>Expense note</label>
            <textarea
              rows={2}
              placeholder="e.g. Cleaning supplies for the back office"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={cn(inputClass, 'resize-none')}
            />
          </div>

          {/* Payment block */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Payment</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Paid on</label>
                <input
                  type="date"
                  value={paidOn}
                  onChange={(e) => setPaidOn(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className={cn(inputClass, 'appearance-none')}
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="mpesa">M-Pesa</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Payment Account</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className={cn(inputClass, 'appearance-none')}
                  disabled={accounts.isLoading}
                >
                  <option value="">
                    {accounts.isLoading
                      ? 'Loading…'
                      : (accounts.data?.length ?? 0) === 0
                        ? 'No accounts configured'
                        : 'Select an account'}
                  </option>
                  {accounts.data?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code ? `${a.code} — ${a.name}` : a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass}>Payment note (optional)</label>
              <input
                type="text"
                placeholder="Reference / memo"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={addExpense.isPending}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={addExpense.isPending}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            {addExpense.isPending ? 'Saving…' : 'Add Expense'}
          </button>
        </div>
      </div>
    </div>
  );
}
