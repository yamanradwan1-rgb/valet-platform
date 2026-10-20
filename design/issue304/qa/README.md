# Issue #304 independent visual and interaction QA

Run only once Prime has assembled all four `option-[1-4].html` files and assigned
the serialized Edge browser slot. This harness launches a **single** local Edge
browser with Playwright and uses `file://` so previews are independently openable.
All screenshots are captured from the real browser and written under
`../evidence/screenshots/`.

```powershell
node design/issue304/qa/run-qa.mjs
```

If needed, set `ISSUE304_PLAYWRIGHT` to an installed Playwright package path and
`ISSUE304_EDGE` to `msedge.exe`. Both have known local defaults in
`browser-setup.mjs`. Exit `2` means prototypes are not assembled; exit `1`
means one or more observed test failures. The machine-readable report is
`qa/results.json`. Testing checks `4 × 4 × 2 × 2 = 64` visual combinations,
with shell DOM, CSS and geometry compared against option 1 for each state;
there are also 8 focused mobile interaction runs, 8 zoom/proxy screenshots
and render-level content checks for A→B→A switches across both resource types.

Controls are exercised through real input. `NOT_RUN` is intentional where
there is not yet a stable row selector; such checks never count as PASS.
The 200% tests include direct CSS zoom and 720px CSS-layout proxy for 1440px at
200% native browser zoom; they are labeled as proxies and must **not** be
presented as native Edge zoom evidence. CSS zoom's injected overflow is saved
as diagnostic data only, while actual native Edge 200% remains `NOT_RUN`.
QR, resource-detail, dialog trapping,
empty/loading/error, and observed shell image-diff remain focused investigations
to document in `../evidence/interaction-qa.md` before signoff.
