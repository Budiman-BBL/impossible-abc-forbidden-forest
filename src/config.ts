/**
 * World units are the v2 prototype's units (Cikgu Nisa = 48 units tall). v2 drew them 1:1 on a
 * 360x640 portrait view; on a 720 px tall landscape view we draw them at 2x (scaled further with screen height,
 * see GameScene.applyZoom), so sizes feel the same on every screen.
 * The player's pinch zoom (0.55x..1.6x, from v2) multiplies this.
 */
export const WORLD_TO_SCREEN = 2;
/** v2: SPRITE_SCALE = 48 / Nisa body height. */
export const CHAR_WORLD_H_NISA = 48;
export const VERSION = "0.2.0";
export const ATLAS = "interim-v2";
