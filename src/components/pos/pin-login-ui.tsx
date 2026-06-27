'use client';

/**
 * Presentational building blocks for the POS PIN-login screen.
 *
 * These components are PURELY presentational — they hold NO state, queries or
 * mutations. Every handler/value is passed in from the page so all auth logic
 * stays in `app/[orgSlug]/pin-login/page.tsx`. Split out only to keep the page
 * under the file-length budget.
 */

import React from 'react';
import {
  BedDouble, Building2, ChevronRight, Coffee, Delete, Pill, Scissors, Settings,
  ShoppingBag, Truck, UtensilsCrossed, Warehouse, Wine, WifiOff, Zap,
} from 'lucide-react';
import { LiveClock } from '@/components/pos/live-clock';
import { cn } from '@/lib/utils';

// ── Shared use-case presentation maps (labels / colours / icons) ─────────────

export const USE_CASE_LABELS: Record<string, string> = {
  hospitality:   'Hospitality',
  quick_service: 'Quick Service',
  retail:        'Retail',
  pharmacy:      'Pharmacy',
  services:      'Services',
  cafe:          'Café',
  bar:           'Bar',
  hotel:         'Hotel',
  warehouse:     'Warehouse',
};

export const USE_CASE_COLORS: Record<string, { bg: string; text: string; accent: string; glow: string }> = {
  hospitality:   { bg: 'bg-amber-500/20',   text: 'text-amber-300',   accent: '#f59e0b', glow: 'hover:shadow-amber-500/15' },
  quick_service: { bg: 'bg-blue-500/20',    text: 'text-blue-300',    accent: '#3b82f6', glow: 'hover:shadow-blue-500/15' },
  retail:        { bg: 'bg-violet-500/20',  text: 'text-violet-300',  accent: '#8b5cf6', glow: 'hover:shadow-violet-500/15' },
  pharmacy:      { bg: 'bg-emerald-500/20', text: 'text-emerald-300', accent: '#10b981', glow: 'hover:shadow-emerald-500/15' },
  services:      { bg: 'bg-teal-500/20',    text: 'text-teal-300',    accent: '#14b8a6', glow: 'hover:shadow-teal-500/15' },
  cafe:          { bg: 'bg-orange-500/20',  text: 'text-orange-300',  accent: '#f97316', glow: 'hover:shadow-orange-500/15' },
  bar:           { bg: 'bg-purple-500/20',  text: 'text-purple-300',  accent: '#a855f7', glow: 'hover:shadow-purple-500/15' },
  hotel:         { bg: 'bg-sky-500/20',     text: 'text-sky-300',     accent: '#0ea5e9', glow: 'hover:shadow-sky-500/15' },
  warehouse:     { bg: 'bg-slate-500/20',   text: 'text-slate-300',   accent: '#94a3b8', glow: 'hover:shadow-slate-500/15' },
  logistics:     { bg: 'bg-cyan-500/20',    text: 'text-cyan-300',    accent: '#06b6d4', glow: 'hover:shadow-cyan-500/15' },
};

export const USE_CASE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  hospitality:   UtensilsCrossed,
  quick_service: Zap,
  retail:        ShoppingBag,
  pharmacy:      Pill,
  services:      Scissors,
  cafe:          Coffee,
  bar:           Wine,
  hotel:         BedDouble,
  warehouse:     Warehouse,
  logistics:     Truck,
};

// ── Outlet selection card (presentational) ───────────────────────────────────

export interface OutletCardData {
  id: string;
  name: string;
  use_case?: string;
  is_hq?: boolean;
}

export function OutletCard({
  outlet, index, onSelect,
}: {
  outlet: OutletCardData;
  index: number;
  onSelect: () => void;
}) {
  const color = (outlet.use_case ? USE_CASE_COLORS[outlet.use_case] : null) ?? {
    bg: 'bg-slate-500/20', text: 'text-slate-300', accent: '#94a3b8', glow: 'hover:shadow-slate-500/15',
  };
  const label = outlet.use_case ? (USE_CASE_LABELS[outlet.use_case] ?? outlet.use_case) : null;
  const OutletIcon: React.ComponentType<{ className?: string }> =
    (outlet.use_case ? USE_CASE_ICONS[outlet.use_case] : undefined) ?? Building2;

  return (
    <button
      onClick={onSelect}
      className={cn(
        'group relative flex flex-col text-left rounded-2xl border overflow-hidden',
        'bg-white border-slate-200',
        'hover:border-slate-300',
        'shadow-sm hover:shadow-lg',
        'active:scale-[0.97] transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60'
      )}
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <div
        className="absolute top-0 inset-x-0 h-0.5 opacity-70 group-hover:opacity-100 transition-opacity"
        style={{ background: `linear-gradient(90deg, transparent, ${color.accent}, transparent)` }}
      />
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div
            className="h-12 w-12 rounded-xl flex items-center justify-center border transition-colors duration-200"
            style={{ background: `${color.accent}14`, borderColor: `${color.accent}33` }}
          >
            <OutletIcon className={cn('h-5 w-5 transition-transform duration-200 group-hover:scale-110', color.text)} />
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {outlet.is_hq && (
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-slate-100 text-slate-500 uppercase tracking-widest">HQ</span>
            )}
            {label && (
              <span
                className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                style={{ background: `${color.accent}1a`, color: color.accent }}
              >
                {label}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-end justify-between gap-2">
          <p className="font-bold text-slate-900 text-sm sm:text-base leading-snug transition-colors">
            {outlet.name}
          </p>
          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all shrink-0 mb-0.5" />
        </div>
      </div>
    </button>
  );
}

// ── Hero band ────────────────────────────────────────────────────────────────
// A brand-tinted (dark) band spanning the top of BOTH steps. White text reads on
// it, which is also where the shared LiveClock (hardcoded text-white) becomes
// visible. Backdrop = tenant screensaver/logo image with a brand-tinted overlay.

export interface LoginHeroProps {
  eyebrow: string;
  heading: string;
  /** Tenant identity line under the heading (outlet name). */
  outletName: string;
  backdropUrl?: string | null;
  logoUrl?: string | null;
  fallbackInitials: string;
  /** Use-case pill (label + accent colour). */
  useCaseLabel?: string | null;
  useCaseAccent?: string | null;
  isHQ?: boolean;
  pinLoginMessage?: string | null;
  showSwitchOutlet?: boolean;
  onSwitchOutlet?: () => void;
  isOnline: boolean;
  /** Settings (screensaver timeout) controls — omitted on the outlet step. */
  settings?: {
    show: boolean;
    onToggle: () => void;
    options: { label: string; ms: number }[];
    activeMs: number;
    onPick: (ms: number) => void;
  };
}

export function LoginHero({
  eyebrow, heading, outletName, backdropUrl, logoUrl, fallbackInitials,
  useCaseLabel, useCaseAccent, isHQ, pinLoginMessage,
  showSwitchOutlet, onSwitchOutlet, isOnline, settings,
}: LoginHeroProps) {
  return (
    <div
      className="relative shrink-0 overflow-hidden"
      style={{
        background:
          'linear-gradient(135deg, rgb(var(--brand-dark)) 0%, hsl(var(--primary)) 130%)',
      }}
    >
      {/* Brand backdrop image (tenant screensaver/logo) — heavily tinted so text reads */}
      {backdropUrl && (
        <img
          src={backdropUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-25"
        />
      )}
      {/* Brand-tint overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, rgb(var(--brand-dark) / 0.82) 0%, hsl(var(--primary) / 0.62) 100%)',
        }}
      />
      {/* Subtle glow */}
      <div
        className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full blur-3xl"
        style={{ background: 'hsl(var(--primary) / 0.35)' }}
      />

      <div className="relative z-10 px-5 sm:px-8 pt-5 pb-6">
        <div className="flex items-start justify-between gap-4">
          {/* Identity */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="h-12 w-12 shrink-0 rounded-2xl bg-white/95 ring-1 ring-white/40 shadow-lg flex items-center justify-center overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="h-9 w-9 object-contain" />
              ) : (
                <span className="text-sm font-black text-slate-900">{fallbackInitials}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/65">
                {eyebrow}
              </p>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-tight truncate">
                {heading}
              </h1>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <span className="text-sm font-semibold text-white/85 truncate max-w-[16rem]">
                  {outletName}
                </span>
                {useCaseLabel && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ring-white/20"
                    style={{
                      background: useCaseAccent ? `${useCaseAccent}33` : 'rgba(255,255,255,0.15)',
                      color: '#fff',
                    }}
                  >
                    {useCaseLabel}
                  </span>
                )}
                {isHQ && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/15 text-white ring-1 ring-inset ring-white/20">
                    <Building2 className="h-2.5 w-2.5" />HQ
                  </span>
                )}
              </div>
              {showSwitchOutlet && (
                <button
                  onClick={onSwitchOutlet}
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-white/75 hover:text-white transition-colors group"
                >
                  <ChevronRight className="h-3 w-3 rotate-90 group-hover:-translate-y-px transition-transform" />
                  Switch outlet
                </button>
              )}
              {pinLoginMessage && (
                <p className="hidden sm:block text-white/60 text-[11px] mt-1 truncate max-w-sm leading-tight">
                  {pinLoginMessage}
                </p>
              )}
            </div>
          </div>

          {/* Right: clock + status + settings */}
          <div className="flex items-start gap-3 shrink-0">
            <div className="hidden sm:block">
              {/* LiveClock hardcodes text-white/* — visible here because the hero is dark/brand. */}
              <LiveClock />
            </div>
            <div className="flex items-center gap-1.5">
              {!isOnline && (
                <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-amber-400/20 ring-1 ring-inset ring-amber-200/40 text-amber-100 text-[11px] font-semibold">
                  <WifiOff className="h-3 w-3" />
                  <span className="hidden sm:inline">Offline</span>
                </div>
              )}
              {settings && (
                <div className="relative">
                  <button
                    onClick={settings.onToggle}
                    className="h-9 w-9 rounded-xl flex items-center justify-center bg-white/15 ring-1 ring-inset ring-white/25 hover:bg-white/25 text-white transition-colors"
                    title="Screensaver timeout"
                    aria-label="Screensaver timeout settings"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                  {settings.show && (
                    <div className="absolute right-0 top-11 z-50 w-44 rounded-2xl border border-slate-200 bg-white shadow-xl p-1.5 space-y-0.5">
                      <p className="px-3 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Screensaver</p>
                      {settings.options.map((opt) => (
                        <button
                          key={opt.ms}
                          onClick={() => settings.onPick(opt.ms)}
                          className={cn(
                            'w-full text-left px-3 py-2 rounded-xl text-sm transition-colors',
                            settings.activeMs === opt.ms
                              ? 'bg-primary text-primary-foreground font-semibold'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile clock row (hero is dark, so white reads) */}
        <div className="sm:hidden mt-4 flex justify-center">
          <LiveClock />
        </div>
      </div>
    </div>
  );
}

// ── Numeric keypad ───────────────────────────────────────────────────────────
// Brand-coloured tactile number keys (7-8-9 / 4-5-6 / 1-2-3 / 0), a backspace
// key and a destructive CLEAR key. PIN-only — no QWERTY, no password field.

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
    <div className="grid grid-cols-3 gap-3 sm:gap-4 w-full">
      {KEYPAD_KEYS.map((key, i) => {
        if (key === 'del') {
          return (
            <button
              key={i}
              onClick={onBackspace}
              disabled={disabled || digitsLength === 0}
              aria-label="Delete"
              className={cn(
                'h-16 sm:h-20 rounded-2xl flex items-center justify-center transition-all duration-100 touch-manipulation',
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
                'h-16 sm:h-20 rounded-2xl flex items-center justify-center transition-all duration-100 touch-manipulation',
                'bg-rose-50 border border-rose-200 text-rose-600 text-sm font-black uppercase tracking-wider',
                'hover:bg-rose-100 hover:border-rose-300 active:scale-95',
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
              'h-16 sm:h-20 rounded-2xl flex items-center justify-center transition-all duration-100 touch-manipulation',
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
