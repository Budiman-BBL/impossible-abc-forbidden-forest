import Phaser from "phaser";
import { ATLAS } from "../config";
import { viewMetrics } from "../ui/layout";
import { FONT, PALETTE, css } from "../ui/palette";

/** Preload: loads the interim atlas and builds the light textures, with a parchment loading bar. */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super("Preload");
  }

  preload(): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const k = viewMetrics(this.scale.width, this.scale.height).ui;
    this.add
      .text(cx, cy - 70, "Impossible ABC\nThe Forbidden Forest", {
        fontFamily: FONT, fontSize: `${Math.round(40 * k)}px`, fontStyle: "bold", color: css(PALETTE.parchmentLight), align: "center",
        stroke: css(PALETTE.ink), strokeThickness: 6 * k,
      })
      .setOrigin(0.5)
      .setY(cy - 70 * k);
    const g = this.add.graphics();
    const w = 420 * k;
    const draw = (p: number) => {
      g.clear();
      g.fillStyle(PALETTE.barBack).fillRoundedRect(cx - w / 2, cy + 30 * k, w, 22 * k, 11 * k);
      g.fillStyle(PALETTE.fire).fillRoundedRect(cx - w / 2 + 3 * k, cy + 33 * k, Math.max(16 * k, (w - 6 * k) * p), 16 * k, 8 * k);
      g.lineStyle(3 * k, PALETTE.ink).strokeRoundedRect(cx - w / 2, cy + 30 * k, w, 22 * k, 11 * k);
    };
    draw(0);
    this.load.on("progress", draw);

    this.load.atlas(ATLAS, "atlases/interim-v2.png", "atlases/interim-v2.json");
    this.load.image("ground", "atlases/ground_tile_interim.png");
  }

  create(): void {
    this.makeRadial("lightBrush", 256, [
      [0, "rgba(0,0,0,1)"],
      [0.22, "rgba(0,0,0,1)"],
      [0.22 + 0.78 * 0.55, "rgba(0,0,0,0.75)"],
      [1, "rgba(0,0,0,0)"],
    ]);
    this.makeRadial("glowBrush", 256, [
      [0, "rgba(255,150,40,0.16)"],
      [1, "rgba(255,120,20,0)"],
    ]);
    this.scene.start("Game");
  }

  /** Radial gradient texture; stops mirror v2's canvas gradients (drawDarkness). */
  private makeRadial(key: string, size: number, stops: [number, string][]): void {
    if (this.textures.exists(key)) return;
    const tex = this.textures.createCanvas(key, size, size);
    if (!tex) return;
    const ctx = tex.getContext();
    const r = size / 2;
    const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
    for (const [at, color] of stops) grad.addColorStop(at, color);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }
}
