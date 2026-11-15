/** Base resolution: landscape 1280x720, scaled to fit any screen (Phaser Scale.FIT). */
export const GAME_W = 1280;
export const GAME_H = 720;
/**
 * World units are the v2 prototype's units (Cikgu Nisa = 48 units tall). v2 drew them 1:1 on a
 * 360x640 portrait view; on a 1280x720 landscape view we draw them at 2x so sizes feel the same.
 * The player's pinch zoom (0.55x..1.6x, from v2) multiplies this.
 */
export const WORLD_TO_SCREEN = 2;
/** v2: SPRITE_SCALE = 48 / Nisa body height. */
export const CHAR_WORLD_H_NISA = 48;
export const VERSION = "0.1.0-sprint1";
export const ATLAS = "interim-v2";
