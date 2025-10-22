import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve ??= {};
      config.resolve.alias ??= {};
      config.resolve.alias.http = path.join(__dirname, "lib/polyfills/http.ts");
      config.resolve.alias.https = path.join(__dirname, "lib/polyfills/https.ts");
    }
    return config;
  },
  /* @opennextjs/cloudflare handles output configuration */
};

export default nextConfig;
