import { describe, expect, it } from "vitest";
import { applySave, CAMP_CFG, CampSim, darknessAt, makeCampLayout, parseSave, phaseAt, T_MALAM, T_PAGI, toSave, type CampEvent } from "../../src/core/camp";

function gather(s: CampSim, kind: "kayu" | "batu" | "dahan", n: number): void {
  for (const node of s.nodes.filter((x) => x.kind === kind)) {
    if (n <= 0) return;
    s.player.x = node.x; s.player.y = node.y;
    s.collect(node.id);
    n--;
  }
}
function toFire(s: CampSim): void { s.player.x = s.layout.fire.x; s.player.y = s.layout.fire.y + 40; }
function run(s: CampSim, secs: number, dt = 0.1): CampEvent[] {
  const all: CampEvent[] = [];
  for (let t = 0; t < secs && s.outcome === "playing"; t += dt) all.push(...s.step(dt));
  return all;
}

describe("Sprint 1 camp", () => {
  it("layout matches the blueprint: one fire, 4 fixed lantern slots, 3 exits, seeded nodes", () => {
    const a = makeCampLayout(7), b = makeCampLayout(7);
    expect(a).toEqual(b);
    expect(a.lanternSlots).toHaveLength(4);
    expect(a.exits).toHaveLength(3);
    for (const k of ["kayu", "batu", "dahan", "beri"]) expect(a.nodes.filter((n) => n.kind === k).length).toBeGreaterThan(3);
  });

  it("clock runs siang → petang → malam → pagi and darkness follows", () => {
    expect(phaseAt(0)).toBe("siang");
    expect(phaseAt(T_MALAM - 1)).toBe("petang");
    expect(phaseAt(T_MALAM + 1)).toBe("malam");
    expect(phaseAt(T_PAGI)).toBe("pagi");
    expect(darknessAt(10)).toBe(0);
    expect(darknessAt(T_MALAM + 60)).toBeGreaterThan(0.8);
  });

  it("first fire needs 5 Kayu + 2 Batu; 1 Kayu = 20 fuel; light shrinks with fuel; fire can go out", () => {
    const s = new CampSim(1);
    toFire(s);
    expect(s.act().some((e) => e.type === "toast")).toBe(true);
    expect(s.fire.lit).toBe(false);
    gather(s, "kayu", 6); gather(s, "batu", 2);
    toFire(s);
    s.act();
    expect(s.fire.lit).toBe(true);
    expect(s.fire.fuel).toBe(100);
    expect(s.inv.kayu).toBe(1);
    const r100 = s.fireRadius();
    s.fire.fuel = 30;
    expect(s.fireRadius()).toBeLessThan(r100);
    s.fire.fuel = 50; s.act();
    expect(s.fire.fuel).toBe(70);
    s.fire.fuel = 0.01;
    const ev = run(s, 1);
    expect(ev.some((e) => e.type === "fire" && e.what === "out")).toBe(true);
    expect(s.fireRadius()).toBe(0);
  });

  it("carry limits hold and the storage feeds the fire", () => {
    const s = new CampSim(2);
    for (let i = 0; i < 30; i++) { gather(s, "kayu", 12); for (const n of s.nodes) n.amount = n.max; }
    expect(s.inv.kayu).toBe(CAMP_CFG.carry.kayu);
    s.player.x = s.layout.storage.x; s.player.y = s.layout.storage.y + 30;
    s.act();
    expect(s.inv.kayu).toBe(0);
    expect(s.store.kayu).toBe(10);
    gather(s, "batu", 2);
    toFire(s); s.act();
    expect(s.fire.lit).toBe(true);
    expect(s.store.kayu).toBe(5);
  });

  it("Bina: fire upgrade with 3 Batu works at camp; fence stays locked (Sprint 2)", () => {
    const s = new CampSim(3);
    gather(s, "kayu", 5); gather(s, "batu", 5);
    toFire(s); s.act();
    const opts = s.buildOptions();
    expect(opts.find((o) => o.id === "fence")!.enabled).toBe(false);
    expect(opts.find((o) => o.id === "upgrade")!.enabled).toBe(true);
    s.build("upgrade");
    expect(s.fire.level).toBe(2);
    expect(s.inv.batu).toBe(0);
  });

  it("wolves never enter the firelight, bite in the dark, and leave at dawn (pass condition)", () => {
    const s = new CampSim(4);
    gather(s, "kayu", 10); gather(s, "batu", 2);
    toFire(s); s.act();
    s.setClock(T_MALAM - 0.5);
    run(s, 1);
    expect(s.wolves.length).toBe(CAMP_CFG.wolf.count);
    // Affan stays by the fire, keeps it fed: wolves stay outside the light, no bites
    for (let i = 0; i < 400 && s.outcome === "playing"; i++) {
      toFire(s);
      if (s.fire.fuel < 60) s.feed();
      run(s, 0.25);
      for (const w of s.wolves) expect(Math.hypot(w.x - s.layout.fire.x, w.y - s.layout.fire.y)).toBeGreaterThanOrEqual(s.fireRadius() - 1);
      if (s.t > T_MALAM + 20) break;
    }
    expect(s.hearts).toBe(3);
    // walking into the dark gets Affan bitten
    s.player.x = s.layout.fire.x + 600; s.player.y = s.layout.fire.y;
    for (const w of s.wolves) { w.x = s.player.x + 40; w.y = s.player.y; }
    run(s, 2);
    expect(s.hearts).toBeLessThan(3);
    // back in the light until morning → won
    s.hearts = 3;
    s.setClock(T_PAGI - 1);
    toFire(s); s.fire.fuel = 100;
    const ev = run(s, 2);
    expect(ev.some((e) => e.type === "won")).toBe(true);
    expect(s.outcome).toBe("won");
  });

  it("losing all hearts ends the night", () => {
    const s = new CampSim(5);
    s.setClock(T_MALAM + 1); run(s, 0.2);
    s.player.x = s.layout.fire.x + 500; s.player.y = s.layout.fire.y;
    for (let i = 0; i < 200 && s.outcome === "playing"; i++) {
      for (const w of s.wolves) { w.x = s.player.x + 20; w.y = s.player.y; w.mode = "chase"; w.cd = 0; }
      run(s, 0.3);
    }
    expect(s.outcome).toBe("lost");
  });

  it("save data v1 round-trips", () => {
    const s = new CampSim(6);
    gather(s, "kayu", 5); gather(s, "batu", 2); gather(s, "dahan", 3);
    toFire(s); s.act(); s.setClock(100);
    const json = JSON.stringify(toSave(s));
    const d = parseSave(json)!;
    expect(d).not.toBeNull();
    expect(d.camp.lanternSlots).toEqual([false, false, false, false]);
    expect(d.player.inventory.dahan).toBe(3);
    const s2 = new CampSim(6);
    applySave(s2, d);
    expect(s2.fire.lit).toBe(true);
    expect(s2.inv.dahan).toBe(3);
    expect(s2.t).toBe(100);
    expect(parseSave("{}")).toBeNull();
    expect(parseSave("nope")).toBeNull();
  });
});
