/**
 * Sprint 1 HUD overlay (own scene, screen space, landscape phone). Edges only, the forest stays in the middle:
 * top-left hearts + small bag strip, top-centre "Hari 1 · Siang" ribbon with a day bar, top-right fire bar and
 * ABC 0/13, bottom-left joystick, bottom-right Interaksi + Bina / Beg / Peta. Panels: Beg, Bina, Cikgu Nisa's
 * line, the Hari 1 title card, and the end-of-night pages. Sizes follow the screen height (u = h / 720).
 */
import Phaser from "phaser";
import { CAMP_CFG, PHASE_LABEL, phaseProgress, RES_LABEL, type Phase } from "../core/camp";
import { ATLAS_KEY } from "./affan";
import type { CampScene } from "./CampScene";
import { CAMP_ATLAS } from "./nisa";
import { POC_VERSION } from "./version";

const SERIF = "Georgia, 'Times New Roman', serif";
const INK = "#3b2412";
const CREAM = "#f6e3b8";
type Btn = { c: Phaser.GameObjects.Container; g: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text; icon: Phaser.GameObjects.Text; r: number };

export class CampHud extends Phaser.Scene {
  private game2!: CampScene;
  private u = 1;
  private hearts: Phaser.GameObjects.Image[] = [];
  private invIcons: Phaser.GameObjects.Image[] = [];
  private invText: Phaser.GameObjects.Text[] = [];
  private invBg!: Phaser.GameObjects.Graphics;
  private ribbon!: Phaser.GameObjects.Image;
  private dayText!: Phaser.GameObjects.Text;
  private dayBar!: Phaser.GameObjects.Graphics;
  private fireBar!: Phaser.GameObjects.Graphics;
  private fireIcon!: Phaser.GameObjects.Image;
  private fireText!: Phaser.GameObjects.Text;
  private abcText!: Phaser.GameObjects.Text;
  private act!: Phaser.GameObjects.Image;
  private actLabel!: Phaser.GameObjects.Text;
  private btns: Record<"bina" | "beg" | "peta", Btn> = {} as Record<"bina" | "beg" | "peta", Btn>;
  private toastText!: Phaser.GameObjects.Text;
  private nisaBox!: Phaser.GameObjects.Container;
  private nisaText!: Phaser.GameObjects.Text;
  private panel: Phaser.GameObjects.Container | null = null;
  private panelKind: "beg" | "bina" | null = null;
  private overlay: Phaser.GameObjects.Container | null = null;
  private stats!: Phaser.GameObjects.Text;
  private joy!: Phaser.GameObjects.Graphics;
  private joyId = -1;
  private joyBase = new Phaser.Math.Vector2();
  private joyKnob = new Phaser.Math.Vector2();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private uiHit = false;

  constructor() { super("campHud"); }

  create(): void {
    this.game2 = this.scene.get("camp") as CampScene;
    for (let i = 0; i < CAMP_CFG.hearts; i++) this.hearts.push(this.add.image(0, 0, ATLAS_KEY, "heart"));
    this.invBg = this.add.graphics();
    const icons: [string, string][] = [[ATLAS_KEY, "log"], [ATLAS_KEY, "stone"], [ATLAS_KEY, "sticks"], ["sbBerry", ""]];
    for (const [k, f] of icons) {
      this.invIcons.push(f ? this.add.image(0, 0, k, f) : this.add.image(0, 0, k));
      this.invText.push(this.add.text(0, 0, "", { fontFamily: SERIF, fontStyle: "bold", color: CREAM, stroke: "#1b0e05" }).setOrigin(0, 0.5));
    }
    this.ribbon = this.add.image(0, 0, ATLAS_KEY, "ribbon");
    this.dayText = this.add.text(0, 0, "", { fontFamily: SERIF, fontStyle: "bold", color: "#3b1d08" }).setOrigin(0.5);
    this.dayBar = this.add.graphics();
    this.fireBar = this.add.graphics();
    this.fireIcon = this.add.image(0, 0, ATLAS_KEY, "flame0");
    this.fireText = this.add.text(0, 0, "Api", { fontFamily: SERIF, fontStyle: "bold", color: CREAM, stroke: "#1b0e05" }).setOrigin(1, 0.5);
    this.abcText = this.add.text(0, 0, `ABC 0/${CAMP_CFG.letters}`, { fontFamily: SERIF, fontStyle: "bold", color: "#e9d6a6", stroke: "#1b0e05" }).setOrigin(1, 0.5);
    this.act = this.add.image(0, 0, ATLAS_KEY, "btn_hand").setInteractive({ useHandCursor: true });
    this.actLabel = this.add.text(0, 0, "", { fontFamily: SERIF, fontStyle: "bold", color: CREAM, stroke: "#2a1608", align: "center" }).setOrigin(0.5, 0);
    this.act.on("pointerdown", () => { this.uiHit = true; this.game2.input2.action = true; this.tweens.add({ targets: this.act, scale: this.act.scale * 0.9, duration: 70, yoyo: true }); });
    this.btns.bina = this.mkBtn("Bina", "⚒", () => this.togglePanel("bina"));
    this.btns.beg = this.mkBtn("Beg", "🎒", () => this.togglePanel("beg"));
    this.btns.peta = this.mkBtn("Peta", "🗺", () => this.toast("Peta dibuka dalam sprint akan datang. Kabus masih menutup hutan."));
    this.toastText = this.add.text(0, 0, "", { fontFamily: SERIF, fontStyle: "bold", color: "#fbe6b0", stroke: "#1b0e05", align: "center" }).setOrigin(0.5).setAlpha(0);
    // Cikgu Nisa's line: parchment strip with her portrait (head layer of her cut-out)
    const nb = this.add.image(0, 0, ATLAS_KEY, "panel").setOrigin(0.5);
    const face = this.add.image(0, 0, CAMP_ATLAS, "nisa_head").setOrigin(0.5);
    const nm = this.add.text(0, 0, "Cikgu Nisa", { fontFamily: SERIF, fontStyle: "bold", color: "#6b3510" }).setOrigin(0, 0.5);
    this.nisaText = this.add.text(0, 0, "", { fontFamily: SERIF, color: INK }).setOrigin(0, 0);
    this.nisaBox = this.add.container(0, 0, [nb, face, nm, this.nisaText]).setAlpha(0);
    this.stats = this.add.text(0, 0, "", { fontFamily: "monospace", color: "#cdb98f" }).setOrigin(1, 1).setAlpha(0.6);
    this.joy = this.add.graphics();
    this.layout();
    this.scale.on("resize", () => this.layout());

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.uiHit) { this.uiHit = false; return; }
      if (this.panel || this.overlay || this.joyId !== -1 || p.x > this.scale.width * 0.55) return;
      this.joyId = p.id; this.joyBase.set(p.x, p.y); this.joyKnob.set(p.x, p.y);
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (p.id !== this.joyId) return;
      const R = 62 * this.u, d = new Phaser.Math.Vector2(p.x - this.joyBase.x, p.y - this.joyBase.y);
      if (d.length() > R) d.setLength(R);
      this.joyKnob.set(this.joyBase.x + d.x, this.joyBase.y + d.y);
    });
    const up = (p: Phaser.Input.Pointer) => { if (p.id === this.joyId) this.joyId = -1; };
    this.input.on("pointerup", up);
    this.input.on("pointerupoutside", up);
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE,B,I") as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on("keydown-E", () => (this.game2.input2.action = true));
    kb.on("keydown-SPACE", () => (this.overlay ? this.dismissTitle() : (this.game2.input2.action = true)));
    kb.on("keydown-B", () => this.togglePanel("bina"));
    kb.on("keydown-I", () => this.togglePanel("beg"));

    const ev = this.game2.events;
    ev.on("toast", (t: string) => this.toast(t));
    ev.on("nisa", (t: string) => this.nisaSay(t));
    ev.on("phase", (p: Phase) => this.phaseBanner(p));
    ev.on("inv", () => this.refreshPanel());
    ev.on("hearts", () => this.tweens.add({ targets: this.hearts, scale: { from: this.hearts[0]!.scale * 1.25, to: this.hearts[0]!.scale }, duration: 250 }));
    ev.on("won", () => this.time.delayedCall(1800, () => this.endPage(true)));
    ev.on("lost", () => this.time.delayedCall(700, () => this.endPage(false)));
    ev.on("startGame", () => this.dismissTitle());
    this.titleCard();
  }

  private mkBtn(label: string, icon: string, fn: () => void): Btn {
    const g = this.add.graphics();
    const ic = this.add.text(0, 0, icon, { fontFamily: "sans-serif", color: CREAM }).setOrigin(0.5);
    const lb = this.add.text(0, 0, label, { fontFamily: SERIF, fontStyle: "bold", color: CREAM, stroke: "#2a1608" }).setOrigin(0.5, 0);
    const c = this.add.container(0, 0, [g, ic, lb]);
    const b: Btn = { c, g, label: lb, icon: ic, r: 30 };
    c.setInteractive(new Phaser.Geom.Circle(0, 0, 34), Phaser.Geom.Circle.Contains);
    c.on("pointerdown", () => { this.uiHit = true; fn(); this.tweens.add({ targets: c, scale: 0.9, duration: 70, yoyo: true }); });
    return b;
  }

  private drawBtn(b: Btn, enabled: boolean): void {
    const u = this.u, r = 30 * u;
    b.g.clear().fillStyle(0x3a2412, enabled ? 0.85 : 0.45).fillCircle(0, 0, r).lineStyle(3 * u, 0xd9b77e, enabled ? 0.95 : 0.4).strokeCircle(0, 0, r);
    b.icon.setFontSize(26 * u).setAlpha(enabled ? 1 : 0.45);
    b.label.setFontSize(15 * u).setStroke("#2a1608", 4 * u).setPosition(0, r + 2 * u).setAlpha(enabled ? 1 : 0.55);
    b.c.input!.hitArea = new Phaser.Geom.Circle(0, 0, r + 6 * u);
  }

  private layout(): void {
    const { width: w, height: h } = this.scale;
    const u = (this.u = h / 720), m = 18 * u;
    this.hearts.forEach((hh, i) => hh.setScale(0.62 * u).setPosition(m + 24 * u + i * 42 * u, m + 22 * u));
    this.invIcons.forEach((ic, i) => {
      const x = m + 20 * u + i * 76 * u, y = m + 70 * u;
      const k = i === 0 ? 0.2 : i === 1 ? 0.55 : i === 2 ? 0.2 : 0.62;
      ic.setScale(k * u).setPosition(x, y);
      this.invText[i]!.setPosition(x + 18 * u, y).setFontSize(17 * u).setStroke("#1b0e05", 4 * u);
    });
    this.invBg.clear().fillStyle(0x1b0e05, 0.45).fillRoundedRect(m - 4 * u, m + 52 * u, 306 * u, 36 * u, 10 * u);
    this.ribbon.setPosition(w / 2, m + 26 * u).setScale(0.95 * u);
    this.dayText.setPosition(w / 2, m + 20 * u).setFontSize(22 * u);
    this.fireIcon.setPosition(w - m - 222 * u, m + 24 * u).setScale(0.17 * u);
    this.fireText.setPosition(w - m - 236 * u, m + 24 * u).setFontSize(16 * u).setStroke("#1b0e05", 4 * u).setVisible(false);
    this.abcText.setPosition(w - m, m + 62 * u).setFontSize(18 * u).setStroke("#1b0e05", 4 * u);
    this.act.setScale(0.62 * u).setPosition(w - 100 * u, h - 122 * u);
    this.actLabel.setPosition(w - 100 * u, h - 66 * u).setFontSize(17 * u).setStroke("#2a1608", 5 * u);
    const bx = w - 100 * u, by = h - 122 * u;
    this.btns.bina.c.setPosition(bx - 128 * u, by + 30 * u);
    this.btns.beg.c.setPosition(bx - 112 * u, by - 72 * u);
    this.btns.peta.c.setPosition(bx - 22 * u, by - 128 * u);
    for (const b of Object.values(this.btns)) this.drawBtn(b, true);
    this.toastText.setPosition(w / 2, h * 0.27).setFontSize(21 * u).setStroke("#1b0e05", 6 * u).setWordWrapWidth(w * 0.62);
    const [nb, face, nm] = this.nisaBox.list as [Phaser.GameObjects.Image, Phaser.GameObjects.Image, Phaser.GameObjects.Text];
    const bw = Math.min(560 * u, w * 0.5), bh = 92 * u;
    this.nisaBox.setPosition(w / 2, h - bh / 2 - 14 * u);
    nb.setDisplaySize(bw, bh);
    face.setScale((bh * 0.95) / face.height).setPosition(-bw / 2 + 48 * u, -2 * u);
    nm.setPosition(-bw / 2 + 96 * u, -bh / 2 + 18 * u).setFontSize(16 * u);
    this.nisaText.setPosition(-bw / 2 + 96 * u, -bh / 2 + 32 * u).setFontSize(17 * u).setWordWrapWidth(bw - 116 * u);
    this.stats.setPosition(w - 6 * u, h - 4 * u).setFontSize(11 * u);
    if (this.panelKind) { const k = this.panelKind; this.closePanel(); this.openPanel(k); }
  }

  // ------------------------------------------------------------------ panels
  private togglePanel(k: "beg" | "bina"): void {
    if (this.overlay) return;
    if (this.panelKind === k) { this.closePanel(); return; }
    this.closePanel();
    if (k === "bina" && !this.game2.sim.inCamp()) { this.toast("Bina hanya di kem. Pulang ke unggun dulu."); return; }
    this.openPanel(k);
  }
  private closePanel(): void { this.panel?.destroy(); this.panel = null; this.panelKind = null; }
  private refreshPanel(): void { if (this.panelKind) { const k = this.panelKind; this.closePanel(); this.openPanel(k); } }

  private parchment(wd: number, ht: number, title: string): Phaser.GameObjects.Container {
    const { width: w, height: h } = this.scale, u = this.u;
    const c = this.add.container(w / 2, h / 2);
    const bg = this.add.image(0, 0, ATLAS_KEY, "panel").setDisplaySize(wd, ht);
    const t = this.add.text(0, -ht / 2 + 26 * u, title, { fontFamily: SERIF, fontStyle: "bold", fontSize: `${26 * u}px`, color: INK }).setOrigin(0.5, 0);
    const x = this.add.text(wd / 2 - 30 * u, -ht / 2 + 22 * u, "✕", { fontFamily: "sans-serif", fontSize: `${26 * u}px`, color: "#6b3510" }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
    x.on("pointerdown", () => { this.uiHit = true; this.closePanel(); });
    bg.setInteractive().on("pointerdown", () => { this.uiHit = true; });
    c.add([bg, t, x]);
    return c;
  }

  private openPanel(k: "beg" | "bina"): void {
    const u = this.u, sim = this.game2.sim;
    const row = (c: Phaser.GameObjects.Container, y: number, text: string, color = INK, size = 19) =>
      c.add(this.add.text(-200 * u, y, text, { fontFamily: SERIF, fontSize: `${size * u}px`, color }).setOrigin(0, 0.5));
    const button = (c: Phaser.GameObjects.Container, x: number, y: number, text: string, enabled: boolean, fn: () => void) => {
      const g = this.add.graphics().fillStyle(enabled ? 0x6b3510 : 0x8a7a66, 1).fillRoundedRect(-80 * u, -18 * u, 160 * u, 36 * u, 10 * u);
      const tx = this.add.text(0, 0, text, { fontFamily: SERIF, fontStyle: "bold", fontSize: `${17 * u}px`, color: enabled ? CREAM : "#e8dcc8" }).setOrigin(0.5);
      const b = this.add.container(x, y, [g, tx]).setSize(160 * u, 36 * u).setInteractive({ useHandCursor: enabled });
      b.on("pointerdown", () => { this.uiHit = true; if (enabled) fn(); });
      c.add(b);
    };
    if (k === "beg") {
      const c = this.parchment(500 * u, 360 * u, "Beg");
      const R = ["kayu", "batu", "dahan", "beri"] as const;
      R.forEach((r, i) => row(c, -100 * u + i * 38 * u, `${RES_LABEL[r]}: ${sim.inv[r]}/${CAMP_CFG.carry[r]}${r !== "beri" ? `     (stor: ${sim.store[r]})` : ""}`));
      row(c, 56 * u, `Nyawa: ${sim.hearts}/${CAMP_CFG.hearts}   ·   Huruf ABC: 0/${CAMP_CFG.letters}`, "#6b3510", 17);
      button(c, 0, 118 * u, "Makan Beri (+1 nyawa)", sim.inv.beri > 0 && sim.hearts < CAMP_CFG.hearts, () => this.game2.eatBerry());
      this.panel = c;
    } else {
      const c = this.parchment(560 * u, 330 * u, "Bina di Kem");
      sim.buildOptions().forEach((o, i) => {
        const y = -60 * u + i * 100 * u;
        row(c, y - 14 * u, `${o.label}  ·  ${o.cost}`, INK, 20);
        row(c, y + 14 * u, o.note, o.enabled ? "#4d6b2a" : "#7a6450", 16);
        button(c, 170 * u, y, o.id === "fence" ? "Akan datang" : "Bina", o.enabled, () => this.game2.build(o.id));
      });
      c.add(this.add.text(0, 128 * u, "Bab 1: hanya pagar dan naik taraf unggun.", { fontFamily: SERIF, fontStyle: "italic", fontSize: `${15 * u}px`, color: "#7a6450" }).setOrigin(0.5));
      this.panel = c;
    }
    this.panelKind = k;
  }

  // ------------------------------------------------------------------ title / end pages
  private titleCard(): void {
    const { width: w, height: h } = this.scale, u = this.u;
    const img = this.add.image(w / 2, h / 2, "campTitle");
    img.setScale(Math.max(w / img.width, h / img.height));
    const shade = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.35);
    const rb = this.add.image(w / 2, h * 0.34, ATLAS_KEY, "ribbon").setScale(1.5 * u);
    const t1 = this.add.text(w / 2, h * 0.33, "Hari 1 · Padang Kem", { fontFamily: SERIF, fontStyle: "bold", fontSize: `${34 * u}px`, color: "#3b1d08" }).setOrigin(0.5);
    const t2 = this.add.text(w / 2, h * 0.52, "Kabus sudah mereda. Hanya Cikgu Nisa dan Affan di kem.\nHidupkan api dan bertahan satu malam sehingga pagi.", { fontFamily: SERIF, fontStyle: "bold", fontSize: `${21 * u}px`, color: "#fbe6b0", stroke: "#1b0e05", strokeThickness: 6 * u, align: "center" }).setOrigin(0.5);
    const t3 = this.add.text(w / 2, h * 0.72, "Ketik untuk mula", { fontFamily: SERIF, fontStyle: "bold", fontSize: `${24 * u}px`, color: "#ffd27a", stroke: "#1b0e05", strokeThickness: 6 * u }).setOrigin(0.5);
    this.tweens.add({ targets: t3, alpha: 0.4, duration: 700, yoyo: true, repeat: -1 });
    this.overlay = this.add.container(0, 0, [img, shade, rb, t1, t2, t3]).setDepth(10);
    shade.setInteractive().on("pointerdown", () => { this.uiHit = true; this.dismissTitle(); });
    this.time.delayedCall(9000, () => this.dismissTitle());
  }

  private dismissTitle(): void {
    if (!this.overlay || this.game2.started) return;
    const o = this.overlay;
    this.tweens.add({ targets: o, alpha: 0, duration: 450, onComplete: () => o.destroy() });
    this.overlay = null;
    this.game2.start();
    this.time.delayedCall(500, () => this.phaseBanner("siang"));
  }

  private endPage(won: boolean): void {
    this.closePanel();
    const { width: w, height: h } = this.scale, u = this.u, sim = this.game2.sim;
    const shade = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, won ? 0.25 : 0.55);
    const bg = this.add.image(w / 2, h / 2, ATLAS_KEY, "panel").setDisplaySize(560 * u, 300 * u);
    const t1 = this.add.text(w / 2, h / 2 - 92 * u, won ? "Pagi tiba!" : "Affan pengsan...", { fontFamily: SERIF, fontStyle: "bold", fontSize: `${36 * u}px`, color: INK }).setOrigin(0.5);
    const t2 = this.add.text(w / 2, h / 2 - 28 * u, won ? "Hari 1 selesai. Kamu bertahan satu malam.\nMatahari terbit, sedikit pudar daripada semalam." : "Serigala terlalu dekat dalam gelap.\nJaga api dan kekal dalam cahaya.", { fontFamily: SERIF, fontSize: `${18 * u}px`, color: "#5a3a1c", align: "center" }).setOrigin(0.5);
    const t3 = this.add.text(w / 2, h / 2 + 34 * u, `Nyawa ${sim.hearts}/${CAMP_CFG.hearts}  ·  Unggun tahap ${sim.fire.level}  ·  Kayu di stor ${sim.store.kayu}`, { fontFamily: SERIF, fontSize: `${15 * u}px`, color: "#7a6450" }).setOrigin(0.5);
    const again = this.add.text(w / 2, h / 2 + 92 * u, won ? "Main semula" : "Cuba lagi", { fontFamily: SERIF, fontStyle: "bold", fontSize: `${26 * u}px`, color: "#7a3a12" }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    again.on("pointerdown", () => location.reload());
    this.overlay = this.add.container(0, 0, [shade, bg, t1, t2, t3, again]).setDepth(10).setAlpha(0);
    this.tweens.add({ targets: this.overlay, alpha: 1, duration: 500 });
  }

  // ------------------------------------------------------------------ feedback
  private phaseBanner(p: Phase): void {
    const u = this.u;
    const txt = { siang: "Siang · kutip bahan", petang: "Petang · pulang ke kem", malam: "Malam · jaga api", pagi: "Pagi" }[p];
    const t = this.add.text(this.scale.width / 2, this.scale.height * 0.4, txt, { fontFamily: SERIF, fontStyle: "bold", fontSize: `${30 * u}px`, color: "#ffe2a0", stroke: "#1b0e05", strokeThickness: 7 * u }).setOrigin(0.5).setAlpha(0);
    this.tweens.chain({ targets: t, tweens: [{ alpha: 1, duration: 400 }, { alpha: 1, duration: 1600 }, { alpha: 0, duration: 600, onComplete: () => t.destroy() }] });
  }

  private toast(text: string): void {
    this.tweens.killTweensOf(this.toastText);
    this.toastText.setText(text).setAlpha(0).setY(this.scale.height * 0.27 + 10 * this.u);
    this.tweens.chain({ targets: this.toastText, tweens: [{ alpha: 1, y: this.scale.height * 0.27, duration: 250, ease: "Cubic.easeOut" }, { alpha: 1, duration: 2400 }, { alpha: 0, duration: 400 }] });
  }

  private nisaSay(text: string): void {
    this.tweens.killTweensOf(this.nisaBox);
    this.nisaText.setText(text);
    this.nisaBox.setAlpha(0);
    this.tweens.chain({ targets: this.nisaBox, tweens: [{ alpha: 1, duration: 250 }, { alpha: 1, duration: 3800 }, { alpha: 0, duration: 500 }] });
  }

  update(): void {
    const g2 = this.game2, sim = g2.sim, s = g2.input2, u = this.u;
    const k = this.keys;
    const kx = (k.D!.isDown || k.RIGHT!.isDown ? 1 : 0) - (k.A!.isDown || k.LEFT!.isDown ? 1 : 0);
    const ky = (k.S!.isDown || k.DOWN!.isDown ? 1 : 0) - (k.W!.isDown || k.UP!.isDown ? 1 : 0);
    const R = 62 * u;
    if (this.joyId !== -1) { s.x = (this.joyKnob.x - this.joyBase.x) / R; s.y = (this.joyKnob.y - this.joyBase.y) / R; }
    else if (kx || ky) { const l = Math.hypot(kx, ky); s.x = kx / l; s.y = ky / l; }
    else if (!(window as unknown as { __SB_AUTOPILOT__?: boolean }).__SB_AUTOPILOT__) { s.x = 0; s.y = 0; }
    const g = this.joy.clear();
    if (!this.overlay) {
      const bx = this.joyId !== -1 ? this.joyBase.x : 130 * u, by = this.joyId !== -1 ? this.joyBase.y : this.scale.height - 130 * u;
      const kx2 = this.joyId !== -1 ? this.joyKnob.x : bx, ky2 = this.joyId !== -1 ? this.joyKnob.y : by;
      const a = this.joyId !== -1 ? 1 : 0.55;
      g.fillStyle(0x2a1608, 0.35 * a).fillCircle(bx, by, R + 10 * u).lineStyle(4 * u, 0xd9b77e, 0.7 * a).strokeCircle(bx, by, R + 10 * u);
      g.fillStyle(0xe8cf9c, 0.9 * a).fillCircle(kx2, ky2, 30 * u).lineStyle(3 * u, 0x5a3a1c, a).strokeCircle(kx2, ky2, 30 * u);
    }
    // Interaksi label
    const a = g2.currentAction();
    let label = "";
    if (a) {
      if (a.kind === "pick") label = a.full ? "Beg penuh" : a.node.kind === "beri" ? "Petik beri" : `Ambil ${RES_LABEL[a.node.kind].toLowerCase()}`;
      else if (a.kind === "light") label = a.ready ? "Hidupkan api" : "Unggun (perlu bahan)";
      else if (a.kind === "feed") label = sim.burning ? "Tambah kayu" : "Hidupkan semula";
      else if (a.kind === "store") label = "Simpan bahan";
      else if (a.kind === "talk") label = "Cakap";
      else label = "Tapak lantera";
    }
    this.actLabel.setText(label);
    this.act.setAlpha(a ? 1 : 0.45);
    this.drawBtn(this.btns.bina, sim.inCamp());
    // hearts, bag strip
    for (let i = 0; i < this.hearts.length; i++) this.hearts[i]!.setFrame(i < sim.hearts ? "heart" : "heart_empty");
    const R4 = ["kayu", "batu", "dahan", "beri"] as const;
    R4.forEach((r, i) => this.invText[i]!.setText(`${sim.inv[r]}/${CAMP_CFG.carry[r]}`).setColor(sim.inv[r] >= CAMP_CFG.carry[r] ? "#ffb070" : CREAM));
    // day ribbon + bar
    this.dayText.setText(`Hari ${sim.day} · ${PHASE_LABEL[sim.phase]}`);
    const w = this.scale.width, m = 18 * u;
    const bw = 200 * u, bx = w / 2 - bw / 2, by = m + 50 * u;
    const col = sim.phase === "siang" ? 0xf2c14e : sim.phase === "petang" ? 0xe07a3a : sim.phase === "malam" ? 0x6f86c9 : 0xf7e08a;
    this.dayBar.clear().fillStyle(0x1b0e05, 0.55).fillRoundedRect(bx, by, bw, 8 * u, 4 * u).fillStyle(col, 1).fillRoundedRect(bx, by, Math.max(4 * u, bw * phaseProgress(sim.t)), 8 * u, 4 * u);
    // fire bar
    const fw = 190 * u, fx = w - m - fw, fy = m + 14 * u, fuel = sim.fire.fuel / CAMP_CFG.fire.fuelMax;
    const fc = !sim.burning ? 0x555555 : fuel < CAMP_CFG.fire.low / 100 ? 0xe0502a : 0xf2a03a;
    this.fireBar.clear().fillStyle(0x1b0e05, 0.6).fillRoundedRect(fx - 4 * u, fy - 4 * u, fw + 8 * u, 28 * u, 10 * u)
      .fillStyle(fc, 1).fillRoundedRect(fx, fy, Math.max(0, fw * (sim.burning ? fuel : 0)), 20 * u, 8 * u)
      .lineStyle(2 * u, 0xd9b77e, 0.8).strokeRoundedRect(fx - 4 * u, fy - 4 * u, fw + 8 * u, 28 * u, 10 * u);
    this.fireIcon.setAlpha(sim.burning ? 1 : 0.4);
    this.stats.setText(`${POC_VERSION}  ${Math.round(g2.fps)} fps`);
  }
}
