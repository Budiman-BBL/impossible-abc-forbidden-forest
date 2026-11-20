/**
 * Cikgu Nisa at camp, following the core NisaBrain routine.
 * - stand / attend: cut-out of her 3/4-front view from the official turnaround (body + head layer), breathing and head sway
 * - walk: Flow walk cycle (6 side frames, feet on a common ground line), frames advanced by distance walked, mirrored for left
 * - sit: Flow seated front view (cut at the seat line) behind the table on the back bench; the table hides her lap
 */
import Phaser from "phaser";
import type { NisaBrain } from "../core/camp";
import nisaMeta from "./assets/nisa.json";
import camp2Meta from "./assets/camp2_meta.json";
import { AFFAN_H } from "./affan";

export const CAMP_ATLAS = "camp";
const CAMP2 = "camp2";
/** an adult teacher: ~18% taller than Affan */
export const NISA_H = AFFAN_H * 1.18;
/** world units walked per full 6-frame cycle (two steps) */
const CYCLE = 56;

export class Nisa {
  readonly root: Phaser.GameObjects.Container;
  private readonly fig: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Image;
  private readonly head: Phaser.GameObjects.Image;
  private readonly walk: Phaser.GameObjects.Image;
  private readonly sit: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private t = Math.random() * 10;
  private walked = 0;
  private lastX: number;
  private lastY: number;

  constructor(scene: Phaser.Scene, private readonly brain: NisaBrain) {
    const m = nisaMeta as { height: number; neck: number; headH: number };
    this.root = scene.add.container(brain.x, brain.y);
    this.shadow = scene.add.ellipse(0, 0, 46, 13, 0x000000, 0.35);
    this.fig = scene.add.container(0, 0).setScale(NISA_H / m.height);
    this.body = scene.add.image(0, 0, CAMP_ATLAS, "nisa_body").setOrigin(0.5, 1);
    // head layer pivots at the neck; its frame starts at the top of the body frame
    this.head = scene.add.image(0, -m.height + m.neck, CAMP_ATLAS, "nisa_head").setOrigin(0.5, m.neck / m.headH);
    this.fig.add([this.body, this.head]);
    this.walk = scene.add.image(0, 0, CAMP2, "nisa_walk_0").setOrigin(0.5, 1).setScale(camp2Meta.scale).setVisible(false);
    this.sit = scene.add.image(0, 0, CAMP2, "nisa_sit").setOrigin(0.5, 1).setScale(camp2Meta.scale).setVisible(false);
    this.root.add([this.shadow, this.fig, this.walk, this.sit]);
    this.root.setDepth(brain.y);
    this.lastX = brain.x; this.lastY = brain.y;
  }

  get x(): number { return this.root.x; }
  get y(): number { return this.root.y; }

  update(dt: number): void {
    const b = this.brain, m = nisaMeta as { height: number; neck: number };
    this.t += dt;
    const mode = b.mode;
    this.walked += Math.hypot(b.x - this.lastX, b.y - this.lastY);
    this.lastX = b.x; this.lastY = b.y;
    this.root.setPosition(b.x, b.y).setDepth(b.y);
    const walking = mode === "walk", seated = mode === "sit";
    this.walk.setVisible(walking);
    this.sit.setVisible(seated);
    this.fig.setVisible(!walking && !seated);
    this.shadow.setVisible(!seated);
    if (walking) {
      const f = Math.floor((this.walked / CYCLE) * camp2Meta.walkFrames) % camp2Meta.walkFrames;
      this.walk.setFrame(`nisa_walk_${f}`).setFlipX(b.face < 0);
      return;
    }
    if (seated) {
      this.sit.setScale(camp2Meta.scale, camp2Meta.scale * (1 + Math.sin(this.t * 2.0) * 0.01));
      return;
    }
    const sx = Math.abs(this.fig.scaleX);
    if (Math.sign(this.fig.scaleX) !== b.face) this.fig.scaleX = sx * b.face;
    const breathe = Math.sin(this.t * 2.0) * 0.012;
    this.body.setScale(1, 1 + breathe);
    this.head.y = (-m.height + m.neck) * (1 + breathe);
    this.head.setRotation(Math.sin(this.t * 0.8) * 0.03 + Math.sin(this.t * 2.3) * 0.008);
  }
}
