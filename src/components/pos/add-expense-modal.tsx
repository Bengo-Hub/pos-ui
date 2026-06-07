'use client';

import { useState } from 'react';
import { Receipt } from 'lucide-react';
import { toast } from 'sonner';

import { useAddExpense } from '@/hooks/usePOS';

interface AddExpenseModalProps {
  open: boolean;
  onClose: () => void;
}

// AddExpenseModal records a petty-cash expense from the register (the godigital "Add Expense" flow).
// It posts straight to treasury via pos-api; money never moves through the till here.
export function AddExpenseModal({ open, onClose }: AddExpenseModalProps) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const addExpense = useAddExpense();

  if (!open) return null;

  async function handleSubmit() {
    const amt = parseFloat(amount);
    if (!description.trim() || !(amt > 0)) {
      toast.error('Enter a description and a positive amount');
      return;
    }
    try {
      await addExpense.mutateAsync({ description: description.trim(), amount: amt });
      toast.success('Expense recorded');
      setDescription('');
      setAmount('');
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
        className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Receipt className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-base">Add Expense</h2>
            <p className="text-xs text-muted-foreground">Records a petty-cash expense to the books</p>
          </div>
        </div>

        <div className="space-y-3 mb-5">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <input
              type="text"
              placeholder="e.g. Cleaning supplies"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full mt-1 bg-background border border-border rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Amount</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full mt-1 bg-background border border-border rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        <div className="flex gap-3">
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
