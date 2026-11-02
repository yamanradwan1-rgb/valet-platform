# Issue #408 — local implementation evidence

Verdict: **READY FOR OWNER REVIEW** of the local implementation, with the review and
repository gate limitations below. This is not release or production acceptance.
Evidence collected 2026-11-01–02 UTC. No push, PR, merge, deployment, production
migration, remote CI dispatch, issue closure, or production policy modification occurred.

## A. Repository and authority

- Branch: `feat/408-mfa-self-service-disable` in `/workspace/valet-408`.
- Base: `0a1d7420c9690d15c9765f9624e6d8e7c2470294`, fetched and independently
  checked against authoritative GitHub main before implementation. Includes #409.
- Original worktree `/workspace/valet-platform`, branch `work`, was preserved at
  `523d1c89746a98f56d1a7c728222b3e12db01734`; no stash/reset/clean was used.
- The final handoff supplies the local commit SHA and post-commit working-tree status.
  This report is contained in that commit; it does not embed its own SHA.
- The complete binding preflight and focused read set are recorded in
  [preflight](issue408/preflight-read-set.json) and
  [focused sources](issue408/focused-read-set.json), including all 20 primary documents.
- Authority is the owner's explicit U-001–U-006 and C1–C4 approval, recorded in
  [the accepted task amendment](ISSUE_408_MFA_DISABLE_CONTRACT.md).
  DEC-078/079/080/081 remain binding, with narrow owner-approved #408 amendments
  to the existing eligibility/mandatory-policy text. DEC-108 module ownership and
  existing Staff session, Native, Push, database and runtime decisions were checked.
  No new Accepted DEC was created on agent authority.

## B. Implementation and changed-file scope

The backend adds authenticated self-account GET/POST `/v1/staff/auth/mfa/disable`
through the existing Staff MFA controller, operation runner, strict contracts,
Staff session resolver, runtime PostgreSQL pool, durable TOTP limiter and
account-security audit writer. The existing `/state` endpoint and state schema
remain compatible. Controller, error filter and route registry preserve private,
non-cacheable responses, including parser errors and late GET reauthorization.

New MFA policy, lock, command, error and service files separate the side-effect-free
availability snapshot from the transaction. No input selects another User or tenant.
The own-account eligibility helper now permits every ACTIVE authenticated Staff User
under U-002. Management/operational authorization guards remain authoritative.
The existing current-factor helper gains an optional NOWAIT mode; other callers
retain their existing behavior.

The Dashboard reuses `/security`, the existing MFA client/access provider, TOTP form,
focus dialog, buttons and translations. A fresh availability read supplies the UUID
after reload and on confirmation. The dialog explains consequences and requires an
explicit fresh-code submission. Current-factor changes cancel old intent. Success
and uncertainty reconcile with authorized GETs; POST is never replayed automatically.
Identity/session and request-generation fences reject stale publication. Cross-tab
signals contain only `MFA_CHANGED`. No proof or factor precondition is stored in
browser persistence. Existing one-time recovery disclosure is preserved during
background attention refreshes. Standalone #409 challenges do not expose this action.

Shared contracts add strict availability, request and success schemas and the three
new error codes. Existing MFA schemas/exports remain compatible. EN/AR copy truthfully
calls `ENROLLMENT_REQUIRED` “MFA not enabled” and offers the existing setup ceremony.

Forward-only canonical migration 107 adds only the nonunique
`organization_memberships(user_id,id)` index. Prisma and database docs match it.
All 106 historical migration SQL files are byte-identical to the base. Empty
bootstrap is guarded by explicit fail-fast relation locks, READ COMMITTED and
double emptiness checks. Nonempty databases require separately authorized online
preinstallation; an operator-only SQL script is supplied, never invoked by the app.
The existing migration inventory appendix is synchronized from its stale count 103
through the already committed 104–106 and new 107; its frozen original prefix is intact.

Tests cover real API/SQL paths, migration safety, Dashboard behavior and regressions.
The accepted amendment and narrow binding-doc annotations document policy first.
The full file manifest is `git show --stat` / `git show --name-only` for the delivered
commit. [Line counts](issue408/line-counts.json) cover all 47 changed authored code
files; maximum 296 physical lines, no new exception or grandfather-baseline change.

## C. Contract compliance and mutation proof

| Contract | Implemented behavior / evidence                                                                                                                                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1       | Exact three-way private GET union; UUID from persisted own factor; strict two-field POST; confirmed 200 `ENROLLMENT_REQUIRED`; no change to `/state`. Contracts, HTTP and E2E tests.                                                                                         |
| C2       | `MFA_TOTP_DISABLED`, USER actor=subject, no metadata or tenant scope; existing append-only account-security SQL function; atomic retirement, accepted step, limiter finalization and one event. Actual trigger-rejected audit rolls everything back.                         |
| C3       | Exact accepted 400/401/403/409/429 and existing 500/503 mapping/messages/precedence. Busy only after confirmed rollback. Repeats/stale IDs return state-changed; no duplicated event or second success. Unknown COMMIT/read failure remains uncertain; no POST replay.       |
| C4       | Explicit READ COMMITTED, existing advisory namespaces with try primitives, ordered NOWAIT account/session/policy/factor rows, bounded runtime relation-lock waits, exact membership index and guarded migration. Real commit/rollback/contention tests and engine rehearsal. |
| U-001    | Any ACTIVE ORG_ADMIN membership in any ACTIVE Organization prohibits disable, irrespective of selected or lower membership. No mandatory-MFA or Super Admin enforcement removed.                                                                                             |
| U-002    | ACTIVE Staff Users including Supervisor, Employee and no-membership accounts can manage their own MFA; no business or platform authority granted.                                                                                                                            |
| U-003    | Existing TOTP verifier and monotonic accepted step require fresh unused proof. Assurance/recovery alone cannot disable.                                                                                                                                                      |
| U-004    | Base sessions and Native refresh survive; retired exact factor makes effective assurance invalid. No Push/session revocation or refresh-assurance renewal added.                                                                                                             |
| U-005    | Existing absent-factor state plus truthful copy and setup path, with no new state value or persistence marker.                                                                                                                                                               |
| U-006    | Own current-factor precondition, single winning transition/event, retired recovery unusable, fresh authorized reconciliation and protected-capability enforcement.                                                                                                           |

Authorization-before-mutation trace:

1. Controller validates transport; `MfaDisableService.disable` authenticates using the
   existing Staff session resolver. The existing account limiter reserves a bounded
   admission attempt; this is not a factor/policy mutation or authority probe.
2. `lockDisableAccount` tries `staff-user-security:<User>`, locks the persisted ACTIVE
   User and exact live session/token/creation identity, then tries `mfa-user:<User>`.
3. It locks **all** own memberships in ID order, then every referenced Organization
   in ID order including inactive rows, and rejects the complete mandatory policy.
   User UPDATE excludes concurrent membership insert/reparent through the immediate FK.
4. `executeMfaDisable` derives and locks the current own factor; compares the UUID only
   as a precondition. It locks the caller's pending attempt and tries the audit UUID
   advisory key before secret use or factor mutation.
5. Existing secret decryption/TOTP verification rejects consumed steps; fresh database
   clock/session and window checks precede a guarded own ACTIVE-factor retirement
   and monotonic step update. This is the first protected factor write.
6. Limiter success and the existing account-security writer append one no-metadata
   event in the same transaction. `inPostgresTransaction` returns only after COMMIT.
7. Every retry restarts authentication, account/policy/factor checks. Every availability
   reconciliation independently reauthorizes and returns only the caller's current state.

Opposing existing session/MFA lock orders cannot cause an indefinite new row/advisory
wait: new acquisitions are NOWAIT/try, and contention rolls the new transaction back.
Relation locks and writes still use the existing finite runtime database budgets;
NOWAIT is not falsely claimed to cover table acquisition. Promotion, activation,
revocation and insert-first interactions are exercised through commit and rollback.
A later membership grant after disable commits remains subject to mandatory-MFA
capability guards; this feature does not grant access without valid assurance.

## D. Verification results and exact commands

Raw local logs are in `/workspace/issue408-contract-evidence/`. The selected portable
visual, preflight and engine results are committed under `docs/validation/issue408/`.
Commands below run from the feature worktree unless a baseline directory is stated.
The test database was an owned disposable loopback PostgreSQL container, not production.
Set `TEST_DATABASE_URL` to an isolated permitted test server; the observed URL was
`postgresql://postgres:synthetic@127.0.0.1:32770/postgres`.

### Real HTTP and PostgreSQL

```sh
NODE_ENV=test DOTENV_CONFIG_PATH=/dev/null corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/mfa-disable-http.integration.test.ts test/mfa-disable-policy-races.integration.test.ts test/mfa-disable-failures.integration.test.ts test/mfa-disable-ceremonies.integration.test.ts test/mfa-disable-policy-lifecycle.integration.test.ts
```

**50 passed,0 failed,0 skipped /5 files** (`feature-final-api.log`). Actual Nest HTTP
boundary and runtime-role SQL, not a mocked disable service. Includes two authenticated
principals/foreign UUID non-disclosure, all approved Staff eligibility classes, quota,
consumed proof, exact errors/headers, stale/repeated calls, session changes, retirement
and audit privacy, multiple memberships, policy changes, simultaneous operations,
row/advisory/table conflicts and authoritative post-failure assertions.

The transaction-failure fixture proxies real PostgreSQL wire traffic: drops before
COMMIT, loses ROLLBACK response, and loses COMMIT response only after another connection
witnesses the durable audit event. No mocked COMMIT success/failure. The committed case
returns 5xx/uncertain, authorized GET observes not-enabled, repeated POST returns 409,
and exactly one audit remains. Audit-trigger rejection leaves factor and accepted step
unchanged. Table-level waits use a shorter existing runtime lock setting in that test,
then prove confirmed rollback and a later explicit authorized success.

Broader MFA/session/Native run: the same command plus these files:

```text
test/staff-mfa-enrollment.integration.test.ts
test/staff-mfa-security.integration.test.ts
test/staff-mfa-assurance.integration.test.ts
test/staff-mfa-eligibility.integration.test.ts
test/staff-mfa-lm-closure.integration.test.ts
test/staff-mfa-session-races.integration.test.ts
test/staff-mfa-authority-races.integration.test.ts
test/issue363-mfa-session-owner.integration.test.ts
test/staff-auth-native.integration.test.ts
```

**97 passed,0 failed,0 skipped /14 files** (`api-regression.log`), before the final extra
parser test and narrow outcome/isolation hardening; the final 50-case run verifies
those changes. These runs overlap and must not be added into a fabricated total.

```sh
NODE_ENV=test DOTENV_CONFIG_PATH=/dev/null corepack pnpm --filter @valet/database exec node ../../scripts/test-harness/run-owned-tests.mjs database vitest.config.mjs src/mfa-disable-migration.integration.test.ts src/mfa-migration.integration.test.ts src/mfa-constraints.integration.test.ts src/mfa-recovery-constraints.integration.test.ts src/mfa-runtime-role.integration.test.ts src/issue363-mfa-owner-deletion.integration.test.ts
```

**24 passed,0 failed,0 skipped /6 files**, including 5 new migration tests
(`database-regression.log`). Fresh canonical 107, early relation contention, nonempty
missing-index refusal, conflicting same-name index, concurrent preinstallation,
constraints and real runtime-role grants/append-only enforcement are exercised.

Actual Prisma-engine 106→107 upgrade rehearsal:
`corepack pnpm --filter @valet/database migrate:deploy` first rejects the nonempty
missing-index fixture as required. In that disposable database only,
`corepack pnpm --filter @valet/database exec prisma migrate resolve --rolled-back 20261101010700_issue408_mfa_disable_policy_index`
records the expected failed test attempt. The supplied operator SQL runs with
`psql -v ON_ERROR_STOP=1 -f /tmp/issue408-local-rollout.sql` inside the owned container,
then the actual deploy command succeeds. **100,016 memberships before=after,
107 applied, exact index valid/ready**; see [engine result](issue408/engine-upgrade-result.json).
No production index rollout was executed or authorized.

### Dashboard browser and unit evidence

```sh
E2E_BASE_URL=http://127.0.0.1:3408 ISSUE408_VISUAL_OUTPUT=/workspace/issue408-contract-evidence/visual-final corepack pnpm --filter @valet/dashboard exec playwright test --config /workspace/issue408-playwright.config.cjs e2e/issue408-mfa-disable.spec.ts e2e/issue408-mfa-fencing.spec.ts e2e/issue408-security-visual.spec.ts e2e/mfa.spec.ts e2e/md-r11-security.spec.ts e2e/issue409-guest-information-mfa-flow.spec.ts e2e/issue409-guest-information-mfa-fencing.spec.ts
```

**47 passed,0 failed,0 skipped** (`dashboard-regression.log`). Real Chromium and Next;
API responses use the repository's browser fixtures. This is not a live full-stack
browser/API/database run. The 23 new cases cover policy/availability, confirmation,
success, invalid/busy/stale results, unknown outcome, reload/session/cross-tab fencing,
re-enrollment, accessibility and no automatic POST. Existing MFA/R11/#409 suites pass.

After building, the standalone Dashboard server was run at the same loopback URL.
The same Playwright command with just `e2e/issue408-security-visual.spec.ts`
and `e2e/issue408-mfa-disable.spec.ts --grep 'Security freeze|requires explicit fresh proof'`
passed **9/9**, including complete re-enrollment, ten-code disclosure/acknowledgment
and action restoration (`compiled-dashboard-e2e.log`). These cases overlap the 47.

Baseline capture at the exact approved base passed 8/8. Final EN/AR × LTR/RTL ×
light/dark ×1440/390 captures and keyboard/Enter/Escape/focus checks passed 8/8.
[Comparison](issue408/visual-comparison.json): no changed pixels above the MFA card;
all existing card coordinates/widths preserved. The only resting-image change is
the new button/lower MFA-card extension, +57.59375 px height in all 8 captures. No CSS
changed and no historical baselines were updated. Captures live in
[baseline](issue408/visual-baseline/) and [final](issue408/visual-final/).
This is fixture-based visual evidence for these sampled states, not every possible
ceremony/error screenshot or a formal screen-reader certification.

```sh
corepack pnpm --filter @valet/dashboard exec vitest run --config /workspace/issue408-dashboard-vitest.config.mjs src
```

**178 files /1,183 tests passed**, no failures/skips (`dashboard-unit-system-chromium.log`).
The environment could not download bundled Chromium (CDN 403), so external configs
selected `/usr/bin/chromium`, `--no-sandbox`, one Playwright worker and two Vitest
workers, preserving existing 60 s E2E timeouts. The Vitest setup overrides only
`chromium.launchServer` executable/args; no test assertions are removed. Standard
repository configs remain unchanged. A first re-enrollment rerun failed solely
because the old dev server had exited; the compiled-server 9/9 rerun supersedes it.

### Quality gates and broader baseline failures

| Exact command / scope                                                                           | Observed result                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `corepack pnpm lint`                                                                            | 11/11 tasks passed;2 unaffected cached (`root-lint.log`).                                                                                                                                                                                                 |
| `corepack pnpm exec turbo run typecheck --concurrency=2`                                        | 11/11 tasks passed;8 unaffected cached. Initial oversubscribed run exited 137; bounded rerun passed (`root-typecheck-sequential.log`); final current-source rerun also passed11/11 (`final-typecheck.log`).                                               |
| `corepack pnpm build --concurrency=1 --filter=@valet/api --filter=@valet/dashboard`             | 4/4 fresh tasks passed: API, optimized Dashboard and dependencies (`build.log`). Not a whole-repository or production deployment build claim.                                                                                                             |
| `corepack pnpm architecture:check`                                                              | Passed; existing grandfathered warnings only. No baseline edits.                                                                                                                                                                                          |
| `MIGRATION_DATABASE_URL=<owned-db> corepack pnpm --filter @valet/database exec prisma validate` | Passed (`prisma-validate.log`).                                                                                                                                                                                                                           |
| `corepack pnpm exec eslint <all changed authored JS/TS paths> --max-warnings=0`                 | Passed; additionally covers E2E files outside normal Dashboard lint scope (`changed-eslint.log`).                                                                                                                                                         |
| Changed authored-file Prettier check and `git diff --check`                                     | Passed for authored code. Repository configuration excludes `docs/`; new report/contract/evidence JSON are additionally checked with `--ignore-path /dev/null`. Existing binding-document additions were reviewed without reformatting unrelated history. |
| `corepack pnpm test:non-postgres`                                                               | Aggregate failed; reasons/reproductions below. No all-repository test-pass claim.                                                                                                                                                                         |

The root non-Postgres run passed contracts **75 files/541 tests**, employee-client
**106/928**, database **8/65**, config **1/1**, UI **1/2**, testing **1/1**.
Dashboard browser-launch errors were resolved by the external system-Chromium adapter
and all 1,183 tests passed. API's native Node runner stopped on an unrelated socket test;
API Vitest was therefore run independently:

```sh
NODE_ENV=test corepack pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-non-postgres
```

Result: **1,437 passed,1 failed,7 skipped;200 files passed,1 failed,2 skipped**
(`api-unit.log`). The sole failure is the stale Hybrid Dispatch module-controller
inventory assertion in `test/feature-module-ownership.test.ts:194`. Reproduced at
the exact untouched base with the same command plus that filename:11 passed/1 failed
(`baseline-feature-ownership.log`). It is outside this authentication task.

```sh
# Run in both feature and exact-base worktrees.
NODE_ENV=test corepack pnpm --filter @valet/api exec node --test test/issue333-u002-http-cancellation.test.mjs
```

Both fail the same case at line 119, “abort after synchronous finish cannot retract
already queued HTTP data”, with “large body server finish timed out” at 12 s
(`api-non-postgres-recheck.log`, `baseline-socket.log`). Baseline 3 passed/1 failed.
No timeouts were raised and no unrelated source/test was changed to hide either failure.
The complete PostgreSQL monorepo suite, all browser suites, remote CI and production
runtime were not run. Targeted results above are the acceptance evidence available.

## E. Security review, findings and limits

Independent COS review: **BLOCKED**. All three configured COS agent endpoints return
404 `tunnel_client_not_seen`. Rechecked before finalization; no worker/reviewer result
is manufactured and no forbidden substitute agent framework was used.

Prime performed the [recorded adversarial self-review](ISSUE_408_SELF_REVIEW.md),
including the full diff and new files. Confirmed self-review findings fixed before
delivery: **P1** false busy classification after an unavailable rollback; **P1**
implicit transaction isolation instead of explicit READ COMMITTED; **P2** lost cancel
focus; **P2** background reconciliation prematurely clearing one-time recovery-code
disclosure. Real failure tests and affected browser cases pass after fixes.
Open confirmed in-scope findings from self-review: P0=0,P1=0,P2=0,P3=0.
These counts do not imply independent security approval or exhaustive proof.

Remaining limits: independent review unavailable; two reproducible baseline API gate
failures; real browser fixtures rather than live full-stack E2E; sampled visual states;
no production/remote-CI evidence. Existing Push semantics are preserved by leaving
their code and session revocation paths unchanged; no device Push delivery test was run.
Simultaneous ceremony HTTP tests exercise real races, but are not an exhaustive
deterministic scheduler for every possible interleaving. No explicit process SIGKILL
recovery claim is made; tested failure boundaries are the actual connection/transaction
cases described above. No unresolved implementation-critical contract contradiction
was found.

## F. Final gate

Local implementation: **READY FOR OWNER REVIEW** with these explicit limitations.
Independent security acceptance: **NO-GO / BLOCKED pending review**.
Implementation/release acceptance: **NO-GO pending owner review and remaining gates**.
Recommendation for Push/Merge: **do not push or merge** under this mission.
A clean local commit records reviewable work only; it does not satisfy remote CI,
human review, production index authorization, deployment or issue acceptance.
