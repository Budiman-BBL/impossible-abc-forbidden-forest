# Legacy prototypes (do not edit)

Original single-file HTML prototypes built with Grok Bot before the Phaser migration.
They are kept **byte-for-byte unchanged** as the known-working reference for gameplay and balance.

| File | SHA-256 |
|---|---|
| `kem-api-unggun-v1.html` | `83a08bde10ecfc634c7853106534d5baa2771f21f4159cb499bd12dd07809e2c` |
| `kem-api-unggun-v2.html` | `691d555cb61181e3171433e58d53b3d6dcddc2380d90b7f0d8a09cbaea07c2ff` |

`kem-api-unggun-v2-preview.png` is a screenshot of v2 for comparison.

Open either HTML file directly in Chrome to play. The unit tests in `tests/unit/` read
`kem-api-unggun-v2.html` and check that the new TypeScript fire/light formulas give the same numbers.
