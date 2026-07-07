'use client';

import { useEffect, useMemo, useState } from 'react';
import { SCREENSAVER_ROTATE_MS } from '@/lib/screensaver';

/**
 * Ambient image slideshow for the idle screensaver: crossfades between images every
 * ~10s with a slow Ken Burns pan/zoom. Portrait posters on a landscape POS screen get
 * a blurred cover backdrop of the same image behind an object-contain foreground, so
 * nothing is cropped and there are no black bars.
 *
 * All slides stay mounted (playlists are small — ≤3 configured or the ≤5 bundled
 * defaults) so the CSS opacity transition produces a true crossfade; the Ken Burns
 * class is applied only to the active slide, restarting its animation on each turn.
 * Respects prefers-reduced-motion (fade only, no pan/zoom).
 */
export function ScreensaverSlideshow({ images, rotateMs = SCREENSAVER_ROTATE_MS }: {
  images: string[];
  rotateMs?: number;
}) {
  const [index, setIndex] = useState(0);
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  // Reset when the playlist itself changes.
  const playlistKey = images.join('|');
  useEffect(() => { setIndex(0); }, [playlistKey]);

  // Rotate (only with 2+ images).
  useEffect(() => {
    if (images.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % images.length), rotateMs);
    return () => clearInterval(t);
  }, [images.length, rotateMs]);

  if (!images.length) return null;

  const kenBurns = ['ss-kb-a', 'ss-kb-b', 'ss-kb-c', 'ss-kb-d'];

  return (
    <div className="absolute inset-0 overflow-hidden">
      <style>{`
        @keyframes ss-kb-a { 0% { transform: scale(1)    translate(0, 0);      } 100% { transform: scale(1.08) translate(1.5%, -1%); } }
        @keyframes ss-kb-b { 0% { transform: scale(1.08) translate(-1.5%, 1%); } 100% { transform: scale(1)    translate(0, 0);      } }
        @keyframes ss-kb-c { 0% { transform: scale(1)    translate(0, 0);      } 100% { transform: scale(1.08) translate(-1.5%, 1%); } }
        @keyframes ss-kb-d { 0% { transform: scale(1.08) translate(1%, 1.5%);  } 100% { transform: scale(1)    translate(0, 0);      } }
        .ss-kb-a { animation: ss-kb-a ${rotateMs + 2000}ms ease-in-out forwards; }
        .ss-kb-b { animation: ss-kb-b ${rotateMs + 2000}ms ease-in-out forwards; }
        .ss-kb-c { animation: ss-kb-c ${rotateMs + 2000}ms ease-in-out forwards; }
        .ss-kb-d { animation: ss-kb-d ${rotateMs + 2000}ms ease-in-out forwards; }
      `}</style>
      {images.map((src, i) => {
        const active = i === index;
        return (
          <div
            key={`${src}-${i}`}
            className="absolute inset-0 transition-opacity duration-1600 ease-in-out"
            style={{ opacity: active ? 1 : 0 }}
            aria-hidden
          >
            {/* Blurred cover backdrop — fills the screen behind portrait posters. */}
            <img
              src={src}
              alt=""
              className="absolute inset-0 h-full w-full object-cover scale-110 blur-2xl brightness-[0.55]"
              draggable={false}
              loading={i === 0 ? 'eager' : 'lazy'}
            />
            {/* Foreground — whole image always visible, gently panning/zooming while active. */}
            <img
              src={src}
              alt=""
              className={`absolute inset-0 m-auto max-h-full max-w-full object-contain ${active && !reducedMotion ? kenBurns[i % 4] : ''}`}
              draggable={false}
              loading={i === 0 ? 'eager' : 'lazy'}
            />
          </div>
        );
      })}
    </div>
  );
}
