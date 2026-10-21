# VAYLET #309 — W7 proposed photo database authorization and release security decision

**Status: PROPOSAL ONLY / NOT ACCEPTED / PRODUCTION PHOTO VIEW NO-GO.**
**Date:** 2026-10-21. **Author:** W7 independent security QA. **Source base:** 459e9c42dfff5b2aeb11ee9165a7d1a4338a7783; W4 API source 2e15f283 (integrated as e6df7b73); W3 production view gate 705e2326; W5 PG17/MinIO report docs/validation/issue-309/w5-private-pg17-minio-qa.md. This document is a *forward-only migration and authorization design specification*, **not** a migration, permission grant, IAM change, production authorization or deployment instruction. No database was changed by W7. Owner acceptance, independent DB/security review and separate rollout authorization remain mandatory.

## 1. Observed failures, precise source of truth

1. **Hard P1 — admission fails before photo authorization: SQLSTATE 23514.** W4 adds TypeScript AntiAbuseScope v1:dashboard-session-photo-view-user at apps/api/src/modules/anti-abuse/anti-abuse-key.ts:5-9 and calls AntiAbuseService.count at apps/api/src/modules/dashboard/session-photo-admission.ts:17-21. AntiAbuseService.countInTransaction inserts COUNTED into public.anti_abuse_events (anti-abuse.service.ts:195-218), whose latest CHECK is packages/database/prisma/migrations/20261015008100_issue_215_photo_anti_abuse_scopes/migration.sql:4-20. That constraint contains the three existing condition-photo upload/status scopes but **not** the Management-view scope. The real restricted-role PostgreSQL 17 probe failed with constraint anti_abuse_events_scope_check, SQLSTATE 23514. Actual HTTP returned 503 before the candidate finder or grants could be tested. No schema change or workaround is yet deployed.
2. **Hard P1 — final row fence fails: SQLSTATE 42501.** apps/api/src/modules/dashboard/session-photo-query.ts:104-152 performs SELECT ... FOR SHARE OF v,o,a,availability on public.vehicle_photo_verifications, public.condition_photo_upload_operations, public.condition_photo_upload_attempts and public.vehicle_photo_availability. packages/database/scripts/condition-photo-runtime-privileges.mjs:43-51 and :74-107 explicitly deny INSERT/UPDATE/other writes and grant runtime SELECT only. W5 proved with real PG17 that UPDATE privilege is false and even SELECT ... WHERE FALSE FOR SHARE fails with 42501 on **each of the four tables**. The successful authenticated byte path cannot run with current runtime credentials after the scope CHECK is addressed. Granting runtime direct UPDATE/column UPDATE is **not** an acceptable fix.
3. **Separate owner authorization stop:** apps/api/src/modules/dashboard/session-photo-authorization.ts:27-47 deliberately returns null through the production entry point. The hypothetical ORG_ADMIN/LOCATION_MANAGER policy is test-only. An API/DB repair must **not** alter that denial, infer permission from Dashboard access, or make photo VIEW live. DEC-104 authorized employee capture/upload, not Management read.
4. **Independent HTTP/transaction semantic gap:** session-photo-service.ts:192-211 calls synchronous deliverSync while final READ COMMITTED transaction locks are held, controller.ts:99-110 uses res.end(bytes), and common/database/postgres-transaction.ts:36-42 only issues COMMIT **after** the callback returns. COMMIT can then fail with already-queued bytes. An HTTP response cannot be withdrawn or converted to a 404/503 after headers/bytes are sent. This is a **P1 decision/proof gate**, independent of 23514 and 42501.

W5 source proof: test/issue309-photo-viewer.integration.test.ts has five cases; test/issue309-photo-grant-race.integration.test.ts has two. All **7/7 acceptance cases currently FAIL**, because the admission failure preempts the intended real auth/race assertions. Six existing #215 real HTTP integration cases pass (6/6) and do **not** qualify #309. W5 uses isolated PG17 restricted runtime and private versioned MinIO, and test-only DI to exercise hypothetical role approval; its fixture cannot authorize production.

## 2. Proposed forward-only schema migration A: narrow anti-abuse scope extension

**Separate future owner-reviewed migration, never edit/replay the applied #215 migration.** Base new migration on the actual CHECK at 20261015008100_issue_215_photo_anti_abuse_scopes/migration.sql:7-19. Preserve **all** existing enumerated scopes, states, HMAC key-format constraint, indexes and existing rows; add **only** v1:dashboard-session-photo-view-user. The precise candidate CHECK replacement is:

~~~sql
-- REVIEW EXAMPLE ONLY. New, uniquely numbered forward-only migration.
-- Install BEFORE code that emits the new anti-abuse event scope.
BEGIN;
SET LOCAL lock_timeout = '2s';
ALTER TABLE public.anti_abuse_events
  DROP CONSTRAINT anti_abuse_events_scope_check;
ALTER TABLE public.anti_abuse_events
  ADD CONSTRAINT anti_abuse_events_scope_check CHECK (
    scope IN (
      'v1:staff-login-identifier', 'v1:staff-client-address',
      'v1:guest-client-address', 'v1:guest-token', 'v1:guest-enrollment-address',
      'v1:handoff-issuance-session', 'v1:handoff-verification-session',
      'v1:mfa-totp-user', 'v1:mfa-recovery-user',
      'v1:staff-onboarding-create-organization',
      'v1:staff-onboarding-resend-membership',
      'v1:staff-activation-credential', 'v1:staff-activation-client-address',
      'v1:shift-presence-challenge-user', 'v1:shift-presence-exception-user',
      'v1:shift-presence-status-user',
      'v1:condition-photo-upload-user', 'v1:condition-photo-upload-session',
      'v1:condition-photo-status-user',
      'v1:dashboard-session-photo-view-user'
    )
  );
COMMIT;
~~~

**Preflight/operations:** assert pg_get_constraintdef of the live CHECK equals the reviewed source definition; abort on unknown scopes or newer migration drift instead of replacing an evolved whitelist. Use the normal locked, migration-owned deployment process; short lock_timeout guards ALTER TABLE's ACCESS EXCLUSIVE lock impact. A failed transaction rolls back both DROP and ADD; do not disable triggers/constraints and do not mark migration applied manually. Count and compare prior accepted scope rows, verify the new CHECK is validated (pg_constraint.convalidated), probe one new-scope COUNTED insert and rollback in isolated PG17 under the restricted runtime role, and verify malformed keys, arbitrary scopes and PENDING/COUNTED/IGNORED invariants still reject as before. Retain HMAC anonymization; never create a public per-photo identifier column or new unbounded request log. Runtime role already has necessary anti-abuse write privilege for recognized scopes; **no new anti-abuse GRANT** is proposed.

**Ordering:** deploy migration A compatibly with existing application (superset constraint); independently prove old scopes still pass. W3 still deny-by-default, so migration alone does not enable viewing.

## 3. Proposed forward-only DB lock capability B: SECURITY DEFINER, exact-row, read-only-in-effect

**Threat boundary:** calling code **must** already hold current W3 Staff user/session/MFA, commercial entitlement, Org/Location/membership/LM grant locks in its own READ COMMITTED transaction and reauthorize the exact ValetSession after S3. A DB helper is a **row-lock capability**, not a principal authorization helper. Its boolean return is not sufficient for HTTP release, cannot be used from unauthenticated routes, cannot generate S3 keys, and must not return a row, object key, URL or digest. The function must execute as the existing trusted database migration/photo-function owner (or independently approved dedicated NOLOGIN function owner with the strictly required private table privileges), never as the API runtime role. Do not introduce a BYPASSRLS/login owner or use a maintenance function as a substitute.

**Proposed exact signature:** public.condition_photo_lock_verified_for_management_view(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea,integer,text,text) RETURNS boolean. Ordered parameters: photo_id, organization_id, location_id, valet_session_id, operation_id, attempt_id, captured_by_membership_id, object_key, content_sha256, byte_size, bucket_alias, object_version. UUID values and all evidence fields come from the server-side reselected verified candidate, **never directly from query/body, a client-supplied object locator, or previously cached manifest**. Proposed self-contained SQL definition, to be independently reviewed and run **only in an owner-approved separate migration**:

~~~sql
-- REVIEW EXAMPLE ONLY: NOT APPLIED / NOT AUTHORIZING PHOTO VIEW.
BEGIN;
CREATE FUNCTION public.condition_photo_lock_verified_for_management_view(
  p_photo_id uuid, p_org_id uuid, p_location_id uuid, p_session_id uuid,
  p_operation_id uuid, p_attempt_id uuid, p_member_id uuid,
  p_key text, p_digest bytea, p_size integer, p_bucket text, p_version text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_photo_id IS NULL OR p_org_id IS NULL OR p_location_id IS NULL
     OR p_session_id IS NULL OR p_operation_id IS NULL
     OR p_attempt_id IS NULL OR p_member_id IS NULL
     OR p_key IS NULL OR p_digest IS NULL OR octet_length(p_digest) <> 32
     OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 8388608
     OR p_bucket IS NULL OR p_bucket = ''
     OR p_version IS NULL OR p_version = '' THEN
    RETURN FALSE;
  END IF;

  PERFORM 1
    FROM public.vehicle_photo_verifications AS v
    JOIN public.condition_photo_upload_operations AS o
      ON o.id = v.operation_id AND o.status = 'VERIFIED'
     AND o.verified_photo_id = v.vehicle_photo_id
     AND o.purpose = v.purpose
     AND o.organization_id = v.organization_id
     AND o.location_id = v.location_id
     AND o.valet_session_id = v.valet_session_id
     AND o.actor_membership_id = v.captured_by_membership_id
    JOIN public.condition_photo_upload_attempts AS a
      ON a.id = v.attempt_id AND a.operation_id = v.operation_id
     AND a.status = 'SELECTED' AND a.object_key = v.object_key
     AND a.organization_id = v.organization_id
     AND a.location_id = v.location_id
     AND a.valet_session_id = v.valet_session_id
     AND a.actor_membership_id = v.captured_by_membership_id
     AND a.canonical_sha256 = v.content_sha256
     AND a.canonical_byte_size = v.byte_size
     AND a.bucket_alias = p_bucket AND a.object_version = p_version
    JOIN public.vehicle_photo_availability AS availability
      ON availability.vehicle_photo_id = v.vehicle_photo_id
     AND availability.organization_id = v.organization_id
     AND availability.location_id = v.location_id
     AND availability.valet_session_id = v.valet_session_id
     AND availability.state = 'AVAILABLE'
   WHERE v.vehicle_photo_id = p_photo_id
     AND v.organization_id = p_org_id AND v.location_id = p_location_id
     AND v.valet_session_id = p_session_id
     AND v.operation_id = p_operation_id AND v.attempt_id = p_attempt_id
     AND v.captured_by_membership_id = p_member_id
     AND v.purpose = 'CHECK_IN_CONDITION'
     AND v.object_key = p_key AND v.content_sha256 = p_digest
     AND v.byte_size = p_size
   FOR SHARE OF v,o,a,availability;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.condition_photo_lock_verified_for_management_view(
 uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea,integer,text,text) FROM PUBLIC;
COMMIT;
~~~

**Review before implementing:** body and 12-argument ordering must exactly match the existing W4 final lock query and the source selector (condition-photo-qualified-receipt.ts:41-103); compare schema/enum casts and execution plan against live PG17. Confirm trusted function owner is not the runtime role and can legitimately acquire SHARE locks on all four private tables. The function contains no dynamic SQL, DML, session setting, calls to upload/maintenance functions, or uncontrolled search_path. No SECURITY DEFINER from HTTP username/role claims. Probe malformed/NULL/foreign/session/photo/version/digest/availability inputs => FALSE with zero metadata, no exception detail leak. SQL SECURITY DEFINER is **not a photo VIEW entitlement**: SQL runtime role already has SELECT but this function should only add the narrow lock operation. Ensure missing rows and competing writers do not cause unbounded wait (existing request/transaction deadline; reviewed SET LOCAL lock_timeout policy at caller). Validate behavior under pg_cancel_backend, server disconnect and deadlocks.

**Explicit minimum EXECUTE privilege wiring (separate approved source/change):** append the exact signature above to the photoRuntimeFunctions whitelist in packages/database/scripts/condition-photo-privilege-policy.mjs, **only after** final SQL/role review. The existing provisionConditionPhotoRuntimePrivileges in condition-photo-runtime-privileges.mjs:43-71 should revoke PUBLIC and runtime permissions first and then grant EXECUTE on that one function to the named restricted API runtime role, with no grant option; keep TABLE SELECT-only. Its verifyConditionPhotoRuntimePrivileges:74-161 must assert every private table runtime can_write=false and can_write_column=false, PUBLIC permissions denied, the new function proconfig exactly search_path=pg_catalog, public, security_definer=true, owner != runtime role, PUBLIC EXECUTE=false and only approved runtime EXECUTE=true. Test a different arbitrary role (and PUBLIC) cannot execute, and helper owner has minimum requisite privilege. Keep all maintenance-only functions non-executable by runtime; **never** add helper to the maintenance allowlist or give runtime EXECUTE on those functions. Verify no function-name prefix scan unexpectedly grants an unreviewed overload.

**Required W4 integration (later, separately reviewed):** change only final transaction lock invocation in session-photo-query.ts from direct FOR SHARE to SELECT public.condition_photo_lock_verified_for_management_view($1::uuid,...,$12::text) AS allowed using the same ordered candidate/tenant parameters, require allowed === true, retain pre-S3 and post-S3 W3 authorizations, selected candidate equality check, exact version/size/SHA256, and final synchronous release fence. **No** function call in the initial manifest path and **no** S3 I/O while locks held. No direct UPDATE grants and no modifications to existing #215 upload/native/maintenance logic. Stage B together with the reviewed privilege-policy whitelist/provisioner change: the current catalog verifier checks unknown condition_photo_ functions for denied runtime/PUBLIC EXECUTE, but does **not** reject a correctly ungranted unlisted helper solely for being unlisted. Provisioning removes its runtime EXECUTE until its exact signature is allowlisted and explicitly granted. Install and verify this compatible pair while W3 continues to DENY. Do not activate W3 VIEW policy in the migration or API integration.

## 4. Transaction/writer interoperability contract — required real PG proof

The helper's SHARE row locks must be acquired **in the caller's second READ COMMITTED transaction** *after* S3 readExact and after reauthorization; they survive function return **until caller COMMIT/ROLLBACK**. PL/pgSQL function execution does not independently commit. The caller also keeps W3 shared advisory/session/MFA/org/Location-grant locks throughout that same transaction. Confirm all supported revokers and security writers take **conflicting** locks before their commit. Specifically:

| Concurrent operation | Existing database path | Required demonstrated ordering |
| --- | --- | --- |
| Revoke Staff login/session/MFA | live-history-read-authorization.ts:68-101 and canonical #315 security mutation writers | Revoker-first reader blocks at shared Staff/session fence, then sees denial; reader-first writer waits through byte **enqueue** |
| Remove LM Location grant / disable Org/Location/entitlement | live-history-read-authorization.ts:130-258 and management grant/exclusive advisory writer | Management org exclusive advisory conflicts with reader shared; no stale Location authority after writer commit |
| Downgrade AVAILABLE to UNAVAILABLE via employee | 20261014008000_issue_215_verified_condition_photo_p1/migration.sql:986-1045, condition_photo_set_availability takes FOR UPDATE on availability row | Revoker-first final helper locks then returns FALSE; reader-first update waits while helper holds SHARE, then commits |
| Integrity maintenance tombstone | 20261015008500_issue_215_p5_photo_integrity_system/migration.sql:45-92, condition_photo_maintenance_mark_unavailable obtains FOR UPDATE | Same AVAILABLE-row serialization; runtime must not receive maintenance EXECUTE |
| Append/select/finalize/attempt mutation | 20261015008300_issue_215_condition_photo_policy_recovery_finish/migration.sql:200-248 and existing selected immutable joins | Selector and helper must agree on VERIFIED/SELECTED and exact tenant/object evidence; lock ordering and concurrent finalize under real PG |

**Lock hazard review:** availability writer takes FOR UPDATE, so FOR KEY SHARE is **insufficient** for state changes and may permit downgrade before enqueue; do not weaken to KEY SHARE or a plain SELECT. A multi-table FOR SHARE join does not document a deterministic tuple lock order: test deadlock cycles (especially maintenance's availability-first workflow and upload finalization). If deadlock SQLSTATE 40P01 or lock timeout 55P03 occurs, deny/fail closed without releasing bytes, never retry after a response is queued. Canonical DB admin/raw privileged mutations that bypass the supported advisory/row-lock protocol lie outside this guarantee; require a documented operational control for such writes.

## 5. HTTP response-before-COMMIT ambiguity: owner policy gate, not a solved atomic commit

**Current sequencing:** authorization + helper locks + synchronous res.end(buffer) inside transaction callback, *then* inPostgresTransaction calls COMMIT. This gives a precise candidate read **enqueue point** while locks are held, but does **not** make HTTP delivery atomic with COMMIT. A socket may flush/deliver bytes while the DB transaction has not committed. After res.end, a COMMIT exception (connection reset, timeout, cancellation, injected exception, in-doubt commit) must not cause a second JSON error write, a false denial claim, or a second delivery. A successful HTTP response does not prove a committed read-only transaction, and the system cannot recall already received bytes.

**Decision A, proposed if Owner accepts enqueue-linearization:** define read authorization to linearize at *synchronous first byte enqueue under held locks*. Revocation committed after that point may not retroactively recall bytes; revoker-first must prevent enqueue. COMMIT success **is not** represented to client as a guarantee of revocation timing. Instrument internally after COMMIT if available; when post-enqueue COMMIT fails, mark a security/operational fault, do not write an alternate HTTP response, and do not claim a retry is safe. Bound response and DB lock hold times; include exact audit/retention expectations. This requires a positive Owner/security decision before release.

**Decision B, if Owner insists on COMMIT-success-before-bytes and a strict no-read-after-revoke guarantee:** current algorithm cannot satisfy both requirements as written. Reject release, re-architect and independently verify a cross-transaction writer/read fence, post-commit authority epoch/lease or equivalent ordering protocol. Simply moving COMMIT before res.end reintroduces a revocation gap. Do **not** describe this as an innocuous controller bugfix or treat unit-test mocks as proof.

**Fault-injection protocol (private PG17 + real Nest HTTP; no production):**
1. Instrument exact internal phases (before final W3 auth; final helper lock held; before res.end; after synchronous enqueue; before COMMIT; commit outcome; HTTP finish/close) with correlation IDs but **no** photo key or image body in logs.
2. Inject SQLSTATE 23514, 42501, lock_timeout 55P03, deadlock 40P01, connection close before final lock, and explicit COMMIT failure **after** enqueue. Ensure pre-enqueue failures produce only controlled no-store/non-JPEG errors, no bytes and no second status write.
3. For post-enqueue COMMIT failure, assert no write-after-end/no uncaught double-send, response completion/error captured, reservation released exactly once via finish/close (plus exceptional path), no disclosure of internal SQL, table, bucket or keys. Treat physically delivered bytes as possible regardless of the final HTTP client error.
4. Reproduce reader-first and writer-first for entitlement/grant/MFA/AVAILABLE downgrades with controlled barriers and real pg_stat_activity wait evidence, for both manifest and bytes; assert authorized **enqueue** ordering, not impossibly retroactive deletion. Repeat with 2+ API instances and independent connections.
5. Confirm abnormal socket close, slow client/backpressure, S3 timeout, provider 404/412/version mismatch and simultaneous revocation do not hold a DB transaction across S3 and do not leak a lingering quota slot or Buffer; no streaming/await of socket completion under database locks.

## 6. Private versioned S3/MinIO/IAM gate (separate from DB authorization)

Current adapter apps/api/src/modules/vehicle-photos/s3-private-photo-store.ts:89-110 calls GetObject with **explicit VersionId**, hard-bounds returned bytes to 8 MiB and checks returned version; W4 also verifies verified selected evidence byte size, SHA256, bucket alias and non-empty version. Server constructs key only from validated exact persisted evidence. condition-photo-storage-config.ts:13-42 requires deployment-owned bucket/alias/endpoint, HTTPS outside isolated loopback tests and explicit CONDITION_PHOTO_STORAGE_PROVIDER_APPROVED=true outside test. **That boolean is a configuration gate, not owner IAM/provider approval.**

Before any true VIEW role, Owner + Infra must record named provider and environment, bucket region, versioning enabled/locked configuration, transport/TLS and encryption requirements, KMS policy if used, replication/backup/restore, integrity checks, retention/legal hold and disposal, operational monitoring, and incident handling of unavailable/tampered stored versions. Proposed minimal **dedicated photo-delivery read identity**: only exact versioned object read (s3:GetObjectVersion; provider-specific minimal GetObject permission only where proven required) for approved private bucket's condition-photo/* prefix, no ListBucket, PutObject, DeleteObject, DeleteObjectVersion, PutBucketPolicy, PutObjectAcl, public ACLs, or presigned browser access; prohibit anonymous bucket reads and object URL exposure. Keep upload's writer identity and maintenance cleanup credentials separated; current shared app credentials must be **inspected rather than assumed** to meet this split. Verify endpoint cannot be client-overridden and cannot reach arbitrary hosts. Execute real MinIO version-specific GET, wrong/missing version, wrong digest/size, access denied and disappeared-object tests under independently provisioned least-privilege credentials; inspect provider IAM and audit trail. No download or photo metadata fields in manifest beyond photoId, verifiedAt, image/jpeg.

## 7. Fleet-wide admission and failure-mode bounds

Current Management scope is independently durable: 120 requests/user in 15 minutes via PG anti-abuse, *but it fails 23514 until migration A*. W4's Map counters allow **2 concurrent byte buffers per user and 4 total per API process only** (session-photo-admission.ts:11-39), held until HTTP finish/close. With N replicas, worst-case API admission can reach 4N simultaneous stored images, with source + copied response Buffers (each up to 8 MiB) plus response/socket buffering; no global cross-replica bound follows from local maps. This is **P1 or P2 by fleet limit and observed memory/latency**, unresolved; do not claim 4-global at fleet scope.

Required Owner/Infra selection: (a) explicit bounded replica count, ingress concurrency and memory allocation with proven adverse-load envelope, or (b) a reviewed shared distributed semaphore/lease (PG/Redis) with atomic acquire and bounded TTL, active renewal through slow HTTP finish, crash recovery, per-user and fleet-global limits, denial on backend failure, and no holding a SQL row lock throughout S3/network I/O. Separate quota failures (429; policy TBD whether Retry-After), provider errors (503), hidden resources (uniform 404), and unsupported auth (deny). 120-count must remain independent from employee CHECK_IN upload/status quota; test budget saturation, simultaneous manifest+bytes, 429 across replicas, server crash, abandoned slow client, lease expiry and cleanup. No implicit production replica/IAM/RateLimit provisioning is approved here.

## 8. Acceptance plan: turn observed #309 7/7 failed into meaningful real green

All steps below must run on W5's **fresh isolated, migrated PostgreSQL 17 with restricted API runtime**, and private versioned MinIO with separately scoped credentials. Confirm test-only LOCATION_MANAGER hypothetical role DI remains test-only; production W3 default-deny is also explicitly tested and cannot be bypassed by a feature flag.

| Stage | Proof / expected evidence | Go criterion |
| --- | --- | --- |
| Schema A | New scope INSERT under restricted runtime; old anti-abuse scope sampling; malformed key/state/scope rejection; pg_constraint.convalidated | SQLSTATE 23514 gone **only** for new approved scope; no whitelist regression |
| DB function B | PG catalog proowner/prosecdef/proconfig/proacl, PUBLIC denies, table privilege matrix, runtime EXECUTE exact new function only | FOUR private tables remain SELECT-only, UPDATE=false; no runtime maintenance function execution; boolean helper locks succeed under real runtime PG17 |
| Auth isolation | Test-only hypothetical CA/LM with real active Staff bearer/MFA, source role, tenant/org/location/session/Location grant checks; normal W3 always-deny path | No role inheritance, cross-tenant/session/photo/forged metadata, unauthorized 200 or exposed S3 locator |
| W5 positive #1 | viewer.integration:42-96 VERIFIED+SELECTED+AVAILABLE and exact persisted version/size/digest, JPEG returned | 200 + exact SHA + no-store; manifest contains only approved display metadata |
| W5 negative #2 | viewer.integration:98-122 foreign tenant, wrong session, wrong photo, absent grant | 403/404 uniform; no private bytes/keys/versions |
| W5 grant #3 | viewer.integration:123-146 grant revoked then manifest and bytes | Both denied, no JPEG after writer commit |
| W5 concurrency #4 | viewer.integration:147-167 four simultaneous manifest/bytes requests | Four intended authorized responses under limits; one immutable verification row |
| W5 availability #5 | viewer.integration:169-190 AVAILABLE -> UNAVAILABLE | Manifest empty; bytes denied even if object remains in S3 |
| W5 race #6-7 | grant-race.integration:42-82 writer-first exclusive org advisory, both manifest and bytes, real pg_stat_activity waiter | Wait observed; writer COMMIT precedes denial; no stale JPEG |
| Added mandatory race | reader-first enqueue vs revoker, employee availability and maintenance writer; timeout/deadlock/rollback; COMMIT-after-end fault | Owner-chosen linearization proved with no uncontrolled post-end error |
| Provider/IAM | wrong/missing VersionId, digest/size, disappearing object, private GetObjectVersion, bucket deny/anonymous deny | No JPEG on error; no privilege escalation or keys in response/log |
| Capacity | local and multi-replica admission 429; slow clients; early disconnect; crash/lease cleanup; 8 MiB max and copy count | Measured bounded resources, release once, quota separate from #215 |
| Regression | Existing #215 PG+MinIO HTTP 6/6, privilege-policy enforcement, API and Dashboard compile/lint/arch/tests, Chrome UI-FROZEN 96-case suite | No upload/native/gallery visual regression, no new unowned product modification |

**Critical sequencing:** migration A and B, test-only API wiring and acceptance tests **do not** approve VIEW. First get 7/7 real green with test-only policy against actual restricted PG/MinIO, plus newly required faults/IAM/load; independently review authorization diff and owner decision. Only then may a separately authorized security change replace default denial; require a further explicit deployment approval. Any future fixture that bypasses SQL CHECK, gives runtime UPDATE/owner rights, mocks S3 or uses direct database admin privileges **does not count** as real green.

## 9. Open Owner/Security/Infra/DB decisions — ALL UNRESOLVED

| Gate | Decision to record (not assumed) | Current state / owner |
| --- | --- | --- |
| Q309-01 principal matrix | CA only? CA + explicitly granted LM? Supervisor? employee? deny former staff/guest; access to captured photos | **Unapproved** — product Owner + Security; default DENY all |
| Q309-02 MFA/current session | CA MFA current factor/session; LM MFA requirement and assurance age; password/session/revoke behavior | **Unapproved** — Owner + Security |
| Q309-03 session/history/retention | historical completed session visibility, inactive Organization/Location, delegated Location scope, contractual photo retention/deletion | **Unapproved** — Owner + Privacy |
| Q309-04 image delivery model | Protected authenticated bytes only vs alternatives; enqueue revocation linearization, audit, no-store, evidence retention | **Unapproved** — Owner + Security |
| DB-A | New anti-abuse scope CHECK superset and safe short-lock schema rollout | **Not implemented/approved** — DB owner |
| DB-B | Exact row-lock SECURITY DEFINER signature/body/owner and EXECUTE-only runtime; lock order, advisory/writer compatibility | **Not implemented/approved** — DB owner + Security |
| HTTP-L | Accept **res.end before COMMIT** enqueue as linearization, or demand a redesigned commit-safe protocol | **Unapproved P1** — Owner + Security + API |
| Storage | Named private versioned S3/MinIO, real read IAM identity, encryption/versioning, audit, backups, retention, incident process, DEC-104 U-005 | **Unapproved** — Owner + Infra/Privacy |
| Capacity | Per-process vs fleet global concurrency, memory budget, load envelope, distributed semaphore/lease if needed | **Unapproved** — Owner + Infra |
| Release | W5 genuine 7/7 and new negative/fault tests, independent security GO, separately reviewed production role activation, final Owner release approval | **NO-GO** — Owner |

**Non-actions:** do not execute the SQL in this proposal, update applied migrations, grant SELECT/UPDATE broadly, grant maintenance EXECUTE, patch source code, enable hypothetical test policy or production VIEW, mutate IAM/MinIO, push, merge or deploy. This document authorizes none of these steps.

## 10. Independent last look at Prime HEAD 58529ab (2026-10-21)

**Read-only source review; W5 real PG17/MinIO tests were not repeated.** The proposed 12-argument order, evidence columns and `FOR SHARE OF v,o,a,availability` predicates match current `session-photo-query.ts:104-153` and the applied #215 table schema. The example is nevertheless **unapplied and unvalidated** as a real restricted-role `SECURITY DEFINER` grant. It is a narrowly scoped row-lock capability, not Staff authorization; an application-SQL injection with runtime EXECUTE could potentially misuse it for lock contention. Require a trusted non-runtime function owner, exact allowlisted EXECUTE signature, short lock timeout, PG role/permission verification and real concurrent writer tests. The hardened API must always perform W3 authorization and post-S3 evidence checking independently.

**New P1 — late registration of response `close` can strand the in-flight slot.** `session-photo-service.ts:195-205` reserves a per-replica byte slot *before* async S3 `readExact`, while `session-photo-controller.ts:106-115` registers `finish`/`close` release callbacks only inside `deliverSync` after S3 and final SQL. If the client closes during provider I/O, the response may emit its sole `close` *before* listeners are installed. A local ephemeral Node `ServerResponse` test reproduced `destroyed=true` before late `end()`, `close=1` before callback, subsequent `close=0`, `finish=0`, `writableEnded=true`. `service.ts:235-247` then sets `queued=true`, skipping its `finally release`; subsequent late callback events never reclaim the slot. Two aborted reads can exhaust a user, four a replica, blocking otherwise permitted reads until restart. This is distinct from the existing Owner-required DB and commit semantics and is a feasible narrow unprivileged W4/API correction.

**Recommended correction, not implemented here:** in the response enqueue callback check `response.destroyed` and `writableEnded` **before** sending JPEG and immediately release if closed; install the idempotent `finish`/`close` handlers and recheck `destroyed`/`closed` immediately afterward to avoid a missed event, never `end` or set image headers on a closed connection. Prefer propagating a request abort signal to cancel S3 work early while keeping the existing protected read, current quota contract and exact locked enqueue ordering. The controller must avoid any second response/error write to a closed socket and the admission release must run **exactly once** across early abort, normal `finish`, `close`, callback throw and post-send COMMIT failure.

**Required focused evidence:** simulate a real HTTP client closing *before* delayed S3 completes, then assert zero late JPEG/JSON, slot restored and next request admitted; simulate `close` between guard and listener registration, `finish` plus `close`, immediate `end` throw, slow-reader backpressure and COMMIT-after-enqueue failure. Current `issue309-session-photo-controller-commit.test.ts:95-188` has four useful controller-level mock cases but no pre-callback-abort case. Its existing `session-photo-controller.ts:117-137` guard already prevents double JSON after JPEG `end`, aborts header-only streams and logs sanitized metadata. **Do not repeat/refactor this already-fixed behavior**; it does not make `res.end` and SQL `COMMIT` atomic. Owner/Security still must explicitly accept enqueue-time linearization or require redesign.

**Other gates unchanged:** latest live-test evidence remains W5 23514 new durable budget scope and 42501 private `FOR SHARE` on four SELECT-only tables; no safe application-only replacement for either. New Management quota is 120/user/15m but blocked by 23514, and process-local 2/user + 4/replica does not impose a fleet-global cap. Production W3 photo VIEW remains default-DENY. Owner decisions Q309-01/02/03/04, DB migration/helper, IAM/provider, fleet limits, retention, HTTP semantics and rollout remain open.
