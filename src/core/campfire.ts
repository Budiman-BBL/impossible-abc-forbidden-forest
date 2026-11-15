/**
 * Campfire rules ported from legacy v2 (decayMul, mainLightMax, mainLightR, campLightR,
 * feedFire, doUpgrade and the fuel part of update()). Pure TypeScript, no Phaser, so the
 * formulas can be unit-tested against the legacy file.
 */
import { CFG, INLINE, UNLOCK_ON_LEVEL } from "./balance";
import { clamp, lerp } from "./math";

export interface FireState {
  /** Seconds since the run started (v2 S.time). */
  time: number;
  fuel: number;
  fuelMax: number;
  level: number;
  logs: number;
  /** Cikgu Nisa alive: her blessing slows the decay (v2: 0.91^level). */
  nisaAlive: boolean;
  lowWarned: boolean;
  out: boolean;
}

export interface CampLike {
  main: boolean;
  lit: boolean;
}

export function createFireState(): FireState {
  return {
    time: 0,
    fuel: CFG.FUEL_START,
    fuelMax: CFG.FUEL_MAX,
    level: 0,
    logs: INLINE.START_LOGS,
    nisaAlive: true,
    lowWarned: false,
    out: false,
  };
}

export function decayMul(s: FireState): number {
  const nights = Math.floor(s.time / CFG.NIGHT_LEN);
  const nisa = s.nisaAlive ? Math.pow(INLINE.NISA_DECAY_PER_LEVEL, s.level) : 1;
  return (1 + nights * (CFG.FUEL_DECAY_NIGHT / CFG.FUEL_DECAY)) * nisa;
}

export function mainLightMax(s: FireState): number {
  return CFG.LIGHT_MAX_BASE + s.level * CFG.LIGHT_MAX_GAIN;
}

export function mainLightR(s: FireState): number {
  const t = clamp(s.fuel / s.fuelMax, 0, 1);
  return lerp(CFG.LIGHT_MIN, mainLightMax(s), t);
}

export function campLightR(s: FireState, camp: CampLike): number {
  if (!camp.lit) return 0;
  if (camp.main) return mainLightR(s);
  return INLINE.SIDE_CAMP_LIGHT_BASE + s.level * INLINE.SIDE_CAMP_LIGHT_PER_LEVEL;
}

/** v2 "Malam N" counter: a new night every NIGHT_LEN seconds (not a real day/night cycle). */
export function nightIndex(s: FireState): number {
  return 1 + Math.floor(s.time / CFG.NIGHT_LEN);
}

export type FireEvent = "out" | "low";

/** Advance the fire by dt seconds. Same order as v2 update(). */
export function stepFire(s: FireState, dt: number): FireEvent[] {
  const events: FireEvent[] = [];
  if (s.out) return events;
  s.time += dt;
  const dec = CFG.FUEL_DECAY * decayMul(s) * dt;
  s.fuel = Math.max(0, s.fuel - dec);
  if (s.fuel <= 0) {
    s.fuel = 0;
    s.out = true;
    events.push("out");
    return events;
  }
  if (s.fuel / s.fuelMax < INLINE.LOW_WARN_BELOW && !s.lowWarned) {
    s.lowWarned = true;
    events.push("low");
  }
  if (s.fuel / s.fuelMax > INLINE.LOW_WARN_RESET_ABOVE) s.lowWarned = false;
  return events;
}

export type FeedResult = { used: number; reason?: "no-logs" | "full" | "out" };

export function feedFire(s: FireState, n = 1): FeedResult {
  if (s.out) return { used: 0, reason: "out" };
  if (s.logs <= 0) return { used: 0, reason: "no-logs" };
  if (s.fuel >= s.fuelMax - INLINE.FULL_EPSILON) return { used: 0, reason: "full" };
  let used = 0;
  while (used < n && s.logs > 0 && s.fuel < s.fuelMax) {
    s.logs--;
    s.fuel = Math.min(s.fuelMax, s.fuel + CFG.LOG_FUEL);
    used++;
  }
  return { used };
}

export function upgradeCost(s: FireState): number | null {
  if (s.level >= CFG.UPGRADE_COSTS.length) return null;
  return CFG.UPGRADE_COSTS[s.level] ?? null;
}

export type UpgradeResult =
  | { ok: true; level: number; unlocks: string | null }
  | { ok: false; reason: "max" | "logs" | "out"; cost: number | null };

export function doUpgrade(s: FireState): UpgradeResult {
  const cost = upgradeCost(s);
  if (s.out) return { ok: false, reason: "out", cost };
  if (cost == null) return { ok: false, reason: "max", cost };
  if (s.logs < cost) return { ok: false, reason: "logs", cost };
  s.logs -= cost;
  s.level++;
  s.fuelMax = CFG.FUEL_MAX + s.level * INLINE.FUEL_MAX_PER_LEVEL;
  s.fuel = Math.min(s.fuelMax, s.fuel + INLINE.UPGRADE_FUEL_BONUS);
  return { ok: true, level: s.level, unlocks: UNLOCK_ON_LEVEL[String(s.level)] ?? null };
}

export type FireSprite = "fire_unlit" | "fire_burning" | "fire_embers";

export function fireSpriteId(s: FireState, camp: CampLike): FireSprite {
  if (!camp.lit) return "fire_unlit";
  if (camp.main && s.fuel / s.fuelMax < INLINE.EMBERS_BELOW) return "fire_embers";
  return "fire_burning";
}
