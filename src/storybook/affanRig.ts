/**
 * Affan cut-out rig (v2), renderer-free: rig types, facing → view/mirror, walk / idle / gather poses and
 * forward kinematics. The Phaser side (affan.ts) only places images from `solve()`.
 *
 * Rules that fix the old flip bug: a facing picks ONE whole view set (head, torso, arms, legs together),
 * and "left" is "right" with the whole root mirrored — never a per-part flip.
 */
export type ViewName = "front" | "back" | "side";
export type Facing = "down" | "up" | "left" | "right";

export interface RigPart {
  id: string;
  parent: string | null;
  /** pivot offset from the parent pivot (atlas px); root = feet */
  x: number;
  y: number;
  z: number;
  frame?: string;
  ox?: number;
  oy?: number;
  tint?: string;
}
export interface RigDef {
  version: 2;
  scale: number;
  /** figure height in atlas px (feet → top of cap) */
  height: number;
  views: Record<ViewName, RigPart[]>;
}
export interface Local { rot?: number; dx?: number; dy?: number; sx?: number; sy?: number }
export interface World { x: number; y: number; rot: number; sx: number; sy: number }
export interface PoseInput {
  /** walk phase (radians) */
  phase: number;
  /** 0 idle .. 1 full walk */
  amp: number;
  /** 0..1 gather / pick-up crouch */
  gather: number;
  /** seconds, drives idle breathing */
  t: number;
}

export function viewFor(f: Facing): ViewName {
  return f === "down" ? "front" : f === "up" ? "back" : "side";
}
/** scaleX of the root container for a facing (side art faces right). */
export function mirrorFor(f: Facing): 1 | -1 {
  return f === "left" ? -1 : 1;
}

/** Forward kinematics: parts must be listed parent-first. */
export function solve(parts: readonly RigPart[], locals: Record<string, Local>): Record<string, World> {
  const out: Record<string, World> = {};
  const root: World = { x: 0, y: 0, rot: 0, sx: 1, sy: 1 };
  for (const p of parts) {
    const par = p.parent ? out[p.parent] ?? root : root;
    const l = locals[p.id] ?? {};
    const ox = (p.x + (l.dx ?? 0)) * par.sx, oy = (p.y + (l.dy ?? 0)) * par.sy;
    const c = Math.cos(par.rot), s = Math.sin(par.rot);
    out[p.id] = { x: par.x + ox * c - oy * s, y: par.y + ox * s + oy * c, rot: par.rot + (l.rot ?? 0), sx: l.sx ?? 1, sy: l.sy ?? 1 };
  }
  return out;
}

const pos = (v: number) => Math.max(0, v);
/** hip → foot length in the side view (atlas px), used to keep the feet on the ground */
const LEG = 147;

export function poseLocals(view: ViewName, i: PoseInput): Record<string, Local> {
  const { phase: p, amp, gather: g, t } = i;
  const breathe = Math.sin(t * 2.2) * 0.014 * (1 - amp);
  const L: Record<string, Local> = {};
  if (view === "side") {
    const A = 0.42 * amp;
    const leg = (ph: number) => ({ thigh: -A * Math.sin(ph), shin: 0.05 * amp + 0.95 * amp * pos(Math.cos(ph)) ** 2 });
    const f = leg(p), b = leg(p + Math.PI);
    // stance leg is the straighter one: drop the hip so its foot stays on the ground
    const stance = Math.abs(Math.cos(p)) < 0.5 ? Math.abs(f.thigh) : Math.min(Math.abs(f.thigh), Math.abs(b.thigh));
    const drop = LEG * (1 - Math.cos(stance)) - 2.5 * amp * Math.cos(p) ** 2;
    L.hip = { dy: drop + 23 * g };
    L.torso = { rot: 0.06 * amp + 0.012 * Math.sin(2 * p) * amp + 0.55 * g, sy: 1 + breathe };
    L.head = { rot: -0.04 * amp - 0.3 * g + Math.sin(t * 1.1) * 0.015 * (1 - amp) };
    L.pack = { dy: 1.5 * amp * Math.cos(2 * p) };
    L.thighF = { rot: f.thigh - 0.95 * g };
    L.shinF = { rot: f.shin + 1.25 * g };
    L.thighB = { rot: b.thigh + 0.2 * g };
    L.shinB = { rot: b.shin + 0.46 * g };
    const arm = (ph: number) => ({ up: 0.5 * amp * Math.sin(ph) + 0.03 * Math.sin(t * 2.2) * (1 - amp), fore: -(0.12 + 0.45 * amp * pos(-Math.sin(ph))) });
    const af = arm(p), ab = arm(p + Math.PI);
    L.armF = { rot: af.up - 1.1 * g };
    L.foreF = { rot: af.fore - 0.25 * g };
    L.armB = { rot: ab.up - 0.9 * g };
    L.foreB = { rot: ab.fore - 0.25 * g };
    return L;
  }
  // front / back: legs lift alternately, arms swing a little, body sways
  const s = Math.sin(p);
  const lift = { L: pos(s) * amp, R: pos(-s) * amp };
  const mir = view === "back" ? -1 : 1; // viewer-left is Affan's right in front, his left in back
  L.hip = { dy: -3 * amp * Math.abs(s) + 22 * g };
  L.torso = { rot: 0.022 * s * amp * mir, sy: (1 + breathe) * (1 - 0.04 * g) };
  L.head = { rot: -0.012 * s * amp * mir + Math.sin(t * 1.1) * 0.012 * (1 - amp), dy: 4 * g };
  if (view === "back") L.pack = { dy: 1.2 * amp * Math.cos(2 * p) };
  for (const side of ["L", "R"] as const) {
    const sg = side === "L" ? 1 : -1;
    const up = lift[side], other = lift[side === "L" ? "R" : "L"];
    L[`thigh${side}`] = { dy: -8 * up, sy: (1 - 0.05 * up) * (1 - 0.32 * g), rot: sg * 0.22 * g };
    L[`shin${side}`] = { sy: 1 - 0.1 * up, rot: -sg * 0.22 * g };
    // the arm opposite the lifted leg swings forward: it reads as a slight shorten + lift of the hand
    L[`arm${side}`] = { rot: sg * (0.05 * (other - up) + 0.02 * Math.sin(t * 2.2) * (1 - amp)) - sg * 0.3 * g, sy: 1 - 0.05 * other };
    L[`fore${side}`] = { rot: -sg * (0.1 + 0.18 * other) - sg * 0.35 * g, sy: 1 - 0.08 * other };
  }
  return L;
}

/** Parts sorted by z for drawing (stable). */
export function drawOrder(parts: readonly RigPart[]): RigPart[] {
  return parts.filter((p) => p.frame).slice().sort((a, b) => a.z - b.z);
}
