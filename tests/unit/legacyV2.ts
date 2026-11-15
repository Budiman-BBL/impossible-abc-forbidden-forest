/**
 * Loads formulas straight out of legacy/kem-api-unggun-v2.html so tests compare the new
 * TypeScript code against the real prototype code, not against copied numbers.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../../legacy/kem-api-unggun-v2.html", import.meta.url)), "utf8");

function blockFrom(start: number): string {
  const open = html.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error("unbalanced braces in legacy file");
}

export function legacySource(name: string): string {
  const start = html.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`legacy function ${name} not found`);
  return blockFrom(start);
}

export function legacyCfg(): Record<string, unknown> {
  const start = html.indexOf("const CFG = {");
  const src = blockFrom(start).replace(/^const CFG = /, "");
  return new Function(`return (${src});`)() as Record<string, unknown>;
}

export function legacyConstSource(name: string): string {
  const m = new RegExp(`const ${name} = [^;]+;`).exec(html);
  if (!m) throw new Error(`legacy const ${name} not found`);
  return m[0];
}

export interface LegacyS {
  time: number;
  fuel: number;
  fuelMax: number;
  level: number;
  logs: number;
  chars: { nisa: { alive: boolean } };
  camps: { main: boolean; lit: boolean; x: number; y: number }[];
  stats: { fed: number };
}

/** Builds the legacy fire functions bound to a mutable legacy state object `S`. */
export function legacyFire(S: LegacyS) {
  const CFG = legacyCfg();
  const names = ["decayMul", "mainLightMax", "mainLightR", "campLightR", "nightIndex", "upgradeCost", "feedFire", "fireSpriteId"];
  const body = `
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const lerp = (a, b, t) => a + (b - a) * t;
    const toast = () => {}; const puff = () => {}; const hinted = {}; const Aud = { feed() {} };
    ${names.map(legacySource).join("\n")}
    return { ${names.join(", ")} };`;
  return new Function("CFG", "S", body)(CFG, S) as {
    decayMul(): number;
    mainLightMax(): number;
    mainLightR(): number;
    campLightR(c: { main: boolean; lit: boolean }): number;
    nightIndex(): number;
    upgradeCost(): number | null;
    feedFire(n?: number): boolean;
    fireSpriteId(c: { main: boolean; lit: boolean }): string;
  };
}

export function legacyMulberry32(): (seed: number) => () => number {
  return new Function(`${legacySource("mulberry32")}; return mulberry32;`)() as (seed: number) => () => number;
}
