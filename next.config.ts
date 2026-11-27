import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // @cursor/sdk / pg use Node APIs; keep them external for App Router API routes
  serverExternalPackages: ["@cursor/sdk", "pg"],
  // Include teaching skills in the serverless file trace (runtime fs.readdir).
  // Prefer non-hidden bundled-skills/; also keep .cursor/skills for local Cursor.
  outputFileTracingIncludes: {
    "/*": [
      "./bundled-skills/**/*",
      "./.cursor/skills/**/*",
      "./.agents/skills/**/*",
    ],
    "/api/:path*": [
      "./bundled-skills/**/*",
      "./.cursor/skills/**/*",
      "./.agents/skills/**/*",
    ],
    "/lab": ["./bundled-skills/**/*", "./.cursor/skills/**/*"],
    "/skills": ["./bundled-skills/**/*", "./.cursor/skills/**/*"],
    "/skills/:path*": ["./bundled-skills/**/*", "./.cursor/skills/**/*"],
  },
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
