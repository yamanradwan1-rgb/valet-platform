# Issue #215 — P1 database and contracts implementation / P2 handoff

Owner authority: Accepted DEC-104; master plan
`docs/plans/ISSUE_215_VERIFIED_CONDITION_PHOTO_MASTER_PLAN.md`, especially
sections 10, 12–14, 20 and 29. Starting `origin/main`:
`37a0b7a9bc19a9048c617978f2b69325a74869ea`.
Implementation branch: `codex/issue-215-p1-foundation`.

## Persisted shape, invariants and migration

The forward-only migration is
`packages/database/prisma/migrations/20261014008000_issue_215_verified_condition_photo_p1/migration.sql`.
It adds typed operation and attempt lifecycles, an immutable selected-byte
verification linked to the legacy VehiclePhoto, separate availability state,
and a per-User admission row. Unique keys prevent duplicate client operations,
parallel PENDING operations for one membership/session/purpose, duplicate
attempt numbers/object keys, multiple selected attempts, and multiple verified
photos per logical operation. Composite keys constrain tenant, location,
ValetSession, membership, purpose, source object and selected attempt.

The deferred constraint triggers verify at COMMIT that a VERIFIED operation
has precisely matching selected canonical-byte proof, a photo and the single
`CHECK_IN_CONDITION_PHOTO_VERIFIED` AuditEvent with `ValetSession` entity,
the exact session, and fixed safe metadata. SQL CHECK constraints enforce
state-specific metadata, exactly 32-byte digests, positive bounded byte size,
dimensions and normalization version. Immutability guards reject history
deletion, terminal resurrection, reparenting or rewriting trusted evidence.
The explicit maintenance-only abandoned-attempt inspection exception updates
its cleanup timestamp without altering object identity or verified history.
Reserved photo VERIFIED/UNAVAILABLE audit events are protected against ordinary
runtime audit INSERT and pre-seeded idempotency keys by an additional
trusted-command trigger; a deferred audit trigger proves exact committed photo
and availability facts. Other established AuditEvent meanings are preserved.

The migration adds scope/unique indexes to existing `vehicle_photos` without
rewriting its content. Metadata-only old photos remain non-qualifying; no
historical verification/availability rows are created. Check-In completion,
guard, reports, analytics, applications, URLs and UI are unchanged in P1.

## Restricted credentials and security matrix

| Relation / function group | API runtime | Separate photo maintenance | PUBLIC | Migration owner |
| --- | --- | --- | --- | --- |
| New operations, attempts, verifications, availability | SELECT | no table access | no access | full DDL / ownership |
| Admission synchronization | no table access | no table access | no access | full DDL / ownership |
| Existing `vehicle_photos` | SELECT, INSERT (append-only compatibility) | no new photo-specific grant | no grant | original owner rights |
| `condition_photo_reserve_upload`, `condition_photo_claim_upload` | EXECUTE | denied | denied | owner rights |
| `condition_photo_mark_stored`, `condition_photo_record_failure` | EXECUTE | denied | denied | owner rights |
| `condition_photo_finalize_upload`, `condition_photo_set_availability` | EXECUTE | denied | denied | owner rights |
| `condition_photo_expire_operation`, `condition_photo_abandon_attempt` | denied | EXECUTE | denied | owner rights |
| Internal private helper functions and trigger functions | denied | denied | denied | owner rights |

`packages/database/scripts/provision-runtime-role.mjs` continues to control
the effective application grants via the focused photo privilege modules,
including re-revocation of stale PUBLIC/column/function grants. Maintenance
provisioning requires a pre-existing **distinct** role and explicit
`CONDITION_PHOTO_MAINTENANCE_DATABASE_URL` and
`CONDITION_PHOTO_MAINTENANCE_ROLE`. It must target exactly the same PostgreSQL
database as migration and runtime, with safe role attributes and no API role
inheritance. It is intentionally **not** a generic API credential and cannot
create verifications. Provisioning must be repeat-safe.

SQL entrypoints are SECURITY DEFINER functions with fixed
`search_path = pg_catalog, public` and schema-qualified SQL references, using
bound parameters and no dynamic SQL. The functions derive persistent
membership/tenant/location/session scope, but **cannot authenticate a bearer
token or verify an external JPEG**. P2 must enforce those preconditions.

## Exact P2 transaction entrypoints

All signatures below are `public` PostgreSQL functions. P2 must use
parameterized calls. `UUID` identifiers and normalization parameters must be
server validated. **Private SQL output must never enter the public DTO.**

| Entry point | Inputs, in order | Result | Required caller behavior |
| --- | --- | --- | --- |
| `condition_photo_reserve_upload` | `user UUID`, `membership UUID`, `session UUID`, `clientOperation UUID`, `sourceSha256 BYTEA`, `sourceByteSize INT`, `normalizationVersion INT`, `bucketAlias TEXT` | `operation_id, attempt_id, object_key, lease_owner, lease_expires_at` | T1: exact authenticated bearer/session recheck, membership/Location authorization, bounded source bytes/digest, then reserve the first attempt |
| `condition_photo_claim_upload` | `user UUID`, `membership UUID`, `operation UUID`, `reconcileExisting BOOLEAN`, `bucketAlias TEXT` | same private attempt lease tuple | Reconcile or explicitly resend/retry. Never write into an old possibly overwritten object without provider write-once fencing |
| `condition_photo_mark_stored` | `user UUID`, `membership UUID`, `operation UUID`, `attempt UUID`, `leaseOwner UUID`, `objectVersion TEXT`, `canonicalSha256 BYTEA`, `canonicalByteSize INT`, `width INT`, `height INT` | `BOOLEAN` changed | After independently verifying read-back of canonical object bytes, persist trusted `STORED` proof with a live lease; an identical replay returns false, inconsistent bytes are rejected |
| `condition_photo_record_failure` | `user UUID`, `membership UUID`, `operation UUID`, `attempt UUID`, `leaseOwner UUID`, `safeErrorCode TEXT` | `BOOLEAN` changed | Bounded `STORAGE_UNAVAILABLE`, `STORAGE_TIMEOUT`, `STORAGE_OUTCOME_UNKNOWN`, `READBACK_UNAVAILABLE`, or `VERIFIER_UNAVAILABLE`; never release a live lease on ambiguous bytes |
| `condition_photo_finalize_upload` | `user UUID`, `membership UUID`, `operation UUID`, `attempt UUID`, `leaseOwner UUID`, `objectVersion TEXT`, `canonicalSha256 BYTEA`, `canonicalByteSize INT`, `width INT`, `height INT` | `vehiclePhotoId UUID` | T2: exact bearer/session recheck with compatible locks, requires previously committed STORED and precisely matching immutable proof; atomically creates photo, verification, availability and one ValetSession audit |
| `condition_photo_set_availability` | `user UUID`, `membership UUID`, `vehiclePhoto UUID`, `state condition_photo_availability_state`, `codedReason TEXT` | `BOOLEAN` changed | Only after trusted integrity inspection; no generic status field update; availability changes do not rewrite historical verification |
| `condition_photo_expire_operation` | `operation UUID` | `BOOLEAN` changed | Maintenance-only expired PENDING operation transition when no live lease |
| `condition_photo_abandon_attempt` | `attempt UUID` | `BOOLEAN` changed | Maintenance-only cleanup inspection metadata on an already ABANDONED unverified attempt |

The operation state is PENDING → VERIFIED/EXPIRED/REJECTED, with terminal
history immutable. Attempts are WRITING → STORED → SELECTED, or become
ABANDONED; an expired lease loses write/finalization authority. The DB
monotonic `next_attempt_number` and per-User admission lock serialize a
maximum of two live leases across memberships, locations and replicas.
The `STORED` fact is separately committed before finalization and remains
observable for explicit recovery from unknown T2 outcomes. Retryable failure
codes never free capacity or turn unknown provider writes into proven absence.
Each request must use database time, same-source bytes for the same client
operation UUID and write-once provider semantics for each attempt object key.
`lease_owner` is an internal server token, never sent in status responses.

The public shared schemas are exported from
`packages/contracts/src/condition-photo-upload.ts` by the contracts root.
P2 must project only the strict PENDING/VERIFIED/EXPIRED/REJECTED DTO,
approved safe error code, status/reconcile request and exact-session
photo-policy discovery response. Raw SHA-256, object keys, URLs, buckets,
lease tokens, bearer credentials, maintenance identities and arbitrary
Org/Location scope fields are forbidden in public responses.

## Lock graph and remaining P2/P5/P6 dependencies

P1 admission reservations lock one persisted User row before operation and
attempt rows; the reserve path then locks the exact ValetSession. Existing
refresh takes the User security advisory before authorization/session row
locks, while logout holds auth rows without that advisory. Existing Check-In
authorization can take User `FOR SHARE` before the session lock. P2 MUST
resolve a globally safe T1/T2 ordering that revalidates the **exact bearer and
refresh/session revocation**, not just persisted User status; test refresh,
logout, revoke, location/settings recheck and two-replica interleavings.

The SQL transaction never proves external JPEG authenticity. P2 must enforce
8 MiB source upload limits, decode/normalize the bytes to JPEG, enforce
4096px per side / 12MP, compute real SHA-256 and length server-side, isolate
private storage, use unique write-once object keys and HEAD/GET read-back
before any finalization. Prove stale PUT/retry provider behavior and status
reconciliation. Avoid holding the SQL transaction during external S3 calls.
P5 separately owns actual provider retention, orphan cleanup, integrity
checks, and availability reconciliation, including approved coded reasons;
P6 owns physical Android/native/visual proof. No Check-In guard/UI was enabled
under P1.

## Validation environment and evidence

Isolated task-owned Docker PostgreSQL 16 container
`vaylet_issue215_p1_local` bound only to 127.0.0.1:58487. Test account
`issue215_owner`; no production/staging host or credentials were used.
Database `issue215_release`: all **80** migrations including the STORED,
failure-recording and protected audit SQL deployed from empty successfully.
The migration's atomic DDL and PUBLIC revocations protect installation.
Distinct
task-created per-test databases in that same container exercised the actual
PostgreSQL constraints, definer functions and role ACLs. A historical
representative prior-schema upgrade test applied **79 → 80** migrations with
legacy ConditionNote/VehiclePhoto rows preserved and no fabricated verified
evidence. Postgres tests enforce a fixed exact disposable URL and create/drop
only their own randomized task databases.

Focused shared contracts: **449/449** tests passed (including 7 new contract
tests), lint/typecheck passed. PostgreSQL integrity, upgrade, negative, STORED
and protected audit/availability: **5 files, 21/21 focused tests passed** on
isolated PostgreSQL, with the existing `database-postgres-provision` Vitest
project global setup, cluster ownership lease and complete cleanup
(`db=0 roles=0 children=0`). These prove false reserved-audit insertion is
denied, authorized T2/audit succeeds, inactive Organization/Location cannot
change availability, STORED is durable and idempotent, stale/changed leases
are denied, selected evidence is coherent, and old rows remain metadata-only.
Photo role policy tests: **3/3**; connected runtime/maintenance role tests:
**4/4**, including all six API versus two maintenance entrypoints, repeat
provisioning, and stale PUBLIC grant revocation. The test harness's
classification/ownership tests: **12/12** PASS, with discovery counts updated
to current exact test ownership. Database lint/typecheck, Prisma validate,
architecture check and diff check passed.
The final migration with explicit `BEGIN`/`COMMIT` DDL and PUBLIC revocations
was applied from empty to a second fresh task database `issue215_atomic_final`:
80/80 migrations succeeded, a second `migrate:deploy` found no pending
migrations, and the actual catalog contained five foundation tables and 15
photo functions. No shared/production database was touched.
No complete HTTP/storage race or physical APK proof is claimed by P1.

Wider `pnpm test:non-postgres` was attempted but failed because the temporary
worktree's install could not resolve many existing API/employee/dashboard
package dependencies (including `@nestjs/common`, `pg` and workspace
`@valet/contracts`); workspace-local installation first hit ENOSPC and
targeted dependency junctions served database/contracts tooling. One
architecture fixture additionally timed out under parallel load. These are
environment/baseline limits rather than evidence of a P1 application change;
the wider suite was **not green** and must be repeated in full CI after a
complete dependency installation. The default PostgreSQL harness wrapper was
also blocked by missing `apps/api/node_modules/pg`; focused database tests
ran through the same owned Vitest PostgreSQL project directly.

Production rollout requires a verified deployment target, approved separate
maintenance identity, independent final code review and future P2-P6 work.
Feature disablement is the supported forward-compatible fallback: do not
delete trusted evidence with a destructive down migration.

## Independent review decision (P1 scope)

The independent DB/security reviewer inspected the final migration, schema,
effective API/maintenance/PUBLIC grants, deferred COMMIT checks, admission
serialization and audit provenance. A separate PostgreSQL integration reviewer
ran 21 scoped integrity/concurrency/upgrade tests. No remaining direct SQL
P0/P1 was identified. **Conditional GO for P1 schema/contracts/ACL handoff;
NO-GO for runtime upload enablement, Check-In qualification or production.**
The outstanding test is P2's *exact current Staff bearer and scoped authority*
lock-order proof: the SQL `condition_photo_authorized_scope` predicate reads
persisted scope, while its API caller must acquire and hold appropriate auth,
User, membership, Organization, Location, access and session locks throughout
T2, with refresh/logout/revoke/disable races proved under two transactions.
P2 also owns actual object-store read-back and unknown-provider outcomes. P5
owns approved retention/legal holds and cleanup; P6 owns Android/visual proof.
