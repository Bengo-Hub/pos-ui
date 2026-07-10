'use client';

import { Button } from '@/components/ui/base';
import { cn } from '@/lib/utils';
import { Check, Minus, Plus, X } from 'lucide-react';
import { useState, useMemo } from 'react';

export interface ModifierOption {
  id: string;
  name: string;
  price: number;
  isDefault?: boolean;
  /** Inventory SKU this option consumes stock from, when it has one — carried through from
   *  the catalog untouched so the order-line payload can pass it straight to pos-api without
   *  a second lookup. Absent for price-only options (e.g. "No Sauce"). */
  sku?: string;
}

export interface ModifierGroup {
  id: string;
  name: string;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  options: ModifierOption[];
}

interface ModifierModalProps {
  open: boolean;
  onClose: () => void;
  itemName: string;
  basePrice: number;
  modifierGroups: ModifierGroup[];
  onConfirm: (selections: Record<string, string[]>, quantity: number) => void;
}

export function ModifierModal({
  open,
  onClose,
  itemName,
  basePrice,
  modifierGroups,
  onConfirm,
}: ModifierModalProps) {
  const [selections, setSelections] = useState<Record<string, string[]>>(() => {
    const defaults: Record<string, string[]> = {};
    for (const group of modifierGroups) {
      const defaultOpts = group.options.filter((o) => o.isDefault).map((o) => o.id);
      if (defaultOpts.length > 0) defaults[group.id] = defaultOpts;
    }
    return defaults;
  });
  const [quantity, setQuantity] = useState(1);

  const toggleOption = (groupId: string, optionId: string, maxSelections: number) => {
    setSelections((prev) => {
      const current = prev[groupId] ?? [];
      if (current.includes(optionId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== optionId) };
      }
      if (maxSelections === 1) {
        return { ...prev, [groupId]: [optionId] };
      }
      if (current.length >= maxSelections) return prev;
      return { ...prev, [groupId]: [...current, optionId] };
    });
  };

  const modifierTotal = useMemo(() => {
    let total = 0;
    for (const group of modifierGroups) {
      const selected = selections[group.id] ?? [];
      for (const optId of selected) {
        const opt = group.options.find((o) => o.id === optId);
        if (opt) total += opt.price;
      }
    }
    return total;
  }, [selections, modifierGroups]);

  const unitPrice = basePrice + modifierTotal;
  const totalPrice = unitPrice * quantity;

  const isValid = modifierGroups.every((group) => {
    if (!group.isRequired) return true;
    const selected = selections[group.id] ?? [];
    return selected.length >= group.minSelections;
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-2xl border border-border w-full max-w-md max-h-[80vh] flex flex-col shadow-xl">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">{itemName}</h3>
            <p className="text-sm text-muted-foreground font-mono">KES {basePrice.toLocaleString()}</p>
          </div>
          <button onClick={onClose} className="h-10 w-10 rounded-xl flex items-center justify-center hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {modifierGroups.map((group) => (
            <div key={group.id}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-sm">{group.name}</h4>
                {group.isRequired && (
                  <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-medium">Required</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                {group.maxSelections === 1 ? 'Select one' : `Select ${group.minSelections}-${group.maxSelections}`}
              </p>
              <div className="space-y-1.5">
                {group.options.map((opt) => {
                  const isSelected = (selections[group.id] ?? []).includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => toggleOption(group.id, opt.id, group.maxSelections)}
                      className={cn(
                        'w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all min-h-[44px]',
                        isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                      )}
                    >
                      <span className="text-sm font-medium">{opt.name}</span>
                      <div className="flex items-center gap-2">
                        {opt.price > 0 && (
                          <span className="text-xs text-muted-foreground font-mono">+KES {opt.price.toLocaleString()}</span>
                        )}
                        {isSelected && <Check className="h-4 w-4 text-primary" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-border p-5 space-y-4">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="h-11 w-11 rounded-xl border border-border flex items-center justify-center hover:bg-accent"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="text-lg font-bold w-8 text-center">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="h-11 w-11 rounded-xl border border-border flex items-center justify-center hover:bg-accent"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <Button
            onClick={() => {
              if (isValid) onConfirm(selections, quantity);
            }}
            disabled={!isValid}
            className={cn('w-full min-h-[52px] text-base font-bold gap-2', !isValid && 'opacity-50 cursor-not-allowed')}
          >
            Add to Order — KES {totalPrice.toLocaleString()}
          </Button>
        </div>
      </div>
    </div>
  );
}
