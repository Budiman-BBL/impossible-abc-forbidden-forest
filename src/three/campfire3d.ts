import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { fireSpriteId, type Camp, type FireState } from "../core";
import { litMaterial } from "./darkness";
import { toM } from "./units";

function radialTexture(inner: string, outer: string): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface Campfire3D {
  group: THREE.Group;
  update(fire: FireState, time: number): void;
}

/** Stone ring + logs (lit by the darkness mask) and an unlit additive flame + glow. */
export function buildCampfire(camp: Camp): Campfire3D {
  const group = new THREE.Group();
  group.position.set(toM(camp.x), 0, toM(camp.y));
  const stones: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = new THREE.DodecahedronGeometry(0.16, 0);
    s.scale(1, 0.7, 1);
    s.translate(Math.cos(a) * 0.62, 0.08, Math.sin(a) * 0.62);
    stones.push(s);
  }
  group.add(new THREE.Mesh(mergeGeometries(stones)!, litMaterial({ color: 0x5c5a55, flatShading: true })));
  const logs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const l = new THREE.CylinderGeometry(0.07, 0.08, 0.9, 6);
    l.rotateZ(Math.PI / 2 - 0.35);
    l.rotateY((i / 4) * Math.PI * 2);
    l.translate(0, 0.18, 0);
    logs.push(l);
  }
  group.add(new THREE.Mesh(mergeGeometries(logs)!, litMaterial({ color: 0x3b2618, flatShading: true })));

  const flame = new THREE.Group();
  const outer = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, 1.0, 7, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  outer.position.y = 0.6;
  const inner = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.65, 6, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  inner.position.y = 0.48;
  flame.add(outer, inner);
  group.add(flame);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: radialTexture("rgba(255,170,80,0.55)", "rgba(255,120,40,0)"), blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  glow.position.y = 0.8;
  group.add(glow);

  return {
    group,
    update(fire, time) {
      const id = fireSpriteId(fire, camp);
      const on = id !== "fire_unlit";
      flame.visible = on;
      glow.visible = on;
      if (!on) return;
      const embers = id === "fire_embers";
      const lvl = camp.main ? fire.level : 0;
      const base = (embers ? 0.45 : 1) * (1 + lvl * 0.12) * (camp.main ? 1 : 0.8);
      const flick = 1 + Math.sin(time * 13.7) * 0.06 + Math.sin(time * 7.3 + 1.3) * 0.05;
      flame.scale.set(base, base * flick, base);
      flame.rotation.y = time * 0.7;
      glow.scale.setScalar(2.6 * base * flick);
    },
  };
}
