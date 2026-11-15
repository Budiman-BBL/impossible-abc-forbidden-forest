/**
 * Wolf drawn from the official wolf sheets (cut-outs, no rig): side view with a walk bob/squash,
 * front/back views when moving down/up, growl near the camp, lunge when attacking, and the
 * "flinch from light" pose with a white flash when the firelight catches it. Left = whole sprite mirrored.
 */
import Phaser from "phaser";
import type { Wolf } from "../core/camp";
import { CAMP_ATLAS } from "./nisa";

/** world units per cut-out pixel: the side view's shoulder (~190 px) ≈ Affan's height (76) */
const WOLF_SCALE = 0.3;

export class WolfSprite {
  readonly root: Phaser.GameObjects.Container;
  private readonly img: Phaser.GameObjects.Image;
  private readonly flash: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private t = Math.random() * 5;
  private face = 1;

  constructor(scene: Phaser.Scene, w: Wolf) {
    this.root = scene.add.container(w.x, w.y);
    this.shadow = scene.add.ellipse(0, 0, 90, 18, 0x000000, 0.35);
    this.img = scene.add.image(0, 0, CAMP_ATLAS, "wolf_side").setOrigin(0.5, 0.97).setScale(WOLF_SCALE);
    this.flash = scene.add.image(0, 0, CAMP_ATLAS, "wolf_flinch").setOrigin(0.5, 0.97).setScale(WOLF_SCALE).setTintFill(0xffffff).setAlpha(0);
    this.root.add([this.shadow, this.img, this.flash]);
    this.root.setAlpha(0);
    scene.tweens.add({ targets: this.root, alpha: 1, duration: 700 });
  }

  update(dt: number, w: Wolf, nearPlayer: number, inDarkGlow: number): void {
    this.t += dt;
    this.root.setPosition(w.x, w.y).setDepth(w.y);
    const moving = w.moving > 8;
    let frame = "wolf_side";
    if (w.flinch > 0) frame = "wolf_flinch";
    else if (w.lunge > 0) frame = "wolf_lunge";
    else if (!moving && nearPlayer < 260) frame = "wolf_growl";
    else if (moving && Math.abs(w.vy) > Math.abs(w.vx) * 1.4) frame = w.vy > 0 ? "wolf_front" : "wolf_back";
    if (this.img.frame.name !== frame) this.img.setFrame(frame);
    if (Math.abs(w.vx) > 0.25) this.face = w.vx < 0 ? -1 : 1;
    const side = frame !== "wolf_front" && frame !== "wolf_back";
    // whole sprite mirrored for left (the art faces right)
    this.root.scaleX = side ? this.face : 1;
    const ph = this.t * (w.mode === "chase" ? 11 : 7);
    const bob = moving ? Math.abs(Math.sin(ph)) * 3.5 : Math.sin(this.t * 2) * 0.6;
    const sq = moving ? Math.sin(ph * 2) * 0.025 : Math.sin(this.t * 2) * 0.01;
    this.img.setPosition(0, -bob).setScale(WOLF_SCALE * (1 - sq), WOLF_SCALE * (1 + sq));
    this.img.setRotation(moving && side ? Math.sin(ph) * 0.03 : 0);
    if (frame === "wolf_growl") this.img.x = Math.sin(this.t * 30) * 0.6;
    this.flash.setFrame(frame).setPosition(this.img.x, this.img.y).setScale(this.img.scaleX, this.img.scaleY).setRotation(this.img.rotation);
    this.flash.setAlpha(w.flinch > 0 ? Math.min(0.75, w.flinch) : 0);
    this.shadow.setScale(side ? 1 : 0.55, 1);
    // night: keep the art a touch darker than Affan so the red-eyed threat reads (glow handled by the scene)
    this.img.setTint(Phaser.Display.Color.GetColor(255 - 90 * inDarkGlow, 255 - 90 * inDarkGlow, 255 - 70 * inDarkGlow));
    if (w.mode === "gone") this.root.setVisible(false);
  }

  /** World positions of the glowing eyes for the current frame (none when facing away or flinching). */
  eyes(): { x: number; y: number }[] {
    const f = this.img.frame.name;
    const E: Record<string, [number, number][]> = {
      wolf_side: [[45, -88]], wolf_growl: [[42, -50]], wolf_lunge: [[47, -77]], wolf_front: [[-6.5, -88], [6.5, -88]],
    };
    const pts = E[f];
    if (!pts || !this.root.visible) return [];
    const sx = this.root.scaleX;
    const k = WOLF_SCALE / 0.4; // offsets were measured at 0.4
    return pts.map(([x, y]) => ({ x: this.root.x + x * k * sx, y: this.root.y + y * k + this.img.y }));
  }

  destroy(): void { this.root.destroy(); }
}
