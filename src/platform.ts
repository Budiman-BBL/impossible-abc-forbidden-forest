/** Platform helpers: web browser vs the Capacitor Android app. */
interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

export function isNativeApp(): boolean {
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/**
 * Web build on phones/tablets: on the first tap, go fullscreen (hides the browser bars) and
 * lock landscape where the browser allows it. Desktop mice are left alone.
 * The Android app is already fullscreen/immersive natively.
 */
export function setupFullscreenOnFirstTap(): void {
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  if (!coarse || !document.fullscreenEnabled) return;
  const onTap = (): void => {
    if (document.fullscreenElement) return;
    document.documentElement
      .requestFullscreen({ navigationUI: "hide" })
      .then(() => {
        const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        return o.lock?.("landscape");
      })
      .catch(() => undefined);
  };
  // pointerup counts as a user gesture for the Fullscreen API; keep trying until it works
  // (e.g. after the player leaves fullscreen with the back gesture).
  window.addEventListener("pointerup", onTap, { passive: true });
}
