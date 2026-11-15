/**
 * Storybook HUD (own scene, screen space): 4 hearts, parchment Quest panel, "Hari 1" ribbon drop,
 * toasts, floating joystick, wooden action button, small stats line.
 * Sizes follow the screen height (u = device px per 100 design units of a 720-px-tall screen).
 */
import Phaser from "phaser";
import { CFG } from "../core/balance";
import { ATLAS_KEY } from "./affan";
import { questLines } from "./quest";
import type { StoryScene } from "./StoryScene";
import { POC_VERSION } from "./version";

const SERIF = "Georgia, 'Times New Roman', serif";
const INK = "#3b2412";

export class StoryHud extends Phaser.Scene {
  private story!: StoryScene;
  private u = 1;
  private hearts: Phaser.GameObjects.Image[] = [];
  private panel!: Phaser.GameObjects.Image;
  private qTitle!: Phaser.GameObjects.Text;
  private qLines: Phaser.GameObjects.Text[] = [];
  private qMarks: Phaser.GameObjects.Graphics[] = [];
  private btn!: Phaser.GameObjects.Image;
  private btnLabel!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private stats!: Phaser.GameObjects.Text;
  private joy!: Phaser.GameObjects.Graphics;
  private joyId = -1;
  private joyBase = new Phaser.Math.Vector2();
  private joyKnob = new Phaser.Math.Vector2();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super("storyHud");
  }

  create(): void {
    this.story = this.scene.get("story") as StoryScene;
    for (let i = 0; i < CFG.CHAR_HP; i++) this.hearts.push(this.add.image(0, 0, ATLAS_KEY, "heart"));
    this.panel = this.add.image(0, 0, ATLAS_KEY, "panel").setOrigin(0, 0);
    this.qTitle = this.add.text(0, 0, "Quest", { fontFamily: SERIF, fontStyle: "bold", color: INK });
    for (let i = 0; i < 3; i++) {
      this.qMarks.push(this.add.graphics());
      this.qLines.push(this.add.text(0, 0, "", { fontFamily: SERIF, color: INK }));
    }
    this.btn = this.add.image(0, 0, ATLAS_KEY, "btn_hand").setInteractive({ useHandCursor: true });
    this.btnLabel = this.add.text(0, 0, "", { fontFamily: SERIF, fontStyle: "bold", color: "#f6e3b8", stroke: "#2a1608" }).setOrigin(0.5, 0);
    this.btn.on("pointerdown", () => {
      this.story.input2.action = true;
      this.tweens.add({ targets: this.btn, scale: this.btn.scale * 0.9, duration: 70, yoyo: true });
    });
    this.toastText = this.add.text(0, 0, "", { fontFamily: SERIF, fontStyle: "bold", color: "#fbe6b0", stroke: "#1b0e05", align: "center" }).setOrigin(0.5).setAlpha(0);
    this.stats = this.add.text(0, 0, "", { fontFamily: "monospace", color: "#cdb98f" }).setOrigin(1, 0).setAlpha(0.7);
    this.joy = this.add.graphics();
    this.layout();
    this.scale.on("resize", () => this.layout());

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.joyId !== -1 || p.x > this.scale.width * 0.55) return;
      this.joyId = p.id;
      this.joyBase.set(p.x, p.y);
      this.joyKnob.set(p.x, p.y);
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
    this.keys = kb.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE") as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on("keydown-E", () => (this.story.input2.action = true));
    kb.on("keydown-SPACE", () => (this.story.input2.action = true));

    this.story.events.on("quest", () => this.refreshQuest(true));
    this.story.events.on("toast", (t: string) => this.toast(t));
    this.story.events.on("gameover", () => this.gameOver());
    this.refreshQuest(false);
    this.time.delayedCall(500, () => this.dayBanner("Hari 1"));
  }

  private layout(): void {
    const { width: w, height: h } = this.scale;
    const u = (this.u = h / 720);
    const m = 18 * u;
    this.hearts.forEach((hh, i) => hh.setScale(0.6 * u).setPosition(m + 22 * u + i * 40 * u, m + 20 * u));
    this.panel.setPosition(m, m + 46 * u).setDisplaySize(250 * u, 128 * u);
    this.qTitle.setPosition(m + 16 * u, m + 56 * u).setFontSize(20 * u);
    this.qLines.forEach((t, i) => t.setPosition(m + 42 * u, m + 86 * u + i * 26 * u).setFontSize(17 * u));
    this.btn.setScale(0.62 * u).setPosition(w - 105 * u, h - 120 * u);
    this.btnLabel.setPosition(w - 105 * u, h - 60 * u).setFontSize(18 * u).setStroke("#2a1608", 5 * u);
    this.toastText.setPosition(w / 2, h * 0.3).setFontSize(22 * u).setStroke("#1b0e05", 6 * u).setWordWrapWidth(w * 0.7);
    this.stats.setPosition(w - m, m * 0.6).setFontSize(12 * u);
    this.refreshQuest(false);
  }

  private refreshQuest(pulse: boolean): void {
    const u = this.u, m = 18 * u;
    questLines(this.story.quest).forEach((l, i) => {
      const t = this.qLines[i]!;
      const was = t.text;
      t.setText(l.text).setColor(l.done ? "#4d6b2a" : INK);
      const g = this.qMarks[i]!.clear();
      const cx = m + 28 * u, cy = m + 97 * u + i * 26 * u;
      g.lineStyle(2 * u, 0x5a3a1c, 1).strokeCircle(cx, cy, 7 * u);
      if (l.done) g.lineStyle(3 * u, 0x4d6b2a, 1).beginPath().moveTo(cx - 5 * u, cy).lineTo(cx - 1 * u, cy + 4 * u).lineTo(cx + 7 * u, cy - 6 * u).strokePath();
      if (pulse && was !== l.text) this.tweens.add({ targets: t, scale: { from: 1.15, to: 1 }, duration: 260, ease: "Back.easeOut" });
    });
  }

  dayBanner(text: string): void {
    const { width: w } = this.scale, u = this.u;
    const rib = this.add.image(0, 0, ATLAS_KEY, "ribbon").setScale(0.95 * u);
    const t = this.add.text(0, -4 * u, text, { fontFamily: SERIF, fontStyle: "bold", fontSize: `${34 * u}px`, color: INK }).setOrigin(0.5);
    const c = this.add.container(w / 2, -80 * u, [rib, t]);
    this.tweens.chain({
      targets: c,
      tweens: [
        { y: 92 * u, duration: 700, ease: "Back.easeOut" },
        { y: 92 * u, duration: 2200 },
        { y: -90 * u, duration: 500, ease: "Cubic.easeIn", onComplete: () => c.destroy() },
      ],
    });
  }

  private toast(text: string): void {
    this.tweens.killTweensOf(this.toastText);
    this.toastText.setText(text).setAlpha(0).setY(this.scale.height * 0.3 + 10 * this.u);
    this.tweens.chain({
      targets: this.toastText,
      tweens: [
        { alpha: 1, y: this.scale.height * 0.3, duration: 250, ease: "Cubic.easeOut" },
        { alpha: 1, duration: 2200 },
        { alpha: 0, duration: 400 },
      ],
    });
  }

  private gameOver(): void {
    const { width: w, height: h } = this.scale, u = this.u;
    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.55);
    this.add.image(w / 2, h / 2, ATLAS_KEY, "panel").setDisplaySize(420 * u, 220 * u);
    this.add.text(w / 2, h / 2 - 40 * u, "Api padam...", { fontFamily: SERIF, fontStyle: "bold", fontSize: `${34 * u}px`, color: INK }).setOrigin(0.5);
    const again = this.add.text(w / 2, h / 2 + 40 * u, "Main semula", { fontFamily: SERIF, fontStyle: "bold", fontSize: `${24 * u}px`, color: "#7a3a12" }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    again.on("pointerdown", () => location.reload());
  }

  update(): void {
    const s = this.story.input2;
    // keyboard overrides the joystick when held
    const k = this.keys;
    const kx = (k.D!.isDown || k.RIGHT!.isDown ? 1 : 0) - (k.A!.isDown || k.LEFT!.isDown ? 1 : 0);
    const ky = (k.S!.isDown || k.DOWN!.isDown ? 1 : 0) - (k.W!.isDown || k.UP!.isDown ? 1 : 0);
    const u = this.u, R = 62 * u;
    if (this.joyId !== -1) {
      s.x = (this.joyKnob.x - this.joyBase.x) / R;
      s.y = (this.joyKnob.y - this.joyBase.y) / R;
    } else if (kx || ky) {
      const l = Math.hypot(kx, ky);
      s.x = kx / l;
      s.y = ky / l;
    } else if (!(window as unknown as { __SB_AUTOPILOT__?: boolean }).__SB_AUTOPILOT__) {
      s.x = 0;
      s.y = 0;
    }
    // joystick: shown where the thumb is, or as a faint hint bottom-left
    const g = this.joy.clear();
    const bx = this.joyId !== -1 ? this.joyBase.x : 130 * u, by = this.joyId !== -1 ? this.joyBase.y : this.scale.height - 130 * u;
    const kx2 = this.joyId !== -1 ? this.joyKnob.x : bx, ky2 = this.joyId !== -1 ? this.joyKnob.y : by;
    const a = this.joyId !== -1 ? 1 : 0.55;
    g.fillStyle(0x2a1608, 0.35 * a).fillCircle(bx, by, R + 10 * u);
    g.lineStyle(4 * u, 0xd9b77e, 0.7 * a).strokeCircle(bx, by, R + 10 * u);
    g.fillStyle(0xe8cf9c, 0.9 * a).fillCircle(kx2, ky2, 30 * u);
    g.lineStyle(3 * u, 0x5a3a1c, a).strokeCircle(kx2, ky2, 30 * u);

    const act = this.story.currentAction();
    const label = !act ? "" : act.kind === "pick" ? (act.p.kind === "log" ? "Ambil kayu" : "Ambil batu") : act.kind === "light" ? "Hidupkan api" : "Masuk kayu";
    this.btnLabel.setText(label);
    this.btn.setAlpha(act ? 1 : 0.45);
    for (let i = 0; i < this.hearts.length; i++) this.hearts[i]!.setFrame(i < this.story.hearts ? "heart" : "heart_empty");
    this.stats.setText(`${POC_VERSION}  ${Math.round(this.story.fps)} fps  kayu ${this.story.core.fire.logs}${this.story.quest.lit ? `  api ${Math.round(this.story.core.fire.fuel)}` : ""}`);
  }
}
