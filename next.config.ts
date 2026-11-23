import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // @cursor/sdk uses Node APIs; keep it external for App Router API routes
  serverExternalPackages: ["@cursor/sdk"],
  // Generated cursor/identity*.ts use ESM .js import specifiers; webpack needs aliases.
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      [path.resolve(__dirname, "cursor/identity.dev.js")]: path.resolve(
        __dirname,
        "cursor/identity.dev.ts"
      ),
      [path.resolve(__dirname, "cursor/identity.js")]: path.resolve(
        __dirname,
        "cursor/identity.ts"
      ),
    };
    return config;
  },
};

export default nextConfig;
