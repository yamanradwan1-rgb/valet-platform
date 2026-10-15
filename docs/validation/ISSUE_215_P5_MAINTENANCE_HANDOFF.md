# Issue #215 P5 — Maintenance and privacy handoff

Status: **SOURCE READY FOR INTEGRATION; AUTOMATIC CLEANUP DISABLED; RELEASE NO-GO**.
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

The currently pinned P1 migration provides `condition_photo_expire_operation`
and `condition_photo_abandon_attempt` as SECURITY DEFINER functions, but the
maintenance DB role has **no candidate discovery** and no durable claim token.
It also has no independent SYSTEM availability writer: the existing
`condition_photo_set_availability` takes a current Staff user/membership, which
scheduled maintenance must never impersonate. Until the migration owner and
prime authorize the next ordered additive migration, these libraries have no
production DB adapter or scheduled entrypoint and cannot run an autonomous
sweep. Do not add generic direct table SELECT/UPDATE grants as a shortcut.

The approved migration must supply least-privileged bounded read functions,
atomic operation/attempt claims with persisted owner/lease generation,
verification/selection/incident-preservation checks, fenced cleanup check
updates, and a trusted SYSTEM availability transition + append-only audit.
Every function must have a fixed safe `search_path`, PUBLIC EXECUTE revoked,
no generic finalize/grants and real restricted-role tests. After it is
integrated, add a dedicated offline process/entrypoint, stop signal, DB pool
with maintenance credentials, and provider cleanup principal. The API's normal
upload identity must never have DeleteObjectVersion permission.

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

Local non-PostgreSQL tests simulate concurrent sweepers, late PUT following
deletion, restart after DB acknowledgement loss, selected/held protection,
foreign references, provider/backup gates, unversioned safety, integrity
uncertainty and backup mismatch. Real hard crash, read/write S3 consistency,
IAM denial, actual PostgreSQL concurrency and paired restore remain required
before #288/#290 acceptance. No production command is documented because the
requisite migration/isolated worker wiring and provider have not been approved.
