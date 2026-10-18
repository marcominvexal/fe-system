import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WebAssembly and data files; load it from node_modules as-is
  serverExternalPackages: ["@electric-sql/pglite"],
  // Ship the legacy JSON data with the API routes so a fresh database can import it
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/*.json"],
  },
};

export default nextConfig;
