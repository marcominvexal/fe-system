import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship the JSON data file with the API routes so hosted builds have data
  outputFileTracingIncludes: {
    "/api/tasks": ["./data/**/*"],
  },
};

export default nextConfig;
