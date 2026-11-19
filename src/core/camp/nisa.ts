/**
 * Cikgu Nisa's camp routine (renderer-free): she sits at the table, gets up, stands at a few spots and
 * walks short loops through camp, following the fixed route in the layout. When Affan comes close she
 * stops and turns to him (so talking still works); when he leaves she carries on.
 */
import type { NisaStop, Pt } from "./layout";

export type NisaMode = "sit" | "stand" | "walk" | "attend";

export const NISA_WALK = 38;
const ATTEND_R = 95;
const RELEASE_R = 150;

export class NisaBrain {
  x: number;
  y: number;
  mode: NisaMode;
  /** −1 faces left, 1 faces right */
  face: 1 | -1 = 1;
  /** seconds spent in the current mode (renderer uses it for sit-down / stand-up easing) */
  modeT = 0;
  private i = 0;
  private hold: number;
  private resume: NisaMode = "sit";

  constructor(readonly route: NisaStop[]) {
    const s = route[0]!;
    this.x = s.x; this.y = s.y;
    this.mode = s.act === "sit" ? "sit" : "stand";
    this.hold = s.hold;
  }

  get target(): Pt { return this.route[(this.i + 1) % this.route.length]!; }

  private setMode(m: NisaMode): void { if (m !== this.mode) { this.mode = m; this.modeT = 0; } }

  step(dt: number, player: Pt): void {
    this.modeT += dt;
    const dP = Math.hypot(player.x - this.x, player.y - this.y);
    // Affan nearby: stop and look at him (sitting stays seated)
    if (this.mode === "attend") {
      this.faceTo(player.x);
      if (dP > RELEASE_R) this.setMode(this.resume);
      return;
    }
    if (this.mode !== "sit" && dP < ATTEND_R) {
      this.resume = this.mode;
      this.setMode("attend");
      this.faceTo(player.x);
      return;
    }
    if (this.mode === "sit" || this.mode === "stand") {
      if (dP < ATTEND_R * 1.6) this.faceTo(player.x);
      this.hold -= dt;
      if (this.hold <= 0) this.setMode("walk");
      return;
    }
    // walking towards the next stop
    const tg = this.target;
    const dx = tg.x - this.x, dy = tg.y - this.y, d = Math.hypot(dx, dy);
    const stepLen = NISA_WALK * dt;
    if (Math.abs(dx) > 2) this.face = dx < 0 ? -1 : 1;
    if (d <= stepLen) {
      this.x = tg.x; this.y = tg.y;
      this.i = (this.i + 1) % this.route.length;
      const stop = this.route[this.i]!;
      if (stop.act === "pass") return;
      this.hold = stop.hold;
      this.setMode(stop.act === "sit" ? "sit" : "stand");
      return;
    }
    this.x += (dx / d) * stepLen;
    this.y += (dy / d) * stepLen;
  }

  private faceTo(x: number): void {
    if (x < this.x - 8) this.face = -1;
    else if (x > this.x + 8) this.face = 1;
  }
}
