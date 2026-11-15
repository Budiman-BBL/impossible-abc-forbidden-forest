import { describe, expect, it } from "vitest";
import balance from "../../src/data/balance.json";
import { legacyCfg, legacyConstSource } from "./legacyV2";

describe("balance.json matches legacy v2", () => {
  it("has every CFG value of v2, unchanged", () => {
    const cfg = legacyCfg();
    expect(Object.keys(balance.cfg).sort()).toEqual(Object.keys(cfg).sort());
    expect(balance.cfg).toEqual(cfg);
  });

  it("keeps the camp layout of v2", () => {
    const src = legacyConstSource("CAMPS_LAYOUT").replace(/^const CAMPS_LAYOUT = /, "").replace(/;$/, "");
    const legacy = new Function(`return (${src});`)() as unknown[];
    expect(balance.camps).toEqual(legacy);
  });
});
