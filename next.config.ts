import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PWA support via next-pwa is configured in next.config.js when using CJS,
  // for App Router we rely on manifest.json + service worker in public/
};

export default nextConfig;
