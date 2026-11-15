/**
 * Cikgu Nisa at camp: cut-out of her 3/4-front view from the official turnaround (body + head layer),
 * idle breathing and a slow head sway, turning (whole figure) towards Affan. She does not walk in Sprint 1.
 */
import Phaser from "phaser";
import nisaMeta from "./assets/nisa.json";
import { AFFAN_H } from "./affan";

export const CAMP_ATLAS = "camp";
/** an adult teacher: ~18% taller than Affan */
export const NISA_H = AFFAN_H * 1.18;

export class Nisa {
  readonly root: Phaser.GameObjects.Container;
  private readonly fig: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Image;
  private readonly head: Phaser.GameObjects.Image;
  private t = Math.random() * 10;
  private face = 1;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const m = nisaMeta as { height: number; neck: number; headH: number };
    this.root = scene.add.container(x, y);
    const shadow = scene.add.ellipse(0, 0, 50, 14, 0x000000, 0.35);
    this.fig = scene.add.container(0, 0).setScale(NISA_H / m.height);
    this.body = scene.add.image(0, 0, CAMP_ATLAS, "nisa_body").setOrigin(0.5, 1);
    // head layer pivots at the neck; its frame starts at the top of the body frame
    this.head = scene.add.image(0, -m.height + m.neck, CAMP_ATLAS, "nisa_head").setOrigin(0.5, m.neck / m.headH);
    this.fig.add([this.body, this.head]);
    this.root.add([shadow, this.fig]);
    this.root.setDepth(y);
  }

  update(dt: number, affanX: number, affanY: number): void {
    this.t += dt;
    const near = Math.hypot(affanX - this.root.x, affanY - this.root.y) < 320;
    if (near) {
      const want = affanX < this.root.x - 8 ? -1 : affanX > this.root.x + 8 ? 1 : this.face;
      if (want !== this.face) this.face = want;
    }
    const sx = Math.abs(this.fig.scaleX), cur = Math.sign(this.fig.scaleX) || 1;
    if (cur !== this.face) this.fig.scaleX = sx * this.face;
    const breathe = Math.sin(this.t * 2.0) * 0.012;
    this.body.setScale(1, 1 + breathe);
    this.head.y = (-(nisaMeta as { height: number }).height + (nisaMeta as { neck: number }).neck) * (1 + breathe);
    this.head.setRotation(Math.sin(this.t * 0.8) * 0.03 + Math.sin(this.t * 2.3) * 0.008);
  }
}
