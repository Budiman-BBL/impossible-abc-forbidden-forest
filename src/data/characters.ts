import raw from "./characters.json";

export type CharacterId = "nisa" | "affan" | "ayan" | "unais" | "hannan" | "asiya" | "safiya";

export interface CharacterDef {
  id: CharacterId;
  displayName: string;
  role: string;
  roleMs: string;
  roleEn: string;
  legacyName: string;
  legacyRole: string;
  interimFrame: string;
  bodyHeight: number;
  startsUnlocked: boolean;
  unlockLevel: number;
}

export const CHARACTERS = raw.characters as CharacterDef[];

export function characterById(id: CharacterId): CharacterDef {
  const c = CHARACTERS.find((ch) => ch.id === id);
  if (!c) throw new Error(`Unknown character id: ${id}`);
  return c;
}
