/*!
 * Virtual joystick adapted from BVHEcctrl's Joystick (https://github.com/pmndrs/BVHEcctrl,
 * (c) 2025 @ErdongChen-Andrew, MIT) as shipped in norio/vrm-game-starter (MIT).
 * Changes: no zustand store (reads x/y directly), v2 parchment styling, sized for thumbs.
 */
export class Joystick {
  readonly element: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private active = false;
  private pointerId = -1;
  private cx = 0;
  private cy = 0;
  /** -1..1, y up */
  x = 0;
  y = 0;

  constructor(parent: HTMLElement, private readonly maxRadius = 52) {
    this.element = document.createElement("div");
    this.element.className = "joy";
    this.base = document.createElement("div");
    this.base.className = "joy-base";
    this.knob = document.createElement("div");
    this.knob.className = "joy-knob";
    this.base.append(this.knob);
    this.element.append(this.base);
    this.element.addEventListener("contextmenu", (e) => e.preventDefault());
    this.element.addEventListener("pointerdown", this.down);
    this.element.addEventListener("pointermove", this.move);
    this.element.addEventListener("pointerup", this.up);
    this.element.addEventListener("pointercancel", this.up);
    parent.append(this.element);
  }

  get magnitude(): number {
    return Math.min(1, Math.hypot(this.x, this.y));
  }

  private readonly down = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.element.setPointerCapture?.(e.pointerId);
    this.pointerId = e.pointerId;
    const r = this.base.getBoundingClientRect();
    this.cx = r.left + r.width / 2;
    this.cy = r.top + r.height / 2;
    this.active = true;
    this.set(e.clientX, e.clientY);
  };

  private readonly move = (e: PointerEvent) => {
    if (this.active && e.pointerId === this.pointerId) this.set(e.clientX, e.clientY);
  };

  private readonly up = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.element.releasePointerCapture?.(e.pointerId);
    this.active = false;
    this.x = this.y = 0;
    this.knob.style.transform = "translate(-50%, -50%)";
  };

  private set(px: number, py: number) {
    let dx = px - this.cx;
    let dy = py - this.cy;
    const d = Math.hypot(dx, dy);
    if (d > this.maxRadius) {
      dx *= this.maxRadius / d;
      dy *= this.maxRadius / d;
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.x = dx / this.maxRadius;
    this.y = -dy / this.maxRadius;
  }
}
