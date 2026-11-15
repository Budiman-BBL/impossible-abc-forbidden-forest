/**
 * Dev-only rig test (`storybook/?rig=1`): four Affans (right, left, down, up) on a checkerboard.
 * `window.__RIG__.set({ phase, amp, gather, t })` poses all of them deterministically for screenshots;
 * without it they walk in place.
 */
import Phaser from "phaser";
import { Affan, preloadAffan } from "./affan";
import type { Facing, PoseInput } from "./affanRig";

const FACINGS: Facing[] = ["right", "left", "down", "up"];

export class RigTestScene extends Phaser.Scene {
  private affans: Affan[] = [];
  private manual = false;
  constructor() { super("rigtest"); }
  preload(): void { preloadAffan(this); }
  create(): void {
    const { width: w, height: h } = this.scale;
    const g = this.add.graphics();
    const s = 16;
    for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
      g.fillStyle(((x / s + y / s) & 1) ? 0xcfcfcf : 0xffffff).fillRect(x, y, s, s);
    }
    const scale = (h * 0.8) / 76;
    FACINGS.forEach((f, i) => {
      const a = new Affan(this, (w * (i + 0.5)) / FACINGS.length, h * 0.92);
      a.root.setScale(scale);
      a.setFacing(f);
      this.add.text((w * (i + 0.5)) / FACINGS.length, 6, f, { fontFamily: "sans-serif", fontSize: `${Math.round(h * 0.05)}px`, color: "#222" }).setOrigin(0.5, 0);
      this.affans.push(a);
    });
    const api = {
      set: (p: Partial<PoseInput>) => { this.manual = true; for (const a of this.affans) a.setPose(p); },
      walk: () => { this.manual = false; },
    };
    (window as unknown as { __RIG__?: typeof api }).__RIG__ = api;
  }
  update(_t: number, dms: number): void {
    if (this.manual) return;
    for (const a of this.affans) a.update(dms / 1000, 1);
  }
}
