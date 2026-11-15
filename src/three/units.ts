/**
 * The shared GameCore works in v2 world units on a 2400 x 2400 forest floor (x, y).
 * The 3D build maps them to metres: 22 units = 1 m (so the camp clearing is ~4.4 m across before the trees start),
 * x -> X and y -> Z, so the whole forest is ~110 m across.
 */
export const UNITS_PER_M = 22;
export const toM = (u: number): number => u / UNITS_PER_M;
export const toUnits = (m: number): number => m * UNITS_PER_M;
