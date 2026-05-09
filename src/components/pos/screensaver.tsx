'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

interface ScreensaverProps {
  active: boolean;
  onDismiss: () => void;
  screensaverUrl?: string | null;
  tenantName?: string | null;
  tenantLogoUrl?: string | null;
}

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!now) return null;

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="text-center select-none">
      <div className="text-7xl sm:text-8xl font-thin tracking-tight text-white tabular-nums drop-shadow-2xl">
        {time}
      </div>
      <div className="text-lg sm:text-xl text-white/50 mt-3 font-light">{date}</div>
    </div>
  );
}

function DefaultBackground() {
  return (
    <>
      <style>{`
        @keyframes ss-blob-a {
          0%,100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(55px,-35px) scale(1.12); }
        }
        @keyframes ss-blob-b {
          0%,100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(-45px,55px) scale(0.9); }
        }
        @keyframes ss-blob-c {
          0%,100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(35px,35px) scale(1.08); }
        }
        .ss-a { animation: ss-blob-a  9s ease-in-out infinite; }
        .ss-b { animation: ss-blob-b 12s ease-in-out infinite; }
        .ss-c { animation: ss-blob-c 15s ease-in-out infinite; }
      `}</style>

      {/* Base dark */}
      <div className="absolute inset-0 bg-gray-950" />

      {/* SVG background (static animated gradient from public) */}
      <img
        src="/screensaver/default.svg"
        alt=""
        className="absolute inset-0 w-full h-full object-cover opacity-100"
        aria-hidden="true"
      />

      {/* React-animated blobs layered on top */}
      <div className="absolute top-1/4 left-1/5 w-96 h-96 rounded-full bg-orange-500/25 blur-3xl ss-a pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/5 w-80 h-80 rounded-full bg-violet-600/20 blur-3xl ss-b pointer-events-none" />
      <div className="absolute top-1/2 right-1/3  w-64 h-64 rounded-full bg-sky-500/15   blur-3xl ss-c pointer-events-none" />
    </>
  );
}

export function Screensaver({ active, onDismiss, screensaverUrl, tenantName, tenantLogoUrl }: ScreensaverProps) {
  if (!active) return null;

  const isVideo = !!screensaverUrl && /\.(mp4|webm|ogg)(\?.*)?$/i.test(screensaverUrl);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Screen saver — tap to continue"
      className="fixed inset-0 z-[500] cursor-pointer overflow-hidden select-none"
      onClick={onDismiss}
      onKeyDown={(e) => e.key !== 'Tab' && onDismiss()}
    >
      {/* ── Background layer ── */}
      {isVideo ? (
        <video
          src={screensaverUrl!}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : screensaverUrl ? (
        <img
          src={screensaverUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <DefaultBackground />
      )}

      {/* Scrim for legibility */}
      <div className="absolute inset-0 bg-black/40" />

      {/* ── Centered content ── */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 p-8">
        {tenantLogoUrl && (
          <img
            src={tenantLogoUrl}
            alt={tenantName ?? ''}
            className="h-14 object-contain opacity-70 drop-shadow-xl"
          />
        )}

        <LiveClock />

        {tenantName && (
          <p className="text-white/30 text-sm font-medium tracking-widest uppercase">
            {tenantName}
          </p>
        )}
      </div>

      {/* ── Wake hint ── */}
      <div className="absolute bottom-8 inset-x-0 flex justify-center pointer-events-none">
        <p className="animate-pulse text-white/30 text-sm tracking-wide">
          Tap anywhere to continue
        </p>
      </div>
    </div>
  );
}
