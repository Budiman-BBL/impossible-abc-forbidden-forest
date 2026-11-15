import { describe, expect, it } from "vitest";
import {
  campLightR,
  createFireState,
  decayMul,
  doUpgrade,
  feedFire,
  fireSpriteId,
  mainLightMax,
  mainLightR,
  nightIndex,
  stepFire,
  upgradeCost,
  type FireState,
} from "../../src/systems/campfire";
import { legacyFire, type LegacyS } from "./legacyV2";

function legacyStateFrom(s: FireState): LegacyS {
  return {
    time: s.time,
    fuel: s.fuel,
    fuelMax: s.fuelMax,
    level: s.level,
    logs: s.logs,
    chars: { nisa: { alive: s.nisaAlive } },
    camps: [{ main: true, lit: true, x: 900, y: 1650 }],
    stats: { fed: 0 },
  };
}

const camps = [
  { main: true, lit: true },
  { main: false, lit: true },
  { main: false, lit: false },
];

describe("fire and light formulas give the same values as legacy v2", () => {
  it("decayMul, light radius, camp light, night index and sprite state over a grid of states", () => {
    let checked = 0;
    for (const level of [0, 1, 2, 3, 4, 5, 6]) {
      for (const time of [0, 10, 74.9, 75, 151, 400, 1000]) {
        for (const fuelPct of [0, 0.1, 0.27, 0.28, 0.5, 0.99, 1, 1.2]) {
          for (const nisaAlive of [true, false]) {
            const s = createFireState();
            s.level = level;
            s.time = time;
            s.fuelMax = 100 + level * 8;
            s.fuel = s.fuelMax * fuelPct;
            s.nisaAlive = nisaAlive;
            const L = legacyFire(legacyStateFrom(s));
            expect(decayMul(s)).toBe(L.decayMul());
            expect(mainLightMax(s)).toBe(L.mainLightMax());
            expect(mainLightR(s)).toBe(L.mainLightR());
            expect(nightIndex(s)).toBe(L.nightIndex());
            expect(upgradeCost(s)).toBe(L.upgradeCost());
            for (const c of camps) {
              expect(campLightR(s, c)).toBe(L.campLightR(c));
              expect(fireSpriteId(s, c)).toBe(L.fireSpriteId(c));
            }
            checked++;
          }
        }
      }
    }
    expect(checked).toBe(7 * 7 * 8 * 2);
  });

  it("fuel burns down at the same rate as v2 update() over 10 minutes at 60 fps", () => {
    const s = createFireState();
    s.fuel = s.fuelMax = 10_000; // keep it alive for the whole run
    const ls = legacyStateFrom(s);
    const Lb = legacyFire(ls);
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 600; i++) {
      stepFire(s, dt);
      // v2 update(): S.time += dt; fuel -= FUEL_DECAY * decayMul() * dt
      ls.time += dt;
      ls.fuel = Math.max(0, ls.fuel - 1.15 * Lb.decayMul() * dt);
    }
    expect(s.time).toBe(ls.time);
    expect(s.fuel).toBe(ls.fuel);
  });

  it("a fresh fire with no wood goes out after the same time as v2 (about 71 s)", () => {
    const s = createFireState();
    let t = 0;
    while (!s.out && t < 600) {
      stepFire(s, 1 / 60);
      t += 1 / 60;
    }
    expect(s.out).toBe(true);
    expect(s.fuel).toBe(0);
    // FUEL_START 82 / FUEL_DECAY 1.15 = 71.3 s (no night bonus before 75 s, level 0)
    expect(s.time).toBeGreaterThan(71.2);
    expect(s.time).toBeLessThan(71.4);
  });

  it("feedFire matches v2 (log count, fuel cap, full and empty cases)", () => {
    for (const [fuel, logs, n] of [
      [50, 5, 1],
      [50, 5, 3],
      [95, 5, 3],
      [99.6, 5, 1],
      [20, 0, 1],
      [0, 10, 10],
    ] as const) {
      const s = createFireState();
      s.fuel = fuel;
      s.logs = logs;
      const ls = legacyStateFrom(s);
      const legacyOk = legacyFire(ls).feedFire(n);
      const r = feedFire(s, n);
      expect(r.used > 0).toBe(legacyOk);
      expect(s.fuel).toBe(ls.fuel);
      expect(s.logs).toBe(ls.logs);
    }
  });

  it("doUpgrade follows v2 costs, fuelMax +8, fuel +14 and unlock order", () => {
    const s = createFireState();
    s.logs = 1000;
    const unlocks: (string | null)[] = [];
    const costs = [12, 22, 22, 26, 30, 34];
    for (let i = 0; i < 6; i++) {
      const before = s.logs;
      const fuelBefore = s.fuel;
      const r = doUpgrade(s);
      expect(r.ok).toBe(true);
      if (r.ok) unlocks.push(r.unlocks);
      expect(before - s.logs).toBe(costs[i]);
      expect(s.fuelMax).toBe(100 + (i + 1) * 8);
      expect(s.fuel).toBe(Math.min(s.fuelMax, fuelBefore + 14));
    }
    expect(unlocks).toEqual(["ayan", "hannan", "asiya", "safiya", null, null]);
    expect(doUpgrade(s)).toEqual({ ok: false, reason: "max", cost: null });
  });

  it("raises the low-fuel warning once below 28% and re-arms above 40%", () => {
    const s = createFireState();
    s.fuel = 28.1;
    expect(stepFire(s, 0.2)).toEqual(["low"]);
    expect(stepFire(s, 0.2)).toEqual([]);
    s.fuel = 50;
    stepFire(s, 0.1);
    expect(s.lowWarned).toBe(false);
  });
});
