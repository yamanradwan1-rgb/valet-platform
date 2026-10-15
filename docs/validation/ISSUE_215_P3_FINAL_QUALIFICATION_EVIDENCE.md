# Issue #215 — P3 Trusted Condition-Photo Check-In Integration Evidence

**Delivery:** backend code integration, guarded for local testing only. **Full P3 security acceptance: NO-GO.** No production provider, hosted deployment, PR, merge, APK, or issue closure is implied.

**Authority:** Accepted DEC-104; `docs/plans/ISSUE_215_VERIFIED_CONDITION_PHOTO_MASTER_PLAN.md` §§9, 10, 14.2–14.3, 20, 24–25. **Starting P3 commit:** `a8bdff6e4a0f37f1d0aaf13ea6f0650d261a0979`, after P2 `a69a69b405cb5b9ba79211fab9a9b7b310a939e5` and P1 `dbb0f8f3ae64bd5b42b22c521c5e52ca78f41e6d`.

## Implementation map

| Source | Responsibility |
| --- | --- |
| `apps/api/src/modules/valet-sessions/condition-photo-qualified-receipt.ts` | Strict VERIFIED/SELECTED/AVAILABLE scoped candidate SQL (ten newest); object bytes, SHA-256, byte count, exact bucket/version; WeakMap-only one-use nonce receipt (60s); locked recheck of same immutable verification tuple |
| `apps/api/src/modules/valet-sessions/check-in-photo-preflight.ts` | Short authorized scope/policy/candidate read transaction; bounded private object reads only after COMMIT; skip S3 for optional, historical marker replay and non-CHECKING_IN state |
| `apps/api/src/modules/valet-sessions/check-in-condition-guard.ts` | Extract existing current Company/Location override, historical marker and satisfaction evaluation; require current exact private evidence receipt when policy is required |
| `apps/api/src/modules/valet-sessions/check-in-vehicle-identity-guard.ts` | Preserve accepted persisted identity check while reducing existing oversized final Check-In source |
| `apps/api/src/modules/valet-sessions/check-in-condition-command.ts` | Historical marker replay unchanged; first marker gets preflight receipt; exact StaffAuthSession recheck inside mutation transaction when P3 attached; existing audit and error unchanged |
| `apps/api/src/modules/valet-sessions/complete-check-in-command.ts` | Independent current-photo policy recheck before old CAS/version increment and atomic completion audit; exact StaffAuthSession recheck when P3 attached |
| `apps/api/src/modules/check-in-api/check-in-api.controller.ts` and `check-in-api.service.ts` | Thread existing Authorization header internally for the two completion operations; resolve StaffSessionContext and inject trusted preflight without changing public DTOs |
| `apps/api/src/modules/vehicle-photos/condition-photo-backend.service.ts` and `condition-photo-discovery-query.ts` | Test-only explicit qualification gate; report proven discovery qualification through identical byte+current-tuple proof with external I/O outside discovery transaction |
| `apps/api/test/condition-photo-qualified-receipt.test.ts`, `check-in-photo-preflight.test.ts`, `check-in-photo-command-credential.test.ts` | Receipt forgery/replay/expiry/integrity, optional policy and historical replay, trust boundary, no S3 while transaction open, token revoked during simulated delayed preflight |

No migration, public contract shape, Native/Web presentation file, Task, Dispatch, Key Custody, or client-supplied proof field is changed. Historical metadata-only VehiclePhoto records remain unverified.

## Guard truth table

| Historical marker | Current policy | Current evidence | Current guard |
| --- | --- | --- | --- |
| absent | Optional | none | Incomplete for final Check-In; first condition marker may be written |
| absent | Required | verified | Incomplete for final Check-In; first marker may be written only with fresh proof |
| present | Optional | none | Photo policy satisfied; final subject to vehicle, version, state, actor |
| present | Required | legacy metadata | Deny |
| present | Required | pending, STORED, expired, or unselected | Deny |
| present | Required | VERIFIED + SELECTED + AVAILABLE + matching private bytes + receipt | Eligible only if all other guards pass |
| present | Required | missing, corrupted, changed version, or unversioned object | Deny |
| present | Required | UNAVAILABLE | Deny |

The *historical* marker retry returns its original committed timestamp and member even when current photo policy later changes; the final completion always applies **current** policy. Company default `false/true`, Location override `null/false/true`, and especially explicit `false` override retain their original semantics. Optional paths require no S3 request. The existing final `CHECKING_IN → AWAITING_PARKING` CAS still increments version exactly once; a photo upload never increments the custody version.

## Trust and transaction graph

1. Existing Staff route parses the same DTO and resolves a bearer principal; the P3-enabled service resolves its exact `StaffSessionContext` separately and checks the same user.
2. **T0 read:** active User, persisted ValetSession scope, explicit active Employee/Supervisor membership and Location access, current policy and bounded current verified candidates. T0 commits before any private-object I/O.
3. **External proof:** up to ten candidates, aggregate 15-second budget; the private adapter reads the exact candidate object version, checks length and timing-safe SHA-256, zeroes returned buffer, and issues an opaque request nonce-bound proof. Provider errors create no proof.
4. **T3 write:** exact Staff credential is locked/revalidated using the existing user-security advisory order **before** User and membership locks; the existing Management settings shared advisory and session FOR UPDATE lock follow; policy and existing state/vehicle/version prerequisites are reread. The one-use receipt intersects the current database VERIFIED operation, selected attempt, verification, bucket/key/version, digest/length, and current AVAILABLE state. No S3 read occurs in T3.
5. **Commit:** the existing marker or final versioned mutation and its existing AuditEvent commit atomically in PostgreSQL. PostgreSQL does **not** atomically commit an object-store state, so a provider must separately prove retained immutable bytes and deletion restrictions.

Cancellation and policy updates continue to synchronize through the existing session and settings lock order. A policy flip optional→required after an optional preflight fails closed until a new request proves eligible bytes. A policy flip required→optional lets the locked optional policy win. No Staff Shift, original intake creator, Task, or Custody prerequisite was added.

## Deliberate conservative capability boundary

Positive P3 runtime qualification is permitted only with `NODE_ENV=test`, `CONDITION_PHOTO_P3_QUALIFICATION_ENABLED=true`, and an explicitly valid private storage configuration. The test-only gate is **not** an attestation of real private-provider interoperability. Normal development/production without those explicit gates continues to deny required-photo completion without a verified receipt; optional no-photo flow remains available.

This P3 preparatory implementation also requires a **non-null exact S3 object version** for positive receipt creation. Existing P2 permits a nullable `VersionId`; the master plan conditionally permits *independently qualified* unversioned IAM-immutable storage. No such provider or immutable write/no-delete proof exists here. Consequently unversioned VERIFIED uploads are intentionally unable to satisfy the P3 guard. Either choose and qualify a versioned provider, or seek a reviewed/provider-qualified unversioned immutability contract before lifting the production gate. Do not silently treat a null version or a mere HEAD/ETag as a byte proof.

An optional-policy marker created before a later policy reversal remains a historical event. Existing P1 upload finalization may reject additional evidence after the marker; P3 does not circumvent that database rule or silently rewrite marker history. Operational recovery in this rare situation remains a separately required policy decision.

## Validation and limitations

Run-time counts, exact Git SHA, and disposable-resource cleanup must be recorded **per invocation**, not combined across passing and failing attempts. Current tests of S3 behavior use fake `PrivatePhotoStore` adapters and cannot establish real MinIO/IAM/versioning/retention guarantees. The local Docker image inventory has PostgreSQL 16 and **no MinIO/S3-compatible server image**. A real isolated S3 test, provider identity, and provider-side no-delete/writable-object IAM proof remain **NOT RUN**.

The first isolated local PostgreSQL attempt at the two existing Check-In suites failed during fixture migrations because `packages/database/node_modules` lacked `dotenv`. `76/76` cases skipped across two files, zero passed, `api-postgres-race` harness cleanup reported `db=0 roles=0 children=0`; this is **NOT PASS**. A scoped `pnpm --filter @valet/database install --offline --frozen-lockfile` later restored the dependency from pnpm local store with exit 0 and no downloaded packages. The follow-up PostgreSQL run must be reported separately.

Second PostgreSQL attempt (both old suites concurrently), after local dependency repair: exit **1**, `2` failed test files, `76` skipped tests, `0` cases executed. Both independent `beforeAll` hooks exceeded `120000ms` while provisioning/migrating their disposable fixture databases. The isolated harness reported `db=0 roles=2 children=0`; a later read-only PostgreSQL role/database inventory found no matching leftover runtime roles or `valet_004*` databases. No domain test passed.

Third PostgreSQL attempt (only the existing condition command suite, `--no-file-parallelism`): exit **1**, `1` failed file, `42` skipped, `0` executed, `beforeAll` exceeded `120000ms`. Cleanup reported `db=0 roles=0 children=0`. The original grandfathered 120-second hook was left unchanged. Thus **P3 required PostgreSQL I19–I24 races, real DB tuple qualification, and real S3 integration remain NOT PROVED** even though an owned disposable PostgreSQL 16 server was reachable.

### Verified command results (local developer machine, P3 dirty worktree)

| Invocation | Exit | Cases/files | Environment and evidence |
| --- | ---: | --- | --- |
| `pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-non-postgres test/condition-photo-qualified-receipt.test.ts test/check-in-photo-preflight.test.ts test/check-in-photo-command-credential.test.ts` | 0 | 17 passed, 0 failed, 0 skipped / 3 files | Mock private store and query adapter; receipt/authorization unit coverage only |
| `pnpm --filter @valet/contracts test` | 0 | 449 passed, 0 failed, 0 skipped / 59 files | Shared DTO/contract regression |
| `pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-non-postgres test/condition-photo-status-query.test.ts test/condition-photo-s3-wire.test.ts test/condition-photo-qualified-receipt.test.ts test/condition-photo-private-storage.test.ts test/condition-photo-multipart.test.ts test/condition-photo-jpeg-decoder.test.ts test/condition-photo-ingress.test.ts test/condition-photo-http.test.ts test/condition-photo-db-errors.test.ts test/condition-photo-admission.test.ts test/check-in-photo-preflight.test.ts test/check-in-photo-command-credential.test.ts` | 0 | 54 passed, 0 failed, 0 skipped / 12 files | Combined P2 regression + P3; mocked storage and local fake signed S3 HTTP wire only; no real provider |
| `pnpm --filter @valet/api lint` | 0 | N/A | Entire API source/test/tool lint |
| `pnpm --filter @valet/api typecheck` | 0 | N/A | API TypeScript no emit |
| `pnpm architecture:check` | 0 | N/A | Only pre-existing grandfathered oversize warnings; P3 new files under 300 lines |
| `git diff --check` | 0 | N/A | Line-ending warnings on Windows; no whitespace violations |
| Existing 2 Check-In PostgreSQL suites using owned harness and `TEST_DATABASE_URL` targeting disposable PostgreSQL 16 | 1 | 0 passed, 76 skipped / 2 failed files | First migration bootstrap failure: missing local `dotenv`, no cases executed; harness cleanup 0/0/0 (db/roles/children) |
| Same 2 suites after scoped offline dependency repair | 1 | 0 passed, 76 skipped / 2 failed files | Migration fixture hooks timed out after 120s; cleanup 0/2/0, later read-only inventory empty |
| `pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-postgres-race --no-file-parallelism test/check-in-condition-command.integration.test.ts` | 1 | 0 passed, 42 skipped / 1 failed file | Hook setup timed out after 120s; cleanup 0/0/0 |

S3 interoperability: **NOT RUN**, `0` real S3 tests, because the Docker image inventory contained `postgres:16-alpine` but no actual MinIO/S3-compatible server. P2's fake S3-shaped signed HTTP transport test, if passing, does not constitute an approved provider or IAM test. Timing benchmarks for successful photo-required Check-In with real private bytes and optional no-photo baseline are **NOT MEASURED**; only static 15-second aggregate provider budget and no-S3 optional code path were inspected/tested with mocks.

**Execution identity:** all results above were observed against the local dirty P3 source whose baseline HEAD was `a8bdff6e4a0f37f1d0aaf13ea6f0650d261a0979`. They were run *before* the focused P3 implementation commit; the tested working tree is the final implementation diff recorded in that commit, provided no intervening source changes occur. The local PostgreSQL target was an explicitly task-owned disposable PostgreSQL 16 Docker server at loopback; a migration bootstrap never established a successful P3 SQL test fixture. The non-PostgreSQL test suite required no disposable database or object-store teardown. No MinIO bucket or credentials were created.

### Mandatory independent review

- **Domain reviewer (CoS worker-1), read-only:** inspected full DEC-104/master plan, old and new marker/final Check-In, policy/cancellation, token fences and discovery. No confirmed new false-qualification P0/P1 on the latest test-gated diff; conditional unversioned compatibility concern and real test gaps remain.
- **Security reviewer (CoS worker-2), read-only:** inspected the exact SQL tuple, opaque receipt, private store, preflight/transaction split, StaffAuthSession fence and final guard. Confirmed prior stale-token window and requested a fresh Stage-C exact-credential lock; patch applied and independently re-reviewed. No current confirmed P0/P1 trust bypass in the test-gated HTTP path; provider qualification and real race proofs are open.

These reviewers performed static source review, **not** real PG/S3/provider acceptance.

## Remaining gates and verdicts

| Gate | Status |
| --- | --- |
| Focused backend code delivery to P3 branch | Reviewable under the disabled-production gate; final commit/push verification separately required |
| P3 real PostgreSQL and S3 local integration | **NO-GO** until full I19–I24 + actual S3 provider tests pass |
| P3 security acceptance | **NO-GO** until exact bearer, deletion/availability, policy/cancellation and versioned object-provider races are proven |
| Production deployment | **NO-GO**; no VPS, approved production provider/bucket, credentials, rollout authorization or deployment |

Outstanding work: [#282](https://github.com/yamanradwan1-rgb/valet-platform/issues/282) real S3 qualification, [#283](https://github.com/yamanradwan1-rgb/valet-platform/issues/283) token/revocation races, [#284](https://github.com/yamanradwan1-rgb/valet-platform/issues/284) integrated HTTP→PG→S3→audit, [#285](https://github.com/yamanradwan1-rgb/valet-platform/issues/285) unknown/crash reconciliation; P4 [#289](https://github.com/yamanradwan1-rgb/valet-platform/issues/289), P5 [#288](https://github.com/yamanradwan1-rgb/valet-platform/issues/288)/[#290](https://github.com/yamanradwan1-rgb/valet-platform/issues/290), and P6 [#291](https://github.com/yamanradwan1-rgb/valet-platform/issues/291).
