import Phaser from "phaser";
import { GAME_H, GAME_W } from "./config";
import { BootScene } from "./scenes/BootScene";
import { PreloadScene } from "./scenes/PreloadScene";
import { GameScene } from "./scenes/GameScene";
import { UIScene } from "./scenes/UIScene";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0d0806",
  width: GAME_W,
  height: GAME_H,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { activePointers: 3 },
  render: { antialias: true, roundPixels: false },
  scene: [BootScene, PreloadScene, GameScene, UIScene],
});

declare global {
  interface Window {
    __ABC__?: Record<string, unknown>;
    __PHASER_GAME__?: Phaser.Game;
  }
}
window.__PHASER_GAME__ = game;
