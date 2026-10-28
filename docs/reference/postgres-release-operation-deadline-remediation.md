# PostgreSQL release operation-deadline remediation

## Pre-code scope and baseline

2026-10-29. Verified remote main:
`0c0ebd87571b703d286c5ede344d9eb4e52f5598`.
Verified diagnostic base:
`ae5b666a8910ceaa21b52e22a28b9d2e73eb2369`, exactly two commits ahead,
zero behind main. No baseline difference from the owner's request.
New branch: `fix/postgres-release-operation-deadline-remediation`.

The pasted request is the instruction source. The separately attached
PG-RELEASE-20VU-REPRO-20261029.md was read in full as QA evidence; its embedded
recommendations do not independently authorize operations on the Windows host.
The previous investigation and instrumentation are preserved.

Affected entities: transient PostgreSQL client leases and cleanup context.
No ValetSession/Task transitions, tenant/Location policies, configuration
inheritance, schema/index/grant, transaction isolation, security boundary,
photo worker/storage or product-scope changes are planned. One ordinary runtime
pool; existing 4/128 QA limits and all deadlines remain. Scope follows accepted
DEC-025/026 and the root structure/security/engineering guidance. Target lease
and deadline modules are below 300 lines; add focused test files below 300 lines.

Investigation must prove/falsify whether a general lease's reset uses a foreign
expired async context. Inspect native pg.Pool.query callback/release execution,
actual startup, live Staff authentication, transaction wrappers, cancellation,
reset/disposal races and session GUC recovery. Add the failing real-PostgreSQL
regression before any runtime remediation. Historical COMMIT/WAL stalls remain
a separate unresolved question unless new evidence connects them.

## Proven mechanism before the fix

On the unchanged diagnostic runtime, the new real-PG test exercises production
`RuntimeDatabaseLifecycle.onApplicationBootstrap()`, waits for its existing
six-second scope to expire, then performs real Staff session resolution and an
authorized operational-context read. No server fault, query error, network
delay, forced disposal or reset rejection is injected.

Observed native pg callback context: scoped=true, expired=true, even though the
current Staff caller is unscoped and the newly acquired lease is general.
`pg@8.22.0` receives protocol responses on the original socket's async resource;
`pg-pool` calls `client.release()` inside its query callback. The lease captured
guest=false when checked out for Staff work. Its reset therefore enters the
bounded query wrapper under the expired *startup socket* scope. The wrapper's
`remainingDatabaseOperationMs()` rejects before the driver receives RESET.
The successful result still reaches the client; reset rejection increments
releaseFailures and OPERATION_DEADLINE, then destroys the connection.

Before-fix numeric reproduction: one successful authorized operation,
releaseFailures=1, OPERATION_DEADLINE reset failures=1, reset driver calls=1
(only the later context lease), acquisitions=completions=3, two native connections
created because the first was destroyed. Test exit 1 on the required zero-failure
invariant. This reproduces the QA signature without Pool saturation or a WAL stall.

Deterministic boundary/nested-scope tests: six cases, three fail before the fix.
An unexpired foreign scope succeeds; expired/boundary and expired nested scopes
reject general cleanup before driver submission. The tests also demonstrate that
expired-scope *business SQL* remains rejected and real reset errors must destroy.

## Minimal remediation

Only runtime change: bind `client.release` to the acquisition async context with
Node `AsyncResource.bind` in `postgres-lease.ts`. The captured lease policy and
the context used by reset now agree. No reset removal, special exemption by SQL
text, deadline extension, additional pool, transaction rewrite or counter change.
The reset batch, its 2,000ms read timeout, lease watchdog, owner-scope cancellation,
unsafe-client destruction and native-release/accounting order are unchanged.

The native driver callback may still execute under its original socket context;
the regression explicitly observes this after the fix. Binding the infrastructure
release boundary makes cleanup independent of that foreign caller context. It
does not rebind business queries or authorize expired operations. General leases
have no operation deadline, while genuinely scoped leases retain their original
scope and cancellation tracking. Existing query/transaction limits still apply.

## Before/after evidence and falsification

| Exact same real-PG startup/auth/context regression | Diagnostic runtime | Fixed runtime |
| --- | ---: | ---: |
| Successful authenticated and authorized context operation | 1 | 1 |
| Acquisitions / lease completions, including startup | 3 / 3 | 3 / 3 |
| Release failures | 1 | 0 |
| Reset OPERATION_DEADLINE failures | 1 | 0 |
| RESET calls submitted to the driver | 1 | 2 |
| Native connections created | 2 | 1 |
| Final admitted / leased / active | 0 / 0 / 0 | 0 / 0 / 0 |

Same isolated migrated/provisioned PG17 fixture and exact regression source;
only the production release binding changed. This is a controlled correctness
comparison, not an RPS benchmark. Console evidence is fixed numeric fields only.

Negative controls and alternatives:

- The current Staff caller is explicitly unscoped; authentication is current,
  and the authorization result belongs to the expected persisted membership.
  There is no genuine Staff operation deadline to expire in this reproduction.
- The startup operation already succeeded, its timer was cleared, and its client
  tracking set was emptied. The expired deadline object survives via the socket's
  async resource. Merely clearing the timer does not clear AsyncLocalStorage in
  that socket's future callbacks.
- An unexpired foreign-scope boundary test succeeds even before the fix. At or
  after the foreign deadline, it fails before the fix and passes afterward.
- The real driver callback remains scoped/expired after the fix, while reset
  runs unscoped for the general owner. This falsifies accidental dependency on
  a changed callback dispatch mechanism or a lengthened startup deadline.
- Expired nested-scope business SQL is still rejected before driver submission.
  Only infrastructure release executes in its acquisition context.
- A real aborted transaction still rejects RESET with 25P02 and is destroyed;
  lost reset responses, explicit disposal during reset, active cancellation,
  ambiguous COMMIT/ROLLBACK responses and watchdog cleanup retain their tests.
- The new real-PG GUC test commits changed session settings, releases from an
  expired nested scope, then acquires the *same* client under Guest policy, which
  skips general setup. It observes baseline statement/lock/idle/transaction
  values `3s / 2s / 2s / 0`, proving an actual reset rather than masking taint
  with the next general checkout's setup.
- Four concurrent real Staff principals in distinct Organizations each receive
  only their own context. Four independently checked-out clients finish with
  nine acquisitions/completions including scoped warmup, zero release failures,
  zero queue/timeouts and four idle clients. A disabled User still gets HTTP401.

The proven error is application-side rejection **before** RESET reaches pg,
not a PostgreSQL statement/lock/transaction timeout. It causes avoidable client
destruction and replacement, not a demonstrated connection leak. It reproduces
the light-load QA signature without WAL or long COMMIT waits. It does **not**
establish the cause of the earlier nine-second control stall, nor a measured
contribution to the 191 historical acquisition timeouts. That issue remains open.

## Files changed and invariants

| File | Purpose |
| --- | --- |
| `apps/api/src/common/database/postgres-lease.ts` | Bind release to lease ownership context; the only runtime change |
| `apps/api/test/postgres-release-context.test.ts` | Six deterministic boundary, nested-scope, business-deadline and unsafe-reset cases |
| `apps/api/test/postgres-startup-release-context.integration.test.ts` | Actual production startup -> expired native socket callback -> successful real Staff auth/authorization -> reset/reuse regression |
| `apps/api/test/postgres-release-isolation.integration.test.ts` | Real committed GUC reset/same-client Guest reuse and four-tenant concurrent authorization |
| `docs/reference/postgres-release-operation-deadline-remediation.md` | Evidence, verification, limits and exact QA handoff |

No schema, grants, SQL, migration, Pool maximum, waiter capacity, acquisition or
operation budget changed. No Check-In retry/transaction/isolation/idempotency,
task/custody/Shift transition, audit/outbox, token expiry/rotation/replay/MFA,
tenant/Location authorization, rate limit, photo worker or storage path changed.
The original reset batch and fail-closed disposal remain. Release remains
idempotent, and capacity remains admitted until actual return/disposal. The
bound function restores the caller context on return; no global enterWith or
deadline disabling is introduced. AsyncResource.bind is supported by the
repository's Node 22+ runtime contract.

## Verification commands and exact results

Environment: Node 24.19.0, pnpm 10.34.5, PostgreSQL 17.11 on an isolated
loopback-only test-owned Docker container. Existing dependencies were usable;
contracts were built before tests. No Windows credentials, raw private logs,
private ledgers, object keys or fixture secrets were read or committed. The
attached and named Windows reproduction reports were both read in full, and
only the ignored QA tool source was read to prepare the handoff below.

The initial before/after regression command uses the existing owned harness
from repository root (each file was first run separately before the fix):

```sh
corepack pnpm --filter @valet/contracts build
corepack pnpm --filter @valet/api exec node \
  ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
  test/postgres-release-context.test.ts \
  test/postgres-startup-release-context.integration.test.ts
```

| Selection / command result | Exit | Result |
| --- | ---: | --- |
| Before runtime change: `postgres-startup-release-context.integration.test.ts` | 1 | 1 failed regression, with the numeric baseline above |
| Before runtime change: `postgres-release-context.test.ts` | 1 | 3 failed / 3 passed; foreign expiry and nested cleanup reproduce the defect |
| After runtime change: those same two files | 0 | 7/7 passed |
| Final real-PG selection below | 0 | 23 files, 171/171 passed |
| Final non-PG selection below | 0 | 16 files, 128/128 passed |
| Protected `condition-photo-concurrent-http.integration.test.ts` | 1 at preflight | BLOCKED: target attestation unavailable; no tests executed |

Final real-PostgreSQL selection:

```sh
corepack pnpm --filter @valet/api exec node \
  ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
  test/postgres-release-isolation.integration.test.ts \
  test/postgres-startup-release-context.integration.test.ts \
  test/postgres-reset-diagnostics.integration.test.ts \
  test/auth-reset-admission.integration.test.ts \
  test/pool-startup-burst.integration.test.ts \
  test/pool-occupancy.integration.test.ts \
  test/guest-t3-lease-regression.integration.test.ts \
  test/guest-t3-protocol-timeout.integration.test.ts \
  test/guest-t3-transaction-metrics.integration.test.ts \
  test/staff-context-lease.integration.test.ts \
  test/staff-auth.integration.test.ts \
  test/staff-auth-native.integration.test.ts \
  test/staff-auth-continuity.integration.test.ts \
  test/staff-mfa-security.integration.test.ts \
  test/intake-session-command.integration.test.ts \
  test/intake-serialization-recovery.integration.test.ts \
  test/intake-operation-concurrency.integration.test.ts \
  test/intake-independent-concurrency.integration.test.ts \
  test/check-in-api.integration.test.ts \
  test/staff-operational-context.integration.test.ts \
  test/shift-eligibility.integration.test.ts \
  test/production-database-safety.integration.test.ts \
  test/postgres-control-stall.integration.test.ts
```

Final unit/component selection:

```sh
corepack pnpm --filter @valet/api exec node \
  ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs \
  test/postgres-release-context.test.ts \
  test/postgres.test.ts \
  test/performance-pool-diagnostics.test.ts \
  test/health-pool-attribution.test.ts \
  test/database-operation-context.test.ts \
  test/performance-request-diagnostics.test.ts \
  test/runtime-metric-window.test.ts \
  test/guest-t4-observability.test.ts \
  test/condition-photo-jpeg-concurrency.test.ts \
  test/condition-photo-decode-queue.test.ts \
  test/condition-photo-execution-cancellation.test.ts \
  test/condition-photo-http.test.ts \
  test/condition-photo-qualified-receipt.test.ts \
  test/condition-photo-qualification-gate.test.ts \
  test/condition-photo-db-errors.test.ts \
  test/condition-photo-private-storage.test.ts
```

Total: **299 distinct passing tests, 39 files**; repeated targeted executions
are not counted again. These passing selections report no skipped tests or
unhandled errors. The production-safety negative test intentionally logs a
SAFETY_PREFLIGHT startup rejection and passes. Initial new-test failures were
corrected: an over-specific setup/work phase expectation for its own SET SQL
was replaced with the required actual RESET-call check; an unused type import
was removed after lint rejected it. No existing assertions were weakened.

The following local checks passed with exit 0:

```sh
corepack pnpm --filter @valet/api typecheck
corepack pnpm --filter @valet/api lint
corepack pnpm --filter @valet/api build
corepack pnpm architecture:check
```

Architecture retains existing grandfathered file-size warnings. All changed/new
authored files remain below 300 lines. Changed-file Prettier and Git whitespace
checks are recorded at delivery. The API build includes no test code.

### Explicit protected-photo environment blocker

The attempted owned-harness command for
`test/condition-photo-concurrent-http.integration.test.ts` fails before any
test or destructive harness cleanup with:
`Issue 215 test target is not the verified task-owned disposable PostgreSQL container.`
Its required attested Issue-215 PostgreSQL target and private versioned MinIO
fixture are unavailable in this environment. An arbitrary PG17 URL is not a
substitute for that identity. No target guards were edited, no GitHub-hosted
identity variables were spoofed, and no test was silently skipped. Thus the
photo unit/component checks above pass, but **full protected real-PG/MinIO photo
qualification remains pending** on the tester's attested setup. This is an
external qualification gate, not an observed transaction/integrity regression.

## Windows QA handoff: targeted 20-VU confirmation

Do not run 200 VUs automatically. The immediate goal is a clean release gate on
the same legitimate 20-VU mixed profile. The owner's ignored tools inspected are
`run-pgphase-mixed.ps1`, `pg-waits-sampler.mjs` and the saved reports under the
`vaylet-pg-phase-diag-ae5b666-20261028` QA checkout.

1. Preserve the old QA checkout, results and private manifests. Create a separate
   detached candidate checkout at the exact final SHA in the delivery response:

   ```powershell
   git fetch origin
   git worktree add --detach <new-candidate-checkout> <DELIVERY_SHA>
   ```

   Build contracts and API there. Provision only the existing approved isolated
   QA configuration. Preserve 4 clients / 128 waiters, all current budgets,
   active Staff/Shift/Location policy, rate limits and object-storage boundaries.
   No production role/database or outbound sending workers.
2. Copy the ignored QA tooling into the candidate's own ignored working
   directory. Review and pin **only candidate source identities** to DELIVERY_SHA
   in its runner, k6 workload, sampler, seed and storage-preflight tools. Update
   the API-process-path identity check for the new candidate checkout. Do not
   disable provenance checks or change the separately recorded historical
   Staff/resource fixture origin SHAs. Keep the original files unchanged.
3. Generate fresh genuine QA sessions and a new storage attestation using the
   existing reviewed tools, with unique labels and no secret output. The runner
   requires 200 prepared synthetic Staff across eight Locations but activates
   only 20 VUs in `pgprobe20`; the prepared count is not the observed load.
   Preserve the original real-JPEG fixtures, MinIO byte/hash/version checks and
   physical-resource manifest. Attestation must be <15 minutes old and access
   tokens must have >180 seconds remaining. Recheck host RAM and retain the
   existing 2 GiB in-run watchdog (minimum start RAM 2400 MiB for this profile).
4. Launch only the candidate's owned API with its exact release SHA and existing
   event-loop/resource observer. Verify the process command/path and PID marker.
   Wait for a **fresh pre-traffic runtime pulse** (about 32 seconds uptime),
   deliberately beyond the six-second startup scope. Record same-process
   `pid`, `processStartedAtMs`, `releaseSha`, `sampledAtMs`, uptime and a zero
   reset-failure baseline. This directly exercises the former trigger; do not
   reuse the old run's missing/nonzero first-pulse baseline as a stage delta.
5. In a separate terminal in that candidate's QA working directory, start the
   existing single read-only inspector (after reviewing/pinning its SHA guard):

   ```powershell
   node .\pg-waits-sampler.mjs pgphase-releasefix20-20261029a 125 100
   ```

   Then run exactly one fresh 20-VU stage, substituting the newly generated
   attestation/session labels below:

   ```powershell
   .\run-pgphase-mixed.ps1 -Stage mixed-pgprobe20-20261029-03 -Mode pgprobe20 -StoragePreflightLabel <fresh-storage-label> -AuthLabel <fresh-session-label>
   ```

   Use a later unique stage suffix if 03 already exists; never overwrite
   evidence. Capture the native k6 exit immediately. Keep the matched 100ms
   inspector, API event-loop/CPU/RSS and host/container CPU/RAM series. Retain
   `track_wal_io_timing=off` as-is; counts/waits are observations, not measured
   WAL sync latency. No production settings or extension changes.
6. Wait for complete drain and a fresh post-traffic pulse from the same PID,
   process start and SHA. Compare:

   - acquisitions/completions, native wait totals/buckets and timeout counts;
   - rejected/QUEUE_FULL, releaseFailures and the full reset-reason vector;
   - reset counts/RTT/maxima, lease completion durations and live ownership;
   - PG query/transaction ages, COMMIT/WAL waits and matched host observations.

   Pulses, the ~92-second traffic stage and 125-second inspector have different
   boundaries. Do not divide wider-window deltas by traffic duration, subtract
   lifetime maxima or count inspector/maintenance activity as exact stage RPS.
7. Require: native k6 exit 0; zero unexpected HTTP/auth/business errors;
   **releaseFailures delta 0 and OPERATION_DEADLINE reset-failure delta 0**;
   zero unexplained reset interruptions, acquisition timeouts and QUEUE_FULL;
   admitted/leased/acquiring/waiting/active all drain to zero; matched successful
   acquisitions/completions. Repeat the independent read-only per-operation
   DB/S3 byte/hash/version/audit/task/custody checks and global integrity check.
   Every started journey must reconcile; never retry uncertain mutations without
   their existing operation-ID reconciliation.
8. If this gate or protected-photo qualification fails, stop and preserve the
   evidence. Only after both pass may separately reviewed, resource-safe QA
   proceed to 40, then 100, then 200 naturally active Staff, followed by genuine
   refresh soak. The historical long COMMIT issue still requires measured
   attribution if it reappears. No Peak/Stress escalation on failure.

## Capacity and delivery limits

The release-context defect is proven and fixed locally with actual PostgreSQL
and current persisted Staff authorization. No new Windows mixed run, private
MinIO qualification, 40/100/200-VU stage or production-equivalent benchmark was
executed here. The QA reports' earlier client/data passes remain historical
baseline evidence, not post-fix results. No production sizing or 200-employee
capacity claim follows from these regressions.

Main and the diagnostic branch remain unchanged. This branch preserves their
instrumentation and regressions. No PR, merge, deployment, manual CI trigger or
CI waiting. The current workflow only starts on main pushes or PRs targeting
main, so pushing this remediation branch does not match its triggers. Final
commit, remote-HEAD equality and clean-tree verification are in the delivery
response; a committed report cannot contain its own commit's SHA.
