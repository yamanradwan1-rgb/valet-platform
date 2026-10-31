# Issue #321 Phase B — Policies Studio integration evidence

Status: integration candidate; **not a release approval**. The design and source
attribution below are fixed by the Owner's Issue #321 decision.

## Immutable source and baseline

- Repository: `yamanradwan1-rgb/valet-platform`.
- Current main baseline: `fcfa760e4f17abae5fc9871417c6b68feecd089c`.
- Approved source commit: `5596e2312f622fbbfdcd498408769149407a6399`.
- Approved source directory: `prototypes/issue-321-policies-studio/`.
- Historical base / merge base: `92638c499a1062db3f814687ca3761f235361298`.
- Integration branch: `feat/issue-321-policies-studio-integration`.
- Integration worktree: `tmp/issue-321-b-prime` (relative to repo root).
- The source branch was inspected and imported file by file. Its historical base
  was never merged into the current production branch.
- The superseded four-prototype directory and `prototypes/issue-321/` are not
  implementation/design authorities.

## Contract and ownership

- Settings: existing Company Admin typed management settings routes, exact
  Location Manager configuration route, `expectedUpdatedAt` CAS, independent
  sensitive-MFA flow, authoritative reads and explicit override presence.
- Presence: existing independent Start/End rules, exact scope and revision,
  readiness, zone CAS, one-shot geolocation and mutation reconciliation.
- WhatsApp: existing bundled policy read/PUT, revision, actual approved template
  and provider-binding catalog; live sending remains disabled.
- Contextual Help: existing Issue #278 bilingual registry and focus handling.
- Service Status: existing Issue #238 read-only implementation and API preserved.
- No ValetSession or Task/Dispatch lifecycle transition changes; no new database
  model, migration, backend mutation, permission or audit writer.

## Open Owner decisions

**U-001 — Service Status placement.** The frozen eight-section Studio excludes
Service Status. Current `/integrations` redirects to `/policies?tab=services`,
and existing Help and e2e checks rely on it. A reversible legacy-query branch
keeps those consumers available in the candidate, without adding a Studio
section or new Dashboard menu item. This branch currently renders the complete
legacy Settings page, including its existing editable tabs; **only the Service
Status panel itself is read-only**. The eventual accepted production placement
is not recorded. Final merge is blocked pending the Owner's choice; the legacy
branch is temporary continuity, not a resolved frozen-UI placement.

**U-002 — RESOLVED by the Owner on 2026-10-31.** The Owner expressly allowed
exceptions for prototype-only material, including simulated/local/fixture
copy. Commit `3f42ac3b` imports Worker 2's follow-up: eight UI TS/TSX files
replace misleading English/Arabic strings with truthful server-save,
readiness, loading, catalog and illustrative-map wording. No CSS, icon,
component geometry or global shell files changed. The resulting localized
text pixels are an approved exception, to be recorded openly in comparison
evidence rather than concealed with image masks.

## Verification rules

The source's historical 24/24, 31/31, 20/20 setting coverage and 261 viewport
checks are **prototype-only** evidence. The integrated candidate needs fresh
functional authorization/CAS and browser pixel checks against the immutable
source using normalized API fixtures, matching Chromium/DPR/fonts/locale/theme,
no broad image masks, and independent review. The global Dashboard shell and
non-Policies pages must be compared to current main, with zero intentional
visual changes. Record test commands, actual exit statuses, screenshot hashes,
pixel differences and any blockers below only after they have been executed.

## Results and artifacts

### Static and runtime verification (2026-10-31)

- `pnpm lint`: PASS; all 11 Turbo tasks succeeded.
- `pnpm typecheck`: PASS; all 11 Turbo tasks succeeded.
- `pnpm build` with `API_ORIGIN=http://127.0.0.1:3001`: PASS; all
  10 Turbo tasks succeeded, including optimized production Dashboard build.
- `pnpm architecture:check`: PASS. Existing grandfathered legacy file-size
  warnings remain; each authored Issue #321 file is under 300 lines.
- `pnpm --filter @valet/dashboard exec vitest run
  src/features/administration/policies-studio`: 34 PASS, 0 FAIL after the
  WhatsApp sensitive-MFA follow-up.
- `pnpm --filter @valet/dashboard exec playwright test
  e2e/issue321-policies-studio.spec.ts` against the compiled production app
  at `127.0.0.1:3014`, using `E2E_BASE_URL`: 3 PASS, 0 FAIL.
- `pnpm --filter @valet/dashboard exec playwright test
  e2e/issue238-service-status.spec.ts` against the same compiled app:
  2 PASS, 0 FAIL; the legacy Service Status query works read-only.
- `pnpm --filter @valet/dashboard test`: 1143 PASS, 2 FAIL. Both failures
  were pre-existing `context-help-registry.test.ts` assertions expecting 111
  registered Help entries while the current source has 112. The mismatch was
  reproduced independently against the pre-integration main baseline.
- `pnpm test`: blocked at repository test-target preflight, before tests run:
  `Issue 215 test target is not the verified task-owned disposable PostgreSQL
  container.` No disposable database target was changed or invented.
- `pnpm format:check`: FAIL; Prettier reports widespread mismatches in
  unrelated current-main source, tests and documentation, beginning at
  `.github/ISSUE_TEMPLATE/bug_report.yml` (4,980 files). No repository-wide reformat was
  performed. `pnpm exec prettier --check` on the eight Prime-owned integration
  files: 8 PASS, 0 FAIL.

The two Help fixture assertions and the Issue #215 test database preflight are
unresolved **baseline/environment** failures, not passing checks. No remote
CI execution is claimed. All browser assertions above used real production
Next.js page hydration with network API fixtures; they are not a substitute
for database-backed concurrency or permission integration tests.

### Independent visual and security review

All six locally imported Policies Studio styles have byte-identical Git blob
SHA-1s to the immutable source (`editors.css` `ede3e60f`, `responsive.css`
`c412c784`, `usability.css` `c425e999`, `workspace-feedback.css` `b09b4b40`,
`workspace.css` `ef27db1d`, `zone-map.css` `8e7106c0`). `git diff
fcfa760..HEAD -- apps/dashboard/src/components apps/dashboard/src/app/globals.css
apps/dashboard/src/app/layout.tsx packages/database` contains no modified
global shell or DB files. CSS equality is source evidence, not a browser
pixel-parity verdict.

The pinned Vite source runs at `127.0.0.1:4322`; production candidate at
`127.0.0.1:3014`. Worker 6 must record actual case counts, unmasked pixel
differences, geometry, RTL/mobile and the unchanged global shell comparison.
Worker 7 must record the exact final diff and adversarial verdict. Neither
review may be called PASS before its independent report is available.

The current candidate implements a field-level server-refresh guard while an
editor is open, in addition to existing server CAS. Source-only simulation
copy exceptions are explicit Owner-authorized differences, never masked.
WhatsApp's bundled policy save now uses existing `useSensitiveMutation`, which
opens the already-approved MFA step-up dialog when assurance expires and asks
the user to retry Save after confirmation. It never auto-submits. Company versus
Location Studio composition is scope-keyed to retire pending Presence/MFA state,
and independent Presence/Zones/WhatsApp read states are no longer suppressed
by an unrelated general-settings read failure. Attendance zone editing uses
the distinct authoritative `canEditZones` capability.

Remaining independent-review concern: Presence and WhatsApp reads currently
mount eagerly on the Studio route, including Location zone pagination. These
are authorized reads but exceed the baseline's conditional tab-loading profile
and should be assessed before merge for large-location performance.

No production deployment, merge to `main`, or Issue #321 closure is authorized
by Phase B. U-001 requires an accepted final placement decision before merge.
