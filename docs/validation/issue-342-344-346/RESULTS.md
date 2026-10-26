# #342 / #344 / #346 — verified implementation

Date: 26 October 2026, Asia/Amman. Synthetic local data only.
Repository: `yamanradwan1-rgb/valet-platform`.
Branch: `feat/dashboard-342-344-346-ui-frozen`.
Base: `90aa90a89593df95b8fd6e41f7d6c97bb42284a4`.

## Implementation

| Issue | Result | Scope |
| --- | --- | --- |
| #344 | DONE | Persisted effective Start/End policy and coherent exact-zone readiness evidence determine localized last-zone feedback; otherwise truthful general guidance. Existing rejection, CAS, permissions, MFA and dialog behavior stay intact. |
| #346 | DONE | Explicit Company Admin Resume command at `POST /v1/staff/management/organizations/:organizationId/locations/:locationId/resume-intake`, using the existing Stop authority, five-minute MFA, lifecycle lock and CAS. Atomically opens ACTIVE Location intake and appends attributed `LOCATION_INTAKE_RESUMED`; no-op retries do not audit. |
| #342 | DONE | Existing Shift Details opts into `?includeCashReconciliation=true`; server separately checks existing financial/reporting authority before projecting persisted Shift cash evidence. Lists and default strict detail responses remain unchanged. Exact decimal presentation, null/forced-ended fallback and safe reporter identity; no financial mutation/recomputation. |

Financial authority: DEC-051 Location Manager financial authority; DEC-052 immutable
close evidence; DEC-060 existing financial snapshot reporting; DEC-080 MFA-backed
Company Admin reporting. No new role/grant, financial approval, POS or settlement
permission. Default detail/list authority alone never selects cash.

Resume updates only `accepting_intake` and the existing lifecycle version. Real
PostgreSQL tests preserve nonempty synthetic Shift, ValetSession, Task, Dispatch,
key-custody and Payment records, then admit a new Check-In through normal intake.
They also cover audit rollback, stale state, replay/no-op, foreign/wrong-role/
revoked actors, MFA freshness, concurrent lifecycle calls and revocation races.

## Executed checks

Commands below use pnpm 10.34.5. In this environment that pinned runner was
`node work/pnpm10/package/bin/pnpm.cjs`; no package/lockfile changes were retained.
Only the named files/projects ran; no full platform CI was triggered.

| Command | Result |
| --- | --- |
| `pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-postgres-race test/issue346-resume-intake.integration.test.ts test/issue342-shift-cash-read.integration.test.ts test/staff-shift-history.integration.test.ts test/staff-shift-history-authority.integration.test.ts test/shift-presence-zone-evaluation-races.integration.test.ts --testTimeout 30000` | PASS: 26/26 in 5 files |
| `pnpm --filter @valet/database exec vitest run --config vitest.config.mjs --project database-postgres-provision src/location-lifecycle-runtime-role.integration.test.ts --testTimeout 30000` | PASS: 6/6; limited EXECUTE, owner/search-path/PUBLIC boundary and forged Resume audit rejection |
| `pnpm --filter @valet/dashboard exec vitest run src/features/administration/settings/shift-presence-zone-readiness.test.ts src/features/administration/settings/shift-presence-policy.test.tsx src/features/administration/staff/staff-shift-cash-facts.test.tsx src/features/administration/locations/location-resume-error.test.ts` | PASS: 38/38 |
| `pnpm --filter @valet/contracts exec vitest run src/staff-shift-cash-reconciliation.test.ts src/staff-shift-history.test.ts` | PASS: 16/16 |
| `pnpm --filter @valet/dashboard exec playwright test --config ../../work/playwright.config.ts issue342-shift-cash.spec.ts issue344-last-attendance-zone.spec.ts issue346-resume-intake.spec.ts issues342-346-evidence.spec.ts` | PASS: 15/15, including 13 behavior cases and 2 before/after evidence cases |
| `ISSUES_UI_BASELINE=1 E2E_BASE_URL=http://localhost:3004 pnpm --filter @valet/dashboard exec playwright test --config ../../work/playwright.config.ts issues342-346-ui-freeze.spec.ts --fully-parallel --workers 2` | PASS: 32/32 baseline variants |
| `ISSUES_UI_FREEZE=1 pnpm --filter @valet/dashboard exec playwright test --config ../../work/playwright.config.ts issues342-346-ui-freeze.spec.ts` | PASS: 32 distinct feature variants, executed in chunks of 11 + 20 + 1 retry; see UI_MATRIX.json |
| `pnpm --filter @valet/api typecheck`; dashboard/contracts/database equivalent | PASS, all four affected packages |
| `pnpm --filter @valet/api lint`; dashboard/contracts/database equivalent | PASS, all four affected packages |
| `pnpm --filter @valet/contracts build`; `pnpm --filter @valet/api build` | PASS |
| `API_ORIGIN=http://127.0.0.1:3001 pnpm --filter @valet/dashboard build` | PASS: verification build only; no deployed artifact |
| `pnpm architecture:check`; `git diff --check` | PASS; only existing grandfathered-size warnings |
| `node_modules/.bin/tsc -p work/e2e-tsconfig.json` (extra scratch E2E scope) | FAIL: existing shared E2E helper typing gaps; see limitations below |

The local Playwright config uses installed `/usr/bin/chromium` and localhost
previews; it is task scratch, not application configuration. The dedicated
before/after specs are opt-in so normal Playwright runs do not require a second
preview or pre-existing screenshot files. Use `ISSUES_UI_EVIDENCE=1` for future
affected-area evidence captures. The initial recorded evidence run preceded
that opt-in guard; its test bodies are unchanged.

## Timing retries, existing limits and untested scenarios

- No unresolved new runtime, contract or product typecheck/lint/build failures.
- Under concurrent local load, existing PostgreSQL tests with a 5-second default
  timeout exceeded that deadline. The same tests passed with the command-local
  30-second timeout; their expectations and unrelated source were not changed.
- One visual variant timed out waiting 5 seconds for the synthetic Sign in
  screen. Its exact retry passed with a local 15-second expect timeout. There
  was no frozen-geometry/style mismatch in the completed normalized matrix.
- A direct Dashboard build without API_ORIGIN was correctly rejected by existing
  configuration validation. The repository's verification loopback origin above
  passed; production configuration was not changed.
- An extra scratch TypeScript check including E2E files (outside the normal
  Dashboard typecheck include set) exposes existing shared helper typing gaps:
  literal Location IDs in `support/fixture-data.ts` / `presence-fixtures.ts`,
  optional `headers` in `support/dashboard-api-fixture.ts`, and `presenceGeo`
  declarations used by `support/presence-map-mock.ts`. These shared files were
  not modified to silence the optional check. Standard affected-package
  typechecks pass and the actual Playwright behavior tests pass.
- UI checks cover EN/AR, RTL/LTR, Light/Dark, 320/390/768/1440px and **CSS zoom**
  100%/200%, focus containment, keyboard confirmation and accessible names/roles.
  A real screen-reader session and native browser-zoom control were NOT RUN.
- PostgreSQL was extracted into task scratch and run as an unprivileged local
  process. No production data, services or external providers were used.

## Freeze and review

See UI_INVENTORY.md, UI_MATRIX.json and screenshots/README.md. The 12 representative
before/after screenshots are synthetic. Sidebar, topbar, general layout, existing
page/drawer/dialog geometry and style rules are unchanged. No CSS, navigation,
Native or Customer code changes. All new/modified authored code stays <=300 lines.
The lifecycle authorization extraction is required to keep the service under the
existing limit; it retains the same authority contract.

## Delivery boundary

Code, tests, documentation and evidence are delivered on the dedicated branch.
No PR creation, main merge, deployment, production access, release publication,
or GitHub issue closure is part of this work. No implementation authority decision
remains open. A later release must apply the forward Resume function migration
and run existing runtime-role provisioning; that release is not performed here.
