# Issue #215 P5 — Maintenance and privacy handoff

Status: **P5 CODE DELIVERED; AUTOMATIC CLEANUP DISABLED; RELEASE NO-GO**.
This record applies to branch `codex/issue-215-p5-maintenance` after the
independently assigned #288/#290 work, not to production or a released worker.

## Safe delivery boundary

- Expiry-only is the library's default. An invoked sweep never deletes an object
  unless explicit cleanup approval and qualification inputs are provided.
- `condition-photo-maintenance-sweep.ts` consumes only DB-selected candidate IDs.
  The DB must decide expiry using `clock_timestamp()`, lock operation before
  attempt, enforce an actual durable lease and return a fenced claim. The code
  never trusts a caller-supplied bucket/key or impersonates a Staff principal.
- An abandoned claim must match its persisted operation UUID, attempt UUID,
  exact `condition-photo/<operation>/<attempt>` key and approved bucket alias;
  SELECTED, verified, held, legacy `vehicle_photos` key references, malformed
  and foreign claims are denied. The DB claim must query **all**
  `vehicle_photos.storage_object_key` references to that exact key, including
  metadata-only legacy and cross-tenant rows; trusting only verification child
  absence would allow destructive deletion.
- Cleanup uses a **separate IAM identity** with version-list/read-version and
  exact-version deletion only. All version IDs and matching delete markers are
  enumerated before any deletion; unversioned deletes are rejected. Never allow
  broad lifecycle removal of selected/verified keys.
- Tombstone rows stay in PostgreSQL and are revisited after every cleanup, even
  after apparent success: a paused PUT can recreate a key after DELETE. Provider
  timeout, partial deletes, interrupted DB commit and unknown outcomes keep the
  claim retryable. A finite late-write bound has not been proved.
- `condition-photo-maintenance-integrity.ts` checks a persisted exact version,
  JPEG validation and SHA-256/length/dimensions. A proven mismatch may append
  `CHECK_IN_CONDITION_PHOTO_UNAVAILABLE` via a future privileged DB function;
  a missing version needs independently qualified strong versioned reads.
  Provider timeout, uncertain absence and DB errors are never declared proof.
- `condition-photo-maintenance-restore.ts` compares one restored PostgreSQL
  verification tuple with its **exact restored private version**. A mock fixture
  checks match/mismatch/provider outage. This is not a real backup/restore run.

## Ordered forward-migration dependency

Forward-only migrations `20261015008400` and `20261015008500` supply bounded
SECURITY DEFINER candidate discovery, durable generation/lease claims, strict
object alias exclusion, SYSTEM integrity audit and role-only function grants.
They extend deferred coherence/audit triggers with SECURITY DEFINER while
retaining the original fixed `search_path` and denying EXECUTE to PUBLIC,
maintenance and runtime roles. Actual PG16/17 tests verified these boundaries.

`PostgresConditionPhotoMaintenanceJournal` and
`PostgresConditionPhotoIntegrityJournal` use only the dedicated role's SQL
entrypoints. The independent `condition-photo-maintenance-worker` executes
expiry by database time and optionally exact version integrity reads.
Deletion is never invoked: the worker has a throwing no-delete storage and
rejects `CONDITION_PHOTO_MAINTENANCE_DELETE_ENABLED=true` at startup. A restart
preserves DB tombstones/claims; stop signals close the DB pool cleanly.

The work cannot unblock deletion until approved independent incident/reference
ingress serialization and verified retention/hold ownership. A positive
`pairedRestoreProved` input in dormant S3 cleanup helpers is not production
proof. Never add broad SELECT/UPDATE grants as a shortcut.

The maintenance service requires its own deployment process with
`CONDITION_PHOTO_MAINTENANCE_ENABLED=true`, `CONDITION_PHOTO_MAINTENANCE_ROLE`,
`CONDITION_PHOTO_MAINTENANCE_DATABASE_URL`, and optional bounded
`CONDITION_PHOTO_MAINTENANCE_BATCH_SIZE` (1–100). The integrity mode is opt-in
with `CONDITION_PHOTO_MAINTENANCE_INTEGRITY_ENABLED=true` and separate approved
private storage configuration/READ IAM. A failed startup cannot silently use
the API database account. Invoke the built worker with
`pnpm --filter @valet/api start:photo-maintenance-worker` only in reviewed
nonproduction qualification or after formal release approval.

## Deployment checklist and policy authority

Before enabling any deletes, independently document: production storage owner,
provider/versioning guarantees, private IAM/anonymous denial, task-owned
cleanup credential, encrypted object + DB backup ownership, paired restore
test, late-write and provider consistency behavior, tenant/incident hold
authority, and the actual contractual retention/disposition policy. No verified
object is eligible for this orphan worker under any of these conditions.
There is **no approved verified-byte deletion interval or hold procedure**;
preserve selected objects and append-only Photo/Verification/Audit records.

The bounded sweep cap is 100 per class/invocation. Metrics are numeric only:
`expired`, `claimDenied`, `cleanupChecked`, `exactVersionsDeleted`,
`unsafeClaim`, `storageUnknown`, `dbUnknown`, plus integrity `checked`,
`changed`, `unavailable`, `unknown`, `rejected`. Production observability should
add DB-derived oldest PENDING and ABANDONED age without keys or PII. Alert on
repeated unknown outcomes, unbounded tombstone age, verified unavailable facts
or any unsafe claim. No arbitrary alert threshold is asserted as approved.

## Incident and rollback

Stop the maintenance process separately from API traffic, revoke its S3
deletion identity if needed and preserve all journal/verification/tombstones.
For lost/corrupt selected bytes, block new required-photo qualification,
verify paired DB+S3 backup identity and exact immutable version, and use only
an approved restore procedure. Never synthesize a new VERIFIED row, silently
mark an unknown object AVAILABLE, or erase history to make a restore pass.

`node packages/database/scripts/verify-issue215-p5-local.mjs` creates and
attests two task-owned PG16 and PG17 Docker containers, each digest-pinned
from the local image, uniquely labeled and backed by tmpfs with an isolated
loopback port. It performs all 85 migrations in each container and passes
23 real assertions in each: candidate expiry, two claims, fenced completion,
legacy reference, incident, strict restricted roles, SYSTEM integrity/audit
exactly once, and deferred trigger security. Both test containers are removed
on success or failure after live identity attestation. There is no shared DB
target, and Docker images are not pulled implicitly.

The API focused tests pass 26/26 non-PostgreSQL cases. They simulate concurrent sweepers, late PUT following
deletion, restart after DB acknowledgement loss, selected/held protection,
foreign references, provider/backup gates, unversioned safety, integrity
uncertainty and backup mismatch. Real hard crash, read/write S3 consistency,
actual IAM denial, approved retention/holds and paired backup restore remain
required before production #288/#290 acceptance. No object deletion is approved.
