import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// ABC_TARGET picks what to build:
//   all (default): the Phaser 2D game at / and the 3D proof-of-concept at /3d/ (GitHub Pages)
//   2d: only the 2D game (2D APK, keeps the 3D models out of it)
//   3d: only the 3D proof-of-concept, at the root of dist-3d/ (3D PoC APK)
const target = process.env.ABC_TARGET ?? "all";
const input: Record<string, string> = {};
if (target !== "3d") input.main = resolve(__dirname, "index.html");
if (target === "all") input.poc3d = resolve(__dirname, "3d/index.html");

// base "./" makes the build work both at the GitHub Pages sub-path and from a local folder
// (and later inside the Capacitor Android WebView).
export default defineConfig({
  base: "./",
  ...(target === "3d" ? { root: resolve(__dirname, "3d"), publicDir: false as const } : {}),
  assetsInclude: ["**/*.glb"],
  build: {
    target: "es2020",
    ...(target === "3d" ? { outDir: resolve(__dirname, "dist-3d"), emptyOutDir: true } : {}),
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      // two pages: the Phaser 2D game (/) and the three.js 3D proof-of-concept (/3d/)
      ...(target === "3d" ? {} : { input }),
      output: {
        manualChunks: (id) =>
          id.includes("node_modules/phaser") ? "phaser" : id.includes("node_modules/three") ? "three" : undefined,
      },
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
