import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.budimanbbl.impossibleabc",
  appName: "Impossible ABC",
  webDir: "dist",
  backgroundColor: "#0d0806",
  android: {
    // Game assets are bundled; no remote content.
    allowMixedContent: false,
  },
};

export default config;
