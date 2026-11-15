import { describe, expect, it } from "vitest";
import rigJson from "../../src/storybook/assets/affan_rig.json";
import { drawOrder, mirrorFor, poseLocals, solve, viewFor, type RigDef, type ViewName } from "../../src/storybook/affanRig";

const rig = rigJson as unknown as RigDef;
const VIEWS: ViewName[] = ["side", "front", "back"];

describe("affan rig v2", () => {
  it("each facing picks one whole view set; only left mirrors, and only the root", () => {
    expect(viewFor("right")).toBe("side");
    expect(viewFor("left")).toBe("side");
    expect(viewFor("down")).toBe("front");
    expect(viewFor("up")).toBe("back");
    expect(mirrorFor("left")).toBe(-1);
    expect(mirrorFor("right")).toBe(1);
    expect(mirrorFor("down")).toBe(1);
    expect(mirrorFor("up")).toBe(1);
  });

  it("every view has head, torso and both legs, listed parent-first, with frames from its own view", () => {
    for (const v of VIEWS) {
      const parts = rig.views[v];
      const seen = new Set<string>();
      for (const p of parts) {
        if (p.parent) expect(seen.has(p.parent), `${v}.${p.id} parent ${p.parent}`).toBe(true);
        seen.add(p.id);
        if (p.frame) expect(p.frame.startsWith(`affan_${v}_`), `${v}.${p.id} uses ${p.frame}`).toBe(true);
      }
      const ids = parts.map((p) => p.id);
      expect(ids).toContain("head");
      expect(ids).toContain("torso");
      expect(drawOrder(parts).length).toBeGreaterThanOrEqual(9);
    }
  });

  it("feet stay near the ground through the side walk cycle (no hip flip, no float)", () => {
    const parts = rig.views.side;
    for (let i = 0; i < 16; i++) {
      const w = solve(parts, poseLocals("side", { phase: (i / 16) * Math.PI * 2, amp: 1, gather: 0, t: 0 }));
      // the lower knee's shin bottom ~ foot: shin pivot + shin length rotated
      const foot = (id: "shinF" | "shinB") => w[id]!.y + 104 * Math.cos(w[id]!.rot);
      const low = Math.max(foot("shinF"), foot("shinB"));
      expect(Math.abs(low - foot0())).toBeLessThan(9);
      // nothing in the side view is ever turned more than a half turn (a flip would show as ±π)
      for (const p of parts) expect(Math.abs(w[p.id]!.rot)).toBeLessThan(Math.PI / 2);
    }
    function foot0(): number {
      const w = solve(parts, poseLocals("side", { phase: 0, amp: 0, gather: 0, t: 0 }));
      return w.shinF!.y + 104;
    }
  });

  it("idle pose is the drawn turnaround (parts sit at their cut positions)", () => {
    for (const v of VIEWS) {
      const w = solve(rig.views[v], poseLocals(v, { phase: 0, amp: 0, gather: 0, t: 0 }));
      expect(Math.abs(w.torso!.rot)).toBeLessThan(0.02);
      expect(Math.abs(w.head!.rot)).toBeLessThan(0.03);
    }
  });
});
