import * as THREE from "three";
import { CHARACTERS } from "../data/characters";
import { CFG, GameCore, campLightR, seedFromUrl, type CoreEvent, type Tree } from "../core";
import { CameraRig } from "./cameraRig";
import { buildCampfire, type Campfire3D } from "./campfire3d";
import { loadCharacter } from "./character";
import { darknessUniforms, setFire } from "./darkness";
import { Hud } from "./hud";
import { toM, toUnits } from "./units";
import { POC_VERSION } from "./version";
import { buildClearings, buildForest, buildGround, type Forest3D } from "./world3d";

const CHOP_REACH = 1.9; // m from the player to a tree trunk
const FEED_REACH = 2.6; // m from the player to the main campfire
const WALK_SPEED = 2.0; // m/s at half stick
const RUN_SPEED = 4.2; // m/s at full stick (v2 WALK is 86 units/s = 3.9 m/s here)

export interface Game3DOptions {
  canvas: HTMLCanvasElement;
  hudRoot: HTMLElement;
}

/** The 3D view of the shared GameCore. */
export async function startGame3D({ canvas, hudRoot }: Game3DOptions) {
  const params = new URLSearchParams(location.search);
  const dprCap = Number(params.get("dpr") ?? 1.5);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: dprCap <= 1.5, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  const night = new THREE.Color(0x05060c);
  scene.background = night;
  scene.fog = new THREE.Fog(night, 12, 34);
  scene.add(new THREE.HemisphereLight(0xbfd0ff, 0x3a2a1a, 1.6));
  const sun = new THREE.DirectionalLight(0xffe2c0, 1.4);
  sun.position.set(-3, 6, 2);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 80);
  const hud = new Hud(hudRoot);
  const rig = new CameraRig(camera, canvas);

  let core: GameCore;
  let forest: Forest3D;
  let fires: Campfire3D[] = [];
  let worldGroup = new THREE.Group();
  const eyes = buildEyes();
  scene.add(eyes.points);

  const player = await loadCharacter();
  scene.add(player.root);
  const pos = new THREE.Vector3();
  let heading = Math.PI; // facing -Z
  let chopping: Tree | null = null;
  let feedTimer = 0;
  let over = false;
  const treeAlive = new Map<number, boolean>();

  function newGame() {
    scene.remove(worldGroup);
    worldGroup = new THREE.Group();
    core = new GameCore(seedFromUrl(location.search));
    forest = buildForest(core.world);
    fires = core.world.camps.map(buildCampfire);
    worldGroup.add(buildGround(core.world), buildClearings(core.world), forest.group, ...fires.map((f) => f.group));
    scene.add(worldGroup);
    treeAlive.clear();
    for (const t of core.world.trees) treeAlive.set(t.id, true);
    const m = core.mainCamp;
    pos.set(toM(m.x), 0, toM(m.y) + 2.4);
    heading = Math.PI;
    rig.yaw = 0;
    chopping = null;
    over = false;
    rig.update(0, pos, true);
    hud.toast("Jalan ke pokok dalam cahaya dan tekan Tebang. Bawa kayu ke unggun.");
  }
  hud.onRestart(() => {
    document.querySelector(".modal")?.classList.add("hidden");
    newGame();
  });
  newGame();

  const screen = new THREE.Vector3();
  function toScreen(xu: number, yu: number, h: number) {
    screen.set(toM(xu), h, toM(yu)).project(camera);
    return { x: (screen.x * 0.5 + 0.5) * window.innerWidth, y: (-screen.y * 0.5 + 0.5) * window.innerHeight };
  }

  function handle(events: CoreEvent[]) {
    for (const ev of events) {
      if (ev.type === "toast") hud.toast(ev.text);
      else if (ev.type === "puff") {
        const s = toScreen(ev.x, ev.y + 50, 2.4);
        hud.puff(s.x, s.y, ev.text, ev.color);
      } else if (ev.type === "chopDone" || ev.type === "chopCancel") {
        if (chopping && chopping.id === ev.treeId) chopping = null;
      } else if (ev.type === "gameover") {
        over = true;
        hud.gameOver(ev.time);
      }
    }
  }

  function nearestTree(): Tree | null {
    let best: Tree | null = null;
    let bd = CHOP_REACH;
    for (const t of core.world.trees) {
      if (t.logs <= 0) continue;
      const d = Math.hypot(toM(t.x) - pos.x, toM(t.y) - pos.z);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }
  const nearFire = () => Math.hypot(toM(core.mainCamp.x) - pos.x, toM(core.mainCamp.y) - pos.z) < FEED_REACH;

  function chop() {
    if (over) return;
    if (chopping) return;
    const t = nearestTree();
    if (!t) return hud.toast("Dekati pokok dulu.");
    const ev = core.chop(t);
    handle(ev);
    if (ev.some((e) => e.type === "chopStart")) {
      chopping = t;
      heading = Math.atan2(toM(t.x) - pos.x, toM(t.y) - pos.z);
    }
  }
  function feed() {
    if (over || !nearFire()) return;
    const ev = core.feed();
    handle(ev);
    if (ev.some((e) => e.type === "fed")) {
      feedTimer = 1.1;
      heading = Math.atan2(toM(core.mainCamp.x) - pos.x, toM(core.mainCamp.y) - pos.z);
    }
  }
  function upgrade() {
    if (over) return;
    handle(core.upgrade((id) => CHARACTERS.find((c) => c.id === id)?.displayName));
  }
  hud.chopBtn.onclick = chop;
  hud.feedBtn.onclick = feed;
  hud.upBtn.onclick = upgrade;

  const keys = new Set<string>();
  window.addEventListener("keydown", (e) => {
    keys.add(e.code);
    if (e.code === "KeyE" || e.code === "Space") chop();
    if (e.code === "KeyF") feed();
    if (e.code === "KeyU") upgrade();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------- loop ----------
  let last = performance.now();
  let animT = 0;
  let fpsFrames = 0;
  let fpsT = 0;
  let fps = 0;
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const move = new THREE.Vector3();

  function frame() {
    const now = performance.now();
    const raw = (now - last) / 1000;
    last = now;
    const dt = Math.min(0.08, raw); // same cap as v2 / the 2D build
    animT += dt;
    fpsFrames++;
    fpsT += raw;
    if (fpsT >= 0.5) {
      fps = fpsFrames / fpsT;
      fpsFrames = 0;
      fpsT = 0;
    }

    handle(core.step(dt));

    // ---- input -> movement ----
    let ix = hud.joystick.x;
    let iy = hud.joystick.y;
    if (keys.has("KeyW") || keys.has("ArrowUp")) iy = 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) iy = -1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) ix = -1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) ix = 1;
    const mag = Math.min(1, Math.hypot(ix, iy));
    rig.forward(fwd);
    right.set(-fwd.z, 0, fwd.x);
    move.copy(fwd).multiplyScalar(iy).addScaledVector(right, ix);
    if (mag > 0.12 && !over) {
      if (chopping) handle(core.cancelChop(chopping.id));
      chopping = null;
      feedTimer = 0;
      move.normalize();
      const speed = mag > 0.7 || keys.has("ShiftLeft") ? RUN_SPEED : WALK_SPEED;
      pos.addScaledVector(move, speed * mag * dt);
      collide();
      const target = Math.atan2(move.x, move.z);
      let d = target - heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      heading += d * Math.min(1, dt * 12);
      player.play(mag > 0.7 || keys.has("ShiftLeft") ? "run" : "walk");
    } else if (chopping) {
      player.play("chop");
    } else if (feedTimer > 0) {
      feedTimer -= dt;
      player.play("feed");
    } else {
      player.play("idle");
    }
    player.root.position.copy(pos);
    player.root.rotation.y = heading;
    player.update(dt);
    darknessUniforms.uPlayer.value.copy(pos);

    // ---- world sync ----
    for (const t of core.world.trees) {
      const alive = t.logs > 0;
      if (treeAlive.get(t.id) !== alive) {
        treeAlive.set(t.id, alive);
        forest.setTreeAlive(t, alive);
      }
    }
    core.world.camps.forEach((c, i) => {
      const flick = 1 + Math.sin(animT * 9.1 + i) * 0.025;
      setFire(i, toM(c.x), toM(c.y), toM(campLightR(core.fire, c)) * flick, c.lit ? 1 : 0);
      fires[i]!.update(core.fire, animT);
    });
    eyes.update(core, animT);

    rig.update(dt, pos);
    renderer.render(scene, camera);

    const near = nearestTree();
    hud.update(core.hud(), !!near, nearFire() && core.fire.logs > 0, chopping ? (core.chops.find((c) => c.tree === chopping)?.t ?? 0) : null);
    const info = renderer.info.render;
    hud.setStats(`${fps.toFixed(0)} fps · ${info.calls} draw · ${(info.triangles / 1000).toFixed(0)}k tri · dpr ${renderer.getPixelRatio().toFixed(2)}`);
    requestAnimationFrame(frame);
  }

  function collide() {
    for (const c of forest.colliders) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const r = c.r + 0.3;
      const d = Math.hypot(dx, dz);
      if (d < r && d > 1e-4) {
        pos.x = c.x + (dx / d) * r;
        pos.z = c.z + (dz / d) * r;
      }
    }
    const W = toM(CFG.WORLD);
    pos.x = THREE.MathUtils.clamp(pos.x, 1, W - 1);
    pos.z = THREE.MathUtils.clamp(pos.z, 1, W - 1);
  }

  // e2e / debugging hooks
  window.__ABC3D__ = {
    version: POC_VERSION,
    ready: true,
    get core() {
      return core;
    },
    get player() {
      return { x: toUnits(pos.x), y: toUnits(pos.z), anim: player.current() };
    },
    stats: () => ({ fps, ...renderer.info.render, memory: renderer.info.memory, character: player.stats, dpr: renderer.getPixelRatio() }),
    /** Teleport next to the tree nearest to the camp and chop it. */
    chopNearest: () => {
      const t = core.nearestTreeToCamp();
      if (!t) return;
      const dx = toM(t.x) - toM(core.mainCamp.x);
      const dz = toM(t.y) - toM(core.mainCamp.y);
      const d = Math.hypot(dx, dz);
      pos.set(toM(t.x) - (dx / d) * 1.1, 0, toM(t.y) - (dz / d) * 1.1);
      collide();
      chop();
    },
    feed,
    upgrade,
    setView: (yaw: number, pitch: number, distance: number) => {
      rig.yaw = yaw;
      rig.pitch = pitch;
      rig.distance = distance;
    },
  };
  requestAnimationFrame(frame);
}

/** Red eye pairs that blink in the dark and flee the light (v2 drawEyes), as one Points draw. */
function buildEyes() {
  const N = 36;
  const posArr = new Float32Array(N * 2 * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xff2a22, size: 0.09, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  points.frustumCulled = false;
  return {
    points,
    update(core: GameCore, t: number) {
      const lights = core.lightSources();
      core.world.eyes.forEach((e, i) => {
        let lit = 0;
        for (const L of lights) lit = Math.max(lit, 1 - Math.hypot(e.x - L.x, e.y - L.y) / L.r);
        const hidden = lit > 0.2 || Math.sin(t * 2.2 + e.ph) < -0.85;
        const x = toM(e.x);
        const z = toM(e.y);
        const y = hidden ? -50 : 0.9 + Math.sin(e.ph) * 0.3;
        posArr.set([x - 0.08, y, z, x + 0.08, y, z], i * 6);
      });
      geo.attributes.position!.needsUpdate = true;
    },
  };
}

declare global {
  interface Window {
    __ABC3D__?: Record<string, unknown>;
  }
}
