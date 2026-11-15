import type { HudState } from "../core";
import { Joystick } from "./joystick";
import { POC_VERSION } from "./version";

/** DOM HUD in the v2 parchment style (bars, round buttons), sized for thumbs. */
export class Hud {
  readonly joystick: Joystick;
  private readonly fuelFill: HTMLDivElement;
  private readonly logs: HTMLSpanElement;
  private readonly level: HTMLSpanElement;
  private readonly night: HTMLSpanElement;
  readonly chopBtn: HTMLButtonElement;
  readonly feedBtn: HTMLButtonElement;
  readonly upBtn: HTMLButtonElement;
  private readonly toastEl: HTMLDivElement;
  private readonly stats: HTMLDivElement;
  private readonly modal: HTMLDivElement;
  private toastTimer = 0;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = `
      <div class="panel top-left">
        <div class="row"><span class="flame-icon"></span><div class="bar"><div class="bar-fill"></div></div></div>
        <div class="row small"><span class="logs-icon"></span><b class="logs">0</b> kayu · Api tahap <b class="lvl">0</b> · <span class="night">Malam 1</span></div>
      </div>
      <div class="stats"></div>
      <div class="toast hidden"></div>
      <div class="buttons">
        <button class="rbtn up"><span>Naik taraf</span><small></small></button>
        <button class="rbtn feed"><span>Masuk kayu</span></button>
        <button class="rbtn chop big"><span>Tebang</span></button>
      </div>
      <div class="modal hidden"><div class="panel box"><h2>Api padam!</h2><p class="msg"></p><button class="rbtn restart"><span>Main semula</span></button></div></div>
      <div class="badge">3D PoC v${POC_VERSION}</div>`;
    const q = <T extends Element>(s: string) => root.querySelector(s) as T;
    this.fuelFill = q(".bar-fill");
    this.logs = q(".logs");
    this.level = q(".lvl");
    this.night = q(".night");
    this.chopBtn = q(".chop");
    this.feedBtn = q(".feed");
    this.upBtn = q(".up");
    this.toastEl = q(".toast");
    this.stats = q(".stats");
    this.modal = q(".modal");
    this.joystick = new Joystick(root);
    for (const b of root.querySelectorAll("button")) b.addEventListener("pointerdown", (e) => e.stopPropagation());
  }

  onRestart(fn: () => void) {
    (this.root.querySelector(".restart") as HTMLButtonElement).onclick = fn;
  }

  update(h: HudState, canChop: boolean, canFeed: boolean, chopProgress: number | null) {
    this.fuelFill.style.width = `${Math.round((h.fuel / h.fuelMax) * 100)}%`;
    this.fuelFill.classList.toggle("low", h.fuel / h.fuelMax < 0.28);
    this.logs.textContent = String(h.logs);
    this.level.textContent = String(h.level);
    this.night.textContent = `Malam ${h.night}`;
    this.chopBtn.disabled = !canChop && chopProgress == null;
    this.chopBtn.style.setProperty("--p", `${Math.round((chopProgress ?? 0) * 360)}deg`);
    this.chopBtn.classList.toggle("busy", chopProgress != null);
    this.feedBtn.disabled = !canFeed;
    (this.upBtn.querySelector("small") as HTMLElement).textContent = h.upgradeCost == null ? "maks" : `${h.upgradeCost} kayu`;
    this.upBtn.disabled = h.upgradeCost == null || h.logs < h.upgradeCost;
  }

  toast(text: string) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove("hidden");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.add("hidden"), 2600);
  }

  puff(x: number, y: number, text: string, color: string) {
    const el = document.createElement("div");
    el.className = "puff";
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = color;
    this.root.append(el);
    setTimeout(() => el.remove(), 1200);
  }

  gameOver(seconds: number) {
    (this.modal.querySelector(".msg") as HTMLElement).textContent = `Kem bertahan ${Math.floor(seconds / 60)} minit ${Math.floor(seconds % 60)} saat.`;
    this.modal.classList.remove("hidden");
  }

  setStats(text: string) {
    this.stats.textContent = text;
  }
}
