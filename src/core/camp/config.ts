/**
 * Sprint 1 "The Living Camp" numbers. All are starting values to tune after play (World & UI Design v1.0, §3).
 * Times are seconds of game time, distances are world units (Affan is 76 units tall, walks 118 units/s).
 */
export const RESOURCES = ["kayu", "batu", "dahan", "getah", "beri"] as const;
export type Res = (typeof RESOURCES)[number];
export type Inventory = Record<Res, number>;

export const CAMP_CFG = {
  /** length of each part of Hari 1; "pagi" (morning) ends the night and passes Sprint 1 */
  phases: { siang: 170, petang: 60, malam: 180 },
  fire: {
    fuelMax: 100,
    /** 1 Kayu fills 20 fuel */
    logFuel: 20,
    /** fuel per second while burning (by day / by night) */
    burnDay: 0.32,
    burnNight: 0.5,
    low: 25,
    /** first fire: 5 Kayu (the fuel) + 2 Batu (the ring), as in the PoC. Open decision in the design doc. */
    firstKayu: 5,
    firstBatu: 2,
    lightMin: 72,
    lightMax: 250,
  },
  /** Bina menu, Bab 1: fire upgrade (Batu) is active; the fence (Dahan) unlocks in Sprint 2 */
  upgrade: { batu: 3, burnMul: 0.7, radiusMul: 1.18, maxLevel: 2 },
  fence: { partialDahan: 8, fullDahan: 16, unlockSprint: 2 },
  carry: { kayu: 10, batu: 6, dahan: 10, getah: 6, beri: 5 } as Inventory,
  hearts: 3,
  berryHeal: 1,
  respawn: { kayu: 45, batu: 75, dahan: 50, getah: 999, beri: 70 } as Inventory,
  /** Bina works and the storage is used inside this radius around the fire */
  campR: 330,
  pickR: 52,
  fireUseR: 95,
  storageUseR: 90,
  nisaTalkR: 80,
  lanternSlots: 4,
  /** small decorative light of Cikgu Nisa's lantern at the tent (not a lantern slot) */
  nisaLanternR: 58,
  wolf: { count: 2, prowl: 46, chase: 86, sight: 300, biteR: 30, biteCd: 2.6, edgePad: 14, retreat: 2.2 },
  /** total letters in the game (A–M); none are found in Sprint 1 */
  letters: 13,
} as const;

export function emptyInv(): Inventory {
  return { kayu: 0, batu: 0, dahan: 0, getah: 0, beri: 0 };
}
