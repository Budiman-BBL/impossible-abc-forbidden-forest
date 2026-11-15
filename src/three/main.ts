import "./style.css";
import { startGame3D } from "./game3d";

const canvas = document.getElementById("scene") as HTMLCanvasElement;
const hudRoot = document.getElementById("hud") as HTMLElement;
const loading = document.getElementById("loading");

startGame3D({ canvas, hudRoot })
  .then(() => loading?.remove())
  .catch((err: unknown) => {
    console.error(err);
    if (loading) loading.textContent = `Gagal memuatkan 3D: ${String(err)}`;
  });

// Web only: go fullscreen + landscape on the first tap (the APK is already immersive).
window.addEventListener(
  "pointerdown",
  () => {
    const el = document.documentElement;
    const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.()) return;
    if (!document.fullscreenElement && el.requestFullscreen && matchMedia("(pointer: coarse)").matches) {
      el.requestFullscreen().then(() => (screen.orientation as { lock?: (o: string) => Promise<void> }).lock?.("landscape")).catch(() => {});
    }
  },
  { once: true },
);
