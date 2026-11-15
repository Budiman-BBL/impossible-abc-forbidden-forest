import type { CapacitorConfig } from "@capacitor/cli";

// CAP_TARGET=poc3d builds the separate 3D proof-of-concept app (its own app id, so it installs
// next to the 2D game instead of replacing it). Default: the 2D game.
const poc3d = process.env.CAP_TARGET === "poc3d";

const config: CapacitorConfig = {
  appId: poc3d ? "com.budimanbbl.impossibleabc.poc3d" : "com.budimanbbl.impossibleabc",
  appName: poc3d ? "ABC 3D PoC" : "Impossible ABC",
  webDir: poc3d ? "dist-3d" : "dist",
  backgroundColor: "#0d0806",
  android: {
    path: poc3d ? "android-poc3d" : "android",
    // Game assets are bundled; no remote content.
    allowMixedContent: false,
  },
};

export default config;
