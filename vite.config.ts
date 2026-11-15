import { defineConfig } from "vitest/config";

// base "./" makes the build work both at the GitHub Pages sub-path and from a local folder
// (and later inside the Capacitor Android WebView).
export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
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
