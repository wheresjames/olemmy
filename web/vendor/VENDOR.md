# Vendored files

Olemmy's only runtime library is markdown-it, with the plugins Lemmy-UI uses for sub/superscript, footnotes and spoilers ([OLEMMY.md](../../docs/OLEMMY.md) §14). Each package's prebuilt browser file is copied from npm at an exact version into its own `<name>@<version>/` folder with its `LICENSE`, and served from our own origin. `index.html` loads each as a classic `defer` script with an `integrity` (SRI) hash, so a changed file won't run. `markdown-it.js` beside this file re-exports their globals as an ES module. The build copies this folder untouched.

| File | Version | Source | SHA-256 | Size | Gzipped |
|---|---|---|---|---|---|
| `markdown-it@15.0.2/markdown-it.min.js` | 15.0.2 (MIT) | npm `markdown-it`, `dist/browser/markdown-it.umd.min.js` | `635972b985228e8af9f0143647c68616b7a3bb09f6946e7e4a52e43dcf5e7be5` | 115,080 B | 48,328 B |
| `markdown-it-sub@2.0.0/markdown-it-sub.min.js` | 2.0.0 (MIT) | npm `markdown-it-sub`, `dist/markdown-it-sub.min.js` | `fffa57742043f3012ee57a4d5b337f04222a459e7a8d0892a9755b5c6b16bca8` | 967 B | 574 B |
| `markdown-it-sup@2.0.0/markdown-it-sup.min.js` | 2.0.0 (MIT) | npm `markdown-it-sup`, `dist/markdown-it-sup.min.js` | `6c81de84d54484f1a37c58277db9cc0a92623253159e360ae99246ff08203236` | 965 B | 572 B |
| `markdown-it-footnote@4.0.0/markdown-it-footnote.min.js` | 4.0.0 (MIT) | npm `markdown-it-footnote`, `dist/markdown-it-footnote.min.js` | `d6fee58a3b56c5742fa18f3e01f1d317cc99975683ebd39c9195cb2aff0c2e42` | 5,624 B | 1,850 B |
| `markdown-it-container@4.0.0/markdown-it-container.min.js` | 4.0.0 (MIT) | npm `markdown-it-container`, `dist/markdown-it-container.min.js` | `5bda29f8cc0e613e04c4eb077a363cc86ab8a238f487b7792f2bdeb7a7b27ff4` | 1,682 B | 867 B |

markdown-it 15.0.2 was chosen over 15.0.3 because 15.0.3 was only nine days old when vendored (2026-10-25). Pin releases that have been out for at least two weeks.

## Flags

`flag-icons@7.5.0/` holds the flags for the language labels' flag style (`js/features/language-flags.js`): 68 of flag-icons' 4×3 SVGs, MIT, from npm `flag-icons` 7.5.0, `flags/4x3/`, copied unchanged, with its `LICENSE`. Only the flags `LANGUAGE_FLAGS` names are kept (477,216 B, 135,474 B gzipped together; `rs.svg` alone is 181,634 B). They're images, loaded with `<img>` when shown, so they need no `index.html` entry or hash. 7.6.0 was 14 days old when vendored (2026-10-29), so the release before it was used.

To add a flag: `npm pack flag-icons@7.5.0`, copy `package/flags/4x3/<country>.svg` here, and add the language to `LANGUAGE_FLAGS`. A test checks every flag it names is here.

## Upgrading

1. `npm pack markdown-it@<version>` (and the plugins), and copy the files above into new `<name>@<version>/` folders with their `LICENSE`. Delete the old folders.
2. Update the `src` and `integrity` attributes in `index.html`. Get the hash with `openssl dgst -sha384 -binary <file> | openssl base64 -A`.
3. Update the table above (`sha256sum`, `wc -c`, `gzip -9c <file> | wc -c`).
4. Run `npm test` (the markdown fixture tests) and `npx playwright test`.
