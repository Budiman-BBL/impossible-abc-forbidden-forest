/**
 * Affan as a cut-out puppet (rig v2): parts cut from the official turnaround (side / front / back),
 * placed every frame by forward kinematics from `affanRig.ts` (walk, idle breathing, gather crouch).
 * A facing shows ONE whole view set; facing left mirrors the whole root container.
 */
import Phaser from "phaser";
import rigJson from "./assets/affan_rig.json";
import atlasPng from "./assets/affan_atlas.png";
import atlasJson from "./assets/affan_atlas.json";
import { drawOrder, mirrorFor, poseLocals, solve, viewFor, type Facing, type PoseInput, type RigDef, type RigPart, type ViewName } from "./affanRig";

export type { Facing } from "./affanRig";
export const ATLAS_KEY = "storybook";
export const AFFAN_ATLAS = "affan";
/** Affan's height in world units (v2 Cikgu Nisa is 48; the storybook camera is closer). */
export const AFFAN_H = 76;
const rig = rigJson as unknown as RigDef;

export function preloadAffan(scene: Phaser.Scene): void {
  scene.load.atlas(AFFAN_ATLAS, atlasPng, atlasJson);
}

interface ViewSet {
  c: Phaser.GameObjects.Container;
  parts: RigPart[];
  imgs: Map<string, Phaser.GameObjects.Image>;
}

export class Affan {
  readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Container;
  private readonly views: Record<ViewName, ViewSet>;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  facing: Facing = "down";
  private view: ViewName = "front";
  private phase = 0;
  private t = 0;
  private amp = 0;
  private gather = 0;
  private squash = 0;
  private wasMoving = false;
  posing = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.root = scene.add.container(x, y);
    this.shadow = scene.add.ellipse(0, 0, 48, 14, 0x000000, 0.35);
    this.body = scene.add.container(0, 0);
    this.root.add([this.shadow, this.body]);
    const mk = (name: ViewName): ViewSet => {
      const c = scene.add.container(0, 0);
      const parts = rig.views[name];
      const imgs = new Map<string, Phaser.GameObjects.Image>();
      for (const p of drawOrder(parts)) {
        const im = scene.add.image(0, 0, AFFAN_ATLAS, p.frame).setOrigin(p.ox ?? 0.5, p.oy ?? 0.5);
        if (p.tint) im.setTint(Number(p.tint));
        imgs.set(p.id, im);
        c.add(im);
      }
      c.setVisible(name === this.view);
      this.body.add(c);
      return { c, parts, imgs };
    };
    this.views = { front: mk("front"), back: mk("back"), side: mk("side") };
    this.apply();
  }

  get x(): number { return this.root.x; }
  get y(): number { return this.root.y; }

  /** Swap the whole view set; left/right only mirror the root (never a part). */
  setFacing(f: Facing, scene?: Phaser.Scene): void {
    if (f === this.facing) return;
    this.facing = f;
    this.root.scaleX = Math.abs(this.root.scaleX) * mirrorFor(f);
    const v = viewFor(f);
    if (v === this.view) return;
    const from = this.views[this.view].c, to = this.views[v].c;
    this.view = v;
    this.apply();
    if (!scene) {
      from.setVisible(false);
      to.setVisible(true).setAlpha(1);
      return;
    }
    scene.tweens.killTweensOf([from, to]);
    to.setVisible(true).setAlpha(1);
    from.setAlpha(1);
    // short fade of the outgoing set on top of the incoming one (both are complete sets, so no mixed limbs)
    this.body.bringToTop(from);
    scene.tweens.add({ targets: from, alpha: 0, duration: 90, onComplete: () => from.setVisible(false).setAlpha(1) });
  }

  /** Gather / pick-up crouch for `ms`, `onMid` at the lowest point. */
  pose(scene: Phaser.Scene, ms: number, onMid: () => void): void {
    this.posing = true;
    const st = { g: 0 };
    scene.tweens.add({
      targets: st, g: 1, duration: ms * 0.45, ease: "Sine.easeInOut", yoyo: true, hold: ms * 0.1,
      onUpdate: () => { this.gather = st.g; },
      onComplete: () => { this.gather = 0; this.posing = false; this.squash = 0.06; },
    });
    scene.time.delayedCall(ms * 0.5, onMid);
  }

  /** speed01: 0 (idle) .. 1 (full walk speed). */
  update(dt: number, speed01: number): void {
    this.t += dt;
    const moving = speed01 > 0.08;
    if (moving !== this.wasMoving) this.squash = moving ? -0.04 : 0.05;
    this.wasMoving = moving;
    this.squash *= Math.exp(-dt * 9);
    const target = moving ? Math.min(1, speed01 * 1.25) : 0;
    this.amp += (target - this.amp) * (1 - Math.exp(-dt * 10));
    this.phase += dt * (6 + 5 * speed01) * (moving ? 1 : 0);
    // settle to a neutral (legs together) phase when stopping
    if (!moving) this.phase += (Math.round(this.phase / Math.PI) * Math.PI - this.phase) * (1 - Math.exp(-dt * 10));
    this.apply();
  }

  /** Deterministic pose (rig test / screenshots). */
  setPose(i: Partial<PoseInput>): void {
    if (i.phase !== undefined) this.phase = i.phase;
    if (i.amp !== undefined) this.amp = i.amp;
    if (i.gather !== undefined) this.gather = i.gather;
    if (i.t !== undefined) this.t = i.t;
    this.squash = 0;
    this.apply();
  }

  private apply(): void {
    const v = this.views[this.view];
    const w = solve(v.parts, poseLocals(this.view, { phase: this.phase, amp: this.amp, gather: this.gather, t: this.t }));
    for (const [id, im] of v.imgs) {
      const p = w[id]!;
      im.setPosition(p.x, p.y).setRotation(p.rot).setScale(p.sx, p.sy);
    }
    const k = AFFAN_H / rig.height;
    this.body.setScale(k * (1 - this.squash * 0.6), k * (1 + this.squash));
  }
}
