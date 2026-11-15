import { expect, test, type Page } from "@playwright/test";

type Node = { id: number; kind: "kayu" | "batu" | "dahan" | "beri"; x: number; y: number; amount: number };
type Sb = {
  ready: boolean;
  version: string;
  started: boolean;
  phase: string;
  outcome: string;
  hearts: number;
  busy: boolean;
  inv: Record<string, number>;
  fire: { lit: boolean; fuel: number; radius: number };
  wolves: { x: number; y: number; mode: string }[];
  nodes: () => Node[];
  camp: () => { x: number; y: number };
  start: () => void;
  goTo: (x: number, y: number) => void;
  act: () => void;
  setClock: (t: number) => void;
};
declare global { interface Window { __ABC_SB__: Sb } }

const sb = <T>(page: Page, f: () => T): Promise<T> => page.evaluate(f);

async function boot(page: Page, errors: string[]): Promise<void> {
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  await page.goto("/storybook/?seed=2026");
  await page.waitForFunction(() => window.__ABC_SB__?.ready === true, null, { timeout: 30_000 });
}

test("sprint 1: tapping the title card starts Hari 1", async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await expect(page.locator("#game canvas")).toBeVisible();
  expect(await sb(page, () => window.__ABC_SB__.started)).toBe(false);
  await page.waitForTimeout(600);
  const box = (await page.locator("#game canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => window.__ABC_SB__.started, null, { timeout: 10_000 });
  expect(await sb(page, () => window.__ABC_SB__.phase)).toBe("siang");
  expect(errors).toEqual([]);
});

test("sprint 1: gather, light the fire, survive the night until pagi", async ({ page }) => {
  // Software rendering on CI can drop to ~1 fps at 1080p; game time is capped per frame, so clock jumps land just before the phase change.
  test.setTimeout(420_000);
  const errors: string[] = [];
  await boot(page, errors);
  await sb(page, () => window.__ABC_SB__.start());
  const c = await sb(page, () => window.__ABC_SB__.camp());
  const nodes = await sb(page, () => window.__ABC_SB__.nodes());
  const near = (k: Node["kind"], n: number) =>
    nodes.filter((p) => p.kind === k).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y)).slice(0, n);
  for (const p of [...near("kayu", 6), ...near("batu", 2)]) {
    await page.waitForFunction(() => !window.__ABC_SB__.busy, null, { timeout: 40_000 });
    const before = await page.evaluate((k) => window.__ABC_SB__.inv[k] ?? 0, p.kind);
    await page.evaluate(([x, y]) => window.__ABC_SB__.goTo(x! + 26, y! + 8), [p.x, p.y]);
    await page.evaluate(() => window.__ABC_SB__.act());
    await page.waitForFunction(([k, b]) => (window.__ABC_SB__.inv[k as string] ?? 0) > (b as number), [p.kind, before] as const, { timeout: 40_000 });
  }
  await page.waitForFunction(() => !window.__ABC_SB__.busy, null, { timeout: 40_000 });
  await page.evaluate(([x, y]) => window.__ABC_SB__.goTo(x! + 10, y! + 60), [c.x, c.y]);
  await page.evaluate(() => window.__ABC_SB__.act());
  await page.waitForFunction(() => window.__ABC_SB__.fire.lit, null, { timeout: 40_000 });
  expect(await sb(page, () => window.__ABC_SB__.fire.radius)).toBeGreaterThan(0);

  // jump to nightfall: wolves arrive and stay outside the light while Affan stands by the fire
  await sb(page, () => window.__ABC_SB__.setClock(229.7));
  await page.waitForFunction(() => window.__ABC_SB__.phase === "malam", null, { timeout: 90_000 });
  await page.waitForFunction(() => window.__ABC_SB__.wolves.length === 2, null, { timeout: 30_000 });
  await page.waitForTimeout(2000);
  const night = await page.evaluate(() => {
    const s = window.__ABC_SB__, f = s.camp();
    return { r: s.fire.radius, d: s.wolves.map((w) => Math.hypot(w.x - f.x, w.y - f.y)), hearts: s.hearts };
  });
  for (const d of night.d) expect(d).toBeGreaterThan(night.r * 0.9);
  expect(night.hearts).toBe(3);

  // jump to just before dawn: Hari 1 is won at pagi
  await sb(page, () => window.__ABC_SB__.setClock(409.7));
  await page.waitForFunction(() => window.__ABC_SB__.outcome === "won", null, { timeout: 90_000 });
  const saved = await page.evaluate(() => localStorage.getItem("impossibleabc.save.v1"));
  expect(saved).toContain('"version":1');
  expect(errors).toEqual([]);
});
