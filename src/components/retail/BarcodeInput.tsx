'use client';

import { cn } from '@/lib/utils';
import { Camera } from 'lucide-react';
import { useRef, useEffect, useCallback } from 'react';

interface BarcodeInputProps {
  onScan: (barcode: string) => void;
  placeholder?: string;
  loading?: boolean;
  className?: string;
}

export function BarcodeInput({
  onScan,
  placeholder = 'Scan or type barcode…',
  loading = false,
  className,
}: BarcodeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.trim();
      if (!value) return;

      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(() => {
        if (value) {
          onScan(value);
          if (inputRef.current) inputRef.current.value = '';
        }
      }, 300);
    },
    [onScan],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const value = inputRef.current?.value.trim();
      if (value) {
        onScan(value);
        if (inputRef.current) inputRef.current.value = '';
      }
    }
  };

  const handleScanButton = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const value = inputRef.current?.value.trim();
    if (value) {
      onScan(value);
      if (inputRef.current) inputRef.current.value = '';
    }
    inputRef.current?.focus();
  };

  return (
    <div className={cn('relative group flex items-center gap-2', className)}>
      <div className="relative flex-1">
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          disabled={loading}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          className="w-full bg-card border border-border rounded-2xl py-3.5 pl-4 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all font-medium placeholder:text-muted-foreground/60 disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>
      <button
        type="button"
        onClick={handleScanButton}
        disabled={loading}
        className="h-12 w-12 flex items-center justify-center rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        title="Scan"
      >
        {loading ? (
          <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
        ) : (
          <Camera className="h-5 w-5" />
        )}
      </button>
    </div>
  );
}
