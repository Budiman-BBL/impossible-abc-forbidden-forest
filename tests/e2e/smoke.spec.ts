import { expect, test, type Page } from "@playwright/test";

type Abc = {
  ready: boolean;
  version: string;
  fire: { fuel: number; logs: number; time: number; out: boolean };
  world: { trees: number; camps: number };
};

async function boot(page: Page, errors: string[]): Promise<void> {
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`);
  });
  await page.goto("/?seed=2026");
  await page.waitForFunction(() => (window as unknown as { __ABC__?: Abc }).__ABC__?.ready === true, null, { timeout: 15_000 });
}

const abc = (page: Page) => page.evaluate(() => {
  const a = (window as unknown as { __ABC__: Abc }).__ABC__;
  return { ...a.fire, trees: a.world.trees, camps: a.world.camps, version: a.version };
});

test("launches without errors and the campfire loop runs", async ({ page }, info) => {
  const errors: string[] = [];
  await boot(page, errors);
  const canvas = page.locator("#game canvas");
  await expect(canvas).toBeVisible();

  const s0 = await abc(page);
  expect(s0.trees).toBe(64);
  expect(s0.camps).toBe(3);
  expect(s0.logs).toBe(5);

  await page.waitForTimeout(1500);
  const s1 = await abc(page);
  expect(s1.time).toBeGreaterThan(s0.time);
  expect(s1.fuel).toBeLessThan(s0.fuel); // fire burns down

  // Tap the campfire (the camera starts centred on the main camp) -> one log goes in.
  // The canvas fills the whole viewport (no letterbox).
  const box = (await canvas.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(Math.abs(box.width - vp.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.height - vp.height)).toBeLessThanOrEqual(1);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (info.project.use.hasTouch) await page.touchscreen.tap(cx, cy);
  else await page.mouse.click(cx, cy);
  await expect.poll(async () => (await abc(page)).logs).toBe(4);

  await page.waitForTimeout(1200);
  if (process.env.SHOT_DIR) {
    await page.screenshot({ path: `${process.env.SHOT_DIR}/sprint1-shot-${info.project.name}.png` });
  }
  expect(errors).toEqual([]);
});

test("chopping a lit tree gives wood; fire out shows game over and restart works", async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  test.setTimeout(120_000);
  const t0 = await page.evaluate(() => {
    const a = (window as unknown as { __ABC__: Abc & { chopNearest(): void } }).__ABC__;
    a.chopNearest();
    return a.fire.time;
  });
  // v2 CHOP = 3.8 s of game time, TREE_LOGS = 2. Wait on game time, not wall time: CI runners
  // render big viewports in software and can drop below 12.5 fps, where the 0.08 s step cap
  // makes game time run slower than real time.
  await page.waitForFunction(
    (start) => (window as unknown as { __ABC__: Abc }).__ABC__.fire.time > start + 4.2,
    t0,
    { timeout: 90_000 },
  );
  expect((await abc(page)).logs).toBe(7);

  await page.evaluate(() => {
    (window as unknown as { __ABC__: Abc }).__ABC__.fire.fuel = 0.01;
  });
  await expect.poll(async () => (await abc(page)).out).toBe(true);

  // "Main semula" button: 68 design units below the centre of the game-over panel.
  const box = (await page.locator("#game canvas").boundingBox())!;
  const k = await page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__: { scale: { width: number; height: number } } }).__PHASER_GAME__;
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
    const { width: w, height: h } = g.scale;
    const ui = Math.max(h / 720, 0.85 * dpr);
    return Math.min(ui, (h * 0.9) / 280, (w * 0.9) / 540) / dpr;
  });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + 68 * k);
  await expect.poll(async () => {
    const s = await abc(page);
    return s.out === false && s.logs === 5;
  }).toBe(true);
  expect(errors).toEqual([]);
});
