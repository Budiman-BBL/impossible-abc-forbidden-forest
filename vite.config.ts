import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// base "./" makes the build work both at the GitHub Pages sub-path and from a local folder
// (and later inside the Capacitor Android WebView).
// ABC_TARGET: "all" (default: 2D at / and the storybook PoC at /storybook/), "2d", or "storybook"
// (storybook only, as the root of dist-storybook/ for its own APK).
const target = process.env.ABC_TARGET ?? "all";
const storyOnly = target === "storybook";

export default defineConfig({
  base: "./",
  root: storyOnly ? "storybook" : ".",
  publicDir: storyOnly ? false : "public",
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 1600,
    outDir: storyOnly ? resolve(import.meta.dirname, "dist-storybook") : "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: storyOnly
        ? resolve(import.meta.dirname, "storybook/index.html")
        : target === "2d"
          ? resolve(import.meta.dirname, "index.html")
          : { main: resolve(import.meta.dirname, "index.html"), storybook: resolve(import.meta.dirname, "storybook/index.html") },
      output: {
        manualChunks: (id) => (id.includes("node_modules/phaser") ? "phaser" : undefined),
      },
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
