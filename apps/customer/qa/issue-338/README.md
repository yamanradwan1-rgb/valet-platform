# Issue 338 color-only verification

These tools render existing Customer components and use the Dashboard's existing
Playwright dependency. No application dependency or production configuration is
added. Use an absolute `QA338_EVIDENCE` directory outside the repository.

1. Export the baseline from a worktree at
   `02fbee5512895fff2870d88f93d40d8edcefe44f`. Copy this task's `render.test.tsx`
   into the same `apps/customer/qa/issue-338` path in that disposable worktree;
   install the existing lockfile and run the command below with `before`.
2. Export the feature worktree with `after`:

   ```sh
   QA338_RENDER="$QA338_EVIDENCE/after" pnpm --filter @valet/customer exec vitest run qa/issue-338/render.test.tsx
   ```

3. Run `node apps/customer/qa/issue-338/browser-compare.mjs` from the feature
   repository root. It compares all 27 views × 3 colors × 2 languages × 2 themes
   × 4 widths. It compares every element's tag, leaf text, bounding box and all
   computed non-color styles. Existing animations are paused at a settled time.
   Screenshot pairs and masks cover representative parked, confirmation and
   control views. CSS import removal omits only the external font-import line;
   theme defaults and the application font-family rules are retained.
4. Run `python3 apps/customer/qa/issue-338/pixel-compare.py`. Pillow is an
   environment-only analysis tool. Pixel changes must stay inside the bounding
   boxes of actual changed color consumers (one pixel for rasterization).
5. Build and start the Customer app against a loopback API origin, then run
   `node apps/customer/qa/issue-338/live-browser.mjs`. The script intercepts only
   synthetic Guest API responses; it never connects to production or proves DB
   authorization. It verifies the actual production bundle's primary color,
   contrast, interaction geometry, disabled state and invalid-session reset.

Both browser scripts accept `QA338_ZOOM=200`. Run that mode on an isolated Xvfb
`DISPLAY` with `xdotool` available (`QA338_XDOTOOL` can select its executable).
It sends real browser zoom accelerators to its own QA window and asserts native
`devicePixelRatio === 2`; this is not device-scale or CSS zoom emulation.
The static script uses compositor screenshots at native zoom to avoid
Playwright's full-page clipping at browser zoom. Set `QA338_WIDTHS` and
`QA338_FILES` to select a representative comparison subset; the full run uses
all widths and views. The live script always runs all 48 color cases.

Chromium's default executable here is `/usr/bin/chromium`. External font service
availability and physical-device rendering are outside this deterministic
fixture. Product font declarations, assets, geometry and workflows are unchanged.

Baseline HTML exports, browser profiles and tool downloads stay outside Git.
The committed validation directory contains reviewed screenshot pairs, compact
results, command logs, the semantic inventory and the implementation report.
