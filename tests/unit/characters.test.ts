import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../../src/data/characters";
import { UNLOCK_ON_LEVEL } from "../../src/data/balance";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("characters.json", () => {
  it("has the 7 approved characters with official spelling", () => {
    expect(CHARACTERS.map((c) => c.displayName)).toEqual([
      "Cikgu Nisa", "Affan", "Ayan", "Unais", "Hannan", "Asiya", "Safiya",
    ]);
    expect(CHARACTERS.find((c) => c.id === "unais")?.roleEn).toBe("Builder");
  });

  it("points every character at an existing interim atlas frame", () => {
    const atlas = JSON.parse(
      readFileSync(fileURLToPath(new URL("../../public/atlases/interim-v2.json", import.meta.url)), "utf8"),
    ) as { frames: Record<string, unknown> };
    for (const c of CHARACTERS) expect(atlas.frames[c.interimFrame], c.id).toBeDefined();
  });

  it("unlock map only names known character ids", () => {
    const ids = new Set(CHARACTERS.map((c) => c.id));
    for (const id of Object.values(UNLOCK_ON_LEVEL)) expect(ids.has(id as never)).toBe(true);
  });
});
