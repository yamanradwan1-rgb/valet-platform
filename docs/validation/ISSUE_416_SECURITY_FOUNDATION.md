# Issue #416 security foundation evidence

## Option A Codex recovery and later design reconciliation (2026-11-13)

The later design-only recovery has its own source-verified history and
[delivery/decision ledger](../plans/issue-416-option-a-recovery-handoff.md).
The two local Codex documentation commits were found in Git and replayed
unchanged onto the original `62d0a3d3f97a4186d2dd85642212efc7b4f35d42`
feature baseline: legacy admission/cutover `2323544b` became `06cc29e0`,
and source lock/outcome analysis `29cfadcb` became `940cc907` via
`cherry-pick -x`. The resulting documents remain **PROPOSED DESIGN**, not
accepted architecture, runtime validation or proof of live secret custody.

The recovered [cutover](../plans/issue-416-option-a-cutover.md),
[locks](../plans/issue-416-option-a-locks.md), and new
[key-custody specification](../plans/issue-416-option-a-key-custody.md)
extend the [central Option A proposal](../plans/issue-416-option-a-authentication-provenance.md).
Exact latest integration/review SHA and U2 source writer inventory are recorded
in the updated handoff once integrated. No authentication code, DB privileges,
migration or reset UI/API has been modified by this design-only recovery.

The older evidence below is intentionally **historical**. Earlier PostgreSQL
tests validated only audit reservation migration **112** and prior runtime
roles; none executed the new command-proof, verifier custody, legacy admission
or future SQL lock graph. Production custody/cutover, proof secrecy and new
PostgreSQL concurrency tests remain **BLOCKED/NOT RUN**. Prior independent
review documents assessed an older design and do not constitute approval of
the recovered aggregate. This record preserves the actual historical results
without relabeling them as fresh passes.

## Later Option A design-only phase

The Owner subsequently selected Option A's architectural direction and authorized
design/evidence documentation only. Baseline and feature starting SHA were
reverified as `bfb4fdccf9d557c371313c9e357faa52e0a71014` and
`350d88b090c9dbe1f8d7fa29d6390e28afa9ae19`. Issue #416 remained open with zero
comments. The starting worktree was clean. The earlier commit's Security CI was
rechecked in this phase; its actual state is reported in the delivery response.

New work consists of source/contract discovery, a proposed Option A protocol,
writer and privilege inventory, rollout/concurrency analysis, future acceptance
specification and three independent design reviews. No new database diagnostics,
auth source change, privilege change or migration was executed in this phase.
All executed test results below belong to the preceding implementation phase.
They are not reruns of the proposed authentication architecture.

Current design and unresolved key-custody/writer-lock contracts are recorded in
[the Option A package](../plans/issue-416-option-a-authentication-provenance.md).
Its acceptance tests remain NOT RUN. Independent review records have separate
auth, SQL and operations perspectives and their own explicit evidence limits.

The historical verdict and evidence below are retained as the prior handoff.

Date: 2026-11-13, Asia/Amman.

Verdict: BLOCKED — OWNER SECURITY DECISION REQUIRED.

The implemented slice reserves reset audit event types from the generic runtime
append function. Authentication provenance and the rest of password reset remain
pending. The proposed alternatives and approval question are recorded in
[the security foundation decision note](../plans/issue-416-security-foundation.md).

## Repository and scope

Verified main baseline is `bfb4fdccf9d557c371313c9e357faa52e0a71014`.
Starting branch SHA is `f24a1964a4f48921ecb14a4dca382b254a175aba`.
Integration branch is `feat/issue-416-company-admin-password-reset`, in `D:/v416`.
The existing seven-file contracts commit is retained. No reset table, controller,
middleware or UI is added by this slice. Migration 112 is additive SQL function
policy, with no Prisma model change or historical-data rewrite.

## PostgreSQL target and effective privileges

Runs use an owned PostgreSQL 17 Docker container with a unique task name/label,
an ephemeral loopback port and tmpfs data. Before testing, Docker ID, name,
ownership label, mounts and port binding are checked, followed by database/User,
PG major version, competing client and database checks. The explicit test URL
then enters the existing `database-postgres-provision` or `api-postgres-standard`
ownership/resource harness. Each fixture creates and removes its own database
and runtime role through the current versioned migrations/provisioner.

One recorded effective role is
`valet_issue416_runtime_cffa71b7657b409f9ae4a1213864e486`. Its inherited-role list
is empty and all superuser/create-role/create-db/replication/bypass-RLS flags are
false. Effective session column UPDATE includes `current_access_token_hash`,
`access_expires_at`, `revoked_at`, `last_rotated_at`, `mfa_authenticated_at`,
`mfa_factor_id` and `last_admin_activity_at`. The inventory records actual column
SELECT/INSERT/UPDATE rights and relevant function EXECUTE permissions.

The session table has six constraints, zero user triggers and RLS disabled.
The MFA factor table has seven constraints and two user triggers. Direct
password-hash UPDATE is denied. The generic account-security wrapper is runtime
executable, the private delegate is denied, and both are PUBLIC-denied.

These are effective privilege facts for the disposable provisioned role.
They do not prove a completed authentication bypass. Session impersonation was
not executed, and no reset-specific privileged issuer operation exists to test.
Automatic security review rejected delegated investigation tasks. That limit
and the missing authentication proof remain explicit acceptance gaps.

## Audit reservation evidence

Before migration 112, both new reserved-denial tests failed because the generic
runtime append succeeded. After migration 112, both names fail with SQLSTATE
`42501`, including an exact replay of trusted-owner-created historical events.
The tests verify no new denied event is inserted, existing MFA append/retry and
conflicting-ID behavior, caller rollback, function ACL/ownership/search_path,
runtime reprovisioning and denial of private audit/password/table access.

The upgrade test restores the historical wrapper in a disposable transaction,
applies the new migration, asserts each reserved denial inside SAVEPOINTs, checks
existing history, then rolls back and checks the retained migrated policy.
Fresh Prisma migration deployment and the canonical 112-entry history both pass.

This closes generic runtime reset-event append. Future issuance USER and
redemption ANONYMOUS attribution, private reset-row correlation and atomic
password/session/push/audit mutation remain unimplemented.

## Diagnostic evidence and limits

The noncredential canary test sets statement/bind/error-bind logging only on the
disposable owner's test connection, with empty shared preload libraries. It
exercises success, rollback, conversion error and statement cancellation.

| Observation | Actual result |
| --- | --- |
| Returned success rows contain canary | false |
| Rollback completes | true |
| Conversion error SQLSTATE | `22P02` |
| Driver conversion-error message contains canary | true |
| Statement cancellation SQLSTATE | `57014` |
| Driver cancellation message contains canary | false |
| Disposable server log contains noncredential canary | true |

Canary values and reusable credentials are excluded from this report. The test
demonstrates exposure mechanisms under those settings. It supplies no production
secrecy attestation. No production PostgreSQL/proxy/trace configuration or
production database credentials were available in this checkout/process.

Source inspection covers the session resolver, SQL driver path, bounded query
measurements/lifecycle counters, request IDs, operation runner, exception filter
and repository monitoring/proxy documentation. Caller-supplied request IDs reach
diagnostic sinks and need credential-safe handling on any future reset ingress.
No new raw-bearer SQL path is implemented. Deployment logging, extensions,
tracing agents, ingress/proxy collectors and real HTTP reset errors remain
unverified. The original raw-bearer SQL path cannot be approved from this evidence.

## Executed checks

| Check | Result | Executed evidence |
| --- | --- | --- |
| Audit reservation, inventory, diagnostics, existing audit/MFA roles | PASS | Five PG provision suites, 21 tests |
| Mounted audit/native Staff auth regressions | PASS | Two API standard PG suites, 31 tests |
| Contracts | PASS | `pnpm --filter @valet/contracts test`, 575 tests |
| Auth/MFA/reset policy unit regression | PASS | Six API non-PG selections, 35 tests |
| Database source history and policies | PASS | `pnpm --filter @valet/database test:non-postgres`, 65 tests |
| Root lint | PASS | `pnpm lint` |
| Root typecheck | PASS | `pnpm typecheck` |
| Architecture | PASS | `pnpm architecture:check` |
| Build contract | PASS | `pnpm test:build-contract`, eight tests |
| Build | PASS | `pnpm build`, using applicable Turbo cache |
| Focused formatting | PASS | Prettier on changed authored TypeScript |
| Root formatting | FAIL | Widespread existing formatting differences, no global rewrite |
| Independent source reviews | PASS | Two read-only reviewers approved the narrow audit source after fixes |
| Authentication remediation/security races | BLOCKED | New trust boundary requires Owner decision |
| Full reset feature and browser privacy | NOT RUN | Conditional implementation gates remain closed |

The initial migration-history unit test caught the new count mismatch. Its
canonical append-only expectation now includes exactly migration 112. Reviewers
caught fixture CI-target compatibility, malformed URL privacy and query override
validation, plus upgrade-proof placement. All were corrected with focused tests.

Docker stopped between runs. The next invocation failed target attestation before
connecting. Docker was restarted and a new disposable target was attested before
the complete 21-test run. This interruption supplies no crash-recovery claim.

PostgreSQL commands use an explicit attested `TEST_DATABASE_URL`, followed by
the normal harness global setup and ownership cleanup.

```sh
pnpm --filter @valet/database exec vitest run --config vitest.config.mjs --project database-postgres-provision --maxWorkers=1 --no-file-parallelism --silent=false --reporter=verbose src/issue416-audit-boundary.integration.test.ts src/issue416-runtime-inventory.integration.test.ts src/issue416-diagnostics.integration.test.ts src/audit-foundation-runtime-role.integration.test.ts src/mfa-runtime-role.integration.test.ts
pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-postgres-standard --maxWorkers=1 --no-file-parallelism test/audit-foundation-writers.integration.test.ts test/staff-auth-native.integration.test.ts
pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-non-postgres --maxWorkers=2 test/issue416-contract-policy.test.ts test/staff-auth.service.test.ts test/mfa-assurance-policy.test.ts test/mfa-secret-protection.test.ts test/mfa-recovery-code.test.ts test/mfa-totp.test.ts
```

## Delivery and release boundary

The final Git SHA, remote equality, final rerun and branch Security CI status are
reported in the delivery response after commit/push. The prior contracts SHA's
Security CI completed successfully. Full CI is PR/main-triggered and is a distinct
gate. No PR, merge, QA/production deployment, production migration, feature
activation or issue closure is authorized by this work.
