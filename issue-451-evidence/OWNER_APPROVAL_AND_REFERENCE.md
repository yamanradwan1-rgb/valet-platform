# VAYLET #451 — local design approval and visual reference evidence

## Owner authorization (conversation, 2026-11-12)

> The Owner has explicitly approved **Prototype V2, Variant A, with visible color labels** and authorized its implementation.

> **Beige / Gold is ONE vehicle color, not two.**

The Owner's decision update authorizes the single optional string value `Beige / Gold` if the existing contract accepts it. The requested change is limited to Employee Native Check-In / Vehicle Details / Color. No other application UI is authorized to change. The current GitHub issue body is earlier design-gate wording and has no Owner approval comment as of this preflight.

## Exact reference after the Owner's Explorer correction

- Physical source: `D:\kndoom\valet-platform\reference\VAYLET-451-color-prototype\v2\index.html`
- The earlier `referenc` spelling does not exist in this checkout; Explorer screenshot explicitly points to `reference`.
- Existing source files: `v2/index.html`, `styles.css`, `prototype.js`, `copy.js`, `DESIGN_REVIEW.md`, `README.md`, `assets/`, `screenshots-v2/`.
- Frozen source was only read; it was not modified, copied into production, or bundled.
- `index.html` SHA256: `0AF41983DB0821DA4EA0AC9B6C8360E8F7F1AE1EE16A8E3626CDF33A1C53BE92`
- `styles.css` SHA256: `457059EB7318A0CBE11695B917185A71D9ABBD359204017A8CF6E19155345EB3`
- `prototype.js` SHA256: `F78F483410EE38AA919F5C8F62014266C782D013A6E7F8E3775EC93024126CA7`
- `copy.js` SHA256: `6D7046680F3DE21687C62AB598A2405F2A97553F1F19FCBBF827B0AF723B6926`

## Browser reference inspection

The archived V2 ran from a read-only local file server on localhost and was inspected in the browser. DOM and screenshot confirmed default `data-variant=a`, nine visible English labels in 3 columns, 4px gaps, 114 x 48px tiles at 390dp, and a 232px Color group. Preset selection, repeat-tap idempotence, one active selection, the Beige / Gold diagonal split swatch, Other custom typing and restored custom buffer, and explicit Clear including buffer disposal were exercised through actual browser interaction. Preset selection did not open the simulated keyboard. The V2 screenshot archive includes 30 A/B PNGs plus a compact comparison, including Arabic, compact widths, 150% text and custom states.

The browser mock is reference evidence only, not proof of React Native fidelity. Initial `adb devices -l` returned no Android device; `emulator -list-avds` reported no configured AVD. Native parity and physical TalkBack remain independent acceptance gates.

## Reference matrix at the frozen V2 state

The V2 archive already has named A-only captures for states 1–3, 5–6, 10, and 12; its other captures cover related states, but not every exact requested combination. During this run the live V2 browser was also inspected at EN/Dark/390 and AR/Light/320, selecting White, Black, Beige / Gold and other presets, editing Other, returning to a buffered custom value, and clearing it. No file was fabricated for an uncaptured state.

| Requirement | Frozen V2 archive reference | Native after screenshot |
| --- | --- | --- |
| 1 EN / Dark / 390 / empty | `a-en-dark-390-empty.png` | unavailable |
| 2 EN / Dark / 390 / White | `a-en-dark-390-white.png` | unavailable |
| 3 EN / Dark / 390 / Black | `a-en-dark-390-black.png` | unavailable |
| 4 EN / Light / 320 / Blue | no exact archive capture | unavailable |
| 5 AR / Dark / 390 / empty | `a-ar-dark-390-empty.png` | unavailable |
| 6 AR / Light / 320 / Beige / Gold | `a-ar-light-320-beige-gold.png` | unavailable |
| 7 AR / Light / 320 / Green | no exact archive capture | unavailable |
| 8 EN / Dark / 320 / Other focused | `a-en-light-320-other-keyboard.png` is adjacent light-theme reference | unavailable |
| 9 AR / Light / 320 / Other focused | no exact archive capture | unavailable |
| 10 Saved custom | `a-en-dark-390-saved-custom.png` | unavailable |
| 11 Clear color | `a-en-dark-390-empty.png` is resulting state | unavailable |
| 12 150% font | `a-ar-light-320-150-percent.png` | unavailable |

The complete prototype directory remains read-only, and all existing `a-` captures are distinguishable from unapproved `b-` Variant B screenshots.

## Local integration record

- Production baseline: `fba739b63762aab40e59ba5f3dcce633989a6ad0`.
- COS writer worktree `tmp/issue-451-w-native`, branch `feat/issue-451-w1-native-color`. Commits: `0d801963bdd0668359401b6816bfa925b98bcc74` (narrow Native Color), `d7b444a9de05b8954c63533d3fd8364d61573a3a` (NFKC-safe 80-codepoint cap and tests), `f99deeffb04568dcfce7e888e4e6ffb8245c61c6` (scoped Other focus indication).
- Prime integrated those three commits by cherry-picking locally as `cad4fa65`, `5199d538`, `98303ad6` on `feat/issue-451-integration-20261112`. No merge to main, no push, no PR or deployment.
- Native selector final focused tests: 9/9, exit 0. Native TypeScript typecheck and scoped ESLint: exit 0. Root architecture check: exit 0, with pre-existing grandfathered warnings only.
- COS independent read-only contract audit: no API/DB or returning-correction blocker. Independent read-only commit review identified NFKC pre-cap defect; worker fixed it in `d7b444a9`. Final reviewer independently confirmed the correction and tests. Native Android UI still requires real device/emulator screenshots at the requested 12 scenarios, TalkBack/keyboard/focus and large-text checks; no connected device or configured AVD was available. Physical visual parity is NOT verified and should not be represented as signoff.
- Portable employee-client on pinned baseline: lint exit 0, typecheck exit 0, full suite 928/928 exit 0; root build-contract suite 8/8 exit 0. This verifies existing contracts, not production runtime.

## Baseline and isolation

- Verified `git fetch origin main`, pinned `origin/main` at `fba739b63762aab40e59ba5f3dcce633989a6ad0`.
- Dedicated integration worktree: `D:\kndoom\valet-platform\tmp\issue-451-integration`, branch `feat/issue-451-integration-20261112`.
- Preserve unrelated main working-tree files and the complete prototype archive.
- No push, PR, merge to main, deployment, or GitHub issue mutation authorized.
