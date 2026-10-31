# Issue #343 UI Freeze Follow-up

Date: 2026-10-31

Status: **UI FREEZE: PASS** — controlled evidence and independent final
verification are complete for this owner-scoped gate.

This file is a new local reconstruction of the UI Freeze investigation. A
previously reported untracked Codex Cloud file with this name was not present on
GitHub or in the authorized local worktrees/evidence directories. Its contents
were not recovered or inferred. The conclusions below come from fresh local
execution against the pushed revisions.

## Revisions and synchronization

- Baseline: `92638c499a1062db3f814687ca3761f235361298` (`origin/main`).
- Feature: `865b7277883a17fa2fb0f3bbbdb9f59b3098332c`
  (`origin/feat/issue-343-task-route-history`).
- Approved prototype reference:
  `1909a3cdb3e34d7bdf8d35897676948542468ac1`
  (`origin/design/issue-343-route-history-prototype`).
- The local fetch was verified against all GitHub heads and tags before this
  follow-up. Baseline and feature were checked out in separate clean worktrees.
- Each comparison worktree installed the same frozen `pnpm-lock.yaml`; no
  dependency or lockfile change was used for this verification.

## Webpack blocker and controlled renderer

The previously reported baseline Webpack blocker was reproduced on the pinned
baseline. Requesting `/tasks` under Next.js 16.4.3 Webpack failed at
`packages/contracts/src/index.ts:5` with:

`Module not found: Can't resolve './api-errors.js'`

The import trace reached the Tasks page through `operations-api.ts`. The
historical `ISSUE_300_LOCAL_PREVIEW=1` Webpack alias was also tried using its
documented local command, after building `@valet/contracts` and `@valet/ui`.
On the current Next.js revision it still resolved the TypeScript source and
failed with the same error. No production import, package export, shared
contract, or Next configuration was changed to manufacture compatibility.

The existing Turbopack configuration already supports the worktree layout and
built contracts package. The pinned baseline and feature both returned HTTP 200
for `/tasks` when launched with Next.js 16.4.3 Turbopack. The strict comparison
therefore uses Turbopack for both revisions.

Controlled inputs:

- Same Windows host and font installation.
- Node.js v24.18.0 and pnpm 10.34.5 for the local verification commands.
- Same Next.js 16.4.3 Turbopack renderer.
- Identical baseline/feature `pnpm-lock.yaml` SHA-256:
  `B7B0C4770083DFE8799138EA3E1AB18CD515CF295D880DDE28C8F4C30B076DBB`.
- Same Playwright Chromium 151.0.7922.34 binary and browser process.
- `localhost` origins for both revisions; no cross-origin dev-resource bypass.
- Same synthetic Dashboard API fixtures.
- Same viewport, `deviceScaleFactor: 1`, locale, theme and application state.
- `document.fonts.ready` before capture.
- Screenshot `fullPage: true`, animations disabled and caret hidden.
- Only Next's development portal is hidden by screenshot-local style.
- No screenshot resizing, RGB tolerance, smoothing or post-render substitution.

## 48-pair matrix

The matrix contains 48 captures per revision:

- 32 main captures: Tasks list and Task Details at 320, 390, 768 and 1440
  widths, English/Arabic and light/dark.
- 16 additional captures: Emergency Takeover, Tasks empty, loading and error
  states across the representative 1440 AR dark, 320 EN light, 390 AR dark and
  768 EN dark combinations used to cover the earlier residual cases.

Every capture is taken twice on the same revision. The repeated captures are
also compared exactly to detect capture nondeterminism. The run produced 192
PNG files: 48 primary and 48 repeat captures for each of the two revisions.

Only the exact visible bounding rectangle of the new
`task-route-history-section` is masked in Task Details and Emergency Takeover
captures. There is no padding around the mask. For Emergency Takeover captures,
the nested pre-existing Emergency dialog rectangle is subtracted from the Route
History rectangle before comparison, so no Emergency modal pixel can be hidden
by the feature mask. Tasks list, empty, loading and error captures have no mask.
The comparison records the CSS bounds, resulting pixel rectangles and excluded
Emergency dialog bounds in each feature manifest/case so the mask is
independently auditable.

Strict RGBA result:

| Check | Result |
| --- | --- |
| Completed pairs | 48 / 48 |
| Exact pairs outside approved insertion | 48 / 48 |
| Failing pairs | 0 |
| Differing unmasked pixels | 0 |
| Baseline repeat determinism | PASS |
| Feature repeat determinism | PASS |
| Frozen geometry comparison | PASS |
| Masks limited to details/emergency insertion | PASS |
| Emergency masks exclude the existing modal | PASS |

The six previously reported one-level raster residuals all became exact zero
under the same-render rerun:

| Historical case | Current differing pixels | Max channel delta |
| --- | ---: | ---: |
| 1440 Arabic dark — Emergency Takeover | 0 | 0 |
| 320 English light — Emergency Takeover | 0 | 0 |
| 390 Arabic dark — Emergency Takeover | 0 | 0 |
| 768 Arabic dark — Task Details | 0 | 0 |
| 768 English dark — Task Details | 0 | 0 |
| 768 English dark — Tasks list | 0 | 0 |

This resolves the old residuals as rendering/capture-environment variation from
the mixed Webpack/Turbopack comparison rather than an accepted RGB tolerance.

## Emergency Takeover geometry

A separate geometry-only audit opens the existing Task Details drawer for the
Emergency Takeover task across all 16 width/locale/theme combinations. It
compares the pre-existing Emergency Takeover button and toolbar rectangle,
Close button and original fact rows between baseline and feature.

Result: **16 / 16 exact**.

The background Tasks table is already covered by the closed-list matrix. It is
not used as the Emergency Takeover action geometry gate because browser
auto-scroll behind an open drawer can move that covered background element
without changing the frozen drawer/action geometry. The full pixel comparison
still compares all visible pixels outside the exact Route History mask.

## Evidence and reproducibility

Durable harness sources:

- `apps/dashboard/e2e/issue343-ui-freeze-local.spec.ts`
- `apps/dashboard/e2e/issue343-emergency-geometry-local.spec.ts`
- `docs/validation/issue-343-ui-freeze/compare.mjs`

Raw local evidence is kept outside the Git commit under:

- `tmp/issue-343-ui-freeze-evidence/`
- `tmp/issue-343-ui-freeze-evidence/comparison.json`
- `tmp/issue-343-ui-freeze-evidence/geometry/emergency-action-geometry.json`

The partial first capture attempt is preserved separately under
`tmp/issue-343-ui-freeze-evidence-attempt1/`; it is not used for the PASS.

This follow-up does not claim live Google Maps verification, native browser
200% zoom, remote CI, production deployment or overall merge readiness. The
owner explicitly scoped this continuation to the remaining pixel-perfect UI
Freeze and excluded those unrelated gates from this task.

**UI FREEZE: PASS**
