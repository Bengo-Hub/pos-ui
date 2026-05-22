'use client';

import { Search, X } from 'lucide-react';

interface ClientSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function ClientSearchBar({ value, onChange, placeholder = 'Search by phone or name…' }: ClientSearchBarProps) {
  return (
    <div className="relative group">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 bg-card border border-border rounded-xl pl-10 pr-9 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/10 transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
