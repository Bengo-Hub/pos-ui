import withPWAInit from "@ducanh2912/next-pwa";
import type { NextConfig } from "next";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
});

const nextConfig: NextConfig = {
  ...(process.env.SKIP_STANDALONE !== 'true' && { output: 'standalone' as const }),
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
