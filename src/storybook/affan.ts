/**
 * Affan as a cut-out puppet: AI-painted turnaround (front / side / back) cut into torso, arms and
 * legs, animated here (walk cycle with leg swing / step, arm swing, body bob, idle breathing,
 * squash on start/stop, cross-fade between facings). One pick-up pose is a whole sprite.
 */
import Phaser from "phaser";
import rig from "./assets/affan_rig.json";

export const ATLAS_KEY = "storybook";
/** Affan's height in world units (v2 Cikgu Nisa is 48; the storybook camera is closer). */
export const AFFAN_H = 76;
const SRC_H = 329; // torso+legs height in the atlas (px)

type Part = { ox: number; oy: number; x: number; y: number };
type ViewName = "front" | "back" | "side";
export type Facing = "down" | "up" | "left" | "right";

interface View {
  c: Phaser.GameObjects.Container;
  torso: Phaser.GameObjects.Image;
  arms: Phaser.GameObjects.Image[];
  legs: Phaser.GameObjects.Image[];
  base: Map<Phaser.GameObjects.Image, { x: number; y: number }>;
}

export class Affan {
  readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Container;
  private readonly views: Record<ViewName, View>;
  private readonly pickup: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  facing: Facing = "down";
  private view: ViewName = "front";
  private phase = 0;
  private t = 0;
  private squash = 0;
  private wasMoving = false;
  posing = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.root = scene.add.container(x, y);
    this.shadow = scene.add.ellipse(0, 0, 48, 14, 0x000000, 0.35);
    this.body = scene.add.container(0, 0);
    this.body.setScale(AFFAN_H / SRC_H);
    this.root.add([this.shadow, this.body]);
    const r = rig as unknown as Record<ViewName, Record<string, Part>>;
    const mk = (name: ViewName): View => {
      const c = scene.add.container(0, 0);
      const base = new Map<Phaser.GameObjects.Image, { x: number; y: number }>();
      const img = (key: string): Phaser.GameObjects.Image => {
        const p = r[name][key]!;
        const im = scene.add.image(p.x, p.y, ATLAS_KEY, `affan_${name}_${key}`).setOrigin(p.ox, p.oy);
        base.set(im, { x: p.x, y: p.y });
        return im;
      };
      const torso = img("torso");
      let arms: Phaser.GameObjects.Image[], legs: Phaser.GameObjects.Image[];
      if (name === "side") {
        const legFar = img("leg0").setTint(0x9a8f88);
        const legNear = img("leg0");
        base.set(legFar, { x: r.side.leg0!.x + 6, y: r.side.leg0!.y });
        legs = [legNear, legFar];
        arms = [img("arm0")];
        c.add([legFar, legNear, torso, arms[0]!]);
      } else {
        legs = [img("leg0"), img("leg1")];
        arms = [img("arm0"), img("arm1")];
        // back view: the backpack hides the arms' roots, draw arms under the torso
        if (name === "back") c.add([...legs, ...arms, torso]);
        else c.add([...legs, torso, ...arms]);
      }
      c.setVisible(name === "front");
      this.body.add(c);
      return { c, torso, arms, legs, base };
    };
    this.views = { front: mk("front"), back: mk("back"), side: mk("side") };
    const pk = (rig as unknown as { pickup: { ox: number; oy: number } }).pickup;
    this.pickup = scene.add.image(0, 0, ATLAS_KEY, "affan_pickup").setOrigin(pk.ox, pk.oy).setVisible(false);
    this.body.add(this.pickup);
  }

  get x(): number { return this.root.x; }
  get y(): number { return this.root.y; }

  setFacing(f: Facing, scene: Phaser.Scene): void {
    if (f === this.facing) return;
    this.facing = f;
    const v: ViewName = f === "down" ? "front" : f === "up" ? "back" : "side";
    const flip = f === "left" ? -1 : 1;
    if (v === this.view) {
      // left <-> right: quick squash-flip instead of a pop
      scene.tweens.add({ targets: this.views.side.c, scaleX: { from: 0, to: flip }, duration: 110, ease: "Quad.easeOut" });
      return;
    }
    const from = this.views[this.view].c, to = this.views[v].c;
    to.setScale(v === "side" ? flip : 1, 1);
    to.setVisible(true).setAlpha(0);
    scene.tweens.add({ targets: to, alpha: 1, duration: 120 });
    scene.tweens.add({ targets: from, alpha: 0, duration: 120, onComplete: () => from.setVisible(false).setAlpha(1) });
    this.view = v;
  }

  /** Pick-up pose for `ms`, then back to the rig. */
  pose(scene: Phaser.Scene, ms: number, onMid: () => void): void {
    this.posing = true;
    const cur = this.views[this.view].c;
    this.pickup.setFlipX(this.facing === "left").setVisible(true).setScale(1, 0.9);
    cur.setVisible(false);
    scene.tweens.add({ targets: this.pickup, scaleY: 1, duration: 140, ease: "Back.easeOut" });
    scene.time.delayedCall(ms * 0.5, onMid);
    scene.time.delayedCall(ms, () => {
      this.pickup.setVisible(false);
      cur.setVisible(true);
      this.squash = 0.08;
      this.posing = false;
    });
  }

  /** speed01: 0 (idle) .. 1 (full walk speed). */
  update(dt: number, speed01: number): void {
    this.t += dt;
    const moving = speed01 > 0.08;
    if (moving !== this.wasMoving) this.squash = moving ? -0.05 : 0.07;
    this.wasMoving = moving;
    this.squash *= Math.exp(-dt * 9);
    this.phase += dt * (5 + 5.5 * speed01) * (moving ? 1 : 0);
    if (!moving) this.phase += (Math.round(this.phase / Math.PI) * Math.PI - this.phase) * (1 - Math.exp(-dt * 10));
    const s = Math.sin(this.phase);
    const amp = Math.min(1, speed01 * 1.3);
    const breathe = moving ? 0 : Math.sin(this.t * 2.4) * 0.012;
    const bob = -Math.abs(Math.cos(this.phase)) * 7 * amp;
    const sy = 1 + this.squash + breathe;
    const v = this.views[this.view];
    const B = (im: Phaser.GameObjects.Image) => v.base.get(im)!;
    if (this.view === "side") {
      v.torso.setPosition(B(v.torso).x, B(v.torso).y + bob);
      const [near, far] = v.legs as [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
      near.setRotation(-s * 0.55 * amp).setPosition(B(near).x, B(near).y + bob * 0.4);
      far.setRotation(s * 0.55 * amp).setPosition(B(far).x, B(far).y + bob * 0.4);
      v.arms[0]!.setRotation(s * 0.5 * amp).setPosition(B(v.arms[0]!).x, B(v.arms[0]!).y + bob);
    } else {
      v.torso.setPosition(B(v.torso).x, B(v.torso).y + bob);
      v.legs.forEach((leg, i) => {
        const lift = Math.max(0, i === 0 ? s : -s) * amp;
        leg.setPosition(B(leg).x, B(leg).y + bob * 0.5 - lift * 9).setScale(1, 1 - lift * 0.1);
      });
      v.arms.forEach((arm, i) => {
        const sw = (i === 0 ? -s : s) * amp;
        arm.setPosition(B(arm).x, B(arm).y + bob).setRotation(sw * 0.16 * (i === 0 ? 1 : -1)).setScale(1, 1 - Math.abs(sw) * 0.05);
      });
    }
    this.body.setScale((AFFAN_H / SRC_H) * (1 - this.squash * 0.6), (AFFAN_H / SRC_H) * sy);
    this.shadow.setScale(1 - Math.abs(bob) * 0.012, 1);
  }
}
