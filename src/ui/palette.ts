/**
 * Colours sampled from the official style sheet v2 (docs/art-reference/ABC_forbidden_forest_official_style_v2.png):
 * colour palette swatches, parchment panels, ink outlines, heart/bar/round-button UI elements.
 */
export const PALETTE = {
  ink: 0x1a0f08,
  parchment: 0xf0c69a,
  parchmentLight: 0xf2d3a8,
  parchmentDark: 0xcda781,
  olive: 0x725529,
  brown: 0x492e1f,
  rust: 0x74432a,
  tan: 0xd19868,
  maroon: 0x742b3d,
  plum: 0x6c3a51,
  slate: 0x66717a,
  fire: 0xf08a2a,
  fireDeep: 0xc4521c,
  gold: 0xe8b84a,
  heart: 0xc8302c,
  barBack: 0x3a2618,
  night: 0x04030a,
} as const;

export const css = (c: number): string => `#${c.toString(16).padStart(6, "0")}`;

export const FONT = 'Georgia, "Times New Roman", serif';
