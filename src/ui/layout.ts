/**
 * Screen metrics for the fill-the-screen layout.
 * The canvas backing store is CSS size × render DPR (capped at 2 for performance), and the
 * canvas is CSS-scaled back down, so drawing is crisp on high-DPR phones.
 * All game coordinates are device pixels of that backing store.
 */
export const MAX_RENDER_DPR = 2;

export function renderDpr(): number {
  return Math.min(Math.max(window.devicePixelRatio || 1, 1), MAX_RENDER_DPR);
}

/** Height (device px) the HUD and world framing were designed for. */
export const DESIGN_H = 720;

export interface ViewMetrics {
  w: number;
  h: number;
  dpr: number;
  /** Device px per HUD design unit. */
  ui: number;
}

/**
 * HUD scale: follow the screen height, but never let it get smaller than 0.85 × DPR,
 * which keeps the smallest round button (radius 30 design units) at ≥ 51 dp on phones
 * (thumb-sized, above the 44-48 dp guideline) and body text ≥ 13 dp.
 */
export function viewMetrics(w: number, h: number): ViewMetrics {
  const dpr = renderDpr();
  return { w, h, dpr, ui: Math.max(h / DESIGN_H, 0.85 * dpr) };
}
