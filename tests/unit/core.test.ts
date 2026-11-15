import { describe, expect, it } from "vitest";
import { CFG, GameCore, MAX_CHOPS, generateWorld, isLit } from "../../src/core";

/** GameCore is the shared logic behind both the Phaser 2D and three.js 3D builds. */
describe("GameCore (shared 2D/3D game logic)", () => {
  it("uses the same seeded forest as generateWorld", () => {
    const core = new GameCore(2026, () => 0.5);
    expect(core.world.trees).toEqual(generateWorld(2026).trees);
  });

  it("chops a lit tree in CFG.CHOP seconds and adds its logs", () => {
    const core = new GameCore(2026, () => 0.5);
    const tree = core.nearestTreeToCamp()!;
    expect(isLit(core.lightSources(), tree.x, tree.y)).toBe(true);
    const logs0 = core.fire.logs;
    expect(core.chop(tree)).toEqual([{ type: "chopStart", treeId: tree.id }]);
    let done = false;
    for (let t = 0; t < CFG.CHOP + 0.2 && !done; t += 0.05) {
      done = core.step(0.05).some((e) => e.type === "chopDone");
    }
    expect(done).toBe(true);
    expect(core.fire.logs).toBe(logs0 + CFG.TREE_LOGS);
    expect(tree.logs).toBe(0);
    expect(core.chop(tree)[0]).toMatchObject({ type: "toast" });
  });

  it("refuses dark trees and more than MAX_CHOPS at once", () => {
    const core = new GameCore(2026, () => 0.5);
    const lit = core.world.trees.filter((t) => core.isLit(t.x, t.y));
    const dark = core.world.trees.find((t) => !core.isLit(t.x, t.y))!;
    expect(core.chop(dark)[0]).toMatchObject({ type: "toast", text: expect.stringContaining("gelap") });
    for (let i = 0; i < MAX_CHOPS; i++) core.chop(lit[i]!);
    expect(core.chop(lit[MAX_CHOPS]!)[0]).toMatchObject({ type: "toast", text: expect.stringContaining("serentak") });
  });

  it("feeds the fire and upgrades it with logs", () => {
    const core = new GameCore(1, () => 0.5);
    core.fire.fuel = 50;
    const fuel0 = core.fire.fuel;
    expect(core.feed()[0]).toEqual({ type: "fed", used: 1 });
    expect(core.fire.fuel).toBe(fuel0 + CFG.LOG_FUEL);
    core.fire.logs = 100;
    const ev = core.upgrade((id) => id.toUpperCase());
    expect(ev[0]).toMatchObject({ type: "upgraded", level: 1, unlocks: "ayan" });
    expect(core.hud().level).toBe(1);
  });

  it("burns out and reports game over once", () => {
    const core = new GameCore(1, () => 0.5);
    core.fire.fuel = 0.01;
    expect(core.step(0.08)).toContainEqual({ type: "gameover", time: expect.any(Number) });
    expect(core.step(0.08).some((e) => e.type === "gameover")).toBe(false);
    expect(core.hud().out).toBe(true);
  });
});
