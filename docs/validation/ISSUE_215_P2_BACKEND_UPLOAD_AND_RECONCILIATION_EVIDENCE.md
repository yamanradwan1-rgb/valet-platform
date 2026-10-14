# Issue #215 — P2 Backend Implementation and Evidence

**Status: P2 REVIEWABLE CODE DELIVERED / SECURITY ACCEPTANCE AND PRODUCTION NO-GO.**
**Branch:** `codex/issue-215-p2-upload`.
**Starting merged P1 main:** `dbb0f8f3ae64bd5b42b22c521c5e52ca78f41e6d`.
**Authority:** [DEC-104](../decisions/DEC-104_VERIFIED_CONDITION_PHOTO_BYTE_EVIDENCE.md), [master plan](../plans/ISSUE_215_VERIFIED_CONDITION_PHOTO_MASTER_PLAN.md), and [P1 SQL handoff](ISSUE_215_P1_IMPLEMENTATION_AND_P2_HANDOFF.md).

This report separates verified P2 code/tests from **unverified real-provider, Staff-revocation race, CI and production criteria**. An implementation commit does not qualify Issue #215 for Check-In completion, deployment or issue closure.

## 1. Implemented source map

- **HTTP:** `apps/api/src/modules/check-in-api/condition-photo.controller.ts` declares four accepted routes; `condition-photo-auth.guard.ts` checks exact Staff bearer/current persisted scope and uses PostgreSQL-backed anti-abuse admission before multipart parsing; `condition-photo-ingress.ts` adds a process-wide limit of four buffered multipart uploads; `condition-photo-multipart.ts` parses one UUID field + one JPEG within bounded fields/parts/bytes/time and returns structured 400/413 on invalid streamed requests.
- **Scope and finalization:** `apps/api/src/modules/vehicle-photos/condition-photo-authorization.ts` calls `lockAndRecheckStaffSessionContext()`, then locks current User, membership, Organization/Location and explicit Location-access rows, deriving Org/Location from ValetSession. `condition-photo-transactions.ts` calls the approved parameterized P1 reserve/mark_stored/finalize/record_failure functions; SQLSTATE failures are mapped to bounded safe public errors.
- **JPEG:** `condition-photo-jpeg-decoder.ts` plus isolated `condition-photo-jpeg-worker.ts`: source/canonical SHA-256, EXIF rotation, metadata removal, full decode, canonical JPEG, 8MiB and 4096px/12MP bounds, 5-second worker termination, maximum two concurrent decodes.
- **Object storage:** `private-photo-store.ts` and `s3-private-photo-store.ts`: server-only S3 client, write-once conditional PUT, exact-version bounded GET/HEAD, read-back byte equality, opaque P1-generated keys; no delete through upload credentials. Feature is off by default; explicit production provider-approval flag is additionally required, **not** itself evidence of provider qualification.
- **Upload/recovery:** `condition-photo-upload-executor.ts` performs canonical decode → T1 → conditional PUT → exact read-back → committed STORED → T2 under exact current credential, with no PostgreSQL transaction held across object I/O. `condition-photo-reconcile-executor.ts` explicitly claims an expired lease, probes the exact object and performs authorized finalization; missing object yields bounded same-byte resend instruction. `condition-photo-status-query.ts` and `condition-photo-discovery-query.ts` are read-only with exact member/session scope and safe public DTO projection.
- **Durable anti-abuse:** new scope keys + `condition-photo-admission.ts` count 20 User starts / 60 Session starts and 120 User reads per 15 minutes in database transactions. Additive migration `20261015008100_issue_215_photo_anti_abuse_scopes` permits these scopes in the existing `anti_abuse_events_scope_check` while retaining old accepted scopes.
- **Telemetry/privacy:** four fixed operation route templates; no dynamic customer, image hash, object key, bucket or lease in responses/metrics; `Cache-Control: no-store` on new routes.

## 2. P1/P2 protection and scope

- **STRICT UI-FROZEN:** zero changes to Native, Employee Web, Dashboard, Customer, CSS, translation, navigation, appearance, QR, OCR or Android.
- **P3 remains untouched:** `FALSE AS qualifying_photo_present` in `check-in-condition-command.ts`; `qualifyingPhotoPresent` discovery conservatively reports `false` until P3 defines production-qualified availability/preflight semantics. Legacy metadata-only `VehiclePhoto` does not qualify.
- No new Shift prerequisite, no automatic upload replay, no client-directed S3 key/URL, no public gallery/download or Guest access.
- P5 independently approved orphan cleanup/holds, verified-object integrity worker and service-owned availability updates are **not implemented**.
- No production secrets, buckets, legal retention or provider identity were selected for the owner.

## 3. Verified checks (focused local evidence)

| Check | Result | What it proves / limits |
| --- | --- | --- |
| P2 API focused non-PostgreSQL suites | **37/37 PASS across nine files** | Includes real Nest HTTP, in-stream multipart 413, source/canonical JPEG, process ingress cap, SQLSTATE/53300 mapping, strict DTOs; backend mocked |
| Real Nest HTTP + strict multipart | **7/7 PASS within 37** | Authorized HTTP status/reconcile/discovery and errors, including 413 in-stream overrun, with mocked operation backend; no unhandled Busboy error |
| S3 SDK signed conditional PUT/GET/HEAD | **1/1 PASS within 37** | Real loopback HTTP transport with test-only S3-shaped server; fake auth server, **not provider IAM/S3 interoperability proof** |
| Protected Issue #215 PostgreSQL project after additive migration | **38/38 PASS in eight files** | Actual explicitly pinned disposable PG16; schema, P1 integrity/roles and 3/3 new anti-abuse scope tests |
| PostgreSQL protected cleanup | **db=0, roles=0, children=0** | No tracked leftover test resources after owned runner |
| API lint/typecheck and architecture | **PASS on final focused checks** | Static correctness and authored 300-line code-file policy, not runtime concurrency |
| API-wide non-PostgreSQL run | **FAIL: 707/715 PASS, 8 FAIL** | Mostly historical fixed-count/feature-owner expectations already stale on baseline. New Check-In controller adds to the existing stale Check-In ownership expectation; not a green full-suite result |

Focused tests run on a local task-owned database only. Exact branch commit SHA and final rerun evidence must be recorded after the final change. No real S3/MinIO deployment-provider test was possible with the currently provided infrastructure; local fake HTTP server **does not validate SigV4/IAM policy**. The official MinIO registry image could not be retrieved in this environment (registry/access errors).

## 4. Known deficiencies / NO-GO release gates

1. **P2-AUTH-001 — not independently proved:** exact Staff bearer T2 read locks exist in code; however no complete two-transaction tests using real concurrent refresh, logout, credential/user/membership/location revocation vs T2 and two API replicas have passed. Explicit lock graph/finalizer-first and revoker-first proofs are required before any deployment enablement. Never treat passing P1 SQL integrity as this proof.
2. **Real provider not qualified:** provider and owner were not supplied. Must test real private S3-compatible bucket, conditional If-None-Match/version behavior, per-attempt exact GET/hash, anonymous denial, least-privilege IAM/no-delete, timeout/lost-ack recovery, encryption, and approved config. Production remains OFF by default.
3. **Integrated HTTP→restricted-runtime PG→private S3→audit not independently proved:** current HTTP test replaces backend with a fixture, while actual P1 PostgreSQL and S3 SDK transport tests are separate. Need full end-to-end and forced-crash/unknown-state replication proof.
   The S3 SDK loopback fake server does not prove actual provider IAM, authorization or encryption. Missing objects during reconciliation return bounded WAIT rather than blindly authorizing a same-byte resend without qualified strong read-after-write/consistency evidence.
4. **P2 REJECTED contract:** malformed/corrupt uploads are rejected *before T1*; the current backend never forges a terminal REJECTED row after unknown storage outcomes. No arbitrary runtime status mutation was added. If a durable post-T1 permanent rejection path becomes necessary, it requires narrow forward-only SQL/ACL and separate review, not direct writes.
5. **Broader baseline suite/CI debt:** API non-PG `707/715` with 8 failing fixed-count expectations (Guest routes/audit type counts and module ownership). P1 also retained an unrelated legacy Audit Foundation migration-count expectation and incomplete main GitHub CI evidence. Do not relabel FAIL as PASS.
6. **P3–P6 unresolved:** Check-In completion qualification, Native UI, retention/integrity worker and physical Android acceptance are later phases.

## 5. Lock boundary and recovery design

- T1: persisted exact-current StaffAuthSession recheck + active User and tenant/location/membership/access share locks → P1 user-wide admission row → locked ValetSession → P1 scoped operation/attempt lease. Commit **before** any S3 network operation.
- Storage: conditional write-once PUT and exact byte read-back entirely outside DB transactions; P1 mark_stored stores canonical facts with the current fenced lease.
- T2: same exact StaffAuthSession/access-hash/createdAt recheck + full persisted authority/share locks → locked ValetSession → P1 locked operation/attempt; P1 finalize atomically writes selected attempt, verified evidence, AVAILABLE record and `CHECK_IN_CONDITION_PHOTO_VERIFIED` ValetSession AuditEvent. **Current design needs independent refresh/logout/revoke lock-graph test.**
- Failure/unknown PUT: P1 safe failure code under current lease where allowed; no guessed absence, direct deletion or automatic replay.
- Reconcile POST: original authorized membership with a fresh current credential can claim a stale attempt; status/discovery GET never finalizes. Unknown and live leases are not silently superseded. STORING is not evidence; finalization requires exact byte/read-back match.

## 6. Owner handoff

**Reviewable code may be committed and pushed to the isolated P2 branch, but P2 feature acceptance remains NO-GO:** no real private provider qualification, no integrated runtime Staff revocation/race proof, no certified end-to-end S3/SQL/audit, and not green full suite. Do not represent reviewer code-level GO as production GO. No PR, no merge, no APK, no production migration, no issue closure. To achieve P2 security GO, obtain the missing approved private provider credentials/config/environment and run reproducible auth-revocation + full HTTP/PG/storage adversarial suites, fix resulting defects and obtain final independent review.
