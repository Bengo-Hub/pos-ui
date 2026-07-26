import withPWAInit from "@ducanh2912/next-pwa";
import type { NextConfig } from "next";

// Uniform offline strategy across every Codevertex frontend: next-pwa generates the service
// worker on each `next build --webpack` (so it always reflects the latest deploy and the browser
// can detect updates → shared PwaUpdater banner). next-pwa auto-bundles src/worker/index.ts
// (our background-sync bridge). NetworkFirst navigations serve the real cached page offline so
// the terminal still boots and reads the IndexedDB queue during an outage.
const withPWA = withPWAInit({
  dest: "public",
  // next-pwa DISABLED: under output:standalone its generated SW activated slowly (~50s precache)
  // and regressed reconnect-sync vs the committed hand-written runtime-caching SW at public/sw.js
  // (proven green end-to-end). We own that static SW (registered by the shared OfflineBar);
  // disabling guarantees the build never overwrites it. Uniform + bundler-agnostic across the fleet.
  disable: true,
  register: true,
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
        hostname: "posapi.codevertexafrica.com",
      },
      {
        protocol: "https",
        hostname: "accounts.codevertexafrica.com",
      },
      {
        protocol: "https",
        hostname: "sso.codevertexafrica.com",
      },
    ],
  },
  turbopack: {},
};

export default withPWA(nextConfig);
