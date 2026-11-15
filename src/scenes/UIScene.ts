import Phaser from "phaser";
import { ATLAS, GAME_H, GAME_W, VERSION } from "../config";
import type { HudState } from "./GameScene";
import { PALETTE } from "../ui/palette";
import { bar, flameIcon, parchmentPanel, roundButton, textStyle, type RoundButton } from "../ui/widgets";

const fmtTime = (t: number): string => {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * HUD overlay running in parallel with Game. Uses the official style sheet v2 look:
 * parchment panels, ink outlines, rounded bars and round buttons.
 * Sprint 1 shows only what really works: fire fuel, wood, fire level, v2 night counter.
 */
export class UIScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private fuelText!: Phaser.GameObjects.Text;
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

  create(): void {
    this.toastQ = [];
    this.over = undefined;
    this.paused = undefined;
    this.g = this.add.graphics();

    // top-left: fire panel
    const fireIcon = this.add.image(50, 64, ATLAS, "fire_burning").setOrigin(0.5, 0.5).setDepth(1);
    fireIcon.setScale(64 / fireIcon.height);
    this.fuelText = this.add.text(88, 24, "Api", textStyle(18)).setDepth(1);
    const wood = this.add.image(104, 86, ATLAS, "firewood").setOrigin(0.5, 0.5).setDepth(1);
    wood.setScale(26 / wood.height);
    this.logsText = this.add.text(124, 74, "", textStyle(20)).setDepth(1);
    this.levelText = this.add.text(224, 77, "", textStyle(16, PALETTE.rust)).setDepth(1);

    // top-right: night pill
    this.clockText = this.add.text(GAME_W - 30, 38, "", textStyle(20)).setOrigin(1, 0.5).setDepth(1);

    // bottom-right: round buttons
    this.upgradeBtn = roundButton(this, GAME_W - 82, GAME_H - 104, 40, (g) => flameIcon(g, 0, 2, 1.25), "Naik taraf", () =>
      this.events.emit("ui:upgrade"),
    );
    roundButton(
      this,
      GAME_W - 186,
      GAME_H - 92,
      30,
      (g) => {
        g.lineStyle(3, PALETTE.ink).strokeCircle(0, 0, 12);
        g.fillStyle(PALETTE.fireDeep).fillCircle(0, 0, 5);
      },
      "Kem",
      () => this.events.emit("ui:recenter"),
    );
    roundButton(
      this,
      GAME_W - 270,
      GAME_H - 92,
      30,
      (g) => {
        g.fillStyle(PALETTE.ink).fillRoundedRect(-9, -11, 6, 22, 2).fillRoundedRect(3, -11, 6, 22, 2);
      },
      "Rehat",
      () => this.togglePause(),
    );

    this.toastText = this.add
      .text(GAME_W / 2, GAME_H - 46, "", { ...textStyle(19, PALETTE.parchmentLight, PALETTE.ink), align: "center", wordWrap: { width: 700 } })
      .setOrigin(0.5, 1)
      .setDepth(5);
    this.add.text(12, GAME_H - 8, `v${VERSION} · aset sementara (interim)`, textStyle(12, PALETTE.parchmentDark, PALETTE.ink)).setOrigin(0, 1).setAlpha(0.8);

    const game = this.scene.get("Game");
    game.events.off("toast").on("toast", (text: string) => this.toast(text));
    game.events.off("gameover").on("gameover", (d: { time: number }) => this.showGameOver(d.time));
  }

  private toast(text: string): void {
    this.toastQ.push({ text, t: 3.2 });
    if (this.toastQ.length > 3) this.toastQ.shift();
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
    this.paused = this.modal("Rehat", "Permainan dihentikan sementara.", "Sambung", () => this.togglePause());
  }

  private showGameOver(time: number): void {
    if (this.over) return;
    this.over = this.modal("Api padam!", `Kem bertahan ${fmtTime(time)}. Gelap menelan hutan.`, "Main semula", () => {
      // Game restarts and relaunches this HUD scene.
      this.events.emit("ui:restart");
    });
  }

  private modal(title: string, body: string, button: string, onTap: () => void): Phaser.GameObjects.Container {
    const shade = this.add.rectangle(0, 0, GAME_W, GAME_H, PALETTE.night, 0.6).setOrigin(0).setInteractive();
    const g = this.add.graphics();
    parchmentPanel(g, GAME_W / 2 - 260, GAME_H / 2 - 130, 520, 260, 20);
    const t = this.add.text(GAME_W / 2, GAME_H / 2 - 82, title, textStyle(40, PALETTE.maroon)).setOrigin(0.5);
    const b = this.add.text(GAME_W / 2, GAME_H / 2 - 18, body, { ...textStyle(20), align: "center", wordWrap: { width: 440 } }).setOrigin(0.5);
    const btnG = this.add.graphics();
    btnG.fillStyle(PALETTE.ink, 0.5).fillRoundedRect(GAME_W / 2 - 108, GAME_H / 2 + 44, 220, 56, 28);
    btnG.fillStyle(PALETTE.fire).fillRoundedRect(GAME_W / 2 - 110, GAME_H / 2 + 40, 220, 56, 28);
    btnG.lineStyle(4, PALETTE.ink).strokeRoundedRect(GAME_W / 2 - 110, GAME_H / 2 + 40, 220, 56, 28);
    const bt = this.add.text(GAME_W / 2, GAME_H / 2 + 68, button, textStyle(22)).setOrigin(0.5);
    const hit = this.add.rectangle(GAME_W / 2, GAME_H / 2 + 68, 220, 56, 0, 0).setInteractive({ useHandCursor: true });
    hit.on("pointerup", (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      onTap();
    });
    return this.add.container(0, 0, [shade, g, t, b, btnG, bt, hit]).setDepth(100);
  }

  update(_t: number, deltaMs: number): void {
    const hud = this.registry.get("hud") as HudState | undefined;
    const g = this.g;
    g.clear();
    parchmentPanel(g, 12, 12, 330, 104);
    if (hud) {
      const pct = hud.fuel / hud.fuelMax;
      bar(g, 120, 24, 206, 22, pct, pct < 0.28 ? PALETTE.heart : PALETTE.fire);
      this.fuelText.setText("Api");
      this.logsText.setText(`Kayu ${hud.logs}`);
      this.levelText.setText(`Tahap api ${hud.level}`);
      this.clockText.setText(`Malam ${hud.night} · ${fmtTime(hud.time)}`);
      const cost = hud.upgradeCost;
      this.upgradeBtn.label.setText(cost == null ? "Tahap maks" : `Naik taraf (${cost})`);
      this.upgradeBtn.setEnabled(cost != null && hud.logs >= cost && !hud.out);
    }
    // night pill (top right)
    const w = Math.max(200, this.clockText.width + 80);
    parchmentPanel(g, GAME_W - w - 12, 12, w, 52, 26);
    const mx = GAME_W - w + 22;
    g.fillStyle(PALETTE.gold).fillCircle(mx, 38, 13);
    g.fillStyle(PALETTE.parchment).fillCircle(mx + 6, 33, 11);
    g.lineStyle(2, PALETTE.ink).strokeCircle(mx, 38, 13);

    // toasts
    const dt = deltaMs / 1000;
    const head = this.toastQ[0];
    if (head) {
      head.t -= dt;
      if (head.t <= 0) this.toastQ.shift();
    }
    this.toastText.setText(this.toastQ[0]?.text ?? "");
  }
}
