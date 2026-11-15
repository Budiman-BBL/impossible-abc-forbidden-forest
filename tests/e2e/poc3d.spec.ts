import { expect, test, type Page } from "@playwright/test";

// The three.js 3D proof-of-concept at /3d/. Headless Chromium renders WebGL with SwiftShader (CPU).
test.use({ launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] } });

type Core = { fire: { fuel: number; logs: number; time: number; out: boolean }; world: { trees: unknown[]; camps: unknown[] } };
type Abc3d = { ready: boolean; core: Core; stats: () => { fps: number; calls: number; triangles: number; character: { triangles: number; textureSize: number } }; chopNearest: () => void };

async function boot(page: Page, errors: string[]) {
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`);
  });
  await page.goto("/3d/?seed=2026");
  await page.waitForFunction(() => (window as unknown as { __ABC3D__?: Abc3d }).__ABC3D__?.ready === true, null, { timeout: 40_000 });
}

const fire = (page: Page) => page.evaluate(() => ({ ...(window as unknown as { __ABC3D__: Abc3d }).__ABC3D__.core.fire }));

test("3D PoC loads Budiman's character, the forest and the shared campfire loop", async ({ page }, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  await boot(page, errors);
  const s = await page.evaluate(() => {
    const a = (window as unknown as { __ABC3D__: Abc3d }).__ABC3D__;
    return { trees: a.core.world.trees.length, camps: a.core.world.camps.length, stats: a.stats() };
  });
  expect(s.trees).toBe(64); // same seeded forest as the 2D game
  expect(s.camps).toBe(3);
  expect(s.stats.character.triangles).toBeLessThan(15_000); // phone budget
  expect(s.stats.character.textureSize).toBeLessThanOrEqual(1024);
  const f0 = await fire(page);
  expect(f0.logs).toBe(5);
  await page.waitForFunction((t0) => (window as unknown as { __ABC3D__: Abc3d }).__ABC3D__.core.fire.time > t0 + 1, f0.time, { timeout: 30_000 });
  const f1 = await fire(page);
  expect(f1.fuel).toBeLessThan(f0.fuel);
  const stats = await page.evaluate(() => (window as unknown as { __ABC3D__: Abc3d }).__ABC3D__.stats());
  expect(stats.calls).toBeLessThan(40); // draw-call budget
  await page.screenshot({ path: info.outputPath("poc3d.png") });
  expect(errors).toEqual([]);
});

test("3D PoC: chopping the nearest lit tree gives 2 wood (game time, not wall time)", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  await boot(page, errors);
  const f0 = await fire(page);
  await page.evaluate(() => (window as unknown as { __ABC3D__: Abc3d }).__ABC3D__.chopNearest());
  await page.waitForFunction((t0) => (window as unknown as { __ABC3D__: Abc3d }).__ABC3D__.core.fire.time > t0 + 4.2, f0.time, { timeout: 100_000 });
  const f1 = await fire(page);
  expect(f1.logs).toBe(f0.logs + 2);
  expect(errors).toEqual([]);
});
