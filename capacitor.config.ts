import type { CapacitorConfig } from "@capacitor/cli";

// CAP_TARGET=storybook builds the separate 2D storybook proof-of-concept app (its own app id, so it
// installs next to the 2D game instead of replacing it). Default: the 2D game.
const storybook = process.env.CAP_TARGET === "storybook";

const config: CapacitorConfig = {
  appId: storybook ? "com.budimanbbl.impossibleabc.storybook" : "com.budimanbbl.impossibleabc",
  appName: storybook ? "ABC Storybook PoC" : "Impossible ABC",
  webDir: storybook ? "dist-storybook" : "dist",
  backgroundColor: "#0d0806",
  android: {
    path: storybook ? "android-storybook" : "android",
    // Game assets are bundled; no remote content.
    allowMixedContent: false,
  },
};

export default config;
