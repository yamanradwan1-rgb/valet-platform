# VAYLET #309 — independent production-build React / immutable approved HTML visual evidence

**Verdict: strict UI-FROZEN STOP and approved-photo painted-pixel parity NOT 100%.**

## Pinned references and method

- Original React Dashboard: source `origin/main` SHA `459e9c42dfff5b2aeb11ee9165a7d1a4338a7783`, Next 16.2.11 **production build** in the existing W1 original worktree (port 3198 in isolated testing).
- Candidate: Issue #309 isolated implementation branch `feat/issue-309-management-photo-view` from that source, Next 16.2.11 **production build** (port 3197 in isolated testing). This candidate additionally contains scoped HTTP error handling and no privileged DB changes.
- Approved HTML: **unchanged**, SHA256 `0b1900896b46af9d1f11dd88f01643978629001cb1c956de5f1e7f5987cdbd74`, original design worktree `docs/validation/issue-309-prototype/issue-309-photo-viewer.html`.
- Actual browser: Chromium Playwright with deterministic signed-in synthetic vehicle fixtures. Same machine, viewport, locale, theme, font readiness, screenshots with animations disabled. No background/API/private photo provider calls or production credentials. Both Next server processes are test-local and should be stopped after completion.

## A. Existing genuine React Dashboard — source vs candidate

Run `react-frozen-parity.spec.ts` separately against ORIGINAL production Next and CANDIDATE production Next with the same W1 original fixture and output to separate directories. Both source and candidate test invocations: **2/2 PASS**, collectively the 32 required configurations (Vehicles / Live Operations, EN/AR, Light/Dark, widths 320/390/768/1440). All original Fact labels and values, order, rectangles, drawer header, Help/Close and initial focus preserved.

Zero-tolerance unmasked original-region comparator `compare-frozen-pixels.py`:

| Real comparison | Exact regions | Different original regions | Changed RGBA pixels | Status |
| --- | ---: | ---: | ---: | --- |
| Source production build → candidate production build | **93/96** | 3 closed Vehicles navigation/sidebar edge crops | **125** | **STOP** |
| Same source production build → fresh repeat of same source | **94/96** | 2 closed Vehicles navigation/sidebar edge crops | **99** | **STOP** |

**32/32 original Facts and 32/32 original headers have ZERO changed pixels between source and candidate.** The three candidate differences are `vehicles-en-dark-320` (39 pixels), `vehicles-en-dark-390` (39), and `vehicles-ar-dark-320` (47); all occur inside the original closed navigation edge, not in the new photo addition. The original-v-original differences `vehicles-ar-dark-320` (47) and `vehicles-ar-light-320` (52) independently demonstrate browser raster variance, but **do not waive the owner's literal zero-pixel Rule A**. No masking, 1-RGB-unit tolerance, navigation/font/global CSS workaround, or intentional unapproved source change was used.

Machine-readable evidence: `results/production-build-source-vs-candidate.json`, `results/production-build-original-vs-original.json`, and pairs under `results/production-build-{original,original-repeat,candidate}/`.

## B. Immutable HTML vs real production React photo UI

New `approved-photo-parity.spec.ts` uses the **actual on-disk approved HTML byte file**, and fails if its SHA256 differs. It opens the **actual Next/React** Management Dashboard in the other page and its real `SessionDrawer`. The **same deterministic JPEG** (`synthetic-photo.jpg`) and truthful React photo number/verified-date text are injected into the HTML **browser memory only**, preserving the immutable HTML file and approved CSS. This isolates visual design and geometry from the mock's synthetic "Front/Left/Rear" labels and illustrated SVG data; it does not change live code or claim metadata the backend has not stored.

Direct two-sided Playwright coverage: **20/20 tests PASS, 320/320 mode combinations**, across 2 callers × 10 approved states (`three`, `one`, `ten`, `empty`, `legacy`, `unavailable`, `loading`, `network/error`, `denied`, `viewer`) × 2 languages × 2 themes × 4 viewport widths. The legacy-only demo state deliberately maps to a truthful empty eligible manifest in production. The production photo UI is tested behind synthetic intercepted authenticated endpoint fixtures; this is **not** a real positive PostgreSQL/S3 authorization result.

Summary generated from exact computed-style and bounding-box captures `results/approved-photo-parity/SUMMARY.json`:

- **0/320 cases with sampled computed CSS-property mismatches** (color, background, border, font, line-height, spacing, aspect ratio, grid, object-fit, shadow, and viewer Close focus styling).
- **0 nonzero photo-internal geometry fields** when coordinates are measured relative to the photo section. Viewer modal **viewport-absolute x/y/width/height** agrees after test fixture texts/images are normalized.
- The standalone HTML's original FactList is not the authoritative frozen React FactList; 16 observed `section.y` differences reflect accepted standalone mock original-Facts height. We did **not** move or restyle any production original Fact to make the mock's external section placement match.
- Representative unmasked photo crops at EN/Light/390 were measured for all 20 route/state pairs; **0/20 painted screenshots are pixel-exact** despite matching inner geometry and fixture assets. Observed examples: Vehicles empty 142/66,495 changed pixels, three photos 1,230/187,891, enlarged viewer 141/148,960. These remaining raster/content glyph differences cannot be called 100% painted parity. The title, modal geometry and source CSS design map directly; the owner must not be told a zero-tolerance painted-pixel PASS.
- HTML source itself was **never edited**, and the React component's CSS `contain:paint;overflow-clip-margin:6px` was previously proven necessary to keep original FactList raster zero and allow 32/32 visible focused photo tile outlines at 320/390. The redundant viewer Close-specific focus override was removed from *new-only scoped React CSS* so the existing global Dashboard focus style matches the approved HTML's `.quiet` control. No original Dashboard focus/style changed.

Representative screenshots, all measurements and unmasked pixel data are in `results/approved-photo-parity/`. The original 320/320 React state tests, real Chrome extension native 200% (16/16), and photo focus 32/32 from the initial W6 run remain separate independent evidence under `qa/results/`.

## Scope and approval decisions

No existing Dashboard navigation, drawer header, FactList, shell CSS, Native capture/upload, verification pipeline or private provider was altered for this QA. These results do **not** authorize any photo-byte access. The real restricted PG17 + private versioned MinIO #309 read tests remain **7/7 FAIL** due to `SQLSTATE23514` and `SQLSTATE42501`, verified independently; current production VIEW remains deliberately default-deny. Owner/security approval for separate least-privilege DB changes and photo-read authority, final `res.end`-before-COMMIT policy, provider/IAM and release remains outstanding. **Do not merge, publish, deploy or close Issue #309.**
