# Issue #215 — Local P2/P3 Security and Integration Remediation

**Scope:** #287 PostgreSQL fixtures, #282 real local S3, #283 exact Staff credentials, #284 Nest HTTP→PG→S3→Audit, #285 crash and unknown-outcome recovery.
**Source:** DEC-104, full Issue #215 master plan, P1–P3 handoffs.
**Base SHA:** `edfe39c1b946d4bc39f964af5bd2dd6101f3aecc`.
**Branch:** `codex/issue-215-local-security-validation`.
**Environment:** Windows, Node 24, pnpm 10, Docker Desktop Linux, disposable PostgreSQL 16.15, isolated Chainguard MinIO versioned bucket on loopback.
**No VPS, staging, production S3, customer images, public buckets, PR, merge, deployment, or APK.**

## A. Environment and exact boundaries

The local PostgreSQL source is the pre-existing task-owned `vaylet_issue215_p1_local` Docker container with PostgreSQL 16.15, `issue215_owner` and disposable `issue215_empty` bootstrap database; its published access is loopback-only. Secrets were extracted from this container's environment inside the invoking process and never copied into the repository or this report. PostgreSQL test suites create individually named test databases and restricted runtime roles. Owned-harness ledgers track cleanup; protected Issue #215 suites additionally require the pinned local Docker/database identity.

Real S3 comes from `scripts/issue215-local-s3/`: Docker Compose pins `cgr.dev/chainguard/minio@sha256:2136d593beacf4461187035eca949fe49abd589d5079735025c711ca58fee0c8` and a pinned MinIO client digest. The image is temporary and test-only; scoped bucket `issue215-s3-worker4` is private, versioned and backed by tmpfs, with a restricted Put/Get/GetVersion app identity (no LIST/DELETE/version deletion) and a disposable KMS secret for adapter-required AES256 server-side encryption. Local credentials are ignored by Git. Port is dynamically bound to `127.0.0.1`; use the runtime fixture file for tests, never commit or log its contents.

## B. #287 — PostgreSQL timeout, actual cause and remediation

The earlier P3 reported `beforeAll` timeout after 120 seconds and did **not** execute 76 intended domain cases. Two distinct failures were found:

1. Missing `packages/database/node_modules/dotenv` on the older worktree aborted `migrate:deploy`. A scoped offline frozen-lockfile dependency install restored it. In the new isolated worktree, `pnpm install --offline --frozen-lockfile --ignore-scripts` succeeded without network downloads, followed by actual SQL migrations.
2. PostgreSQL **16** cannot recognize the `transaction_timeout` setting, introduced in PostgreSQL 17. The API opened connections with `options=-c transaction_timeout=5000`, so normal restricted runtime acquisition failed and the wrapper hid the unsupported-parameter error as `RuntimeDatabaseUnavailableError`. Read-only `SHOW transaction_timeout` produced `unrecognized configuration parameter` and `server_version_num=160015`. This was a code/server contract mismatch rather than proof of database saturation.

Repair: remove unsupported startup GUC, install/reset native `transaction_timeout` only on PostgreSQL 17+, preserve PostgreSQL 16+ supported `statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout`, and the established JavaScript per-lease/per-request watchdog. Guest transaction shorter deadlines use native pre-BEGIN SET on PostgreSQL 17+; PostgreSQL 16 stays bounded by the operation watchdog, statement/lock/idle server limits and forced client disposal. Bootstrap checks the available GUCs and refuses unknown or unsafe versions. No global beforeAll timeout was increased, no security/target assertion removed, and no production database connection was used.

The two oversized legacy Check-In suites now share `apps/api/test/issue215-fixture-timing.ts` for bounded redacted fixture timings and nested child exit classification, removing duplicated spawn code. Time points: connection/database CREATE, Prisma migration, per-migration SQL elapsed times from the owned `_prisma_migrations` journal, role provisioning, raw/runtime connections, application lifecycle and guest shorter deadline, cases and cleanup. The fixture source files shrink relative to their grandfathered baselines. The child diagnostic does not print connection strings, secrets or customer data.

Observed local timings:

| Measurement | Real result |
| --- | --- |
| Direct disposable database CREATE | 0.47–0.55 s |
| Direct 81 migrations, two runs | 7.884 s and 10.647 s |
| Direct runtime role provisioning | 2.516 s |
| Direct migration + provision + owned cleanup | 11.489 s |
| Concurrent Check-In fixture CREATE | 133 ms / 210 ms |
| Concurrent Check-In migration | 11.037 s / 11.017 s |
| Concurrent restricted runtime provisioning | 3.281 s / 3.259 s |
| Concurrent runtime connection stage | 29–30 ms |
| Both existing PostgreSQL Check-In suites after basic server compatibility fix | **76/76 passed**, two files, no skipped, 17.68 s Vitest duration, harness cleanup `db=0 roles=0 children=0` |
| Final PG16/PG17-guarded source rerun with lifecycle/guest connection checks | **76/76 passed**, two files, no skipped, 17.14 s, cleanup `db=0 roles=0 children=0` |
| Actual 81-migration SQL journal on two concurrent fixtures | **6.208 s / 6.232 s**; slowest migration 453 ms |
| Protected P1/P2 actual PostgreSQL tests | **38/38 passed**, eight files, 49.58 s, cleanup `db=0 roles=0 children=0` |

The earlier run **before** PostgreSQL 16 connection repair executed 42 cases: 14 passed and 28 failed with availability errors; another diagnostic run failed the raw/runtime comparison in `beforeAll` with all 42 skipped. Both are separate actual failure results, not silently omitted. The latest 76/76 rerun verifies actual Nest runtime database lifecycle and guest shorter-budget queries on the owned PostgreSQL 16 target. Independent review found a PostgreSQL 17 guest case lacking a native 5-second limit in an intermediate patch; it was corrected to SET a native 5-second-or-shorter deadline before every PG17 guest transaction. Actual PostgreSQL 17 server regression remains **NOT RUN**; code-level review is not runtime proof.

## C. #282 — Real local MinIO qualification

Initial official MinIO Quay image lookup returned HTTP 401; a pinned Chainguard MinIO distribution was obtainable. The first real signed PUTs returned HTTP 501 because the mandatory AES256 SSE request needed a KMS secret on this provider. The disposable MinIO fixture was corrected with a temporary KMS key; **no production adapter or security requirement was weakened**.

`node scripts/issue215-local-s3/run.mjs` executed **6/6 real S3 SDK tests across two files**, zero skipped: signed conditional PUT + second-write rejection; concurrent creators exactly one winner; versioned exact GET/HEAD with actual byte-length and SHA-256 comparison; wrong version/missing-key rejection; anonymous GET/LIST and scoped-identity DELETE/LIST/cross-prefix denied; SSE AES256; real provider commit followed by lost HTTP acknowledgement yields UNKNOWN while exact proof remains; stalled GET yields bounded TIMEOUT. The isolated task bucket provides non-null VersionId required by P3. It does not prove any future production provider's SLA, TLS, IAM governance, backup, legal retention, or immutability outside the approved versioned contract.

## D. #283 — Exact Staff credential races

Current P1/P2 and P3 code ties authority to exact StaffAuthSession ID, User ID, access hash and creation time, expiry/revocation, OrganizationMembership, Organization/Location/access, current lease and ValetSession. The intended lock sequence is user-security advisory → StaffAuthSession `FOR UPDATE` → User and scope/membership/access `FOR SHARE` → P1 admission → session/operation/attempt; P3 Stage C reacquires exact credential before normal settings/session locks. Refresh and User disable share advisory fence, logout directly contends for the same session row, and membership/location revocation conflicts with scope share locks.

Dedicated protected API test classification permits only reviewed exact Issue #215 filenames and retains strict test-target attestation/lease recovery. Deterministic tests use independent PostgreSQL connections, active lock-wait observation and real T1/T2/StaffAuthService paths, including refresh/logout/revoker-first and T2-first orderings. The protected `api-postgres-issue215` #283 suite **executed 8/8 passing tests**, no skips, against pinned PostgreSQL16, with cleanup `db=0 roles=0 children=0`. Classification/target-preflight negative tests **16/16 PASS**. A separate attempted rerun was denied *before testing* by the occupied owned-cluster lease and is not counted as successful.

## E. #284 — Full HTTP/PG/S3/Audit Check-In path

The protected `api-postgres-issue215` actual Nest HTTP integration **executed 6/6 passing tests**, zero failures/skips, 18.59 seconds (22.08 seconds runner), owned cleanup `db=0 roles=0 children=0`. It used real `CheckInModule`/`AuthModule` with exact Staff bearer, runtime-restricted PostgreSQL, actual versioned private MinIO, multipart synthetic JPEG→P1 T1/STORED/T2→VERIFIED+SELECTED+AVAILABLE→exact S3 VersionId/byte length/SHA-256/stripped EXIF→P3 GET discovery true→condition marker/replay→final current-policy Check-In CAS and three exact verification/marker/final AuditEvents. HTTP 201 upload and 200 completion returned correct public DTOs.

Five more executed cases covered optional Location override zero-photo completion, metadata-only evidence denial, historical optional marker with subsequent required policy and final denial, known unavailable evidence denial, and concurrent final CAS with one winner/audit. Unexercised full I19–I24 permutations (actual cancel/Location close, policy writer vs preflight, unavailable storage after S3 read, audit rollback via real HTTP, cross-replica concurrency) remain outstanding; **passing six representative tests does not prove the entire matrix**. Earlier P2 mocked Nest/loopback signed S3 tests remain separate.

## F. #285 — Crash, lost acknowledgement and reconciliation

The isolated recovery test fixture uses task-owned PostgreSQL, distinct runtime actor credentials, a child uploader process and explicit T1 lease, owned child hard kill after signed PUT and before T2, fresh-credential/second-replica reconcile, exact counts and held read barrier. The deterministic **S3-shaped local HTTP fixture** suite passed **3/3 real PG tests** (no skips), cleanup `db=0 roles=0 children=0`. A separate **actual MinIO + PostgreSQL** suite passed **2/2 real-provider tests**, initial 19.05 seconds, cleanup `db=0 roles=0 children=0`: after real MinIO signed PUT and SIGKILL of the dedicated uploader PID before T2, a fresh credential/replica proved the exact object version and committed precisely one photo/verification/SELECTED/audit; also recovered an actual stored PUT whose reply was lost and recorded as UNKNOWN. This is a hard-killed uploader process with parent-owned committed T1, **not** full Nest API crash and restart. All other failure windows remain open. Fixture-only expiry advances a targeted attempt in its disposable database; runtime never gains direct mutation privileges.

**Security finding corrected:** The first #285 test fixture trusted `ISSUE215_DISPOSABLE_PG_CONFIRMED=YES` with arbitrary loopback PostgreSQL and its two suites were outside pinned Issue215 API project classification. Independent review classified this as **P1 test-target safety**, rather than a production HTTP vulnerability. The fixture now requires the exact `requireIssue215TestUrl` protected project/lease, pinned Docker container ID/volume/live SQL identity via `verifyIssue215Bootstrap` **before CREATE and before DROP**, and validates its generated owned database/role at cleanup. Both filenames are exact allowlisted in protected `api-postgres-issue215`; classification negative tests preserve fail-closed behavior. A second independent review identified test-only provider spoofing and cleanup issues: actual MinIO test now proves worker4's ignored fixture identity and secrets match, verifies live Docker pinned image digest, container ID, Compose labels, loopback port, tmpfs and no bind **before the first test DB CREATE**; fake-storage cleanup calls the protected DB close in a `finally` branch. New adversarial PG target tests **14/14 PASS**, MinIO identity negatives **15/15 PASS**, and the **final protected rerun executed 5/5 PASS** across fake-transport real-PG (3) and real-MinIO real-PG (2) files, 34.13s, zero skips, cleanup `db=0 roles=0 children=0`. Independent storage reviewer found no remaining confirmed P0/P1 test-target spoof/unsafe deletion in this local fixture. This closes identified test-target P1, while full Nest server process crash/other failure windows remain unproved.

## G. Performance and resource measurements

Only measured timings above are evidence; successful end-to-end JPEG decode, S3 PUT/GET/T1/STORED/T2/P3 preflight latency, peak memory and throughput must be measured in their real integration run. The photo-optional no-S3 path preserves existing P3 fail-closed guard behavior, but no real optional end-to-end latency comparison has yet been recorded.

### Exact suite results and commands

| Validation command (under the stated scoped environment) | Actual outcome | Cleanup/notes |
| --- | --- | --- |
| `pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/check-in-condition-command.integration.test.ts test/complete-check-in-command.integration.test.ts` | Exit 0; **76 pass, 0 fail, 0 skip, two files**; 17.14 s | Pinned disposable PostgreSQL16, db/roles/children **0/0/0** |
| `pnpm --filter @valet/database exec node ../../scripts/test-harness/run-postgres-projects.mjs vitest.config.mjs database-postgres-issue215` | Exit 0; **38 pass, 0 fail, 0 skip, eight files**; 49.58 s | Protected P1/P2 SQL, db/roles/children **0/0/0** |
| `node scripts/issue215-local-s3/run.mjs` | Exit 0; **6 pass, 0 fail, 0 skip, two files** | Real scoped MinIO 127.0.0.1, versioning, IAM; temporary objects removed by owned stop |
| `pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/issue215-staff-credential-races.test.ts` | Exit 0; **8 pass, 0 fail, 0 skip, one file** | Protected PG, db/roles/children **0/0/0** |
| Same protected API runner, `test/issue215-real-http-integration.test.ts`, `ISSUE215_REAL_HTTP_ENABLED=true` | Exit 0; **6 pass, 0 fail, 0 skip, one file**, final after exact business error assertions 17.21 s | Real Nest/PG/MinIO; db/roles/children **0/0/0** |
| Same protected API runner, `test/issue215-recovery.integration.test.ts test/issue215-recovery-real-s3.integration.test.ts`, opt-in verified with pinned PG and live MinIO | Exit 0; **5 pass, 0 fail, 0 skip, two files**, 34.13 s | Actual signed PUT/hard child kill/UNKNOWN, db/roles/children **0/0/0** |
| `node --test scripts/test-harness/issue215-api-classification.test.mjs scripts/test-harness/classification.test.mjs` | Exit 0; **16 pass, 0 fail, 0 skip** | Pure ownership classification tests, no DB |
| New pure recovery target tests | Exit 0; **29 pass, 0 fail, 0 skip** | 14 pinned PostgreSQL + 15 real MinIO identity negatives; no DB |
| Focused P2/P3 `api-non-postgres` twelve-file suite | Exit 0; **54 pass, 0 fail, 0 skip** | Unit/mock signed HTTP and JPEG; no real provider claim |
| `pnpm --filter @valet/contracts test` | Exit 0; **449 pass, 0 fail, 0 skip, 59 files** | No DB |
| API/Database lint/typecheck; `pnpm architecture:check`; `git diff --check` | Exit 0 on final correction | Only grandfathered legacy file-size warnings, Windows CRLF warnings |

The protected PostgreSQL runner needs an explicitly owned loopback `TEST_DATABASE_URL`, dynamically populated from the pinned `vaylet_issue215_p1_local` Docker container's task credential in memory. Protected recovery additionally requires explicit local opt-in and protected run identity; the S3 runner derives test secrets from ignored worker4 fixture files. These commands must **not** be pointed at arbitrary databases or production S3. Historical attempts (missing dotenv, invalid PG16 GUC, preflight/skipped cases, child import and target classifier failures) are reported in the stage-specific sections and are not included in the PASS totals.

### Teardown and leftovers

Final task-owned `node scripts/issue215-local-s3/stop.mjs` exited **0** and removed only the verified `issue215-s3-worker4` Compose container and its tmpfs/in-memory objects. `docker ps` afterward listed only the pre-existing task-owned PostgreSQL 16 container `vaylet_issue215_p1_local`, intentionally preserved. Read-only SQL inventory of `valet_004%`/`valet_215_%` test databases and `valet_runtime_%`/`valet_215_%` test roles returned **zero rows**. All final protected harness runs reported `db=0 roles=0 children=0`. No test-only MinIO container, public bucket or object remains; no deletion or mutation of unrelated developer services was requested or performed.

## H. Security review and outstanding risks

Independent read-only #283 domain/security source reviews inspected old Check-In history, P1/P2 exact Staff authorization and token-writer lock ordering; they found no confirmed new P0/P1 bypass at P3 base SHA, but could not certify concurrency without real tests. A separate independent final-diff review is required for the PostgreSQL 16 fallback, PG17 native behavior, cross-replica safety, private storage/versioning and final HTTP domain counts.

Four independent *review roles* were covered by source reviewers who did not author the specific material examined: (1) worker-2 audited prime's #287 PG16/PG17 lease/harness safety, identifying and prompting remediation of the PG17 guest native timeout regression and #285 test-target P1; (2) worker-1 audited worker-5's #283 exact Staff lock/race implementation and worker-7's #285 database target and MinIO provenance, identifying pinned-target/IAM identity and teardown issues; (3) worker-4 audited real private MinIO conditional/version/identity/IAM and worker-7's eventual recovery controls; (4) worker-5 independently audited worker-1's real Nest/PG/S3/Audit Check-In and cancellation correctness. Source review does not establish executed race coverage. Worker-3 and worker-6 slots failed to start; neither is presented as an independent reviewer.

Known functional edge: a condition marker from an earlier optional policy remains historical; later required policy correctly denies final Check-In, but P1 SQL prohibits a new verified upload after marker completion. An accepted operational recovery design is still needed. An unversioned private object cannot qualify P3; versioning is mandatory for this test fixture. Production qualification, retention and release authorization remain closed.

Additional adversarial findings are deliberately preserved: **P1 domain/liveness** — an optional marker becoming current-policy REQUIRED is denied indefinitely while P1 T1/T2 blocks later verification after marker, unless an approved policy reversal/recovery path is defined. **Potential pre-existing P1 cancellation credential TOCTOU** — cancellation controller currently resolves token to UserId once and cancellation transaction does not revalidate that exact StaffAuthSession after concurrent logout/refresh; this is outside the authorized P3 cancellation-change scope and requires separate real revocation-vs-cancel repro/disposition. **Test coverage gaps** — the six-case real HTTP suite does not exhaust I19–I24 or all error precedence, the real MinIO process-kill kills an owned uploader subprocess rather than a whole Nest server, and PostgreSQL 17 native timeout must be verified on an actual PG17 disposable server. No automatic issue closure follows.

## I. Acceptance matrix — update after final exact test runs

| Item | Development local verdict | Rationale |
| --- | --- | --- |
| #287 PostgreSQL fixture/harness | **GO for verified local PG16** | Final 76/76 Check-In and 38/38 protected SQL suites, cleanup 0/0/0; PG17 live version test remains |
| #282 Real local S3 | **GO for isolated MinIO interoperability** | 6/6 actual provider tests, private/versioned/SSE |
| #283 Credential concurrency | **GO for tested local PG16 concurrency** | 8/8 genuine protected PG races; no mocked revocation |
| #284 Full authenticated Nest integration | **GO for six local full-stack cases, wider matrix pending** | Real HTTP+Staff bearer+PG+private MinIO+P3/Audit 6/6 |
| #285 Crash-safe recovery | **GO for five tested local crash/UNKNOWN scenarios; broader lifecycle pending** | Protected target 14/14 negative guard checks, 5/5 real PG recovery (2 actual MinIO), cleanup 0/0/0 |
| Overall development security | **NO-GO for exhaustive Issue #215 acceptance** | Proven representative local paths, but I19–I24/cancellation/whole-process/PG17 and some hostile cases remain |
| Future production | **NO-GO** | No production server/provider, credentials, approval or release |

## Required follow-up evidence

After test completion, append exact commands, SHA, passed/failed/skipped counts, file counts, elapsed time, Docker+database identity, cleanup DB/roles/process counts and remaining S3 objects. Preserve original failed attempts as failures. Update #287/#282/#283/#284/#285 separately; do not close #215 or silently enable positive P3 production qualification.
