'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface TypeaheadOption {
  value: string;
  label: string;
  hint?: string;
}

interface TypeaheadInputProps {
  /** Free-text value — unlike Combobox, this does NOT have to match an option; the user can
   *  type any value and it's used as-is (e.g. a one-off supplier/staff name). */
  value: string;
  onChange: (value: string) => void;
  options: TypeaheadOption[];
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Editable text input with a filtered suggestions dropdown — a "rich select with free-type"
 * field. Picking a suggestion fills the text with its label; the user can otherwise keep typing
 * anything (no option needs to match). Use this instead of Combobox when the underlying field is
 * a plain string (not a foreign-key id) but should still offer known values to pick from.
 */
export function TypeaheadInput({
  value,
  onChange,
  options,
  placeholder = 'Type or select…',
  emptyText = 'No matches — keep typing to use this name',
  disabled,
  className,
}: TypeaheadInputProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.hint ?? '').toLowerCase().includes(q),
    );
  }, [options, value]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <input
        type="text"
        disabled={disabled}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full bg-background border border-input rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
      />
      {open && options.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-center text-xs text-muted-foreground">{emptyText}</li>
            ) : (
              filtered.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => { onChange(o.label); setOpen(false); }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-foreground">{o.label}</span>
                      {o.hint && <span className="block truncate text-xs text-muted-foreground">{o.hint}</span>}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
