# Issue #309 — W6 independent actual React UI-FROZEN acceptance

**Final status: STOP under literal zero-pixel acceptance.** Initially the new
photos changed the original FactList paint in all 32 React configurations.
Scoped photo-only CSS `contain:paint` in candidate commit `8dc1c421` restored
all **32 FactLists and all 32 original headers** to exact pixels. Three closed
Dashboard screenshots retain 137 sidebar-edge antialias pixels of difference,
so this report does not waive literal zero tolerance.

## Source and candidate

- Unmodified real source (W1 browser reference):
  `459e9c42dfff5b2aeb11ee9165a7d1a4338a7783`. The independent W1 docs
  checkout has docs-only commits; its production React at this SHA is unchanged.
- Candidate under final frozen test: `8dc1c421`, including production React
  source `55ecd9ce285226df9e9f55c4f28e00d1281a3e99`, API
  `e6df7b73675d7660371d9445970609210bcfea55`, and scoped CSS paint fix.
- Approved HTML is `a6227f681f4948305c331b1372062fe34533b9aa`
  (SHA256 prefix `0b190089`) and only the *new* photo section/modal may match
  that HTML; the pre-existing real Next Dashboard was captured from source.

## Evidence from Chromium

Real browser test `react-frozen-parity.spec.ts` completed **2/2 PASS** across
32 original source configurations (Vehicles and Live Operations, EN/AR,
Light/Dark, 320/390/768/1440 CSS pixels). Original 12/14 Fact rows had exact
same labels, values, order, first focus, bounding boxes and body padding.
Escape closes the drawer and focus returns to the original row action.
Browser page exceptions: zero. All candidate screenshots were captured from
the real running Next/React app using scoped synthetic authorized staff API
responses; the standalone HTML was **not** substituted for the real app.

Strict pixel diffs (Pillow RGBA, 0 tolerance, no masked original regions):

| Comparison | Protected regions equal | Regions different | Changed pixels |
| --- | ---: | ---: | ---: |
| Archived original vs current fresh original | 94/96 | 2 | 85 |
| Archived original vs integrated candidate | 64/96 | 32 | 215,984 |
| Fresh original vs candidate **before** paint fix | 62/96 | 34 | 216,069 |
| **Fresh original vs candidate after paint fix and mouse normalization** | **93/96** | **3** | **137** |

The 96 regions consist of **32 complete closed Dashboard shells**, **32
original drawer headers**, and **32 exact original FactList rectangles**. After
the W2 paint fix, **32/32 FactLists and 32/32 headers are pixel-perfect**.
Three *closed* Vehicles screenshots have small antialias differences:
`en-light-390` 38 pixels, `ar-dark-320` 47, `ar-light-320` 52 (137 total).
Pixels are around the sidebar edge (x21–24 and x122–124), mostly one RGB
unit apart. Even the original compared to earlier captures changes 85 sidebar
edge pixels, supporting nondeterministic browser rasterization, but strict
owner zero tolerance still means **STOP**. Both source and candidate were
rendered by genuine Next/React at ports3198 and3197, with matching fixture,
font readiness, screenshot timing and mouse position. No pixels were masked.

Primary evidence JSON files in `results/`:

- `fresh-vs-archived-original.json`: independently recaptured source A/A
  (94/96 exact, 85 pixels).
- `fresh-original-vs-candidate.json`: primary A/B exact painted diff
  (34 changed / 96, 216,069 pixels).
- `frozen-pixel-report.json`: archived source/candidate comparison
  (32 changed /96, 215,984 pixels after font timing correction).
- `final-deterministic-frozen-pixels.json`: **post-fix actual React** source
  vs candidate strict result, 93/96, 137 one-RGB nav-edge pixels difference.
- `fresh-original/{vehicles,live-operations}-candidate.json` plus corresponding
  `*.png`: fresh original source captures.
- `{vehicles,live-operations}-candidate.json` plus corresponding `*.png`:
  production React candidate captures.

The observed FactList raster difference needs a scoped diagnosis of added
photo layout/overflow and text paint compositing. Temporarily hiding only
`SessionPhotos` via DevTools can isolate the cause without editing frozen
source DOM/CSS. W2 owns product fixes; W6 does not patch product files.

**One-configuration root-cause experiment (Vehicles EN/Dark 390):** The source
and candidate have identical computed CSS for the original FactList, row label,
row value, backdrop, font, `filter=none`, `opacity=1`, and bounds. However,
the new photo section changes scrollable body content from source
`scrollHeight=827/clientHeight=827` to candidate `983/827`; the FactList image
therefore differs at 5,953 pixels. Transient, **uncommitted** DevTools changes
on the candidate produced the following original FactList pixel comparisons:

| Temporary CSS on new `.photoSection` only | Different original FactList pixels |
| --- | ---: |
| None (candidate normal) | 5,953 |
| `display: none` | 0 |
| `visibility: hidden` | 0 |
| **`contain: paint` (photos stay visible; scrolling stays 983/827)** | **0** |

The paint-contained candidate CSS retains the original markup/body scroll
dimensions while restoring exact Facts pixels both in this experiment and in
the independent **32-case** production React rerun. Evidence pairs and
computed styles are in `results/paint-diagnosis/`. W6 modified no product code.

**P1 focus indicator regression under containment:** The first tile starts
at the section's left x25. Its focus-visible outline is 3px, offset2, but
the new `contain:paint` clips it outside the section: 0 changed focus pixels
in left-edge exterior band x19–24/y560–795. A transient photo-only
`overflow-clip-margin:6px` restores **924 visible pixels** outside that edge,
while retaining containment. Alternate `isolation:isolate` without `contain`
also produced zero changed FactList pixels in this one case, but needs 32-case
validation before replacing the scoped CSS. This is a release blocker until W2
adds a focus-safe scoped remedy and W6 verifies it; evidence is in
`results/paint-diagnosis/candidate-focus-geometry.json` and paired PNGs.

## Photo gallery status and release constraints

The independent `react-photo-matrix.spec.ts` **passed 20/20 executed
Playwright tests**, with 16 locale/theme/viewport configurations per test,
giving **320/320 actual React screenshot/behavior combinations** across both
routes and all 10 photo states (verified 1/3/10, empty, legacy-only,
unavailable, loading, network error/retry, denied, viewer). Keyboard Enter,
Escape, RTL/LTR arrows, initial Close focus, trigger focus restoration,
ten-image last tile, JPEG decode and protected `blob:` presentation passed;
zero page JS exceptions. The scoped API paths and JPEG bytes were intercepted
using synthetic test-only fixtures. Real production auth/storage policy was
not exercised and remains fail closed until the owner accepts a role policy.
Photo-region exact painted HTML parity is **not fully verified with identical
image fixtures**, so it remains a separate gate.

The original Chrome-native 200% source clipping at 320 physical pixels is
already proven and inherited: Close EN 10.42/AR 17.78 CSS pixels clipped. This
W6 comparison currently uses 100% browser zoom and is **not** candidate native
200% proof; no screen-reader/TalkBack or WCAG-compliance certification is made.

**Decision:** **NO-GO/STOP** for zero-pixel owner approval despite 32/32
functional frozen checks and 320/320 synthetic photo UI combinations passing.
Outstanding gates: three closed-shell sidebar AA changes (137 pixels), P1
clipped first-thumbnail focus outline after containment, candidate true
Chrome-native200, identical-input approved HTML new-region pixel comparison,
and explicit management photo-read access policy acceptance.
