import { defineConfig, devices } from "@playwright/test";

// Smoke tests run against the production build served by `vite preview`.
// Locally you can use the system Chrome with PW_CHANNEL=chrome.
const channel = process.env.PW_CHANNEL;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { channel, trace: "retain-on-failure" },
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: "desktop-1280x720",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 }, channel },
    },
    {
      // Android phone in landscape (Pixel 7 landscape emulation: touch + mobile UA).
      name: "android-landscape",
      use: { ...devices["Pixel 7 landscape"], channel },
    },
  ],
});
