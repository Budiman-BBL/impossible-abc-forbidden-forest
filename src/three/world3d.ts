import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CFG, type Tree, type TreeKind, type World, mulberry32 } from "../core";
import { litMaterial } from "./darkness";
import { toM } from "./units";

/**
 * Low-poly stylised forest built from the shared seeded World. Every tree kind is ONE
 * InstancedMesh with baked vertex colours, so the whole forest is a handful of draw calls.
 */

function colored(geo: THREE.BufferGeometry, hex: number, jitter = 0, seed = 1): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position!.count;
  const c = new THREE.Color(hex);
  const rng = mulberry32(seed);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (rng() - 0.5) * jitter;
    for (let j = 0; j < 3 && i + j < n; j++) {
      arr[(i + j) * 3] = c.r * k;
      arr[(i + j) * 3 + 1] = c.g * k;
      arr[(i + j) * 3 + 2] = c.b * k;
    }
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute("uv");
  g.computeVertexNormals();
  return g;
}

function at(geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s: [number, number, number] = [1, 1, 1]) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(...s));
  return geo.applyMatrix4(m);
}

const BARK = 0x4a3020;
const LEAF = 0x2e5130;
const LEAF2 = 0x3d6a35;

function rubberTree(): THREE.BufferGeometry {
  return mergeGeometries([
    colored(at(new THREE.CylinderGeometry(0.13, 0.22, 2.6, 6), 0, 1.3, 0), BARK, 0.2, 2),
    colored(at(new THREE.IcosahedronGeometry(1.25, 0), 0, 3.1, 0, 0.3, 0.2, 0, [1, 0.8, 1]), LEAF, 0.35, 3),
    colored(at(new THREE.IcosahedronGeometry(0.9, 0), 0.45, 3.9, 0.2, 0.1, 0.9, 0, [1, 0.85, 1]), LEAF2, 0.35, 4),
  ])!;
}

function coconutTree(): THREE.BufferGeometry {
  const parts = [colored(at(new THREE.CylinderGeometry(0.1, 0.16, 4.2, 5), 0, 2.1, 0, 0, 0, 0.08), 0x6b4a2e, 0.2, 5)];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const leaf = at(new THREE.ConeGeometry(0.28, 2.0, 3), 0, 1.0, 0, 0, 0, 0, [1, 1, 0.25]);
    leaf.rotateZ(-1.9);
    leaf.rotateY(a);
    leaf.translate(-0.17, 4.15, 0);
    parts.push(colored(leaf, i % 2 ? LEAF : LEAF2, 0.3, 6 + i));
  }
  return mergeGeometries(parts)!;
}

function bamboo(): THREE.BufferGeometry {
  const rng = mulberry32(77);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = rng() * Math.PI * 2;
    const r = 0.15 + rng() * 0.3;
    const h = 3 + rng() * 1.6;
    parts.push(colored(at(new THREE.CylinderGeometry(0.05, 0.06, h, 5), Math.cos(a) * r, h / 2, Math.sin(a) * r, (rng() - 0.5) * 0.15, 0, (rng() - 0.5) * 0.15), 0x6f8f3a, 0.25, 10 + i));
    parts.push(colored(at(new THREE.ConeGeometry(0.35, 0.9, 4), Math.cos(a) * r, h - 0.2, Math.sin(a) * r), LEAF2, 0.3, 20 + i));
  }
  return mergeGeometries(parts)!;
}

export interface Forest3D {
  group: THREE.Group;
  /** Show a tree standing (logs > 0) or as a stump. */
  setTreeAlive(t: Tree, alive: boolean): void;
  treePos(t: Tree): THREE.Vector3;
  /** Obstacles for the player: x, z, radius in metres. */
  colliders: { x: number; z: number; r: number; treeId?: number }[];
}

export function buildForest(world: World): Forest3D {
  const group = new THREE.Group();
  const mat = litMaterial({ vertexColors: true, flatShading: true });
  const kinds: Record<TreeKind, THREE.BufferGeometry> = { rubber: rubberTree(), coconut: coconutTree(), bamboo: bamboo() };
  const byKind: Record<TreeKind, Tree[]> = { rubber: [], coconut: [], bamboo: [] };
  for (const t of world.trees) byKind[t.kind].push(t);
  const meshes = new Map<number, { mesh: THREE.InstancedMesh; index: number; matrix: THREE.Matrix4 }>();
  const rng = mulberry32(world.seed ^ 0x51ed);
  const dummy = new THREE.Object3D();
  (Object.keys(byKind) as TreeKind[]).forEach((k) => {
    const list = byKind[k];
    const mesh = new THREE.InstancedMesh(kinds[k], mat, Math.max(1, list.length));
    mesh.count = list.length;
    list.forEach((t, i) => {
      const s = 0.85 + rng() * 0.35;
      dummy.position.set(toM(t.x), 0, toM(t.y));
      dummy.rotation.set(0, rng() * Math.PI * 2, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      meshes.set(t.id, { mesh, index: i, matrix: dummy.matrix.clone() });
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  });

  // stumps (one instanced mesh, hidden by zero scale until the tree is chopped)
  const stumpGeo = mergeGeometries([
    colored(at(new THREE.CylinderGeometry(0.2, 0.25, 0.35, 6), 0, 0.17, 0), BARK, 0.2, 30),
    colored(at(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 6), 0, 0.355, 0), 0xc9a26b, 0.1, 31),
  ])!;
  const stumps = new THREE.InstancedMesh(stumpGeo, mat, world.trees.length);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  world.trees.forEach((_t, i) => stumps.setMatrixAt(i, zero));
  stumps.frustumCulled = false;
  group.add(stumps);

  // rocks and bushes
  const rockMesh = new THREE.InstancedMesh(colored(new THREE.DodecahedronGeometry(0.32, 0), 0x6b6a66, 0.3, 40), mat, Math.max(1, world.rocks.length));
  world.rocks.forEach((r, i) => {
    dummy.position.set(toM(r.x), 0.12, toM(r.y));
    dummy.rotation.set(rng(), rng() * 6, rng());
    dummy.scale.set(r.s, r.s * 0.7, r.s);
    dummy.updateMatrix();
    rockMesh.setMatrixAt(i, dummy.matrix);
  });
  rockMesh.count = world.rocks.length;
  const bushGeo = mergeGeometries([
    colored(at(new THREE.IcosahedronGeometry(0.5, 0), 0, 0.35, 0, 0, 0, 0, [1, 0.75, 1]), 0x335a2c, 0.35, 41),
    colored(at(new THREE.IcosahedronGeometry(0.08, 0), 0.25, 0.55, 0.3), 0xb02a2a, 0, 42),
    colored(at(new THREE.IcosahedronGeometry(0.08, 0), -0.3, 0.45, 0.2), 0xb02a2a, 0, 43),
  ])!;
  const bushMesh = new THREE.InstancedMesh(bushGeo, mat, Math.max(1, world.bushes.length));
  world.bushes.forEach((b, i) => {
    dummy.position.set(toM(b.x), 0, toM(b.y));
    dummy.rotation.set(0, rng() * 6, 0);
    dummy.scale.setScalar(b.s);
    dummy.updateMatrix();
    bushMesh.setMatrixAt(i, dummy.matrix);
  });
  bushMesh.count = world.bushes.length;
  group.add(rockMesh, bushMesh);

  // tents
  const tentGeo = mergeGeometries([
    colored(at(new THREE.ConeGeometry(1.25, 1.6, 4), 0, 0.8, 0, 0, Math.PI / 4, 0), 0xb08a5a, 0.15, 50),
    colored(at(new THREE.PlaneGeometry(0.6, 0.9), 0, 0.45, 0.62, -0.32, 0, 0), 0x241812, 0, 51),
  ])!;
  const tents = new THREE.InstancedMesh(tentGeo, mat, world.tents.length);
  world.tents.forEach((t, i) => {
    dummy.position.set(toM(t.x), 0, toM(t.y));
    dummy.rotation.set(0, 0.4, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    tents.setMatrixAt(i, dummy.matrix);
  });
  group.add(tents);

  const colliders: Forest3D["colliders"] = [];
  for (const t of world.trees) colliders.push({ x: toM(t.x), z: toM(t.y), r: 0.4, treeId: t.id });
  for (const r of world.rocks) colliders.push({ x: toM(r.x), z: toM(r.y), r: 0.3 * r.s });
  for (const t of world.tents) colliders.push({ x: toM(t.x), z: toM(t.y), r: 1.1 });
  for (const c of world.camps) colliders.push({ x: toM(c.x), z: toM(c.y), r: 0.75 });

  return {
    group,
    colliders,
    treePos: (t) => new THREE.Vector3(toM(t.x), 0, toM(t.y)),
    setTreeAlive(t, alive) {
      const m = meshes.get(t.id);
      if (!m) return;
      m.mesh.setMatrixAt(m.index, alive ? m.matrix : zero);
      m.mesh.instanceMatrix.needsUpdate = true;
      const stump = new THREE.Matrix4().makeTranslation(toM(t.x), 0, toM(t.y));
      stumps.setMatrixAt(world.trees.indexOf(t), alive ? zero : stump);
      stumps.instanceMatrix.needsUpdate = true;
      const col = colliders.find((c) => c.treeId === t.id);
      if (col) col.r = alive ? 0.4 : 0.25;
    },
  };
}

/** Ground: one big plane with a small procedural canvas texture (256 px, repeated). */
export function buildGround(world: World): THREE.Mesh {
  const size = toM(CFG.WORLD);
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#3d4a2a";
  g.fillRect(0, 0, 256, 256);
  const rng = mulberry32(world.seed);
  for (let i = 0; i < 2200; i++) {
    const v = rng();
    g.fillStyle = v < 0.45 ? "#34401f" : v < 0.8 ? "#4a5530" : "#5a4a30";
    g.fillRect(rng() * 256, rng() * 256, 2 + rng() * 5, 2 + rng() * 5);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(size / 4, size / 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), litMaterial({ map: tex }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(size / 2, 0, size / 2);
  return mesh;
}

/** Packed-earth clearings around the camps (one merged mesh). */
export function buildClearings(world: World): THREE.Mesh {
  const geos = world.camps.map((c) =>
    colored(at(new THREE.CircleGeometry(c.main ? 2.9 : 2.2, 20), toM(c.x), 0.01, toM(c.y), -Math.PI / 2), 0x6a5034, 0.12, 60),
  );
  return new THREE.Mesh(mergeGeometries(geos)!, litMaterial({ vertexColors: true }));
}
