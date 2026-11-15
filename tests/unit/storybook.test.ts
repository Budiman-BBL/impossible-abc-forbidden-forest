import { describe, expect, it } from "vitest";
import { addStone, addWood, canLight, createQuest, questDone, questLines, STONE_GOAL, WOOD_GOAL } from "../../src/storybook/quest";
import { makeLayout, LOGS_PLACED, STONES_PLACED } from "../../src/storybook/layout";
import { GameCore } from "../../src/core/game";

describe("storybook quest", () => {
  it("counts wood and stones up to the goals and lists the three lines", () => {
    const q = createQuest();
    expect(questLines(q).map((l) => l.text)).toEqual(["Kumpul kayu (0/5)", "Cari batu (0/2)", "Hidupkan unggun api"]);
    for (let i = 0; i < 7; i++) addWood(q);
    addStone(q);
    expect(q.wood).toBe(WOOD_GOAL);
    expect(questLines(q)[0]!.done).toBe(true);
    expect(questLines(q)[1]!.done).toBe(false);
    expect(canLight(q, 5)).toBe(false);
    addStone(q);
    addStone(q);
    expect(q.stones).toBe(STONE_GOAL);
    expect(canLight(q, 4)).toBe(false);
    expect(canLight(q, 5)).toBe(true);
    q.lit = true;
    expect(canLight(q, 9)).toBe(false);
    expect(questDone(q)).toBe(true);
  });
});

describe("storybook layout", () => {
  it("is seeded, places enough pickups, and keeps the camp and path clear", () => {
    const core = new GameCore(2026);
    const a = makeLayout(2026, core.mainCamp);
    const b = makeLayout(2026, core.mainCamp);
    expect(a).toEqual(b);
    expect(a.pickups.filter((p) => p.kind === "log")).toHaveLength(LOGS_PLACED);
    expect(a.pickups.filter((p) => p.kind === "stone")).toHaveLength(STONES_PLACED);
    const c = core.mainCamp;
    for (const p of a.props) if (p.kind.startsWith("tree")) expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeGreaterThan(220);
    expect(a.props.filter((p) => p.kind.startsWith("tree")).length).toBeGreaterThan(40);
  });
});
