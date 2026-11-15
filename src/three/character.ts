import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { withDarkness } from "./darkness";
import { retargetClips } from "./retarget";
import charUrl from "./assets/budiman.glb?url";
import animUrl from "./assets/ual-anims.glb?url";

export type CharAnim = "idle" | "walk" | "run" | "chop" | "feed";

const CLIP: Record<CharAnim, string> = {
  idle: "Idle_Loop",
  walk: "Walk_Loop",
  run: "Jog_Fwd_Loop",
  chop: "Sword_Attack",
  feed: "Interact",
};

export interface Character {
  root: THREE.Group;
  stats: { triangles: number; textureSize: number };
  play(a: CharAnim): void;
  current(): CharAnim;
  update(dt: number): void;
}

function blobShadow(): THREE.Mesh {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(0,0,0,0.55)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  return m;
}

/** Budiman's character (image-to-3D + auto-rig, see docs/poc-3d.md) with retargeted CC0 animations. */
export async function loadCharacter(): Promise<Character> {
  const loader = new GLTFLoader();
  const [charGltf, animGltf] = await Promise.all([loader.loadAsync(charUrl), loader.loadAsync(animUrl)]);
  const model = charGltf.scene;
  let triangles = 0;
  let textureSize = 0;
  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    const src = m.material as THREE.MeshStandardMaterial;
    if (src.map) {
      src.map.anisotropy = 1;
      textureSize = Math.max(textureSize, (src.map.image as { width?: number } | null)?.width ?? 0);
    }
    m.material = withDarkness(new THREE.MeshLambertMaterial({ map: src.map }));
    m.frustumCulled = false;
    triangles += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position!.count) / 3;
  });
  const clips = retargetClips(animGltf.scene, animGltf.animations, model, Object.values(CLIP), {
    restClip: "A_TPose",
    inPlace: true,
  });
  const root = new THREE.Group();
  root.add(model, blobShadow());
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map<CharAnim, THREE.AnimationAction>();
  for (const [k, name] of Object.entries(CLIP) as [CharAnim, string][]) {
    const clip = clips.find((c) => c.name === name);
    if (clip) actions.set(k, mixer.clipAction(clip));
  }
  let cur: CharAnim = "idle";
  actions.get("idle")?.play();
  return {
    root,
    stats: { triangles, textureSize },
    current: () => cur,
    play(a) {
      if (a === cur) return;
      const next = actions.get(a);
      const prev = actions.get(cur);
      if (!next) return;
      next.reset();
      next.setLoop(a === "feed" ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = a === "feed";
      next.play();
      if (prev) next.crossFadeFrom(prev, 0.2, false);
      cur = a;
    },
    update(dt) {
      mixer.update(dt);
    },
  };
}
