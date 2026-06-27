'use client';

/**
 * On-screen keyboards for the POS PIN-login card (presentational only).
 *
 * Holds NO state, queries or mutations — every handler is passed in from the
 * page so all auth logic stays in `app/[orgSlug]/pin-login/page.tsx`. Split out
 * of `pin-login-ui.tsx` purely to keep both files under the length budget.
 *
 * Two keyboards:
 *  - <QwertyKeyboard>  full on-screen QWERTY (white keys on the light panel).
 *  - <NumericKeypad>   7-8-9 / 4-5-6 / 1-2-3 / 0 + CLEAR (brand-coloured keys).
 *
 * Colours map to tenant branding: numeric/primary keys use hsl(var(--primary))
 * → hsl(var(--primary-dark)); CLEAR uses the destructive token; QWERTY keys are
 * white. None of the reference design's literal blue/green is hardcoded.
 */

import React from 'react';
import { ArrowBigUp, CornerDownLeft, Delete } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Numeric keypad ───────────────────────────────────────────────────────────
// Brand-coloured tactile number keys (7-8-9 / 4-5-6 / 1-2-3 / 0) with a
// destructive CLEAR key + backspace on the bottom row. RIGHT zone of the login
// card (numeric keys = hsl(var(--primary)); CLEAR = the destructive token).

const KEYPAD_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'clear', '0', 'del'] as const;

export interface PinKeypadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  disabled: boolean;
  /** True while the 4th digit is submitting — render a pulse on number keys. */
  isSubmitting: boolean;
  digitsLength: number;
  pinLength: number;
}

export function PinKeypad({
  onDigit, onBackspace, onClear, disabled, isSubmitting, digitsLength, pinLength,
}: PinKeypadProps) {
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:gap-3 w-full">
      {KEYPAD_KEYS.map((key, i) => {
        if (key === 'del') {
          return (
            <button
              key={i}
              onClick={onBackspace}
              disabled={disabled || digitsLength === 0}
              aria-label="Delete"
              className={cn(
                'h-14 sm:h-16 rounded-2xl flex items-center justify-center transition-all duration-100 touch-manipulation',
                'bg-slate-100 border border-slate-200 text-slate-500',
                'hover:bg-slate-200 hover:text-slate-700 active:scale-95',
                'shadow-sm disabled:opacity-40 disabled:cursor-not-allowed'
              )}
            >
              <Delete className="h-6 w-6" />
            </button>
          );
        }
        if (key === 'clear') {
          return (
            <button
              key={i}
              onClick={onClear}
              disabled={disabled || digitsLength === 0}
              aria-label="Clear"
              data-testid="pin-key-clear"
              className={cn(
                'h-14 sm:h-16 rounded-2xl flex items-center justify-center transition-all duration-100 touch-manipulation',
                'bg-destructive/10 border border-destructive/25 text-destructive text-sm font-black uppercase tracking-wider',
                'hover:bg-destructive/15 hover:border-destructive/40 active:scale-95',
                'shadow-sm disabled:opacity-40 disabled:cursor-not-allowed'
              )}
            >
              Clear
            </button>
          );
        }
        return (
          <button
            key={i}
            data-testid={`pin-key-${key}`}
            onClick={() => onDigit(key)}
            disabled={disabled || digitsLength >= pinLength}
            className={cn(
              'h-14 sm:h-16 rounded-2xl flex items-center justify-center transition-all duration-100 touch-manipulation',
              'text-white text-2xl sm:text-3xl font-black',
              'active:scale-95',
              'shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_4px_14px_hsl(var(--primary)/0.35)]',
              'disabled:opacity-40 disabled:cursor-not-allowed'
            )}
            style={{
              background: 'linear-gradient(160deg, hsl(var(--primary)) 0%, hsl(var(--primary-dark)) 100%)',
            }}
          >
            {isSubmitting && digitsLength === pinLength ? (
              <span className="h-2.5 w-2.5 rounded-full bg-white/80 animate-pulse" />
            ) : key}
          </button>
        );
      })}
    </div>
  );
}

// ── QWERTY keyboard ──────────────────────────────────────────────────────────

const QWERTY_ROWS: string[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

export interface QwertyKeyboardProps {
  /** Append a single character (already shift-cased by the caller). */
  onKey: (char: string) => void;
  onBackspace: () => void;
  /** ENTER submits the current passcode (the shared submitPasscode path). */
  onEnter: () => void;
  shift: boolean;
  onToggleShift: () => void;
  disabled: boolean;
}

/** A reusable white QWERTY key on the light card panel. */
function KbdKey({
  label, char, onPress, disabled, className, testChar, style,
}: {
  label: React.ReactNode;
  char?: string;
  onPress: () => void;
  disabled: boolean;
  className?: string;
  /** data-testid suffix — defaults to the char. */
  testChar?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      style={style}
      data-testid={`kbd-key-${testChar ?? char}`}
      className={cn(
        'flex h-11 min-w-0 flex-1 items-center justify-center rounded-xl',
        'bg-white text-slate-700 text-sm font-semibold',
        'border border-slate-200 shadow-sm',
        'hover:bg-slate-50 hover:border-slate-300 active:scale-95',
        'transition-all duration-100 touch-manipulation select-none',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        className
      )}
    >
      {label}
    </button>
  );
}

export function QwertyKeyboard({
  onKey, onBackspace, onEnter, shift, onToggleShift, disabled,
}: QwertyKeyboardProps) {
  const cased = (c: string) => (shift ? c.toUpperCase() : c);

  return (
    <div className="flex w-full flex-col gap-1.5 sm:gap-2">
      {/* Row 1: QWERTYUIOP + backspace */}
      <div className="flex gap-1.5 sm:gap-2">
        {QWERTY_ROWS[0].map((c) => (
          <KbdKey key={c} char={c} label={cased(c)} disabled={disabled} onPress={() => onKey(cased(c))} />
        ))}
        <KbdKey
          char="backspace"
          label={<Delete className="h-4 w-4" />}
          disabled={disabled}
          onPress={onBackspace}
          className="flex-[1.4] bg-slate-100 text-slate-500"
        />
      </div>

      {/* Row 2: ASDFGHJKL + ENTER */}
      <div className="flex gap-1.5 sm:gap-2 px-3">
        {QWERTY_ROWS[1].map((c) => (
          <KbdKey key={c} char={c} label={cased(c)} disabled={disabled} onPress={() => onKey(cased(c))} />
        ))}
        <KbdKey
          char="enter"
          label={<span className="flex items-center gap-1 text-xs font-bold"><CornerDownLeft className="h-3.5 w-3.5" />Enter</span>}
          disabled={disabled}
          onPress={onEnter}
          className="flex-[2] text-white border-transparent shadow-sm hover:opacity-90"
          style={{ background: 'linear-gradient(160deg, hsl(var(--primary)) 0%, hsl(var(--primary-dark)) 100%)' }}
        />
      </div>

      {/* Row 3: SHIFT + ZXCVBNM + ,/. + SHIFT */}
      <div className="flex gap-1.5 sm:gap-2">
        <KbdKey
          char="shift-l"
          label={<ArrowBigUp className="h-4 w-4" />}
          disabled={disabled}
          onPress={onToggleShift}
          className={cn('flex-[1.6]', shift ? 'bg-primary/15 text-primary border-primary/40' : 'bg-slate-100 text-slate-500')}
        />
        {QWERTY_ROWS[2].map((c) => (
          <KbdKey key={c} char={c} label={cased(c)} disabled={disabled} onPress={() => onKey(cased(c))} />
        ))}
        <KbdKey char="comma" label="," disabled={disabled} onPress={() => onKey(',')} className="bg-slate-50" />
        <KbdKey char="period" label="." disabled={disabled} onPress={() => onKey('.')} className="bg-slate-50" />
        <KbdKey
          char="shift-r"
          label={<ArrowBigUp className="h-4 w-4" />}
          disabled={disabled}
          onPress={onToggleShift}
          className={cn('flex-[1.6]', shift ? 'bg-primary/15 text-primary border-primary/40' : 'bg-slate-100 text-slate-500')}
        />
      </div>

      {/* Row 4: wide SPACE */}
      <div className="flex gap-1.5 sm:gap-2">
        <KbdKey
          char="space"
          label={<span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">Space</span>}
          disabled={disabled}
          onPress={() => onKey(' ')}
          className="flex-1"
        />
      </div>
    </div>
  );
}
