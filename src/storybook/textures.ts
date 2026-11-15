/** Small textures drawn at boot (soft light brush, glow, fog, firefly) so the atlas stays art-only. */
import Phaser from "phaser";

function radial(scene: Phaser.Scene, key: string, size: number, stops: [number, string][]): void {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, size, size)!;
  const ctx = t.getContext();
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  t.refresh();
}

export function makeTextures(scene: Phaser.Scene): void {
  // erase brush: same falloff idea as core lightAt (1 - d/r), softened at the rim
  radial(scene, "sbLight", 256, [[0, "rgba(255,255,255,1)"], [0.55, "rgba(255,255,255,0.85)"], [0.85, "rgba(255,255,255,0.3)"], [1, "rgba(255,255,255,0)"]]);
  radial(scene, "sbGlow", 256, [[0, "rgba(255,190,90,0.55)"], [0.4, "rgba(255,140,50,0.22)"], [1, "rgba(255,120,40,0)"]]);
  radial(scene, "sbFly", 32, [[0, "rgba(255,255,200,1)"], [0.25, "rgba(255,235,120,0.9)"], [1, "rgba(255,210,60,0)"]]);
  if (!scene.textures.exists("sbFog")) {
    const w = 512, h = 192;
    const t = scene.textures.createCanvas("sbFog", w, h)!;
    const ctx = t.getContext();
    let s = 1234;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      const x = 40 + rnd() * (w - 80), y = h * 0.35 + rnd() * h * 0.4, r = 30 + rnd() * 60;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(215,225,235,0.16)");
      g.addColorStop(1, "rgba(215,225,235,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    t.refresh();
  }
}
