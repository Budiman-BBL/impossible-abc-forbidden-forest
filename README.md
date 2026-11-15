# Impossible ABC: The Forbidden Forest

Game pengembaraan survival 2D dengan tujuh watak asal dari projek animasi **The Impossible ABC**:
Cikgu Nisa, Affan, Ayan, Unais, Hannan, Asiya dan Safiya.
Dibina dengan **Phaser 3 + TypeScript + Vite**, untuk browser dahulu dan kemudian APK Android (Capacitor).

▶️ **Main di browser / telefon (landskap):** https://budiman-bbl.github.io/impossible-abc-forbidden-forest/

## Status: Sprint 1 (asas repo dan gelung teras)

**Yang berfungsi sekarang**
- Gelung api unggun dari prototaip v2, kini dalam Phaser: bahan api menurun, bulatan cahaya mengecil, api padam = kalah.
- Tap pokok dalam kawasan cahaya → ditebang dalam 3.8 s → +2 kayu (maksimum 2 pokok serentak); pokok tumbuh semula selepas 52 s.
- Tap api unggun → masukkan 1 kayu. Butang **Naik taraf** besarkan api (kos 12–34 kayu, 6 tahap).
- Dunia hutan ber-seed dari v2 (64 pokok, batu, semak, khemah, 3 tapak kem, burung hantu, ayam hutan, kera, mata merah dalam gelap).
- Seret untuk gerak kamera, cubit atau roda tetikus untuk zum, butang **Kem** untuk kembali ke kem utama, butang **Rehat**.
- Skrin landskap 1280×720 diskala ikut skrin (Scale.FIT); telefon dalam potret diminta pusing ke landskap.
- HUD gaya *official style sheet v2*: panel kertas, garis dakwat, bar dan butang bulat.

**Belum ada (sprint akan datang)**
- Menu dan pilih watak, gerak watak dengan joystick (Sprint 2).
- Kutip batu, hotbar inventori, kitaran siang/malam sebenar, simpanan (Sprint 3). Paparan "Malam N" sekarang hanyalah kiraan malam v2 setiap 75 s yang mempercepat api padam, bukan siang/malam.
- Pengikut AI, babi hutan, Hantar Obor, Api Ajaib, kem kedua dan ketiga (sprint kemudian). Naik taraf api belum membuka watak baru.
- Bunyi dan muzik. APK Android (Sprint 5).
- **Semua sprite ialah aset sementara (interim)** dari prototaip v2 (gaya lama, satu pose). Ia akan diganti dengan seni dari *official style sheet v2*.

## Cara jalankan

```bash
npm ci
npm run dev        # pelayan dev (http://localhost:5173)
npm run typecheck  # semakan TypeScript
npm run lint
npm test           # ujian unit: formula api dibanding terus dengan legacy v2
npm run build      # build web ke dist/
npm run test:e2e   # ujian Playwright (desktop + Android landskap); perlukan `npx playwright install chromium`
npm run atlas      # jana semula atlas sprite interim (perlukan Python + Pillow)
```

Tambah `?seed=2026` pada URL untuk dunia yang sama setiap kali.

## Struktur

```
src/scenes/   Boot, Preload, Game, UI (HUD)
src/systems/  campfire (formula api v2), light, world (penjana dunia ber-seed)
src/data/     balance.json (nilai v2), characters.json (nama rasmi)
src/ui/       palet warna & widget gaya style sheet v2
tests/unit/   Vitest, termasuk perbandingan dengan legacy/kem-api-unggun-v2.html
tests/e2e/    Playwright smoke tests
legacy/       prototaip HTML v1 dan v2 (tidak diubah)
assets/sprites/interim-v2/  sprite sementara + sprite_meta.json
public/atlases/             atlas dijana (interim)
docs/         keputusan, seni bina, rujukan seni, laporan sprint
```

Dokumen: [DECISIONS](docs/DECISIONS.md) · [Seni bina](docs/architecture.md) · [Art bible](docs/art-bible.md) · [Audit v2](docs/audit-v2.md) · [Sprint 1](docs/sprints/sprint-1.md) · [CHANGELOG](CHANGELOG.md)

---

## English (short)

2D survival adventure starring the seven original characters of *The Impossible ABC*. Phaser 3 + TypeScript + Vite; browser first, Android APK via Capacitor later.

**Sprint 1 status:** the legacy v2 campfire loop now runs in Phaser in landscape: fuel decays, the light circle shrinks, tap lit trees for wood, tap the fire to feed it, upgrade the fire, game over when it goes out. Fire/light formulas are unit-tested against the legacy v2 file itself. **Not yet:** character select, joystick movement, inventory, real day/night, saving, enemies/followers, audio, Android build. All sprites are **interim** (from the old prototype) until the official style v2 art is cut.

Play: https://budiman-bbl.github.io/impossible-abc-forbidden-forest/ · Project owner: Budiman (final approval on every sprint).
