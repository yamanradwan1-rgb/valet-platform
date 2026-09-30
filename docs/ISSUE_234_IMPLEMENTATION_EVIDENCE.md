# Issue #234 Implementation Evidence

Status: validated working-tree evidence for `fix/234-security-shell-mfa-workspace` against baseline `8a7d3640d8c95031d34673e15bcd0f2bbc80a0ce`.

This document records implementation evidence plus commands actually executed during the owning #234 implementation run. It does not claim remote CI. Final repository-wide closure gates are recorded here only after they are run.

## Accepted contract represented by the implementation

- Account Security eligibility is account-level: authenticated active Staff plus at least one ACTIVE `ORG_ADMIN` membership in an ACTIVE Organization.
- Eligibility is independent of selected Organization/Location/workspace role and independent of `dashboardAccess`.
- A mixed-role User remains eligible when another active membership supplies the qualifying Company Admin relationship.
- LM-only, Supervisor-only and Employee-only accounts do not receive the Account Security management affordance.
- Direct `/security` uses the existing Dashboard shell with truthful null Organization/Location and zero Management discovery/business-data requests merely to draw that shell.
- The Security utility destination is presented from account eligibility. Existing business destination IDs may be reused from an already-resolved, memory-only presentation snapshot; absence of that snapshot produces account-only navigation.
- Provisioning secrets, TOTP/recovery inputs and raw recovery-code disclosures remain ceremony-local and ephemeral.
- Sensitive-action freshness is independent of ordinary `ASSURED`; fresh TOTP may still be required before a sensitive action.
- Successful step-up never automatically replays the protected mutation. Rejected mutations require explicit retry.
- #234 changes no production API endpoint, public MFA contract, database schema, persisted factor model or factor type/format.

## Source evidence observed in the current working tree

| Behavior | Current implementation evidence | Observed result | Validation status in this documentation pass |
|---|---|---|---|
| Account eligibility source | `apps/dashboard/src/components/security/account-security-access-provider.tsx` | Shared provider reads `GET /mfa/state`, binds the result to auth generations, and exposes `eligible` / `ineligible` / `error` without selected business scope | Focused fixture/backend evidence passed; runtime was not run |
| Shared account result | `apps/dashboard/src/app/app-providers.tsx` | Nav/Help/Security consume one non-secret account result and share in-flight reads | Direct-route budget test passed with one logical state read |
| Security route bypasses business authority | `apps/dashboard/src/components/foundation/management-foundation-app.tsx` | Account Security returns `AccountSecurityShell` before normal selected-scope route revalidation | Direct-route E2E passed with zero Management/business reads |
| Scopeless shell | `apps/dashboard/src/components/foundation/account-security-shell.tsx` | Null selected scope is truthful; business presentation comes only from an exact-generation memory snapshot | Focused fixture E2E passed |
| Zero discovery for direct shell | `apps/dashboard/src/components/foundation/account-security-shell.tsx` | No Management discovery client is invoked to build the direct Account Security shell | Focused fixture network assertions passed |
| Account navigation presentation | `apps/dashboard/src/lib/navigation/account-security-navigation.ts` | Selected-role Security is removed and re-added only from current account eligibility | Unit + authority/shell E2E passed |
| Unselected workspace affordance | `apps/dashboard/src/components/foundation/unselected-scope-foundation.tsx` | Security link is rendered only for account-eligible state | Authority E2E passed for mixed-role and LM-only cases |
| Help affordance | `apps/dashboard/src/components/foundation/help-foundation.tsx` | Help shows Account Security only when the shared account result is eligible | Covered by the shared eligibility/navigation E2E path |
| Ephemeral ceremony material | `apps/dashboard/src/components/security/use-account-security-ceremony.ts` | Enrollment/recovery material stays in component state and clears on unknown authority, route exit, dismissal, logout and session replacement | Privacy E2E passed 3/3 cases |
| Failed reread does not retain prior assurance | `apps/dashboard/src/components/security/account-security-access-provider.tsx`, `apps/dashboard/src/components/security/account-security-workspace.tsx` | Failed reconciliation replaces old `ASSURED` with checking/error state | Lifecycle E2E passed 8/8 including stale-Verified and delayed-response cases |
| Sensitive freshness independent of ordinary assurance | `apps/dashboard/src/features/administration/sensitive-mfa-dialog.tsx` | TOTP form is shown for `STEP_UP_REQUIRED` and ordinary `ASSURED` when a sensitive mutation demanded fresh proof | Required Branding fixture regression passed |
| Explicit retry after sensitive verification | `apps/dashboard/src/features/administration/use-sensitive-mutation.ts` | Step-up closes the dialog and surfaces explicit retry; protected mutation is not reinvoked | Branding fixture observed one denied write before explicit user retry |
| Mutation 401 no replay | `apps/dashboard/src/lib/api/dashboard-api-client.ts` | Non-GET 401 reconciles authentication but does not issue a second write | Unit and MFA E2E proof passed |
| MFA mutation reconciliation | `apps/dashboard/src/components/security/use-account-security-ceremony.ts` | Uncertain/auth/server outcomes clear sensitive material, reread authority and require deliberate user action | Focused 401 and unknown/network no-replay proof plus lifecycle E2E passed |

## No backend / database / public-contract expansion

Against baseline `8a7d3640`, the current `git diff --name-only` has no production changes under:

- `apps/api/src`
- `packages/contracts`
- `packages/database`

`apps/api/test/staff-mfa-eligibility.integration.test.ts` adds focused account-eligibility evidence. Any working-tree test-only change under `apps/api/test` is not a production API, contract, persistence or factor-model change.

The frontend consumes the existing Staff MFA endpoints and factor model. This evidence does not assert new server semantics beyond the already-implemented active-Company-Admin account eligibility and existing Standard/Sensitive assurance rules.

## Tests run and passed

- Focused Dashboard unit slice: six files / 38 tests passed (`dashboard-api-client`, `dashboard-mfa-client`, `staff-auth-client`, `mfa-ui`, navigation registry and account-Security navigation).
- Existing Security/MFA fixture slice: 9/9 passed.
- Security shell/authority fixture slice: 9/9 passed.
- Current-tree Security lifecycle: 8/8 passed, including stale Verified, delayed secret/state fencing, cached-`ASSURED` denial handling, same-identity external refresh and replacement-session stale success/error.
- Privacy/accessibility: 5/5 passed. Synthetic setup/recovery material was checked against localStorage, sessionStorage, IndexedDB and CacheStorage in the focused privacy proof.
- Security visual proof: 8/8 passed, covering EN/AR, Light/Dark, desktop/narrow plus scoped/scopeless Security states.
- Sensitive freshness/Administration: 7/7 passed, including ordinary `ASSURED` followed by a Sensitive denial, TOTP, no protected-write replay and explicit resubmission.
- Required minimal backend evidence was observed green on the current tree before an already-running broad backend process was stopped: `staff-mfa-eligibility.integration.test.ts` 4/4 and `staff-mfa-assurance.integration.test.ts` 3/3, including mixed-membership/inactive authority and exact 8h/30m/5m boundaries.
- Final static/build closure gates are recorded below only after their final run; remote CI is not claimed.

## Source-level UI visual-freeze audit

- `DashboardShell`, sidebar/topbar/mobile navigation components, `shell.css`, `shell-controls.css`, `foundation.css`, Help CSS and Administration CSS are unchanged from the baseline.
- The only CSS diff is deletion of the old Security-local `account-security.module.css`. Security now reuses the existing Dashboard Help page/card pattern, Administration error surface, global `stack` / `field`, shared `Button`, `FocusDialog` and `BidiText`.
- No new color, token, radius, shadow, spacing scale, breakpoint, shell dimension or Security-specific input/button styling was introduced.
- Shell geometry remains the frozen 260/80 sidebar and 4rem topbar; direct/scoped Security only changes composition and eligibility-driven presence, not Dashboard geometry.

## Tests intentionally skipped under Fast Validation Mode

- `RUNTIME MFA E2E: NOT RUN`. Disposable runtime proof was optional because backend production MFA code/contracts were unchanged and the required fixture/backend evidence was green.
- Root `pnpm test` was not run; current repository instructions do not make it a required final gate for this branch.
- Historical broad MFA/backend/race/enrollment/recovery suites were not rerun for closure. A pre-existing broad backend process was stopped after the two required focused backend tests had already reported green.
- No duplicate visual rerun was performed after the green visual matrix because no production UI/CSS code changed afterward.

## Final closure gates

- `pnpm --filter @valet/dashboard lint`: passed.
- `pnpm --filter @valet/dashboard typecheck`: passed.
- `pnpm architecture:check`: passed; only pre-existing grandfathered file-size warnings were reported.
- `pnpm test:build-contract`: 4/4 passed.
- `pnpm build:production`: final configured run passed with `API_ORIGIN=http://127.0.0.1:3001`; Turbo reported 10/10 build tasks successful, including the Dashboard `/security` route. The first unconfigured attempt correctly failed closed because production requires `API_ORIGIN`.
- `git diff --check`, final authored-file size audit and final `git status --short` are run immediately before commit and recorded in the delivery report.
