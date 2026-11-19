/**
 * Cikgu Nisa at camp: cut-out of her 3/4-front view from the official turnaround (body + head layer).
 * She follows the core NisaBrain routine: sits at the table, stands, walks short loops, stops for Affan.
 * There is no sitting or walking art yet: "sitting" = she settles behind the table on the back bench
 * (the table hides her legs), "walking" = the standing cut-out with a step bob and sway.
 */
import Phaser from "phaser";
import type { CampObject, NisaBrain } from "../core/camp";
import nisaMeta from "./assets/nisa.json";
import { AFFAN_H } from "./affan";

export const CAMP_ATLAS = "camp";
/** an adult teacher: ~18% taller than Affan */
export const NISA_H = AFFAN_H * 1.18;
/** how far she sinks when seated behind the table (world units) */
const SIT_DROP = 40;
/** share of the body frame hidden (legs) while seated, so nothing pokes out under the table */
const SIT_CROP = 0.42;

export class Nisa {
  readonly root: Phaser.GameObjects.Container;
  private readonly fig: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Image;
  private readonly head: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly seatDepth: number;
  private t = Math.random() * 10;
  private sit = 1;
  private walkPh = 0;

  constructor(scene: Phaser.Scene, private readonly brain: NisaBrain, furniture: CampObject[]) {
    const m = nisaMeta as { height: number; neck: number; headH: number };
    this.root = scene.add.container(brain.x, brain.y);
    this.shadow = scene.add.ellipse(0, 0, 50, 14, 0x000000, 0.35);
    this.fig = scene.add.container(0, 0).setScale(NISA_H / m.height);
    this.body = scene.add.image(0, 0, CAMP_ATLAS, "nisa_body").setOrigin(0.5, 1);
    // head layer pivots at the neck; its frame starts at the top of the body frame
    this.head = scene.add.image(0, -m.height + m.neck, CAMP_ATLAS, "nisa_head").setOrigin(0.5, m.neck / m.headH);
    this.fig.add([this.body, this.head]);
    this.root.add([this.shadow, this.fig]);
    // seated she is drawn just above the back bench and below the table
    const bench = furniture.filter((f) => f.kind === "bench").sort((a, b) => a.y - b.y)[0];
    this.seatDepth = (bench?.y ?? brain.y) + 1;
    this.root.setDepth(brain.y);
  }

  get x(): number { return this.root.x; }
  get y(): number { return this.root.y; }

  update(dt: number): void {
    const b = this.brain, m = nisaMeta as { height: number; neck: number };
    this.t += dt;
    const seated = b.mode === "sit";
    this.sit += ((seated ? 1 : 0) - this.sit) * (1 - Math.exp(-dt * 6));
    const walking = b.mode === "walk";
    if (walking) this.walkPh += dt * 7.5;
    const bob = walking ? Math.abs(Math.sin(this.walkPh)) * 2.2 : 0;
    this.root.setPosition(b.x, b.y).setDepth(this.sit > 0.5 ? this.seatDepth : b.y);
    this.fig.y = this.sit * SIT_DROP - bob;
    const fw = this.body.frame.width, fh = this.body.frame.height;
    if (this.sit > 0.5) this.body.setCrop(0, 0, fw, fh * (1 - SIT_CROP));
    else if (this.body.isCropped) this.body.setCrop();
    this.fig.rotation = walking ? Math.sin(this.walkPh) * 0.035 : 0;
    this.shadow.setAlpha(1 - this.sit).setScale(walking ? 1 - bob * 0.04 : 1, 1);
    const sx = Math.abs(this.fig.scaleX);
    if (Math.sign(this.fig.scaleX) !== b.face) this.fig.scaleX = sx * b.face;
    const breathe = Math.sin(this.t * 2.0) * 0.012;
    this.body.setScale(1, 1 + breathe);
    this.head.y = (-m.height + m.neck) * (1 + breathe);
    this.head.setRotation(Math.sin(this.t * 0.8) * 0.03 + Math.sin(this.t * 2.3) * 0.008 + (walking ? Math.sin(this.walkPh) * 0.02 : 0));
  }
}
