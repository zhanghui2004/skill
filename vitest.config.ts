import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Override project PostCSS (Tailwind) so Node unit tests do not load it
  css: {
    postcss: {
      plugins: [],
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
