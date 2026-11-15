import Phaser from "phaser";
import { FONT, PALETTE, css } from "./palette";

/** Parchment panel with ink outline, like the panels on the official style sheet v2. */
export function parchmentPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r = 14): void {
  g.fillStyle(PALETTE.ink, 0.45).fillRoundedRect(x + 3, y + 4, w, h, r);
  g.fillStyle(PALETTE.parchment).fillRoundedRect(x, y, w, h, r);
  g.fillStyle(PALETTE.parchmentLight, 0.6).fillRoundedRect(x + 4, y + 4, w - 8, h * 0.45, r - 4);
  g.lineStyle(3, PALETTE.ink).strokeRoundedRect(x, y, w, h, r);
  g.lineStyle(1.5, PALETTE.olive, 0.8).strokeRoundedRect(x + 5, y + 5, w - 10, h - 10, r - 5);
}

/** Rounded bar with dark trough and ink outline (style sheet v2 "UI Elements" bars). */
export function bar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, pct: number, fill: number): void {
  const p = Phaser.Math.Clamp(pct, 0, 1);
  g.fillStyle(PALETTE.barBack).fillRoundedRect(x, y, w, h, h / 2);
  if (p > 0) {
    const fw = Math.max(h - 4, (w - 4) * p);
    g.fillStyle(fill).fillRoundedRect(x + 2, y + 2, fw, h - 4, (h - 4) / 2);
    g.fillStyle(0xffffff, 0.22).fillRoundedRect(x + 4, y + 3, Math.max(0, fw - 4), (h - 4) * 0.35, (h - 4) * 0.17);
  }
  g.lineStyle(2.5, PALETTE.ink).strokeRoundedRect(x, y, w, h, h / 2);
}

export const textStyle = (size: number, color: number = PALETTE.ink, stroke?: number): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT,
  fontSize: `${size}px`,
  fontStyle: "bold",
  color: css(color),
  ...(stroke != null ? { stroke: css(stroke), strokeThickness: Math.max(3, size / 5) } : {}),
});

export interface RoundButton {
  container: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  setEnabled(on: boolean): void;
}

/**
 * Round parchment button with ink ring (style sheet v2 round buttons). The handler stops the
 * DOM event so taps on the HUD never reach the Game scene below.
 */
export function roundButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  drawIcon: (g: Phaser.GameObjects.Graphics, r: number) => void,
  caption: string,
  onTap: () => void,
): RoundButton {
  const g = scene.add.graphics();
  const draw = (pressed: boolean, enabled: boolean) => {
    g.clear();
    g.fillStyle(PALETTE.ink, 0.5).fillCircle(2, 4, radius);
    g.fillStyle(enabled ? (pressed ? PALETTE.tan : PALETTE.parchment) : PALETTE.parchmentDark).fillCircle(0, pressed ? 2 : 0, radius);
    g.lineStyle(4, PALETTE.ink).strokeCircle(0, pressed ? 2 : 0, radius);
    g.lineStyle(2, PALETTE.olive).strokeCircle(0, pressed ? 2 : 0, radius - 6);
    g.save();
    g.translateCanvas(0, pressed ? 2 : 0);
    drawIcon(g, radius);
    g.restore();
  };
  let enabled = true;
  draw(false, true);
  const label = scene.add.text(0, radius + 12, caption, textStyle(15, PALETTE.parchmentLight, PALETTE.ink)).setOrigin(0.5);
  const container = scene.add.container(x, y, [g, label]);
  const hit = scene.add.circle(0, 0, radius + 6, 0x000000, 0).setInteractive({ useHandCursor: true });
  container.add(hit);
  hit.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
    ev.stopPropagation();
    draw(true, enabled);
  });
  hit.on("pointerup", (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
    ev.stopPropagation();
    draw(false, enabled);
    onTap();
  });
  hit.on("pointerout", () => draw(false, enabled));
  return {
    container,
    label,
    setEnabled(on: boolean) {
      if (on === enabled) return;
      enabled = on;
      draw(false, on);
    },
  };
}

/** Small flame icon drawn with shapes (ink outline, orange/gold fill). */
export function flameIcon(g: Phaser.GameObjects.Graphics, cx: number, cy: number, s: number): void {
  const pts = (k: number) => [
    new Phaser.Math.Vector2(cx, cy - 16 * s * k),
    new Phaser.Math.Vector2(cx + 9 * s * k, cy - 2 * s * k),
    new Phaser.Math.Vector2(cx + 7 * s * k, cy + 9 * s * k),
    new Phaser.Math.Vector2(cx, cy + 12 * s * k),
    new Phaser.Math.Vector2(cx - 7 * s * k, cy + 9 * s * k),
    new Phaser.Math.Vector2(cx - 9 * s * k, cy - 2 * s * k),
  ];
  g.fillStyle(PALETTE.fireDeep).fillPoints(pts(1), true);
  g.lineStyle(2.5, PALETTE.ink).strokePoints(pts(1), true);
  g.fillStyle(PALETTE.gold).fillPoints(pts(0.5).map((p) => p.add(new Phaser.Math.Vector2(0, 5 * s))), true);
}
