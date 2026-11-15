/** Hari 1 clock: siang → petang → malam → pagi (morning ends the night). */
import { CAMP_CFG } from "./config";

export type Phase = "siang" | "petang" | "malam" | "pagi";
export const PHASE_LABEL: Record<Phase, string> = { siang: "Siang", petang: "Petang", malam: "Malam", pagi: "Pagi" };

const P = CAMP_CFG.phases;
export const T_PETANG = P.siang;
export const T_MALAM = P.siang + P.petang;
export const T_PAGI = P.siang + P.petang + P.malam;

export function phaseAt(t: number): Phase {
  return t < T_PETANG ? "siang" : t < T_MALAM ? "petang" : t < T_PAGI ? "malam" : "pagi";
}

/** 0 = full daylight .. 1 = darkest night. Petang dims, the night deepens, and it lifts towards dawn. */
export function darknessAt(t: number): number {
  const s = (a: number, b: number, x: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  if (t < T_PETANG) return 0;
  if (t < T_MALAM) return 0.45 * s(T_PETANG, T_MALAM, t);
  if (t < T_PAGI) return 0.45 + 0.45 * s(T_MALAM, T_MALAM + 25, t) - 0.35 * s(T_PAGI - 25, T_PAGI, t);
  return Math.max(0, 0.55 - 0.55 * s(T_PAGI, T_PAGI + 6, t));
}

/** Progress through the current phase, 0..1 (for the HUD sun/moon bar). */
export function phaseProgress(t: number): number {
  const ph = phaseAt(t);
  const [a, b] = ph === "siang" ? [0, T_PETANG] : ph === "petang" ? [T_PETANG, T_MALAM] : ph === "malam" ? [T_MALAM, T_PAGI] : [T_PAGI, T_PAGI + 1];
  return Math.min(1, Math.max(0, (t - a) / (b - a)));
}

/** The sun still rises each morning, a little weaker each day, until the letters restore it (Kitab v1.1). */
export function sunStrength(day: number): number {
  return Math.max(0.5, 1 - (day - 1) * 0.04);
}
