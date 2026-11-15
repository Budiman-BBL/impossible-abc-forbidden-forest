import raw from "../data/balance.json";

export interface CampDef {
  id: string;
  name: string;
  x: number;
  y: number;
  main: boolean;
}

export const CFG = raw.cfg;
export const INLINE = raw.inline;
export const CAMPS: readonly CampDef[] = raw.camps;
export const UNLOCK_ON_LEVEL: Readonly<Record<string, string>> = raw.unlockOnLevel;
export const CAMERA = raw.camera;
export type Cfg = typeof CFG;
