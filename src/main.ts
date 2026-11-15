import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { PreloadScene } from "./scenes/PreloadScene";
import { GameScene } from "./scenes/GameScene";
import { UIScene } from "./scenes/UIScene";
import { renderDpr } from "./ui/layout";
import { isNativeApp, setupFullscreenOnFirstTap } from "./platform";

/** Size of the visible area in CSS px (visualViewport follows the mobile browser bars). */
function cssSize(): { w: number; h: number } {
  const vv = window.visualViewport;
  return { w: Math.round(vv?.width ?? window.innerWidth), h: Math.round(vv?.height ?? window.innerHeight) };
}

const start = cssSize();
const dpr0 = renderDpr();

// Fill the whole screen: the game size always equals the screen size (in device px), the
// canvas is shown at CSS size via zoom = 1/dpr. Cameras and HUD adapt to any aspect ratio.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0d0806",
  width: start.w * dpr0,
  height: start.h * dpr0,
  scale: {
    mode: Phaser.Scale.NONE,
    zoom: 1 / dpr0,
  },
  input: { activePointers: 3 },
  render: { antialias: true, roundPixels: false },
  scene: [BootScene, PreloadScene, GameScene, UIScene],
});

let pending = 0;
function fitToScreen(): void {
  window.clearTimeout(pending);
  pending = window.setTimeout(() => {
    const { w, h } = cssSize();
    const d = renderDpr();
    if (game.scale.width === w * d && game.scale.height === h * d) return;
    game.scale.setZoom(1 / d);
    game.scale.resize(w * d, h * d);
  }, 120);
}
window.addEventListener("resize", fitToScreen);
window.visualViewport?.addEventListener("resize", fitToScreen);
window.addEventListener("orientationchange", fitToScreen);
document.addEventListener("fullscreenchange", fitToScreen);

if (!isNativeApp()) setupFullscreenOnFirstTap();

declare global {
  interface Window {
    __ABC__?: Record<string, unknown>;
    __PHASER_GAME__?: Phaser.Game;
  }
}
window.__PHASER_GAME__ = game;
