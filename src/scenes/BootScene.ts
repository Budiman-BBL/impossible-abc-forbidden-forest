import Phaser from "phaser";

/** Boot: global settings, then hand over to Preload. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create(): void {
    this.input.mouse?.disableContextMenu();
    // Try to lock landscape where the browser allows it (Android Chrome in fullscreen/PWA);
    // ignored elsewhere. A CSS overlay asks to rotate when the phone is in portrait.
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    orientation.lock?.("landscape").catch(() => undefined);
    this.scene.start("Preload");
  }
}
