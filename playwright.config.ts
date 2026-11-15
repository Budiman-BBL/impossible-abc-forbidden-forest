import { defineConfig, devices } from "@playwright/test";

// Smoke tests run against the production build served by `vite preview`.
// Locally you can use the system Chrome with PW_CHANNEL=chrome.
const channel = process.env.PW_CHANNEL;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:4173", channel, trace: "retain-on-failure" },
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
      name: "desktop-1920x1080",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 }, channel },
    },
    {
      // Budiman's phone shape: 2400x1080 physical px at DPR 2.625 = 914x411 CSS px, landscape.
      name: "phone-2400x1080",
      use: { ...devices["Pixel 7 landscape"], viewport: { width: 914, height: 411 }, deviceScaleFactor: 2.625, channel },
    },
    {
      // Same phone with the browser address bar visible (shorter viewport).
      name: "phone-2400x1080-urlbar",
      use: { ...devices["Pixel 7 landscape"], viewport: { width: 914, height: 355 }, deviceScaleFactor: 2.625, channel },
    },
  ],
});
