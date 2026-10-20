# Issue #304 — Dashboard shell source parity and proof boundaries

**Baseline:** `main` commit `a3779327690debc1ec561760641502967603c5f2`.
**Scope:** design mockups only. The immutable global Dashboard shell is shared
by four HTML options; only their page interiors differ. All displayed
organization, Location and resource data are explicitly synthetic.

## Source audit

| Dashboard source | Baseline contract | Pinned shell evidence |
| --- | --- | --- |
| `apps/dashboard/src/app/globals.css` | Light/dark CSS variables; `Inter, "Segoe UI", Tahoma, Arial, sans-serif`; focus shadow | `foundation/globals.snapshot.css`, included verbatim apart from resolving its three `@import`s inline |
| `apps/dashboard/src/styles/foundation.css` | Generic buttons/panel/quiet button states | `foundation/foundation.snapshot.css` exact copied source |
| `apps/dashboard/src/styles/shell.css` | 260px desktop sidebar, 80px collapsed, fixed 4rem header, `content` scrolling, 820px mobile breakpoint | `foundation/shell.snapshot.css` exact copied source |
| `apps/dashboard/src/styles/shell-controls.css` | Location context, theme segmented buttons and <=820px text hiding | `foundation/controls.snapshot.css` exact copied source |
| `components/shell/{dashboard-shell,sidebar,topbar,navigation-list,mobile-navigation-dialog}.tsx` | Sidebar brand, Organization selector, active `Keys & Spots` link, topbar Location/language/theme/logout, mobile modal navigation | `foundation/shell.template` uses same class hierarchy and presentation order |
| `components/brand/vaylet-logo.tsx` and `public/vaylet-*.png` | 32x32 emblem, 108x16 white wordmark; mobile dialog uses dark wordmark in light theme | PNG copies embedded as data URIs; theme picks correct mobile logo; narrow collapsed sidebar hides wordmark |
| `features/operations/operations-navigation.ts`, `lib/navigation/product-navigation-order.ts` and other navigation registrations | Exact EN/AR labels and stable navigation ordering; `/keys` active | Static synthetic Company Admin exact-Location navigation registry in assembler; 19px/1.9 Lucide SVG snapshots |
| `components/foundation/header-preferences.tsx` | AR/EN locale button; light/dark sun/moon segmented control; sign-out quiet button | Native-sized shell controls respond locally without a live session |
| `components/scope/location-switch-menu.tsx` and `.module.css` | Trigger opens listbox; ArrowUp/Down/Home/End/Escape and focus return | Static fixture A/B location selector with corresponding keyboard behavior and no protected API |
| `features/operations/keys/keys-page.tsx` | Existing `Operational Keys` + `Physical Resources` duplicated workspace tabs | Replaced only inside proposed option concepts; **not** in shared shell or product source |
| `features/administration/physical-resources/physical-resources-panel.tsx` | `Key Slots` and `Parking Spots`, add/zone/label dialogs | Interior mockup worker responsibility; shared shell stops at `.content-inner` |

## Exact baseline measurements and tokens

| Property | Source value |
| --- | --- |
| Light: background/surface/text | `#f4f7fb` / `#ffffff` / `#101828` |
| Dark: background/surface/text | `#081020` / `#0d152f` / `#f8fafc` |
| Accent | `#1e60f0` both themes |
| Sidebar / soft / border | `#0b132b` / `#131e3d` / `#172346` |
| Sidebar width desktop / collapsed | `260px` / `80px` |
| Topbar & brand height | `4rem` each |
| Main page padding desktop / <=820 | `2rem` / `1.25rem` |
| Mobile mode | `max-width: 820px`; desktop sidebar hidden, menu trigger shown |
| Content max width | `1600px` |
| Nav size & icons | `0.75rem` label, 19px icon, stroke `1.9` |
| Title/theme focus | Native source focus ring `0 0 0 3px color-mix(... --focus ...)` |

## Intentional static preview boundaries

The live shell resolves navigation dynamically from persisted role, authorized
scope, commercial capabilities and Location status. The static options show an
illustrative eligible Company Admin at an active exact Location. Availability of
other routes in a real account is not asserted. Navigation links, sign out and
Organization switch are inert design-preview controls; they never authenticate,
read API data or change production state. Location A/B switching affects only
the canonical synthetic fixture. The menu uses the same source dimensions and
interaction semantics but static CSS class names instead of Next.js CSS module
hashes. The mobile dialog has one contrast rule for readable nav text that
does not modify any pinned production stylesheet.

`shell.template` uses the Dashboard CSS font stack; no web font is fetched. If
Inter is not installed locally, the browser will use its platform fallback as
it would without an explicit app font resource. Mobile focus trapping is
implemented in standalone JS, matching the intent of the production `FocusDialog`.
All assembly is offline and self-contained.

**Visual proof boundary:** W9's first actual Edge run captured 64/64
viewport/locale/theme screenshots of the four mockups at 320/390/768/1440,
EN/AR, light/dark. This supports equality among the four mockup shells,
not pixel identity to a live production Dashboard. No authenticated live
Dashboard pixel-diff was captured; W9's later final QA report confirmed the
same inherited P1 and aggregate results, without establishing live pixel parity.

## W9 actual Edge 64-state shell parity and inherited narrow-width P1

**Observed browser evidence:** W9 ran serialized Windows Edge/Playwright on
2026-10-20T18:26:36.071Z, with **64/64 screenshots**: four options x four
widths (320/390/768/1440) x two locales (EN/LTR and AR/RTL) x two themes
(light/dark). The observed run reports **1004 PASS / 32 FAIL / 4 NOT_RUN**;
native browser 200% zoom accounts for the four NOT_RUN checks. W9 confirmed
**64/64 shell HTML DOM parity, 64/64 embedded shell CSS parity, 64/64 computed
shell geometry parity, and 64/64 computed shell style parity across the four
options**. These are comparisons among *standalone design artifacts*, not an
authenticated production browser/pixel-diff test. Evidence:
[interaction-qa.md](interaction-qa.md), [qa-matrix.md](qa-matrix.md),
[actual raw checks](../qa/results.json), and [screenshots/](screenshots/).

**Witnessed P1 at 320px and 390px:** 32 of the 64
`topbar-controls-within-header` checks FAIL (all four options x two narrow
widths x EN/AR x light/dark); the 32 wide 768/1440 checks PASS. The mobile
Location and Sign out controls wrap/spill below the fixed **4rem = 64px**
topbar and overlap the interior/page heading. In a failed 320px state, raw
Edge bounding boxes show `Change scope` bottom **76px** and `Sign out`
bottom **100px** against the 64px header. Witnessed images include
[Option 2 320 AR Dark](screenshots/option-2-320-ar-dark.png),
[Option 1 320 AR Dark](screenshots/option-1-320-ar-dark.png),
[Option 2 390 EN Dark](screenshots/option-2-390-en-dark.png), and
[Option 4 390 EN Dark](screenshots/option-4-390-en-dark.png).
This is a vertical header overlap, not a horizontal page overflow.

**Root cause traced to the frozen Dashboard implementation:**

- `apps/dashboard/src/styles/shell.css:186-198`: `.topbar` has
  `height:4rem; min-height:4rem; flex:0 0 4rem; display:flex`,
  `align-items:center; justify-content:space-between; gap:1rem`.
- `apps/dashboard/src/styles/shell.css:205-211`: `.scope-line` and
  `.topbar-actions` each have `display:flex; gap:0.5rem; flex-wrap:wrap`.
  `shell.css:255-261` changes only the mobile topbar padding to `1rem`,
  without changing the 64px height or wrap behavior.
- `apps/dashboard/src/components/shell/topbar.tsx:32-79`: native groups are
  Menu + Location and locale + theme + account/sign-out, in the same layout
  sequence as `foundation/shell.template:30-51`; native
  `header-preferences.tsx:9-49` confirms language/theme controls. The
  preview `.shell-location-anchor` follows the native
  `location-switch-menu.module.css:1-5` anchor (`position:relative`,
  `display:inline-flex`, `min-width:0`). It is not an introduced header
  width/height override.

**Literal SHA-256 source/snapshot proof:** `Get-FileHash -Algorithm SHA256`
was run against each production stylesheet and pinned foundation snapshot;
both files in every row returned the **identical hash**:

| Original Dashboard stylesheet = frozen mockup snapshot | Shared SHA-256 |
| --- | --- |
| `apps/dashboard/src/styles/shell.css` = `foundation/shell.snapshot.css` | `0DBFB51F550150F282A8D21887ED63FA3B6432641C55B7CE98BDEE7E236F58DC` |
| `apps/dashboard/src/styles/shell-controls.css` = `foundation/controls.snapshot.css` | `C5978953780A674FD4B6BD7C576E6AD711A418FBC6C96FAAFF494D36CA474984` |
| `apps/dashboard/src/styles/foundation.css` = `foundation/foundation.snapshot.css` | `0905036073DBB298BA93739AA4313076B6DEC6A2CCF7E300CDA44F76A37E16EC` |

**Acceptance: inherited frozen-shell P1 — blocked without separate Owner shell
authorization.** The fixed-height/flex-wrap conflict is inherited from the
unchanged Dashboard shell, shared by all four preview options. Fixing it
through a mockup-only CSS media rule (hiding/repositioning Sign out, raising
the header height, or disabling wrapping) would silently deviate from the
strictly frozen shell and fail source parity. **No mockup CSS fix was made; no
foundation CSS, app source, production shell, or option interior was changed
by W1.** Full mobile acceptance requires Owner's explicit decision to accept
the inherited limitation or separately authorize a production-shell change.
The 64 screenshot cases establish preview parity and reproduce the P1, but
do not authorize a shell redesign.

## Assembly and shared state

`design/issue304/foundation/assemble.mjs` exports
`assembleShell({ interiorHtml, interiorCss, interiorJs, title, locale, theme })`.
Prime's `design/issue304/build.mjs` combines this function with the one
`fixtures/canonical-data.json`. Each generated `option-N.html` is a standalone
page with embedded PNG logos, SVG navigation icons, CSS and JS. The runtime
publishes `window.VAYLET_304_SHELL_STATE` and dispatches
`window` `vaylet:shell-state` after locale/theme/location changes, and once in
a microtask after concept initialization, as:

```js
{ locale: 'en' | 'ar', theme: 'light' | 'dark', locationIndex: 0 | 1 }
```

Exact source snapshots and the single shared template keep the four shell
instances uniform. Changes to the four page interiors cannot add new global
navigation or change the source shell tokens without visibly modifying this
shared foundation.
