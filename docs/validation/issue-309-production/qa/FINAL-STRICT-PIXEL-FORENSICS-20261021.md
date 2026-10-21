# VAYLET #309 — final strict visual forensic continuation (21 Oct 2026)

**Verdict: visual release acceptance remains STRICT STOP.** This is a reproducible
classification of residual pixels, not a claim that either visual rule now
passes at 100%. Original Dashboard UI and immutable approved HTML were untouched.

## Source and browser-controlled comparison

- Original app: actual Next production build at main
  `459e9c42dfff5b2aeb11ee9165a7d1a4338a7783`; candidate production
  React at original checked-out Issue #309 branch, with *no photo CSS/TSX
  source changes in this continuation*.
- Approved design: immutable byte file
  `issue-309-photo-viewer.html`, SHA256
  `0b1900896b46af9d1f11dd88f01643978629001cb1c956de5f1e7f5987cdbd74`.
- Existing original matrix: **32/32 original FactLists, 32/32 headers identical
  pixels and semantics**; original React vs candidate **93/96** literal exact
  protected regions. Original versus fresh original **94/96** exact.
- Existing HTML-vs-React matrix: **320/320 scenario mode observations** across
  2 callers, 10 states, 2 languages, 2 themes, 320/390/768/1440 px.
  Sampled styles and internal component geometry match; **0/20 screenshot
  pairs pixel-exact** under the original intentionally different mock fixtures.
- This continuation adds **4/4 real Chromium Playwright targeted diagnostics**
  at English/light, 390 × 900, **DPR 1**, same actual synthetic JPEG,
  same real-time string captions, same viewport/locale/theme, settled fonts
  (`Inter`), pointer outside components and identical screenshot options.
  HTML changes are *in the Playwright browser DOM only* — the approved file on
  disk and production React source are both immutable for this experiment.
  Targeted captures include `empty`, `three`, `network`, enlarged `viewer`.

| Targeted state | HTML → React changed pixels | Total photo/viewer pixels | HTML → same HTML second capture | React → same React second capture |
| --- | ---: | ---: | ---: | ---: |
| No verified photographs | 142 | 66,495 | **0** | **0** |
| Three verified photographs | 1,292 | 187,891 | **0** | **0** |
| Error/retry (**demo-only label normalized in test DOM**) | 48 | 82,863 | **0** | **0** |
| Expanded photo viewer | 141 | 148,960 | **0** | **0** |

Source: `strict-pixel-diagnostics.spec.ts`, paired screenshots and measured
`items.*.absolute` and `font` fields under
`results/strict-pixel-diagnostics/`, and calculated `FORENSICS.json`
from `analyze-strict-pixel-diagnostics.py`. The React/HTML pair in each
state used identical **absolute x/y** for the photo-section rectangle, glyph,
metadata text, viewer, viewer title and close control; dimensions, reported
font families/weight and sampled styles agreed. All same-page repeated
screenshots were pixel-identical. Differences are *cross-implementation
paint effects*, not frame-to-frame screenshot jitter.

## Root-cause and authorization findings

1. **Intentional demo-only text is not a production defect.** The immutable
   HTML uses `Retry demo`, which switches local demo controls into
   `loading`; the production React button says `Retry` and issues a real
   retry. Without test-only text normalization the old pair had **1,270
   different pixels**; with normalization it has **48**, all channel deltas
   at most 2. Never ship a misleading "demo" label or fake retry to achieve
   screenshot parity.
2. **State glyph rendering:** the same `▧` codepoint, 30×30 rectangle,
   font style and absolute position still paints one baseline pixel
   differently (142 changed pixels overall in empty state; original reference
   showed ~120 glyph-region pixel mismatches). An isolated *browser-only*
   experiment replacing the React `span.stateGlyph` with an HTML-like
   `div.stateGlyph` produced **exactly the same 142 changed pixels**.
   Thus no evidence supports a production DOM/CSS patch.
3. **Caption raster phase:** first line of the `Verified upload` timestamp
   inside image cards accounts for most three-photo pixel differences
   (original image pair: 1,217/1,230 differences located in y=275–284).
   Picture, card bounds and most other typography matched. In a separate
   browser-only experiment, merging React `small` text nodes into one
   `textContent` produced **no reduction** in the new 1,292-pixel difference,
   ruling out a simple JSX text-node rendering fix.
4. **Expanded viewer:** image, navigation/canvas and footer are pixel-identical
   in the saved representative pair. The remaining **141 pixels** are confined
   to header/top border/focus-edge rasterization (not enlarged image sizing
   or controls), despite identical absolute rectangles and sampled font/style.
   The existing photo-scoped containment and clip margin were already tested
   to protect frozen FactList pixels and visible keyboard focus. Removing
   them without an equivalent frozen parity proof is not authorized.
5. **No frozen region was altered for a cosmetic screenshot improvement.**
   In particular, approved standalone fixture FactList height differs from
   real React, but this is *not* permission to change source Dashboard Facts
   or move the photo section relative to them. No confident photo-specific
   production CSS defect emerged from pixel forensics.

## Original Next-to-Next protected pixels

Existing 32-mode source/baseline/candidate images were compared again **with
literal zero-tolerance RGBA** rather than running a new unrelated Next build.
The three candidate mismatches and two self-comparison mismatches all lie in
the responsive *closed Vehicles* shell's nav/icon edge area; **each changed
channel by at most 2**. No source/candidate differences were found in the
32 original Facts or 32 drawer headers.

| Closed route/mode | Original → candidate | Original → original repeat | Candidate → original repeat |
| --- | ---: | ---: | ---: |
| Vehicles EN dark 320 | 39 | 0 | 39 |
| Vehicles EN dark 390 | 39 | 0 | 39 |
| Vehicles AR dark 320 | 47 | 47 | **0** |
| Vehicles AR light 320 | **0** | 52 | 52 |

The reversals (candidate sometimes exactly equals the repeated original,
and sometimes differs while original equals original) are evidence of tiny
Chrome edge-raster variations on **unchanged closed navigation**, not an
identified feature regression. Nonetheless Rule A explicitly requires no
unapproved changed pixel; **93/96 is not 96/96, so STOP is retained**.
No baseline tolerance or mask was introduced.

## Validation boundaries / next decisions

- Four targeted real-Chrome tests **PASS 4/4**, full saved 320-case matrix
  unchanged, and the new forensics script emits deterministic exact-pixel JSON.
- No authorized production photo appearance change is justified by evidence;
  test-only diagnosis was preferred over speculative CSS changes that might
  undermine freeze or accessibility.
- Backend photo VIEW remains fail-closed; isolated PG17/MinIO Management reads
  remain **7/7 FAIL** due to `23514` anti-abuse scope CHECK and `42501`
  four-table final `FOR SHARE` against SELECT-only runtime; old Native
  upload **6/6 PASS** does not prove Management read delivery. No DB migration,
  auth change, IAM rollout or production permission has been applied.
- Owner must independently accept the literal visual evidence (or define
  new measurable acceptance criteria) **before** release; otherwise preserve
  strict STOP. Security/DB owners must separately accept the existing narrow
  migration and read-lock function proposal, new VIEW authority, provider/IAM,
  COMMIT/response linearization and final genuine delivery/revocation tests.
