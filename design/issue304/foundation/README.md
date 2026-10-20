# Issue #304 shared VAYLET Dashboard shell

This is the single shell used by all four standalone, design-only HTML previews.
Source baseline: `main` at `a3779327690debc1ec561760641502967603c5f2`.

## Integration contract

Prime's aggregator reads `design/issue304/concepts/option-N.inner`,
`option-N.css`, and `option-N.js` for each option (N = 1..4), injects the
synthetic fixture, and calls `assembleShell` from `assemble.mjs`:

```powershell
node design/issue304/build.mjs
```

Outputs are `design/issue304/option-1.html` through `option-4.html`. Each
contains the same pinned shell CSS, actual VAYLET logo PNGs and SVG icons as
inline assets. No server, font CDN, external stylesheets, live API, or build
step is needed to open the finished pages in a desktop browser.

For a single interior preview, an alternate CLI interface is available:

```powershell
node design/issue304/foundation/assemble.mjs --content design/issue304/concepts/option-1.inner --css design/issue304/concepts/option-1.css --js design/issue304/concepts/option-1.js --output design/issue304/option-1.html --theme dark
```

In JavaScript, import `assembleShell({interiorHtml,interiorCss,interiorJs,
title,locale,theme})`. The assembly API never modifies production files.
Keep interior markup inside `.content-inner`; do not replace the outer shell.
Write CSS selectors scoped to the option's interior root to avoid overriding
the shared sidebar/topbar tokens. Avoid `body`, `.sidebar`, `.topbar`,
`.nav-link`, `.shell`, `:root`, and broad element selectors in concept CSS.

`window.VAYLET_304_SHELL_STATE` is an immutable state snapshot with
`{locale, theme, locationIndex}`. Listen for the initial and subsequent
`window` event `vaylet:shell-state` with that same `detail` structure:

```js
window.addEventListener('vaylet:shell-state', ({ detail }) => {
  // Re-render option interior using detail and window.VAYLET_304_DATA.
});
```

The assembler reads the **single** `fixtures/canonical-data.json` during
generation. The location dropdown displays its exact `name.en` or `name.ar`.
Location A is index `0` (`loc-a`) and B is `1` (`loc-b`). Concept scripts must
read resource rows from `window.VAYLET_304_DATA.resources[location.id]`;
never independently invent location labels or fixture identifiers.

## Pinned visual sources

- `globals.snapshot.css` — `apps/dashboard/src/app/globals.css`, with its three
  original import directives removed *only during assembly* after the imported
  CSS is inserted in their source order.
- `shell.snapshot.css` — `apps/dashboard/src/styles/shell.css`, untouched.
- `controls.snapshot.css` — `apps/dashboard/src/styles/shell-controls.css`, untouched.
- `foundation.snapshot.css` — `apps/dashboard/src/styles/foundation.css`, untouched.
- `assets/vaylet-*.png` — copies of `apps/dashboard/public/vaylet-*.png`.
- `icons.snapshot.json` — Lucide React's SVG markup rendered locally from the
  repository's installed `lucide-react` at 19px/1.9 stroke, with header chevrons
  at 16px; Reports' production-specific five-path `ReportsFileTextIcon` is
  rebuilt verbatim in `assemble.mjs`. Icon license: Lucide ISC; icons retain
  attribution here.
- `shell-additions.css` — static-only location listbox, hidden-state and dialog
  contrast rules outside the copied source files.

No shell file belongs to any option worker. Changes to this directory and to
`evidence/shell-parity.md` belong solely to W1. Production Dashboard shell,
Keys & Spots and API remain unchanged pending Issue #304 owner approval.
