'use client';

import { Image as ImageIcon, Megaphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BannerFormState } from './discount-form-types';

/** Outlet use-case values (mirrors TerminalProfile in lib/use-case-config.ts) offered as the
 *  "show for use cases" filter — empty selection = show for every use case. Kept as a plain
 *  local list (not imported) so this field stays free of pos-ui-specific coupling beyond the
 *  wire-shape string values themselves, per DiscountFormModal's adapter-driven doc comment. */
const USE_CASE_OPTIONS: { v: string; l: string }[] = [
  { v: 'retail', l: 'Retail' },
  { v: 'hospitality', l: 'Hospitality' },
  { v: 'quick_service', l: 'Quick Service' },
  { v: 'services', l: 'Services' },
];

/**
 * StorefrontBannerFields — the toggle-gated "Storefront Banner" section of DiscountFormModal,
 * split into its own file to keep the modal under its ~400-line budget.
 *
 * When `banner.showOnStorefront` is on, this promotion is also surfaced as a marketing banner
 * on the customer-facing online ordering storefront (ordering-frontend, a separate app this
 * repo does not touch) via pos-api's GET /api/v1/s2s/{tenant}/discounts/banners S2S endpoint.
 * Everything here round-trips through Promotion.metadata["banner"] — no dedicated schema
 * column. A plain URL text field is used for the banner image (v1) rather than building new
 * upload infra — no trivially-reachable image-upload component exists from this form today.
 */
export function StorefrontBannerFields({
  banner, onChange,
}: {
  banner: BannerFormState;
  onChange: (patch: Partial<BannerFormState>) => void;
}) {
  const input = 'mt-1 w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <label className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/40 cursor-pointer">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Megaphone className="h-4 w-4 text-primary" /> Show on storefront
        </span>
        <input
          type="checkbox"
          checked={banner.showOnStorefront}
          onChange={(e) => onChange({ showOnStorefront: e.target.checked })}
          className="h-4 w-4 rounded border-input"
        />
      </label>

      {banner.showOnStorefront && (
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Surfaces this discount as a marketing banner on the customer-facing online ordering
            storefront, alongside the POS discount itself.
          </p>
          <label className="block">
            <span className="text-sm font-medium">Banner title</span>
            <input value={banner.bannerTitle} onChange={(e) => onChange({ bannerTitle: e.target.value })}
              placeholder="e.g. Happy Hour — 20% off all cocktails" className={input} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Subtitle <span className="text-xs text-muted-foreground">(optional)</span></span>
            <input value={banner.bannerSubtitle} onChange={(e) => onChange({ bannerSubtitle: e.target.value })}
              placeholder="e.g. Every day, 4–6pm" className={input} />
          </label>
          <label className="block">
            <span className="text-sm font-medium flex items-center gap-1">
              <ImageIcon className="h-3.5 w-3.5" /> Banner image URL <span className="text-xs text-muted-foreground">(optional)</span>
            </span>
            <input value={banner.bannerImageUrl} onChange={(e) => onChange({ bannerImageUrl: e.target.value })}
              placeholder="https://…" className={input} />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium">CTA label <span className="text-xs text-muted-foreground">(optional)</span></span>
              <input value={banner.ctaLabel} onChange={(e) => onChange({ ctaLabel: e.target.value })}
                placeholder="e.g. Order now" className={input} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">CTA link <span className="text-xs text-muted-foreground">(optional)</span></span>
              <input value={banner.ctaLink} onChange={(e) => onChange({ ctaLink: e.target.value })}
                placeholder="https://… or /menu" className={input} />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium">Banner color <span className="text-xs text-muted-foreground">(optional)</span></span>
              <div className="mt-1 flex items-center gap-2">
                <input type="color" value={banner.bannerColor || '#111827'}
                  onChange={(e) => onChange({ bannerColor: e.target.value })}
                  className="h-9 w-10 rounded-lg border border-input bg-background" />
                <input value={banner.bannerColor} onChange={(e) => onChange({ bannerColor: e.target.value })}
                  placeholder="#111827" className={cn(input, 'mt-0 flex-1')} />
              </div>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Text color <span className="text-xs text-muted-foreground">(optional)</span></span>
              <div className="mt-1 flex items-center gap-2">
                <input type="color" value={banner.textColor || '#ffffff'}
                  onChange={(e) => onChange({ textColor: e.target.value })}
                  className="h-9 w-10 rounded-lg border border-input bg-background" />
                <input value={banner.textColor} onChange={(e) => onChange({ textColor: e.target.value })}
                  placeholder="#ffffff" className={cn(input, 'mt-0 flex-1')} />
              </div>
            </label>
          </div>
          <div>
            <span className="text-sm font-medium">Show for use cases <span className="text-xs text-muted-foreground">(none selected = all)</span></span>
            <div className="mt-1 flex flex-wrap gap-2">
              {USE_CASE_OPTIONS.map((u) => (
                <button key={u.v} type="button"
                  onClick={() => onChange({
                    useCases: banner.useCases.includes(u.v)
                      ? banner.useCases.filter((x) => x !== u.v)
                      : [...banner.useCases, u.v],
                  })}
                  className={cn('px-2.5 py-1 rounded-full text-xs border font-medium transition-colors',
                    banner.useCases.includes(u.v) ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-accent')}>
                  {u.l}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
