/**
 * Renderer-agnostic game logic shared by the Phaser 2D build (src/scenes) and the three.js 3D
 * build (src/three). Nothing in src/core may import Phaser, three.js or touch the DOM.
 */
export * from "./balance";
export * from "./campfire";
export * from "./light";
export * from "./world";
export * from "./math";
export * from "./rng";
export * from "./game";
