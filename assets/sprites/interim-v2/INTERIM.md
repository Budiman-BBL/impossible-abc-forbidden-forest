# ⚠️ INTERIM SPRITES — not final art

These 31 PNGs were cut from the earlier sheets (lineup v4, binatang v1, tempat_prop v1) for
legacy prototype v2. They are used in Sprint 1 only so the Phaser build has something to show.

Known problems: single pose (no walk/run animation), low resolution (characters ~140-170 px tall),
cream fringe from the paper background, ground tile seams, and they follow the **older** style,
not the official style sheet v2. File names keep the old spellings (`afan`, `hanan`).

They will be replaced by sprites cut from the official style v2 sheets (Sprint 2+).
`sprite_meta.json` holds width/height and the foot anchor (`ax`, `ay`) measured for each sprite.
The atlas `public/atlases/interim-v2.*` is generated from this folder by `npm run atlas`.
