import * as THREE from "three";

/**
 * Third-person follow camera: orbit by dragging (one finger / mouse) on empty screen, pinch or
 * wheel to zoom. Pitch/zoom limits and smoothing follow the feel of vrm-game-starter's
 * CameraRig (MIT); no camera collision is needed in an open clearing.
 */
export class CameraRig {
  yaw = Math.PI; // behind the player, looking north (-Z)
  pitch = 0.5;
  distance = 6;
  readonly target = new THREE.Vector3();
  private readonly smoothed = new THREE.Vector3();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly el: HTMLElement) {
    el.addEventListener("pointerdown", this.down);
    el.addEventListener("pointermove", this.move);
    el.addEventListener("pointerup", this.up);
    el.addEventListener("pointercancel", this.up);
    el.addEventListener("wheel", (e) => this.zoom(e.deltaY > 0 ? 1.1 : 0.9), { passive: true });
  }

  private zoom(k: number) {
    this.distance = THREE.MathUtils.clamp(this.distance * k, 3, 14);
  }

  private readonly down = (e: PointerEvent) => {
    this.el.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.pinch = 0;
  };

  private readonly move = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      p.x = e.clientX;
      p.y = e.clientY;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch > 0) this.zoom(this.pinch / d);
      this.pinch = d;
      return;
    }
    this.yaw -= (e.clientX - p.x) * 0.006;
    this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - p.y) * 0.004, 0.12, 1.25);
    p.x = e.clientX;
    p.y = e.clientY;
  };

  private readonly up = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.pinch = 0;
  };

  /** Forward direction on the ground for the current yaw (where "up" on the joystick goes). */
  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  update(dt: number, follow: THREE.Vector3, snap = false) {
    this.target.copy(follow).add(new THREE.Vector3(0, 1.3, 0));
    if (snap) this.smoothed.copy(this.target);
    else this.smoothed.lerp(this.target, 1 - Math.pow(0.0005, dt));
    const off = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    ).multiplyScalar(this.distance);
    this.camera.position.copy(this.smoothed).add(off);
    this.camera.lookAt(this.smoothed);
  }
}
