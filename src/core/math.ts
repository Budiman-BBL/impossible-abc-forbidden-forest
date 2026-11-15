/** Small math helpers, identical in behaviour to the legacy v2 prototype. */
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(bx - ax, by - ay);
export const ang = (ax: number, ay: number, bx: number, by: number): number => Math.atan2(by - ay, bx - ax);
