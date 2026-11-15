/** Light queries ported from legacy v2 (lightAt / isLit). Pure, no Phaser. */
import { INLINE } from "../data/balance";
import { dist } from "../utils/math";

export interface LightSource {
  x: number;
  y: number;
  r: number;
}

/** 0 (dark) .. 1 (at the centre of the strongest light). */
export function lightAt(lights: readonly LightSource[], x: number, y: number): number {
  let best = 0;
  for (const L of lights) {
    const d = dist(x, y, L.x, L.y);
    if (d < L.r) best = Math.max(best, 1 - d / L.r);
  }
  return best;
}

export function isLit(lights: readonly LightSource[], x: number, y: number): boolean {
  return lightAt(lights, x, y) > INLINE.LIT_THRESHOLD;
}
