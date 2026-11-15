import * as THREE from "three";

/**
 * Retarget humanoid clips from the Universal Animation Library rig (CC0, Quaternius; the copy
 * shipped with norio/vrm-game-starter, MIT) onto our own rig, which uses the same DEF-* bone
 * names but a different rest pose (A-pose, arms down) and proportions.
 *
 * Idea adapted from vrm-game-starter's VrmAnimation.ts (MIT, (c) 2026 norio): work in world
 * space. For every bone b with source rest world rotation S0, target rest world rotation T0 and
 * the rotation A that turns the target bone direction onto the source bone direction:
 *     T(t) = S(t) * S0^-1 * A * T0
 * so each target bone points where the source bone points at time t. Hips translation is
 * scaled by the leg-length ratio. Clips are baked once at load (a few hundred frames).
 */

/** Child bone used to measure each bone's direction (three.js strips "." from node names). */
const CHAIN: Record<string, string> = {
  "DEF-hips": "DEF-spine001",
  "DEF-spine001": "DEF-spine002",
  "DEF-spine002": "DEF-spine003",
  "DEF-spine003": "DEF-neck",
  "DEF-neck": "DEF-head",
  "DEF-shoulderL": "DEF-upper_armL",
  "DEF-upper_armL": "DEF-forearmL",
  "DEF-forearmL": "DEF-handL",
  "DEF-shoulderR": "DEF-upper_armR",
  "DEF-upper_armR": "DEF-forearmR",
  "DEF-forearmR": "DEF-handR",
  "DEF-thighL": "DEF-shinL",
  "DEF-shinL": "DEF-footL",
  "DEF-footL": "DEF-toeL",
  "DEF-thighR": "DEF-shinR",
  "DEF-shinR": "DEF-footR",
  "DEF-footR": "DEF-toeR",
};
/** Leaf bones reuse their parent's direction fix. */
const LEAF_FROM: Record<string, string> = {
  "DEF-head": "",
  "DEF-handL": "DEF-forearmL",
  "DEF-handR": "DEF-forearmR",
  "DEF-toeL": "DEF-footL",
  "DEF-toeR": "DEF-footR",
};
export const RETARGET_BONES = [...Object.keys(CHAIN), ...Object.keys(LEAF_FROM)];

const wq = (o: THREE.Object3D) => o.getWorldQuaternion(new THREE.Quaternion());
const wp = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

export interface RetargetOptions {
  fps?: number;
  /** Clip that holds the source rest pose. */
  restClip: string;
  /** Clips that must not move the hips forward (in-place locomotion). */
  inPlace?: boolean;
}

export function retargetClips(
  sourceRoot: THREE.Object3D,
  sourceClips: THREE.AnimationClip[],
  targetRoot: THREE.Object3D,
  clipNames: readonly string[],
  opts: RetargetOptions,
): THREE.AnimationClip[] {
  const fps = opts.fps ?? 30;
  const src = new Map<string, THREE.Object3D>();
  const tgt = new Map<string, THREE.Bone>();
  sourceRoot.traverse((o) => src.set(o.name, o));
  targetRoot.traverse((o) => {
    if ((o as THREE.Bone).isBone) tgt.set(o.name, o as THREE.Bone);
  });
  const bones = RETARGET_BONES.filter((b) => src.has(b) && tgt.has(b));
  if (!bones.includes("DEF-hips")) throw new Error("retarget: rig has no DEF-hips");

  // ---- rest poses ----
  const mixer = new THREE.AnimationMixer(sourceRoot);
  const pose = (clip: THREE.AnimationClip, t: number) => {
    mixer.stopAllAction();
    const a = mixer.clipAction(clip);
    a.reset().play();
    mixer.setTime(t);
    sourceRoot.updateMatrixWorld(true);
  };
  const rest = sourceClips.find((c) => c.name === opts.restClip);
  if (!rest) throw new Error(`retarget: missing rest clip ${opts.restClip}`);
  pose(rest, 0);
  const S0 = new Map<string, THREE.Quaternion>();
  const S0inv = new Map<string, THREE.Quaternion>();
  const srcDir = new Map<string, THREE.Vector3>();
  for (const b of bones) {
    S0.set(b, wq(src.get(b)!));
    S0inv.set(b, wq(src.get(b)!).invert());
    if (CHAIN[b] && src.has(CHAIN[b]!)) srcDir.set(b, wp(src.get(CHAIN[b]!)!).sub(wp(src.get(b)!)).normalize());
  }
  const srcHips0 = wp(src.get("DEF-hips")!);
  const srcFoot = src.get("DEF-footL") ?? src.get("DEF-hips")!;
  const srcLeg = srcHips0.y - wp(srcFoot).y;

  targetRoot.updateMatrixWorld(true);
  const T0 = new Map<string, THREE.Quaternion>();
  const A = new Map<string, THREE.Quaternion>();
  for (const b of bones) {
    T0.set(b, wq(tgt.get(b)!));
    const child = CHAIN[b];
    if (child && tgt.has(child) && srcDir.has(b)) {
      const dT = wp(tgt.get(child)!).sub(wp(tgt.get(b)!)).normalize();
      A.set(b, new THREE.Quaternion().setFromUnitVectors(dT, srcDir.get(b)!));
    }
  }
  for (const b of bones) {
    if (A.has(b)) continue;
    const from = LEAF_FROM[b];
    A.set(b, from && A.has(from) ? A.get(from)!.clone() : new THREE.Quaternion());
  }
  const tgtHips = tgt.get("DEF-hips")!;
  const tgtHips0 = wp(tgtHips);
  const tgtFoot = tgt.get("DEF-footL") ?? tgtHips;
  const scale = (tgtHips0.y - wp(tgtFoot).y) / srcLeg;
  const hipsParentInv = new THREE.Matrix4();
  tgtHips.parent!.updateWorldMatrix(true, false);
  hipsParentInv.copy(tgtHips.parent!.matrixWorld).invert();

  // parent world rotation at rest for target bones whose parent is not retargeted
  const restParentWorld = new Map<string, THREE.Quaternion>();
  for (const b of bones) restParentWorld.set(b, wq(tgt.get(b)!.parent!));

  // order bones parent-first
  const depth = (o: THREE.Object3D) => {
    let d = 0;
    for (let p = o.parent; p; p = p.parent) d++;
    return d;
  };
  bones.sort((a, b) => depth(tgt.get(a)!) - depth(tgt.get(b)!));

  const out: THREE.AnimationClip[] = [];
  for (const name of clipNames) {
    const clip = sourceClips.find((c) => c.name === name);
    if (!clip) continue;
    const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
    const times = new Float32Array(frames);
    const quat = new Map<string, Float32Array>(bones.map((b) => [b, new Float32Array(frames * 4)]));
    const hipsPos = new Float32Array(frames * 3);
    for (let f = 0; f < frames; f++) {
      const t = Math.min(clip.duration, f / fps);
      times[f] = t;
      pose(clip, t);
      const world = new Map<string, THREE.Quaternion>();
      for (const b of bones) {
        const S = wq(src.get(b)!);
        const T = S.multiply(S0inv.get(b)!).multiply(A.get(b)!).multiply(T0.get(b)!);
        world.set(b, T);
        const parent = tgt.get(b)!.parent!;
        const pw = world.get(parent.name) ?? restParentWorld.get(b)!;
        const local = pw.clone().invert().multiply(T);
        local.toArray(quat.get(b)!, f * 4);
      }
      const d = wp(src.get("DEF-hips")!).sub(srcHips0).multiplyScalar(scale);
      if (opts.inPlace) {
        d.x = 0;
        d.z = 0;
      }
      const p = tgtHips0.clone().add(d).applyMatrix4(hipsParentInv);
      p.toArray(hipsPos, f * 3);
    }
    const tracks: THREE.KeyframeTrack[] = bones.map((b) => new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, times, quat.get(b)!));
    tracks.push(new THREE.VectorKeyframeTrack("DEF-hips.position", times, hipsPos));
    out.push(new THREE.AnimationClip(name, clip.duration, tracks));
  }
  mixer.stopAllAction();
  return out;
}
