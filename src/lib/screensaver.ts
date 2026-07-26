/**
 * Screensaver media resolution — ONE place both consumers (the PIN-login page and the
 * TerminalIdleScreensaver) build their slideshow from, so precedence can never drift:
 *
 *   1. Tenant/outlet-configured media (outlet settings `screensaver_urls` — up to 3,
 *      managed from Settings → Display — falling back to the legacy single
 *      `screensaver_url`, then the tenant-brand `pos_screensaver_url`).
 *      A configured VIDEO plays exclusively; configured images rotate.
 *   2. Nothing configured → the bundled per-tenant defaults under
 *      `public/screensaver/default/{slug}/` (baked at build time, so they work offline
 *      on first idle and never leak across tenants).
 *   3. No defaults for the slug → empty playlist → branded gradient background.
 */

export const SCREENSAVER_ROTATE_MS = 10_000;

const VIDEO_RE = /\.(mp4|webm|ogg)(\?.*)?$/i;

export function isVideoUrl(url: string | null | undefined): boolean {
  return !!url && VIDEO_RE.test(url);
}

/** Bundled default screensaver sets, keyed by tenant slug (files live in public/). */
export const DEFAULT_SCREENSAVERS: Record<string, string[]> = {
  'urban-loft': [
    '/screensaver/default/urban-loft/screensaver-1.png',
    '/screensaver/default/urban-loft/screensaver-2.png',
    '/screensaver/default/urban-loft/screensaver-3.jpg',
    '/screensaver/default/urban-loft/screensaver-4.png',
    '/screensaver/default/urban-loft/screensaver-5.png',
  ],
};

export interface ScreensaverMedia {
  /** Exclusive video (first configured video URL), or null. */
  videoUrl: string | null;
  /** Image playlist to rotate through (empty ⇒ branded background). */
  images: string[];
}

/** pos-api stores managed screensavers as RELATIVE `/media/...` paths (resolve-at-read
 *  convention) — they are served by pos-api, not the UI origin, so prefix the API base. */
export function resolveMediaUrl(url: string): string {
  if (!url.startsWith('/media/')) return url;
  const base = process.env.NEXT_PUBLIC_API_URL || 'https://posapi.codevertexafrica.com';
  return `${base.replace(/\/$/, '')}${url}`;
}

export function buildScreensaverMedia(opts: {
  /** Configured URLs in precedence order (outlet list → legacy single → tenant brand). */
  configuredUrls?: Array<string | null | undefined>;
  orgSlug?: string | null;
}): ScreensaverMedia {
  const configured = [
    ...new Set((opts.configuredUrls ?? []).filter((u): u is string => !!u).map(resolveMediaUrl)),
  ];
  const video = configured.find(isVideoUrl) ?? null;
  if (video) return { videoUrl: video, images: [] };
  if (configured.length) return { videoUrl: null, images: configured };
  const defaults = opts.orgSlug ? DEFAULT_SCREENSAVERS[opts.orgSlug] ?? [] : [];
  return { videoUrl: null, images: defaults };
}
