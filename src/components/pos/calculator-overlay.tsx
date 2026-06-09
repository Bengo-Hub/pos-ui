'use client';

import { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * On-screen calculator for the retail/pharmacy terminal (cfg.showCalculator). Lets a cashier
 * compute change / quantities without leaving the till. Pure UI — no business logic, no eval().
 */
export function CalculatorOverlay({ onClose }: { onClose: () => void }) {
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState('');

  // Evaluate a simple +-*/ expression with correct * / precedence — no eval().
  const compute = useCallback((e: string): string => {
    const tokens = e.match(/(\d+\.?\d*|[+\-*/])/g);
    if (!tokens || tokens.length === 0) return '';
    const nums: number[] = [];
    const ops: string[] = [];
    let i = 0;
    nums.push(parseFloat(tokens[i++]));
    while (i < tokens.length) {
      const op = tokens[i++];
      const n = parseFloat(tokens[i++] ?? '0');
      if (Number.isNaN(n)) break;
      if (op === '*') nums[nums.length - 1] *= n;
      else if (op === '/') nums[nums.length - 1] = n === 0 ? NaN : nums[nums.length - 1] / n;
      else { ops.push(op); nums.push(n); }
    }
    let total = nums[0];
    for (let j = 0; j < ops.length; j++) total = ops[j] === '+' ? total + nums[j + 1] : total - nums[j + 1];
    if (!Number.isFinite(total)) return 'Error';
    return String(Math.round(total * 100) / 100);
  }, []);

  const press = (k: string) => {
    if (k === 'C') { setExpr(''); setResult(''); return; }
    if (k === '=') { setResult(compute(expr)); return; }
    if (k === '⌫') { setExpr((s) => s.slice(0, -1)); return; }
    setExpr((s) => s + k);
  };

  const keys = ['C', '⌫', '/', '*', '7', '8', '9', '-', '4', '5', '6', '+', '1', '2', '3', '=', '0', '.'];

  return (
    <div className="fixed bottom-24 right-6 z-50 w-64 bg-card border border-border rounded-2xl shadow-2xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Calculator</span>
        <button type="button" onClick={onClose} className="h-6 w-6 rounded hover:bg-accent flex items-center justify-center">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="bg-muted/40 rounded-lg px-3 py-2 mb-2 text-right">
        <div className="text-xs text-muted-foreground truncate min-h-4">{expr || '0'}</div>
        <div className="text-xl font-bold tabular-nums truncate">{result || '—'}</div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className={cn(
              'h-10 rounded-lg text-sm font-semibold transition-colors',
              k === '0' && 'col-span-2',
              k === '=' ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : ['/', '*', '-', '+'].includes(k) ? 'bg-accent text-foreground hover:bg-accent/70'
                : k === 'C' ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                : 'bg-card border border-border hover:bg-accent',
            )}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
