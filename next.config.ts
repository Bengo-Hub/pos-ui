import withPWAInit from "@ducanh2912/next-pwa";
import type { NextConfig } from "next";

// Offline + caching: the committed hand-written service worker at public/sw.js (registered by
// the shared OfflineBar) is the single source of truth; public/sw-media.js adds the bounded
// media cache. next-pwa stays installed but disabled, so a build never overwrites public/sw.js.
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
      // Catalog item images: pos-api's catalog sync passes through inventory-api's
      // already-fully-resolved image_url as-is (see [[inventory-media-image-convention]]).
      // Both live hostnames are whitelisted since some pre-existing rows were stored
      // against codevertexitsolutions.com (a real second Codevertex domain, not a typo).
      { protocol: "https", hostname: "inventoryapi.codevertexafrica.com", pathname: "/media/**" },
      { protocol: "https", hostname: "inventoryapi.codevertexitsolutions.com", pathname: "/media/**" },
      { protocol: "http", hostname: "localhost", port: "4001", pathname: "/media/**" },
      { protocol: "http", hostname: "127.0.0.1", port: "4001", pathname: "/media/**" },
    ],
    // Modern formats + a size ladder tuned for small POS grid thumbnails (not full-bleed
    // hero photos like the customer-facing ordering app) so cards resolve fast on
    // constrained in-store wifi — see [[project_pos_load_speed]].
    formats: ["image/avif", "image/webp"],
    // Upload names are content-unique; 7 days keeps the optimizer cache warm while still letting
    // the few manually replaced images refresh within the week.
    minimumCacheTTL: 604800,
    deviceSizes: [384, 640, 750],
    imageSizes: [48, 64, 96, 128, 192],
  },
  turbopack: {},
};

export default withPWA(nextConfig);
