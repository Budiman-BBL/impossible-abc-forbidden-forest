import { expect, test, type Page } from "@playwright/test";

type P = { id: number; kind: "log" | "stone"; x: number; y: number; taken: boolean };
type Sb = {
  ready: boolean;
  version: string;
  quest: { wood: number; stones: number; lit: boolean };
  logs: number;
  fire: { fuel: number; out: boolean };
  pickups: () => P[];
  camp: () => { x: number; y: number };
  goTo: (x: number, y: number) => void;
  act: () => void;
};
const fuel = (page: Page) => page.evaluate(() => (window as unknown as { __ABC_SB__: Sb }).__ABC_SB__.fire.fuel);

async function boot(page: Page, errors: string[]): Promise<void> {
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  await page.goto("/storybook/?seed=2026");
  await page.waitForFunction(() => (window as unknown as { __ABC_SB__?: Sb }).__ABC_SB__?.ready === true, null, { timeout: 20_000 });
}

async function waitQuest(page: Page, pred: string): Promise<void> {
  await page.waitForFunction(`(() => { const q = window.__ABC_SB__.quest; return ${pred}; })()`, null, { timeout: 15_000 });
}

test("storybook slice: collect wood and stones, light the fire", async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await expect(page.locator("#game canvas")).toBeVisible();
  const q0 = await page.evaluate(() => (window as unknown as { __ABC_SB__: Sb }).__ABC_SB__.quest);
  expect(q0).toEqual({ wood: 0, stones: 0, lit: false });

  const picks = await page.evaluate(() => (window as unknown as { __ABC_SB__: Sb }).__ABC_SB__.pickups());
  const logs = picks.filter((p) => p.kind === "log").slice(0, 5);
  const stones = picks.filter((p) => p.kind === "stone").slice(0, 2);
  let n = 0;
  for (const p of [...logs, ...stones]) {
    await page.waitForFunction(() => !(window as unknown as { __ABC_SB__: { busy: boolean } }).__ABC_SB__.busy);
    await page.evaluate(([x, y]) => (window as unknown as { __ABC_SB__: Sb }).__ABC_SB__.goTo(x! + 20, y! + 6), [p.x, p.y]);
    await page.evaluate(() => (window as unknown as { __ABC_SB__: Sb }).__ABC_SB__.act());
    n++;
    if (p.kind === "log") await waitQuest(page, `q.wood >= ${Math.min(n, 5)}`);
    else await waitQuest(page, `q.stones >= ${n - 5}`);
    await page.waitForTimeout(150);
  }
  await page.waitForFunction(() => !(window as unknown as { __ABC_SB__: { busy: boolean } }).__ABC_SB__.busy);
  const c = await page.evaluate(() => (window as unknown as { __ABC_SB__: Sb }).__ABC_SB__.camp());
  await page.evaluate(([x, y]) => (window as unknown as { __ABC_SB__: Sb }).__ABC_SB__.goTo(x! + 10, y! + 55), [c.x, c.y]);
  await page.evaluate(() => (window as unknown as { __ABC_SB__: Sb }).__ABC_SB__.act());
  await waitQuest(page, "q.lit === true");
  const f0 = await fuel(page);
  await page.waitForTimeout(1500);
  const f1 = await fuel(page);
  expect(f1).toBeLessThan(f0);
  expect(errors).toEqual([]);
});
