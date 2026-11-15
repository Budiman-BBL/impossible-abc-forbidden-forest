import Phaser from "phaser";
import { CampScene } from "./CampScene";
import { CampHud } from "./CampHud";
import { RigTestScene } from "./RigTestScene";
import { isNativeApp, setupFullscreenOnFirstTap } from "../platform";

/** DPR cap for the storybook PoC (`?dpr=` overrides on the web for testing). */
function dpr(): number {
  const q = Number(new URLSearchParams(location.search).get("dpr"));
  const cap = q > 0 ? q : 2;
  return Math.min(Math.max(window.devicePixelRatio || 1, 1), cap);
}
function cssSize(): { w: number; h: number } {
  const vv = window.visualViewport;
  return { w: Math.round(vv?.width ?? window.innerWidth), h: Math.round(vv?.height ?? window.innerHeight) };
}
const s0 = cssSize();
const d0 = dpr();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#06090f",
  width: s0.w * d0,
  height: s0.h * d0,
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / d0 },
  input: { activePointers: 3 },
  render: { antialias: true, roundPixels: false, powerPreference: "high-performance" },
  // ?rig=1: dev-only rig test page (Affan large on a checkerboard, deterministic poses for screenshots)
  scene: new URLSearchParams(location.search).has("rig") ? [RigTestScene] : [CampScene, CampHud],
});
let pending = 0;
function fit(): void {
  window.clearTimeout(pending);
  pending = window.setTimeout(() => {
    const { w, h } = cssSize();
    const d = dpr();
    if (game.scale.width === w * d && game.scale.height === h * d) return;
    game.scale.setZoom(1 / d);
    game.scale.resize(w * d, h * d);
  }, 120);
}
window.addEventListener("resize", fit);
window.visualViewport?.addEventListener("resize", fit);
document.addEventListener("fullscreenchange", fit);
if (!isNativeApp()) setupFullscreenOnFirstTap();
(window as unknown as { __PHASER_GAME__?: Phaser.Game }).__PHASER_GAME__ = game;
