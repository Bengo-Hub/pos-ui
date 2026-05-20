'use client';

import { Button } from '@/components/ui/base';
import { X } from 'lucide-react';
import { useState, useEffect } from 'react';

interface SerialCaptureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  quantity: number;
  onConfirm: (serials: string[]) => void;
}

export function SerialCaptureModal({
  open,
  onOpenChange,
  itemName,
  quantity,
  onConfirm,
}: SerialCaptureModalProps) {
  const [serials, setSerials] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setSerials(Array(quantity).fill(''));
    }
  }, [open, quantity]);

  const allFilled = serials.length === quantity && serials.every((s) => s.trim().length > 0);

  const handleChange = (index: number, value: string) => {
    setSerials((prev) => prev.map((s, i) => (i === index ? value : s)));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-base">Serial Numbers Required</h3>
            <p className="text-sm text-muted-foreground truncate">{itemName}</p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="h-10 w-10 rounded-xl flex items-center justify-center hover:bg-accent transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {serials.map((value, i) => (
            <div key={i}>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                Serial #{i + 1}
              </label>
              <input
                value={value}
                onChange={(e) => handleChange(i, e.target.value)}
                placeholder={`Enter serial #${i + 1}…`}
                autoFocus={i === 0}
                className="w-full bg-background border border-border rounded-xl py-3 px-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>
          ))}
        </div>

        <div className="p-5 border-t border-border flex gap-3 shrink-0">
          <Button variant="outline" className="flex-1 min-h-12" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="flex-1 min-h-12"
            disabled={!allFilled}
            onClick={() => {
              if (allFilled) onConfirm(serials.map((s) => s.trim()));
            }}
          >
            Confirm {quantity > 1 ? `${quantity} Serials` : 'Serial'}
          </Button>
        </div>
      </div>
    </div>
  );
}
