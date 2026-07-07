'use client';

import { useEffect, useState } from 'react';
import { ScreensaverSlideshow } from '@/components/pos/screensaver-slideshow';
import { buildScreensaverMedia } from '@/lib/screensaver';

interface ScreensaverProps {
  active: boolean;
  onDismiss: () => void;
  /** Legacy single media URL (video or image) — still honored when no playlist is given. */
  screensaverUrl?: string | null;
  /** Image playlist (rotating slideshow). Build via buildScreensaverMedia so precedence
   *  (configured urls → bundled per-slug defaults → branded background) stays uniform. */
  playlist?: string[];
  tenantName?: string | null;
  tenantLogoUrl?: string | null;
  outletName?: string | null;
}

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!now) return null;

  const timeMain = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const secs = now.toLocaleTimeString([], { second: '2-digit' }).split(':').pop() ?? '00';
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="text-center select-none">
      {/* Large time display — follows 60-30-10 hierarchy */}
      <div className="flex items-end justify-center gap-3 leading-none">
        <span
          className="text-[5.5rem] sm:text-[7.5rem] font-thin tracking-tight text-white tabular-nums"
          style={{ textShadow: '0 0 60px rgba(255,255,255,0.08), 0 2px 20px rgba(0,0,0,0.5)' }}
        >
          {timeMain}
        </span>
        <span
          className="text-2xl sm:text-3xl font-thin tabular-nums mb-4 sm:mb-6"
          style={{ color: 'hsl(var(--primary) / 0.55)' }}
        >
          {secs}
        </span>
      </div>
      <p className="text-base sm:text-lg text-white/30 mt-1 font-light tracking-[0.06em]">{date}</p>
    </div>
  );
}

function BrandBackground() {
  return (
    <>
      <style>{`
        @keyframes ss-blob-a { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(55px,-35px) scale(1.12); } }
        @keyframes ss-blob-b { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-45px,55px) scale(0.88); } }
        @keyframes ss-blob-c { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(35px,35px) scale(1.08); } }
        .ss-a { animation: ss-blob-a 9s ease-in-out infinite; }
        .ss-b { animation: ss-blob-b 12s ease-in-out infinite; }
        .ss-c { animation: ss-blob-c 15s ease-in-out infinite; }
      `}</style>

      {/* Brand-driven base gradient — uses tenant --brand-dark */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, rgb(var(--brand-dark)) 0%, color-mix(in srgb, rgb(var(--brand-dark)) 82%, rgb(var(--brand-emphasis))) 55%, rgb(var(--brand-dark)) 100%)',
        }}
      />

      {/* Static SVG background pattern */}
      <img
        src="/screensaver/default.svg"
        alt=""
        className="absolute inset-0 w-full h-full object-cover opacity-40"
        aria-hidden
      />

      {/* Brand-colored animated blobs — 60% primary, 30% emphasis, 10% accent */}
      <div
        className="absolute top-[10%] left-[8%] w-[48vw] h-[48vh] rounded-full blur-[90px] ss-a pointer-events-none"
        style={{ background: 'rgb(var(--brand-primary))', opacity: 0.22 }}
      />
      <div
        className="absolute bottom-[12%] right-[8%] w-[40vw] h-[40vh] rounded-full blur-[80px] ss-b pointer-events-none"
        style={{ background: 'rgb(var(--brand-emphasis))', opacity: 0.18 }}
      />
      <div
        className="absolute top-[42%] right-[28%] w-[26vw] h-[26vh] rounded-full blur-[70px] ss-c pointer-events-none"
        style={{ background: 'rgb(var(--brand-primary))', opacity: 0.1 }}
      />

      {/* Grain texture overlay for premium depth */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.03] pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <filter id="ss-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="4" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#ss-grain)" />
      </svg>
    </>
  );
}

export function Screensaver({
  active,
  onDismiss,
  screensaverUrl,
  playlist,
  tenantName,
  tenantLogoUrl,
  outletName,
}: ScreensaverProps) {
  const [ringPhase, setRingPhase] = useState(0);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setRingPhase((p) => (p + 1) % 3), 2200);
    return () => clearInterval(t);
  }, [active]);

  if (!active) return null;

  // Resolve media: explicit playlist wins; otherwise the legacy single URL feeds the same
  // resolver (a video plays exclusively; an image becomes a one-slide show).
  const media = playlist?.length
    ? { videoUrl: null, images: playlist }
    : buildScreensaverMedia({ configuredUrls: [screensaverUrl] });
  const isVideo = !!media.videoUrl;
  const hasImages = media.images.length > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Screen saver — tap to continue"
      className="fixed inset-0 z-[500] cursor-pointer overflow-hidden select-none"
      onClick={onDismiss}
      onKeyDown={(e) => e.key !== 'Tab' && onDismiss()}
    >
      {/* ── Background ── */}
      {isVideo ? (
        <video
          src={media.videoUrl!}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : hasImages ? (
        <ScreensaverSlideshow images={media.images} />
      ) : (
        <BrandBackground />
      )}

      {/* Scrim — light vignette, darkens edges for text legibility */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 70% at 50% 50%, transparent 30%, rgba(0,0,0,0.28) 100%)',
        }}
      />
      <div className="absolute inset-0 bg-black/18 pointer-events-none" />

      {/* ── Main content ── */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-8">
        {/* Logo with soft ambient glow */}
        {tenantLogoUrl && (
          <div className="relative mb-2">
            <div
              className="absolute -inset-8 rounded-full blur-3xl opacity-18 pointer-events-none"
              style={{ background: 'rgb(var(--brand-primary))' }}
            />
            <img
              src={tenantLogoUrl}
              alt={tenantName ?? ''}
              className="relative h-14 sm:h-18 w-auto object-contain"
              style={{
                filter: 'brightness(1.05) drop-shadow(0 0 24px rgba(255,255,255,0.18))',
                maxWidth: '200px',
              }}
            />
          </div>
        )}

        {/* Clock — the primary element */}
        <LiveClock />

        {/* Outlet / tenant labels */}
        <div className="flex flex-col items-center gap-1 mt-1">
          {outletName && (
            <p className="text-white/50 text-sm font-medium tracking-[0.18em] uppercase">{outletName}</p>
          )}
          {tenantName && (
            <p className="text-white/22 text-xs font-medium tracking-[0.28em] uppercase">{tenantName}</p>
          )}
        </div>
      </div>

      {/* ── Wake hint with animated ring ── */}
      <div className="absolute bottom-8 sm:bottom-10 inset-x-0 flex flex-col items-center gap-3 pointer-events-none">
        {/* Concentric pulsing rings */}
        <div className="relative h-10 w-10 flex items-center justify-center">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="absolute rounded-full border transition-all duration-700"
              style={{
                width: `${10 + i * 10}px`,
                height: `${10 + i * 10}px`,
                borderColor: 'rgb(var(--brand-primary))',
                opacity: ringPhase === i ? 0.65 : 0.15,
                transform: `scale(${ringPhase === i ? 1.2 : 1})`,
              }}
            />
          ))}
          <div
            className="h-3 w-3 rounded-full"
            style={{ background: 'hsl(var(--primary) / 0.7)' }}
          />
        </div>
        <p className="text-white/28 text-xs font-medium tracking-[0.22em] uppercase">
          Touch to continue
        </p>
      </div>
    </div>
  );
}
