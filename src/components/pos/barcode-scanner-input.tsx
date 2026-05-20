'use client';

import { cn } from '@/lib/utils';
import { ScanBarcode } from 'lucide-react';
import { useRef } from 'react';

interface BarcodeScannerInputProps {
  onScan: (barcode: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
}

export function BarcodeScannerInput({
  onScan,
  placeholder = 'Scan barcode…',
  autoFocus = false,
  disabled = false,
  className,
}: BarcodeScannerInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = inputRef.current?.value.trim();
      if (value) {
        onScan(value);
        if (inputRef.current) inputRef.current.value = '';
      }
    }
  };

  return (
    <div className={cn('relative group', className)}>
      <ScanBarcode className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        onKeyDown={handleKeyDown}
        className="w-full bg-card border border-border rounded-2xl py-3.5 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all font-medium placeholder:text-muted-foreground/60 disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}
