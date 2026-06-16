import withPWAInit from "@ducanh2912/next-pwa";
import type { NextConfig } from "next";

// Uniform offline strategy across every Codevertex frontend: next-pwa generates the service
// worker on each `next build --webpack` (so it always reflects the latest deploy and the browser
// can detect updates → shared PwaUpdater banner). next-pwa auto-bundles src/worker/index.ts
// (our background-sync bridge). NetworkFirst navigations serve the real cached page offline so
// the terminal still boots and reads the IndexedDB queue during an outage.
const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  // Don't auto-reload the page when connectivity returns — it yanks the cashier mid-task; the
  // shared OfflineBar shows the "Syncing offline data…" ribbon while the queue drains instead.
  reloadOnOnline: false,
  cacheOnFrontEndNav: true,
  workboxOptions: {
    skipWaiting: false, // PwaUpdater activates the waiting worker on the user's click
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      {
        urlPattern: ({ request }: { request: Request }) => request.mode === "navigate",
        handler: "NetworkFirst",
        options: { cacheName: "pages", networkTimeoutSeconds: 3, expiration: { maxEntries: 64 } },
      },
      {
        urlPattern: /\/_next\/static\/.*/i,
        handler: "CacheFirst",
        options: { cacheName: "next-static", expiration: { maxEntries: 256 } },
      },
      {
        urlPattern: /\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|svg|gif|webp|ico)$/i,
        handler: "StaleWhileRevalidate",
        options: { cacheName: "assets", expiration: { maxEntries: 256 } },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  ...(process.env.SKIP_STANDALONE !== 'true' && { output: 'standalone' as const }),
  // The webpack build type-checks the generated .next/types route validators, which trip on
  // Next 16's PageProps shape; app code is type-checked separately via `tsc --noEmit` in CI.
  typescript: { ignoreBuildErrors: true },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "posapi.codevertexitsolutions.com",
      },
      {
        protocol: "https",
        hostname: "accounts.codevertexitsolutions.com",
      },
      {
        protocol: "https",
        hostname: "sso.codevertexitsolutions.com",
      },
    ],
  },
  turbopack: {},
};

export default withPWA(nextConfig);
