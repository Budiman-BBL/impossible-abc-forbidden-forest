import { describe, expect, it } from "vitest";
import { generateWorld } from "../../src/systems/world";
import { mulberry32 } from "../../src/utils/rng";
import { legacyMulberry32 } from "./legacyV2";
import { lightAt, isLit } from "../../src/systems/light";

describe("seeded world", () => {
  it("mulberry32 gives the same sequence as legacy v2", () => {
    const legacy = legacyMulberry32();
    for (const seed of [1, 42, 0x9e37, 123456]) {
      const a = mulberry32(seed);
      const b = legacy(seed);
      for (let i = 0; i < 200; i++) expect(a()).toBe(b());
    }
  });

  it("is deterministic and matches the v2 layout rules", () => {
    const a = generateWorld(2026);
    const b = generateWorld(2026);
    expect(a).toEqual(b);
    expect(a.trees.length).toBe(64);
    expect(a.eyes.length).toBe(36);
    expect(a.camps.filter((c) => c.lit).map((c) => c.id)).toEqual(["utama"]);
    for (const t of a.trees) {
      expect(t.x).toBeGreaterThanOrEqual(70);
      expect(t.y).toBeLessThanOrEqual(2400 - 70);
    }
  });
});

describe("light queries (v2 lightAt / isLit)", () => {
  const lights = [{ x: 0, y: 0, r: 100 }];
  it("is 1 at the centre, 0 at the edge, lit above 0.1", () => {
    expect(lightAt(lights, 0, 0)).toBe(1);
    expect(lightAt(lights, 100, 0)).toBe(0);
    expect(isLit(lights, 89, 0)).toBe(true);
    expect(isLit(lights, 91, 0)).toBe(false);
  });
});
