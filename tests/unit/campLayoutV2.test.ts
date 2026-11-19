import { describe, expect, it } from "vitest";
import { applySave, CAMP_C, CampSim, CLEARING_R, makeCampLayout, NisaBrain, parseSave, toSave, walkable, WORLD_H, WORLD_W } from "../../src/core/camp";

describe("camp v2 layout (fixed, hand-placed)", () => {
  const L = makeCampLayout();

  it("world 4800×4000, fire at the centre of a flat round clearing; same map every run", () => {
    expect([L.worldW, L.worldH]).toEqual([WORLD_W, WORLD_H]);
    expect([WORLD_W, WORLD_H]).toEqual([4800, 4000]);
    expect(L.fire).toEqual(CAMP_C);
    expect(CLEARING_R).toBeGreaterThanOrEqual(340);
    expect(makeCampLayout()).toEqual(L);
    expect(new CampSim(1).layout).toEqual(new CampSim(999).layout);
  });

  it("three tents, a table with seating, storage, letter slot, 4 reserved lantern slots, 3 trails", () => {
    expect(L.tents.map((t) => t.kind).sort()).toEqual(["tent_boys", "tent_girls", "tent_nisa"]);
    expect(L.furniture.some((f) => f.kind === "table")).toBe(true);
    expect(L.furniture.filter((f) => f.kind === "bench" || f.kind === "stool").length).toBeGreaterThanOrEqual(2);
    expect(Math.hypot(L.letterSlot.x - L.fire.x, L.letterSlot.y - L.fire.y)).toBeLessThan(110);
    expect(L.lanternSlots).toHaveLength(4);
    expect(L.trails.map((t) => t.id)).toEqual(["belukar", "batu", "larangan"]);
    for (const o of [...L.tents, ...L.furniture, L.storage, L.spawn]) expect(Math.hypot(o.x - L.fire.x, o.y - L.fire.y)).toBeLessThan(CLEARING_R);
  });

  it("keeps the tested resource counts (Kayu 12, Batu 7, Dahan 10, Beri 5), all on open ground and reachable", () => {
    const count = (k: string) => L.nodes.filter((n) => n.kind === k).length;
    expect([count("kayu"), count("batu"), count("dahan"), count("beri")]).toEqual([12, 7, 10, 5]);
    // flood-fill the walkable grid from Affan's spawn; every node must be reachable
    const S = 20, w = Math.ceil(WORLD_W / S), h = Math.ceil(WORLD_H / S);
    const seen = new Uint8Array(w * h), q: number[] = [];
    const push = (x: number, y: number) => { const i = y * w + x; if (x < 0 || y < 0 || x >= w || y >= h || seen[i] || !walkable(x * S + S / 2, y * S + S / 2)) return; seen[i] = 1; q.push(i); };
    push(Math.floor(L.spawn.x / S), Math.floor(L.spawn.y / S));
    while (q.length) { const i = q.pop()!, x = i % w, y = (i / w) | 0; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
    for (const n of L.nodes) expect(seen[Math.floor(n.y / S) * w + Math.floor(n.x / S)], `${n.kind} ${n.x},${n.y}`).toBe(1);
    // Day 1 is doable close to camp: 3 Kayu in the west glade, the rest along the trails
    expect(L.nodes.filter((n) => n.kind === "kayu" && Math.hypot(n.x - L.fire.x, n.y - L.fire.y) < 900).length).toBeGreaterThanOrEqual(3);
  });

  it("Night-1 fence: weak pieces with gaps and open gates on every trail; states are saved", () => {
    const st = new Set(L.fence.map((f) => f.state));
    expect(st.has("weak") && st.has("missing") && st.has("damaged")).toBe(true);
    expect(st.has("solid")).toBe(false);
    for (const tr of L.trails) {
      const mouth = tr.pts[1]!;
      const ang = Math.atan2(mouth.y - L.fire.y, mouth.x - L.fire.x);
      const gate = L.fence.find((f) => f.gate && Math.abs(Math.atan2(Math.sin(Math.atan2((f.a.y + f.b.y) / 2 - L.fire.y, (f.a.x + f.b.x) / 2 - L.fire.x) - ang), Math.cos(Math.atan2((f.a.y + f.b.y) / 2 - L.fire.y, (f.a.x + f.b.x) / 2 - L.fire.x) - ang))) < 0.3);
      expect(gate, tr.id).toBeTruthy();
    }
    const s = new CampSim(3);
    s.fenceStates[0] = "solid";
    const d = parseSave(JSON.stringify(toSave(s)))!;
    const s2 = new CampSim(3);
    applySave(s2, d);
    expect(s2.fenceStates).toEqual(s.fenceStates);
  });
});

describe("Cikgu Nisa routine", () => {
  const L = makeCampLayout();
  const far = { x: L.fire.x + 2000, y: L.fire.y };

  it("sits at the table, then walks and stands around camp, and comes back", () => {
    const b = new NisaBrain(L.nisaRoute);
    expect(b.mode).toBe("sit");
    const seen = new Set<string>();
    let maxR = 0;
    for (let t = 0; t < 200; t += 0.1) {
      b.step(0.1, far);
      seen.add(b.mode);
      maxR = Math.max(maxR, Math.hypot(b.x - L.fire.x, b.y - L.fire.y));
      // never walks through the fire
      expect(Math.hypot(b.x - L.fire.x, b.y - L.fire.y)).toBeGreaterThan(60);
    }
    expect([...seen].sort()).toEqual(["sit", "stand", "walk"]);
    expect(maxR).toBeLessThan(CLEARING_R);
  });

  it("can be talked to while seated, from the front of the table", () => {
    const s = new CampSim(5);
    const table = L.furniture.find((f) => f.kind === "table")!;
    s.player.x = table.x; s.player.y = table.y + 30;
    expect(s.nisa.mode).toBe("sit");
    expect(s.currentAction()?.kind).toBe("talk");
  });

  it("stops for Affan while walking and the talk action follows her", () => {
    const s = new CampSim(5);
    s.player.x = far.x; s.player.y = far.y;
    for (let i = 0; i < 400 && s.nisa.mode !== "walk"; i++) s.step(0.1);
    expect(s.nisa.mode).toBe("walk");
    s.player.x = s.nisa.x + 30; s.player.y = s.nisa.y + 10;
    s.step(0.1);
    expect(s.nisa.mode).toBe("attend");
    const at = { x: s.nisa.x, y: s.nisa.y };
    for (let i = 0; i < 50; i++) s.step(0.1);
    expect(Math.hypot(s.nisa.x - at.x, s.nisa.y - at.y)).toBeLessThan(0.01);
    expect(s.currentAction()?.kind).toBe("talk");
    expect(s.act().some((e) => e.type === "nisa")).toBe(true);
    s.player.x = far.x; s.player.y = far.y;
    s.step(0.1);
    expect(s.nisa.mode).toBe("walk");
  });
});
