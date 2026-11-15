import Phaser from "phaser";
import { ATLAS, VERSION } from "../config";
import type { HudState } from "./GameScene";
import { PALETTE } from "../ui/palette";
import { viewMetrics, type ViewMetrics } from "../ui/layout";
import { bar, flameIcon, parchmentPanel, roundButton, textStyle, type RoundButton } from "../ui/widgets";

const fmtTime = (t: number): string => {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * HUD overlay running in parallel with Game, styled after official style sheet v2
 * (parchment panels, ink outlines, rounded bars, round buttons).
 * Layout: groups anchored to the screen corners and scaled by `ui` (see ui/layout.ts), so the
 * HUD fills any screen shape and stays thumb-sized on phones. Rebuilt on every resize.
 */
export class UIScene extends Phaser.Scene {
  private m!: ViewMetrics;
  private gTL!: Phaser.GameObjects.Graphics;
  private gTR!: Phaser.GameObjects.Graphics;
  private tr!: Phaser.GameObjects.Container;
  private logsText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private upgradeBtn!: RoundButton;
  private toastText!: Phaser.GameObjects.Text;
  private toastQ: { text: string; t: number }[] = [];
  private over?: Phaser.GameObjects.Container;
  private paused?: Phaser.GameObjects.Container;

  constructor() {
    super("UI");
  }

  /** Text that stays crisp when its container is scaled by `ui`. */
  private text(x: number, y: number, s: string, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
    return this.add.text(x, y, s, style).setResolution(Math.max(1, this.m.ui));
  }

  create(): void {
    this.m = viewMetrics(this.scale.width, this.scale.height);
    const { w, h, ui } = this.m;
    this.toastQ = [];
    this.over = undefined;
    this.paused = undefined;

    // ---- top-left: fire panel ----
    const tl = this.add.container(0, 0).setScale(ui);
    this.gTL = this.add.graphics();
    const fireIcon = this.add.image(50, 64, ATLAS, "fire_burning");
    fireIcon.setOrigin(0.5).setScale(64 / fireIcon.height);
    const wood = this.add.image(104, 86, ATLAS, "firewood");
    wood.setOrigin(0.5).setScale(26 / wood.height);
    this.logsText = this.text(124, 74, "", textStyle(20));
    this.levelText = this.text(224, 77, "", textStyle(16, PALETTE.rust));
    tl.add([this.gTL, fireIcon, wood, this.text(88, 24, "Api", textStyle(18)), this.logsText, this.levelText]);

    // ---- top-right: night pill ----
    this.tr = this.add.container(w, 0).setScale(ui);
    this.gTR = this.add.graphics();
    this.clockText = this.text(-30, 38, "", textStyle(20)).setOrigin(1, 0.5);
    this.tr.add([this.gTR, this.clockText]);

    // ---- bottom-right: round buttons ----
    const br = this.add.container(w, h).setScale(ui);
    this.upgradeBtn = roundButton(this, -82, -104, 40, (g) => flameIcon(g, 0, 2, 1.25), "Naik taraf", () => this.events.emit("ui:upgrade"));
    const kem = roundButton(
      this, -186, -92, 30,
      (g) => {
        g.lineStyle(3, PALETTE.ink).strokeCircle(0, 0, 12);
        g.fillStyle(PALETTE.fireDeep).fillCircle(0, 0, 5);
      },
      "Kem",
      () => this.events.emit("ui:recenter"),
    );
    const rehat = roundButton(
      this, -270, -92, 30,
      (g) => {
        g.fillStyle(PALETTE.ink).fillRoundedRect(-9, -11, 6, 22, 2).fillRoundedRect(3, -11, 6, 22, 2);
      },
      "Rehat",
      () => this.togglePause(),
    );
    for (const b of [this.upgradeBtn, kem, rehat]) {
      b.label.setResolution(Math.max(1, ui));
      br.add(b.container);
    }

    // ---- bottom-left: toasts + version ----
    const bl = this.add.container(0, h).setScale(ui);
    const wrap = Math.max(260, w / ui - 360);
    this.toastText = this.text(18, -40, "", { ...textStyle(19, PALETTE.parchmentLight, PALETTE.ink), wordWrap: { width: wrap } }).setOrigin(0, 1);
    bl.add([this.toastText, this.text(12, -8, `v${VERSION} · aset sementara (interim)`, textStyle(12, PALETTE.parchmentDark, PALETTE.ink)).setOrigin(0, 1).setAlpha(0.8)]);

    const game = this.scene.get("Game");
    game.events.off("toast").on("toast", (t: string) => this.toast(t));
    game.events.off("gameover").on("gameover", (d: { time: number }) => this.showGameOver(d.time));

    // Rebuild the HUD for the new screen size (rotation, browser bars, fullscreen).
    this.scale.off("resize", this.onResize, this).on("resize", this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off("resize", this.onResize, this));

    // Restore modal state after a rebuild.
    const hud = this.registry.get("hud") as HudState | undefined;
    if (hud?.out) this.showGameOver(hud.time);
    else if (this.scene.isPaused("Game")) this.showPause();
  }

  private onResize(): void {
    this.scene.restart();
  }

  private toast(text: string): void {
    this.toastQ.push({ text, t: 3.2 });
    if (this.toastQ.length > 3) this.toastQ.shift();
  }

  private showPause(): void {
    this.paused = this.modal("Rehat", "Permainan dihentikan sementara.", "Sambung", () => this.togglePause());
  }

  private togglePause(): void {
    if (this.over) return;
    if (this.paused) {
      this.paused.destroy();
      this.paused = undefined;
      this.scene.resume("Game");
      return;
    }
    this.scene.pause("Game");
    this.showPause();
  }

  private showGameOver(time: number): void {
    if (this.over) return;
    this.over = this.modal("Api padam!", `Kem bertahan ${fmtTime(time)}. Gelap menelan hutan.`, "Main semula", () => {
      // Game restarts and relaunches this HUD scene.
      this.events.emit("ui:restart");
    });
  }

  private modal(title: string, body: string, button: string, onTap: () => void): Phaser.GameObjects.Container {
    const { w, h, ui } = this.m;
    const shade = this.add.rectangle(0, 0, w, h, PALETTE.night, 0.6).setOrigin(0).setInteractive();
    const box = this.add.container(w / 2, h / 2).setScale(Math.min(ui, (h * 0.9) / 280, (w * 0.9) / 540));
    const g = this.add.graphics();
    parchmentPanel(g, -260, -130, 520, 260, 20);
    const t = this.text(0, -82, title, textStyle(40, PALETTE.maroon)).setOrigin(0.5);
    const b = this.text(0, -18, body, { ...textStyle(20), align: "center", wordWrap: { width: 440 } }).setOrigin(0.5);
    const btnG = this.add.graphics();
    btnG.fillStyle(PALETTE.ink, 0.5).fillRoundedRect(-108, 44, 220, 56, 28);
    btnG.fillStyle(PALETTE.fire).fillRoundedRect(-110, 40, 220, 56, 28);
    btnG.lineStyle(4, PALETTE.ink).strokeRoundedRect(-110, 40, 220, 56, 28);
    const bt = this.text(0, 68, button, textStyle(22)).setOrigin(0.5);
    const hit = this.add.rectangle(0, 68, 220, 56, 0, 0).setInteractive({ useHandCursor: true });
    hit.on("pointerup", (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      onTap();
    });
    box.add([g, t, b, btnG, bt, hit]);
    return this.add.container(0, 0, [shade, box]).setDepth(100);
  }

  update(_t: number, deltaMs: number): void {
    const hud = this.registry.get("hud") as HudState | undefined;
    const g = this.gTL;
    g.clear();
    parchmentPanel(g, 12, 12, 330, 104);
    if (hud) {
      const pct = hud.fuel / hud.fuelMax;
      bar(g, 120, 24, 206, 22, pct, pct < 0.28 ? PALETTE.heart : PALETTE.fire);
      this.logsText.setText(`Kayu ${hud.logs}`);
      this.levelText.setText(`Tahap api ${hud.level}`);
      this.clockText.setText(`Malam ${hud.night} · ${fmtTime(hud.time)}`);
      const cost = hud.upgradeCost;
      this.upgradeBtn.label.setText(cost == null ? "Tahap maks" : `Naik taraf (${cost})`);
      this.upgradeBtn.setEnabled(cost != null && hud.logs >= cost && !hud.out);
    }
    // night pill (top right, coordinates relative to the right edge)
    const gr = this.gTR;
    gr.clear();
    const pw = Math.max(200, this.clockText.width + 80);
    parchmentPanel(gr, -pw - 12, 12, pw, 52, 26);
    const mx = -pw + 22;
    gr.fillStyle(PALETTE.gold).fillCircle(mx, 38, 13);
    gr.fillStyle(PALETTE.parchment).fillCircle(mx + 6, 33, 11);
    gr.lineStyle(2, PALETTE.ink).strokeCircle(mx, 38, 13);

    const head = this.toastQ[0];
    if (head) {
      head.t -= deltaMs / 1000;
      if (head.t <= 0) this.toastQ.shift();
    }
    this.toastText.setText(this.toastQ[0]?.text ?? "");
  }
}
