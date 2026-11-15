/**
 * Save-data shape (v1), planned from day one (World & UI Design v1.0 §5). Sprint 1 writes it to
 * localStorage at each phase change and at the end of the night; loading/continue arrives in Sprint 4.
 */
import { RESOURCES, type Inventory } from "./config";
import type { Phase } from "./clock";
import type { CampSim } from "./sim";

export const SAVE_VERSION = 1;
export const SAVE_KEY = "impossibleabc.save.v1";
export type Facing = "up" | "down" | "left" | "right";

export interface SaveDataV1 {
  version: 1;
  general: { day: number; timeOfDay: Phase; clock: number; sunStrength: number };
  player: { x: number; y: number; facing: Facing; hearts: number; inventory: Inventory; torch: number };
  camp: { fuel: number; fireLit: boolean; fireEverLit: boolean; fireLevel: number; fenceParts: number; lanternSlots: boolean[]; campLevel: number; storage: Inventory };
  letters: { found: string[]; activeEffects: string[] };
  characters: { returned: string[]; tracksFound: string[]; pathsOpen: string[] };
  mapStory: { explored: string[]; rajaHints: string[]; flags: Record<string, boolean> };
}

export function toSave(s: CampSim): SaveDataV1 {
  return {
    version: 1,
    general: { day: s.day, timeOfDay: s.phase, clock: Math.round(s.t * 10) / 10, sunStrength: s.sun },
    player: { x: Math.round(s.player.x), y: Math.round(s.player.y), facing: s.player.facing, hearts: s.hearts, inventory: { ...s.inv }, torch: 0 },
    camp: { fuel: Math.round(s.fire.fuel * 10) / 10, fireLit: s.fire.lit, fireEverLit: s.fire.everLit, fireLevel: s.fire.level, fenceParts: s.fenceParts, lanternSlots: [...s.lanternSlots], campLevel: 1, storage: { ...s.store } },
    letters: { found: [...s.lettersFound], activeEffects: [] },
    characters: { returned: ["nisa", "affan"], tracksFound: [], pathsOpen: [] },
    mapStory: { explored: ["padang-kem"], rajaHints: [], flags: { hari1Survived: s.outcome === "won" } },
  };
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
function isInv(v: unknown): v is Inventory {
  return typeof v === "object" && v !== null && RESOURCES.every((r) => isNum((v as Record<string, unknown>)[r]));
}

/** Parse and check a stored save; returns null for anything that is not a valid v1 save. */
export function parseSave(json: string): SaveDataV1 | null {
  try {
    const d = JSON.parse(json) as Partial<SaveDataV1>;
    if (d.version !== SAVE_VERSION || !d.general || !d.player || !d.camp || !d.letters || !d.characters || !d.mapStory) return null;
    if (!isNum(d.general.day) || !isNum(d.general.clock) || !isNum(d.player.hearts) || !isInv(d.player.inventory) || !isInv(d.camp.storage)) return null;
    if (!Array.isArray(d.camp.lanternSlots) || !isNum(d.camp.fuel)) return null;
    return d as SaveDataV1;
  } catch {
    return null;
  }
}

/** Put a save back into a fresh sim (used by tests now, by "Sambung" in Sprint 4). */
export function applySave(s: CampSim, d: SaveDataV1): void {
  s.day = d.general.day;
  s.setClock(d.general.clock);
  s.player.x = d.player.x; s.player.y = d.player.y; s.player.facing = d.player.facing;
  s.hearts = d.player.hearts;
  Object.assign(s.inv, d.player.inventory);
  Object.assign(s.store, d.camp.storage);
  s.fire.fuel = d.camp.fuel; s.fire.lit = d.camp.fireLit; s.fire.everLit = d.camp.fireEverLit; s.fire.level = d.camp.fireLevel;
  s.fenceParts = d.camp.fenceParts;
  d.camp.lanternSlots.forEach((v, i) => { if (i < s.lanternSlots.length) s.lanternSlots[i] = v; });
  s.lettersFound = [...d.letters.found];
}
