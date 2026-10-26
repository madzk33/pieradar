import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a second instance (e.g. a verification run) build into its own folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // PGlite ships WASM + data files that must be loaded from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  outputFileTracingIncludes: {
    "/**/*": ["./drizzle/**/*"],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "www.google.com" }],
  },
};

export default nextConfig;
