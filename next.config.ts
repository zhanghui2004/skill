import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @cursor/sdk uses Node APIs; keep it external for App Router API routes
  serverExternalPackages: ["@cursor/sdk"],
};

export default nextConfig;
