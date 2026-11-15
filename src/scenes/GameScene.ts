import Phaser from "phaser";
import { ATLAS, CHAR_WORLD_H_NISA, VERSION, WORLD_TO_SCREEN } from "../config";
import { DESIGN_H, renderDpr } from "../ui/layout";
import { CHARACTERS, characterById } from "../data/characters";
import {
  CAMERA,
  CFG,
  GameCore,
  clamp,
  dist,
  fireSpriteId,
  lightAt,
  seedFromUrl,
  type CoreEvent,
  type FireState,
  type LightSource,
  type Tree,
  type World,
} from "../core";
import { FONT, PALETTE, css } from "../ui/palette";

export type { HudState } from "../core";

const DARK_LAYER_RES = 0.5; // darkness rendered at half resolution (plan: risk E)

/**
 * Game: the Phaser 2D view of the shared GameCore (src/core). Tap a lit tree to chop it (+2 kayu after 3.8 s),
 * tap the campfire to feed it, upgrade it from the HUD. Drag to pan, pinch/wheel to zoom.
 */
export class GameScene extends Phaser.Scene {
  private core!: GameCore;
  private world!: World;
  private fire!: FireState;
  private userZoom = 1;
  private treeSprites = new Map<number, Phaser.GameObjects.Image>();
  private stumpSprites = new Map<number, Phaser.GameObjects.Ellipse>();
  private campFire = new Map<string, Phaser.GameObjects.Image>();
  private chopGfx!: Phaser.GameObjects.Graphics;
  private dark!: Phaser.GameObjects.RenderTexture;
  private brush!: Phaser.GameObjects.Image;
  private glows: Phaser.GameObjects.Image[] = [];
  private eyesGfx!: Phaser.GameObjects.Graphics;
  private critterSprites: { img: Phaser.GameObjects.Image; baseY: number; bob: number }[] = [];
  private animT = 0;
  private drag = { down: false, panned: false, x: 0, y: 0, pinchD: 0 };

  constructor() {
    super("Game");
  }

  create(): void {
    const seed = seedFromUrl(window.location.search);
    this.core = new GameCore(seed);
    this.world = this.core.world;
    this.fire = this.core.fire;
    this.treeSprites.clear();
    this.stumpSprites.clear();
    this.campFire.clear();
    this.glows = [];
    this.critterSprites = [];
    this.userZoom = 1;

    this.buildWorld();
    this.buildLighting();
    this.setupCamera();
    this.setupInput();

    this.scene.launch("UI");
    this.scene.bringToTop("UI");

    const ui = this.scene.get("UI");
    ui.events.off("ui:upgrade").on("ui:upgrade", () => this.tryUpgrade());
    ui.events.off("ui:recenter").on("ui:recenter", () => this.recenter());
    ui.events.off("ui:restart").on("ui:restart", () => this.scene.restart());

    window.__ABC__ = {
      version: VERSION,
      ready: true,
      seed,
      scene: "Game",
      fire: this.fire,
      world: { trees: this.world.trees.length, camps: this.world.camps.length },
      feed: () => this.tryFeed(),
      chopNearest: () => {
        const t = this.core.nearestTreeToCamp();
        if (t) this.tryChop(t);
      },
    };
    this.time.delayedCall(400, () => this.toast("Tap pokok dalam cahaya untuk tebang kayu. Tap api unggun untuk masukkan kayu."));
  }

  // ---------- world ----------
  private img(frame: string, x: number, y: number, worldH: number, flip = false): Phaser.GameObjects.Image {
    const im = this.add.image(x, y, ATLAS, frame);
    im.setScale((worldH / im.height) * (flip ? -1 : 1), worldH / im.height);
    im.setDepth(y);
    return im;
  }

  private shadow(x: number, y: number, w: number): void {
    this.add.ellipse(x, y + 2, w * 2, 6.8, 0x000000, 0.35).setDepth(y - 0.5);
  }

  private buildWorld(): void {
    const W = CFG.WORLD;
    const ground = this.add.tileSprite(0, 0, W, W, "ground").setOrigin(0, 0).setDepth(-10);
    const tex = this.textures.get("ground").getSourceImage() as HTMLImageElement;
    ground.setTileScale(128 / tex.width, 128 / tex.height);
    ground.setTint(0x5e5a54); // v2 darkened the tile with rgba(6,8,12,0.62)

    const g = this.add.graphics().setDepth(-5);
    for (const c of this.world.camps) {
      g.fillStyle(c.lit ? 0x463214 : 0x1e1c18, c.lit ? 0.35 : 0.45).fillCircle(c.x, c.y, c.main ? 92 : 70);
      if (c.main) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + 0.2;
          g.fillStyle(0x3a3a36).fillEllipse(c.x + Math.cos(a) * 22, c.y + Math.sin(a) * 16 + 6, 12, 8);
          g.lineStyle(2, 0x000000).strokeEllipse(c.x + Math.cos(a) * 22, c.y + Math.sin(a) * 16 + 6, 12, 8);
        }
      } else {
        g.lineStyle(2, 0xdcb478, 0.55).strokeCircle(c.x, c.y, 26);
      }
    }

    for (const r of this.world.rocks) {
      this.shadow(r.x, r.y, 10);
      this.img("rocks", r.x, r.y, 20 * r.s);
    }
    for (const b of this.world.bushes) {
      this.shadow(b.x, b.y, 10);
      this.img(b.full ? "berry_full" : "berry_empty", b.x, b.y, 24 * b.s);
    }
    for (const t of this.world.tents) {
      this.shadow(t.x, t.y, 22);
      this.img("tent", t.x, t.y, 58);
    }
    for (const t of this.world.trees) {
      const frame = t.kind === "rubber" ? "tree_rubber" : t.kind === "bamboo" ? "bamboo" : "tree_coconut";
      const h = t.kind === "rubber" ? 92 : t.kind === "bamboo" ? 78 : 82;
      this.shadow(t.x, t.y, 16);
      this.treeSprites.set(t.id, this.img(frame, t.x, t.y, h));
      const stump = this.add.ellipse(t.x, t.y + 4, 16, 9, 0x3a2a18).setStrokeStyle(2.5, 0x000000).setDepth(t.y).setVisible(false);
      this.stumpSprites.set(t.id, stump);
      if (t.hasOwl) this.img("owl_front", t.x + 10, t.y - h * 0.62, 22, t.sway > 3).setDepth(t.y + 1);
    }
    for (const c of this.world.camps) {
      this.add.ellipse(c.x, c.y + 8, 32, 14, 0xff8c28, 0.22).setDepth(c.y + 3).setName(`glowfloor-${c.id}`);
      this.shadow(c.x, c.y, 12);
      const scale = c.main ? 1 : 0.8;
      const im = this.img(fireSpriteId(this.fire, c), c.x, c.y, 36 * scale).setDepth(c.y + 4);
      im.setData("scale", scale);
      this.campFire.set(c.id, im);
    }
    for (const cr of this.world.critters) {
      const img = this.img(cr.kind === "kera" ? "kera_side" : "ayam_side", cr.x, cr.y, cr.kind === "kera" ? 26 : 22, cr.facing < 0);
      this.critterSprites.push({ img, baseY: cr.y, bob: cr.bob });
    }

    // Starting characters stand around the main camp like v2 (first 3 of v2's order).
    // Static interim sprites: walking, selection and animation start in Sprint 2.
    const main = this.world.camps[0]!;
    const nisaBody = characterById("nisa").bodyHeight;
    const v2Order = ["nisa", "affan", "unais", "ayan", "hannan", "asiya", "safiya"] as const;
    v2Order.forEach((id, i) => {
      const def = characterById(id);
      if (!def.startsUnlocked) return;
      const a = -0.4 + i * 0.55;
      const r = def.role === "leader" ? 28 : 54;
      const x = main.x + Math.cos(a) * r;
      const y = main.y + Math.sin(a) * r + 8;
      // keep official proportions: same scale for everyone (v2 SPRITE_SCALE)
      const k = CHAR_WORLD_H_NISA / nisaBody;
      this.shadow(x, y, id === "nisa" ? 12 : 10);
      const im = this.add.image(x, y, ATLAS, def.interimFrame).setScale(k).setDepth(y);
      this.add
        .text(x, y + 6, def.displayName, {
          fontFamily: FONT, fontSize: "9px", fontStyle: "bold", color: css(PALETTE.parchmentLight), stroke: css(PALETTE.ink), strokeThickness: 3,
        })
        .setOrigin(0.5, 0)
        .setResolution(3)
        .setDepth(9000); // names stay readable above sprites, still under the darkness
      im.setName(`char-${id}`);
    });

    this.chopGfx = this.add.graphics().setDepth(5000);
  }

  // ---------- lighting ----------
  private buildLighting(): void {
    const { width: w, height: h } = this.scale;
    this.dark = this.add
      .renderTexture(w / 2, h / 2, Math.ceil(w * DARK_LAYER_RES), Math.ceil(h * DARK_LAYER_RES))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(10000);
    this.brush = this.make.image({ key: "lightBrush", add: false });
    this.eyesGfx = this.add.graphics().setDepth(10002);
  }

  private lightSources(): LightSource[] {
    return this.core.lightSources();
  }

  private drawLighting(lights: LightSource[]): void {
    const cam = this.cameras.main;
    const z = cam.zoom;
    // scrollFactor-0 objects are still zoomed around the camera centre; undo that.
    this.dark.setPosition(cam.width / 2, cam.height / 2);
    this.dark.setScale(1 / (DARK_LAYER_RES * z));
    this.dark.clear();
    this.dark.fill(PALETTE.night, 0.93);
    const view = cam.worldView;
    for (const L of lights) {
      const sx = (L.x - view.x) * z * DARK_LAYER_RES;
      const sy = (L.y - view.y) * z * DARK_LAYER_RES;
      const r = L.r * z * DARK_LAYER_RES;
      this.brush.setPosition(sx, sy).setScale((r * 2) / 256);
      this.dark.erase(this.brush);
    }
    while (this.glows.length < lights.length) {
      this.glows.push(this.add.image(0, 0, "glowBrush").setBlendMode(Phaser.BlendModes.ADD).setDepth(10001));
    }
    this.glows.forEach((g, i) => {
      const L = lights[i];
      g.setVisible(!!L);
      if (L) g.setPosition(L.x, L.y).setScale((L.r * 0.7 * 2) / 256);
    });

    // v2 drawEyes: red eye pairs blink in the dark only
    this.eyesGfx.clear();
    for (const e of this.world.eyes) {
      if (lightAt(lights, e.x, e.y) > 0.2) continue;
      if (Math.sin(this.animT * 2.2 + e.ph) < -0.85) continue;
      if (!Phaser.Geom.Rectangle.Contains(view, e.x, e.y)) continue;
      const s = 1 / WORLD_TO_SCREEN;
      this.eyesGfx.fillStyle(0xff3010, 0.35).fillCircle(e.x - 3.4 * s, e.y + 1.1 * s, 4 * s).fillCircle(e.x + 3.6 * s, e.y + 1.1 * s, 4 * s);
      this.eyesGfx.fillStyle(0xff2a22, 1).fillRect(e.x - 5 * s, e.y, 3.2 * s, 2.2 * s).fillRect(e.x + 2 * s, e.y, 3.2 * s, 2.2 * s);
    }
  }

  // ---------- camera & input ----------
  private setupCamera(): void {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, CFG.WORLD, CFG.WORLD);
    this.applyZoom(1);
    this.recenter();
    this.scale.on("resize", this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off("resize", this.onResize, this));
  }

  /**
   * Camera zoom = player zoom × 2 (v2 units → 720 px design height) × screen height / 720.
   * So every screen shows the same world height (360 units at zoom 1) and wider screens
   * simply show more forest to the sides; nothing is letterboxed.
   */
  private applyZoom(z: number): void {
    this.userZoom = clamp(z, CAMERA.zoomMin, CAMERA.zoomMax);
    this.cameras.main.setZoom(this.userZoom * WORLD_TO_SCREEN * (this.scale.height / DESIGN_H));
  }

  private onResize(size: Phaser.Structs.Size): void {
    const cam = this.cameras.main;
    const mid = cam.midPoint.clone();
    cam.setSize(size.width, size.height);
    this.applyZoom(this.userZoom);
    cam.centerOn(mid.x, mid.y);
    this.dark.resize(Math.ceil(size.width * DARK_LAYER_RES), Math.ceil(size.height * DARK_LAYER_RES));
    this.dark.setPosition(size.width / 2, size.height / 2);
  }

  recenter(): void {
    const m = this.world.camps[0]!;
    this.cameras.main.centerOn(m.x, m.y);
  }

  private setupInput(): void {
    const cam = this.cameras.main;
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.drag.down = true;
      this.drag.panned = false;
      this.drag.x = p.x;
      this.drag.y = p.y;
      this.drag.pinchD = 0;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      const p1 = this.input.pointer1;
      const p2 = this.input.pointer2;
      if (p1.isDown && p2.isDown) {
        const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (this.drag.pinchD > 0) this.applyZoom(this.userZoom * (d / this.drag.pinchD));
        this.drag.pinchD = d;
        this.drag.panned = true;
        return;
      }
      if (!p.isDown || !this.drag.down) return;
      const dx = p.x - this.drag.x;
      const dy = p.y - this.drag.y;
      if (!this.drag.panned && Math.hypot(dx, dy) < 12 * renderDpr()) return;
      this.drag.panned = true;
      cam.scrollX -= dx / cam.zoom;
      cam.scrollY -= dy / cam.zoom;
      this.drag.x = p.x;
      this.drag.y = p.y;
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      const wasTap = this.drag.down && !this.drag.panned && !this.input.pointer2.isDown;
      this.drag.down = false;
      this.drag.pinchD = 0;
      if (wasTap) this.onTap(cam.getWorldPoint(p.x, p.y));
    });
    this.input.on("wheel", (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.applyZoom(this.userZoom * (dy > 0 ? 0.9 : 1.1));
    });
  }

  private onTap(pt: Phaser.Math.Vector2): void {
    if (this.fire.out) return;
    const main = this.world.camps[0]!;
    if (dist(pt.x, pt.y, main.x, main.y - 10) < 34) {
      this.tryFeed();
      return;
    }
    let best: Tree | null = null;
    let bestD = Infinity;
    for (const t of this.world.trees) {
      if (Math.abs(pt.x - t.x) > 24 || pt.y < t.y - 80 || pt.y > t.y + 12) continue;
      const d = dist(pt.x, pt.y, t.x, t.y - 30);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (best) this.tryChop(best);
  }

  // ---------- actions ----------
  private tryFeed(): void {
    this.handle(this.core.feed());
  }

  private tryChop(t: Tree): void {
    this.handle(this.core.chop(t));
  }

  private tryUpgrade(): void {
    this.handle(this.core.upgrade((id) => CHARACTERS.find((c) => c.id === id)?.displayName));
  }

  /** Show the core's feedback the 2D way. */
  private handle(events: CoreEvent[]): void {
    for (const ev of events) {
      if (ev.type === "toast") this.toast(ev.text);
      else if (ev.type === "puff") this.puff(ev.x, ev.y, ev.text, ev.color);
      else if (ev.type === "gameover") this.events.emit("gameover", { time: ev.time });
    }
  }

  private puff(x: number, y: number, text: string, color: string): void {
    const t = this.add
      .text(x, y, text, { fontFamily: FONT, fontSize: "11px", fontStyle: "bold", color, stroke: css(PALETTE.ink), strokeThickness: 3 })
      .setOrigin(0.5)
      .setResolution(3)
      .setDepth(10005);
    this.tweens.add({ targets: t, y: y - 22, alpha: 0, duration: 1100, onComplete: () => t.destroy() });
  }

  private toast(text: string): void {
    this.events.emit("toast", text);
  }

  // ---------- loop ----------
  update(): void {
    // Real elapsed time capped at 0.08 s like v2's loop (Phaser's smoothed delta slows game
    // time down when the frame rate drops, which would make the fire burn slower than v2).
    const dt = Math.min(0.08, this.game.loop.rawDelta / 1000);
    this.animT += dt;

    this.handle(this.core.step(dt));
    const lights = this.lightSources();
    this.updateVisuals();
    this.drawLighting(lights);

    this.registry.set("hud", this.core.hud());
  }

  private updateVisuals(): void {
    for (const t of this.world.trees) {
      const spr = this.treeSprites.get(t.id)!;
      const alive = t.logs > 0;
      spr.setVisible(alive);
      this.stumpSprites.get(t.id)!.setVisible(!alive);
      if (alive) spr.x = t.x + Math.sin(this.animT * 0.8 + t.sway) * 1.4;
    }
    for (const c of this.world.camps) {
      const im = this.campFire.get(c.id)!;
      const id = fireSpriteId(this.fire, c);
      if (im.frame.name !== id) {
        im.setFrame(id);
      }
      const h = (id === "fire_burning" ? 36 : 26) * (im.getData("scale") as number);
      im.setScale(h / im.height);
      const floor = this.children.getByName(`glowfloor-${c.id}`) as Phaser.GameObjects.Ellipse | null;
      floor?.setVisible(id === "fire_burning");
    }
    for (const c of this.critterSprites) c.img.y = c.baseY + Math.sin(this.animT * 2 + c.bob) * 1.1;

    this.chopGfx.clear();
    for (const c of this.core.chops) {
      const x = c.tree.x;
      const y = c.tree.y - 60;
      this.chopGfx.fillStyle(PALETTE.ink, 0.75).fillCircle(x, y, 8);
      this.chopGfx.lineStyle(3, PALETTE.fire, 1).beginPath().arc(x, y, 6, -Math.PI / 2, -Math.PI / 2 + c.t * Math.PI * 2).strokePath();
    }
  }
}
