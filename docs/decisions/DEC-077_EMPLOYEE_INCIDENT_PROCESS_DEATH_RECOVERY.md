# DEC-077 — Employee Incident Process-Death Recovery

Status: Proposed
Date: 2026-09-12
Task: MOB-023B-INCIDENT-RECOVERY-CONTRACT
Implementation child: MOB-023B-INCIDENT-RECOVERY-IMPLEMENTATION
Audited base: `91e458cdf88b4e34525614a08eb10c2f14ceb2ed`
Branch: `codex/mob-023b-incident-recovery-contract`

## 1. Decision requested

Recommend **Option B, narrowed to a durable Incident-ID retirement fence**, plus
the minimal device identity from Option A and an actor-bound canonical GET.
There is no server draft, preflight intent reservation, worker, replay, or body
storage. A separate, explicit recovery-resolution command either finds the
original report or permanently retires its unused ID. GET itself never writes.

**Do not accept unmodified Option A's definitive-ABSENT claim.** The existing
advisory transaction lock serializes holders, but cannot exclude a POST that has
not yet acquired it. Moving the lock earlier does not exclude a delayed HTTP
request arriving after GET. A retained negative decision is needed unless a
different server-enforced admission/expiry protocol is separately accepted.

This recommendation intentionally costs one narrow table, one additional explicit
recovery command, and a protected-command fence check. It is smaller than a full
submission-intent lifecycle and supplies the missing negative proof. It is **not
the no-migration candidate**. Owner acceptance of these differences, the retention
policy, and the conservative purge behavior below is required before implementation.

This file changes no existing authority while Proposed. No production files,
schema, migrations, dependencies or runtime grants change in this branch. No
decision-log mirror edit is required for a Proposed file by AGENTS.md,
`docs/00_SOURCE_OF_TRUTH.md` or `docs/decisions/README.md`; the high-contention
`docs/08_DECISIONS_LOG.md` is deliberately untouched.

## 2. Context, existing binding authority and audit provenance

The failure is an independent Incident operation, not a custody transition:
Process A sends the existing Incident POST; Incident and INCIDENT_OPENED commit;
the response never reaches Native; Process A dies. Process B has neither the
original UUID nor a canonical Employee report read. A new UUID can duplicate the
same intended report. A timeout/disconnect does not prove rollback.

Authority reviewed at the base above:

| Source | Current status / relevant authority |
| --- | --- |
| `AGENTS.md`; `docs/17_AGENT_CODE_STRUCTURE_RULES.md` | Binding; authority before disclosure/mutation, atomic audit, tenant isolation, independent Incident lifecycle, one writer and 300-line authored-code ceiling |
| `docs/20_EMPLOYEE_NATIVE_EXECUTION_PLAN.md` (read in full) | Binding execution envelope; MOB-017A/MC-17 owns Incident; MOB-023A owns auth/network; MOB-023B/MC-22 owns process death; R-07 is command-specific recovery, not generic replay |
| Plan §§2–3, §7 A/R-07, §8 common task-card contract, B6/G7 and graph | Truthful recovery, no secret/free-text diagnostics, fresh authority, EN/AR and platform proof; MOB-023A → MOB-023B; MOB-023B AND MOB-024B → G7. This child neither starts MOB-024A nor closes G7 |
| [DEC-059](DEC-059_PHASE7_INCIDENT_RUNTIME_READ_AUTHORITY.md) | **Accepted**, inspected in its actual focused file; runtime Incident SELECT for Dashboard, separately accepted Employee INSERT; exact-Location manager Dashboard authority is not Employee recovery authority |
| [DEC-063](DEC-063_EMPLOYEE_OFFLINE_OPERATION_POLICY.md) | **Accepted**, full focused file; Incident MANUAL_RETRY_EXISTING_IDEMPOTENCY; in-memory drafts only; new durable storage/privacy contract required; no generic journal/outbox/replay |
| [DEC-071](DEC-071_MOBILE_PLATFORM_REPOSITORY_ARCHITECTURE.md) | **Accepted**, full focused file; one Expo application, portable orchestration, Native adapters, Android first and same-source iOS |
| [DEC-072](DEC-072_NATIVE_STAFF_AUTHENTICATION_ARCHITECTURE.md) | **Accepted**, full focused file; access memory-only, dedicated SecureStore refresh envelope, installation generation, restore-before-work, purge and failure taxonomy |
| [DEC-032](DEC-032_SHIFT_OPERATIONAL_ELIGIBILITY.md) | **Accepted**, actual focused file; membership-specific Shift and locked current eligibility. Its own-Shift cleanup exception is not permission for Incident disclosure after revocation |
| [DEC-066](DEC-066_EMPLOYEE_BOTTOM_NAV_PRODUCTION_WIRING.md) | **Accepted**, actual focused file; workflow/identity isolation; directory visibility does not grant Incident authority |
| DEC-023 in `docs/08_DECISIONS_LOG.md` | **Accepted** in its actual canonical entry (no separate focused DEC-023); principal proves User only, exact Bearer transport, no role inheritance |
| DEC-024/025/026/027/029 | Actual focused files each say **Accepted** and point to their canonical log contracts: shared auth abuse boundary, runtime TLS/privilege separation, common infrastructure, feature ownership and controlled provisioning. None approves operational draft storage |
| DEC-031/033/034/035/036/037/039/042/043/052/065/068 | Actual focused statuses inspected: **Accepted**; custody/Task relations and terminal-state dependencies of the existing Staff access classifier. DEC-068 amendments to earlier key/parking decisions are acknowledged. No change to those commands or their state transitions is proposed |

The current reporting authority is **the accepted Stream-A implementation**
explicitly recognized by DEC-059 §9 and DEC-063 §6, not an invented focused
Incident-reporting DEC. Its provenance is `551c45b4717763ade598eca78feb1c8059768bfa`
(reporting API) and `9535e40bf44bb604d443e2705ef5c471ec25c4b8` (actor-bound retry
hardening). Git provenance supports implementation history, not decision status.
`apps/api/src/modules/incidents/README.md` still says placeholder; executable
reporting files and their registration in `staff/staff.module.ts` establish the
current implementation. There is no `incidents.module.ts` to extend.

The plan's historical NOT STARTED rows are not current implementation evidence.
The current [MOB-023B evidence](../reference/employee-native-mob-023b-evidence.md),
especially “MOB-023B-INCIDENT-RECOVERY CONTRACT CHILD REQUIRED,” identifies the
remaining block. Its existing tests do not prove a recovery read or durable ID.

### Source-grounded implementation trace

Paths below are repository-relative and refer to the audited base.

| Boundary | Source / observed behavior |
| --- | --- |
| Native ID and transport | `apps/valet-native/src/incident/native-incident-session.ts`: private nullable `incidentId`; CSPRNG UUID in `submit`; stable reuse on failure; POST through EmployeeClient; success clears ID; `open` and `clear` also clear ID |
| Draft and result | `src/incident/native-incident-form.tsx` owns React in-memory type/severity/description; types/copy/styles/screen are presentation. Current success needs both report and session detail, which recovery must decouple |
| Routing and retirement | `src/shell/native-contextual-route.ts` holds transient origin/session ID; `native-production-bootstrap.ts` creates a new runtime; `native-workflow-scope-retirement.ts` clears Incident; `src/auth/native-auth-runtime.ts` composes Incident and registers identity purge |
| Auth/storage | `src/auth/native-auth-storage.ts`: Expo SecureStore refresh adapter and app-private installation file; `identity-state-boundary.ts` awaits purge handlers; portable `native-auth-storage.ts` serializes auth writes. None is an Incident store |
| Portable reuse | `packages/employee-client/src/index.ts` re-exports Incident schemas/types from contracts; `employee-client.ts` is transport; `recovery-policy.ts` retries only safe GET/HEAD after refresh. No current portable Incident durable-recovery helper exists |
| Public contract | `packages/contracts/src/incidents.ts`: strict UUID/type/severity/trimmed 1–500-character description request; response omits description |
| API | `incident-reporting.controller.ts` validates request and exactly one Authorization header; service delegates to `createReportIncidentCommandExecutor` using the single runtime pool |
| Authorization | `staff/custody-staff-authorizer.ts`, `shifts/shift-operational-eligibility.ts`, `staff/staff-valet-session-{authorization,queries}.ts`: persisted scope, active rows and Location access under locks; Employee state-specific Task relationship; Supervisor exact-Location exception |
| Existing reads | `staff/staff-valet-session.service.ts` returns custody/vehicle/guest/handoff detail, not Incident results, and requires Shift/task eligibility. Dashboard overview Incident query separately selects description; it must not be reused for this response |
| Transactions | `incident-reporting-command.ts`: one pg PoolClient, BEGIN, authorization/Shift/task checks, description normalization, advisory lock, prior Incident lookup, Incident INSERT + audit INSERT, COMMIT; catch ROLLBACK; finally release |
| DB | `packages/database/prisma/schema.prisma` Incident model and `20260809001300_incident_foundation/migration.sql`: UUID primary key, tenant/Location/session/reporter composite FKs, `(location_id,status)` index. No uniqueness per session, payload or time window; several Incidents are legal |
| Runtime | `packages/database/scripts/runtime-table-privileges.mjs` and verifier allow incidents SELECT/INSERT, deny UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER. Provisioning is separate from migrations. `audit_events` remains append-only; its event/entity type columns are TEXT |
| Evidence | `apps/api/test/staff-incident-reporting.integration.test.ts` proves exact retry, changed payload and cross-actor conflicts, scope/Shift/terminal denial, one Incident/INCIDENT_OPENED and unchanged aggregates. Native process-death/recovery/routing and incident-repair/success-lifecycle tests expose the memory boundary. Portable `native-auth-storage-matrix.test.ts` covers durable auth failures, not durable Incident identity |

No live deployment-role verification or real PostgreSQL race experiment was run
in this documentation task. Runtime privilege statements above are repository
provisioning facts; future implementation must prove them with the genuine role.

### Facts A–K verified or qualified

| Fact | Result |
| --- | --- |
| A: one client stable incidentId | Verified per logical submit attempt; generated lazily, not once per entire process |
| B: survives retries only in Process A | Verified with qualification: even a living session loses it on `open`, `clear`, or authoritative success. Revalidation/background alone do not durably store it |
| C: fresh owner has no old ID | Verified: constructor initializes null; no restore input/store |
| D: four-field POST and normalized exact retry | Verified: incidentId, severity, type, description; description trim; exact actor/session/type/severity/trimmed-description match. Retry still requires current creation eligibility first |
| E: changed payload conflicts | Verified when authorization reaches the idempotency check; earlier current-authority denial can take precedence |
| F: original membership binding | Verified: `reported_by_membership_id !== actor.membershipId` conflicts even for otherwise authorized Supervisor |
| G: no Employee canonical Incident recovery read | Verified in current Staff routes/contracts and Native/portable consumers. Custody detail and Dashboard reads are not substitutes |
| H: runtime SELECT is not Employee Dashboard permission | Verified in DEC-059 and application boundaries |
| I: manual same-ID retry permitted | Verified in Accepted DEC-063 §6 |
| J: durable Incident drafts not approved | Verified in DEC-063 §3; SecureStore auth authority is not a draft exception |
| K: generic durable journal/outbox/background replay prohibited | Verified in DEC-063/071 and MOB-023B scope |

## 3. Options considered

| Option | Identity / privacy | Negative-outcome proof | Cost and disposition |
| --- | --- | --- | --- |
| A: minimal device identity + actor GET | Small encrypted metadata envelope; no content. Existing ReportIncidentResponse can be an opening receipt | Existing lock can observe a preceding commit/rollback but cannot exclude a later lock entrant. Bare no-row is UNKNOWN, not definitive ABSENT | Attractive positive recovery; **reject as complete solution without a durable fence or newly accepted server admission protocol**. No-schema is not proved |
| B: server intent/attempt entity | Can persist metadata only, bound to actor/session/scope; full intents need registration, state lifecycle, retention and cleanup | Durable retirement checked by every POST excludes late commits | **Recommend its smallest retirement-only variant** below. No normal-path preflight round trip; one explicit resolution command only on ambiguity; one new table. Full draft/attempt preparation lifecycle is unnecessary for this cut |
| C: full durable draft + explicit same-ID retry | Stores potentially sensitive PII/free text and category/severity; requires separate durable-draft privacy authority | Reuses exact ID without needing to infer absence, but current POST still denies terminal Shift/session or revoked scope | Reject here: encryption/key accessibility, device extraction/backup, TTL, logout purge and edited-draft conflict UX materially expand scope. User confirmation alone does not legalize storage under DEC-063 |
| D: latest/list/payload/time matching | Broadens read disclosure; may expose others' descriptions | Cannot prove identity: same actor/session may legitimately repeat type, severity and even identical free text; ordering/time windows and multiple devices do not identify the lost operation | Reject. Neither latest OPEN nor a session list is exact recovery. Do not add search/list endpoints |
| E: generic journal/outbox | Broad durable commands/content | Prohibited independently of deduplication technique | Rejected by Accepted policy; not designed |

An expiring signed submission permit could also exclude late POSTs, but it would
introduce issuance, authenticated time/admission semantics, compatibility and
possibly signing-key lifecycle. Neither HTTP timeout nor a client marker TTL is
such a permit. No accepted bounded end-to-end request lifetime exists here. A
transaction timeout alone does not cover network delay before BEGIN. Those
alternatives are not silently added to Option A.

## 4. Proposed API and durable retirement contract

All names/routes in this section are **new Proposed contracts**.

### Canonical non-mutating read

`GET /v1/staff/valet-sessions/:sessionId/incidents/:incidentId`

Strict UUID path parameters; empty query; no request body; exactly one existing
Staff Bearer header; existing principal resolver. No client membership/tenant
authority fields. `Cache-Control: no-store`; no CDN/offline response caching.

Strict HTTP 200 discriminated response:

```text
{ outcome: "FOUND", report: ReportIncidentResponse }
{ outcome: "ABSENT", incidentId, sessionId }
{ outcome: "UNKNOWN", incidentId, sessionId }
```

FOUND selects only the original reporter's report in the exact persisted
Organization/Location/session. It does not select description, resolution notes,
vehicle/customer data, key location or other Incidents. Reuse
ReportIncidentResponse as the **original opening receipt**, not a claim about
current Incident lifecycle. Its `status: OPEN` means it was opened; no current
lifecycle writer is accepted by this task. A future Incident lifecycle change
must review this receipt contract; unsupported/corrupt projections fail closed,
not silently coerce arbitrary data to success.

ABSENT requires a matching durable retirement row and no Incident. No Incident
and no retirement row returns UNKNOWN. Within an authorized session scope, a
foreign reporter/retirement binding also returns UNKNOWN: it denies the report
projection without making GET an existence oracle for another actor's ID.
Forbidden or missing session scope returns the same non-disclosing 404 class;
it is never converted into ABSENT by Native. Anonymous/invalid auth uses the existing
401 convention. Transport, lock timeout, deadlock, malformed response and server
failure remain unavailable/ambiguous. An ordinary HTTP 404 is not absence proof.

### Explicit recovery resolution (a command, not a disguised GET)

`POST /v1/staff/valet-sessions/:sessionId/incidents/:incidentId/resolve-recovery`

Strict empty JSON object and query, same UUID/auth boundary. This is **not**
Incident creation or mutation replay. It must only follow an explicit foreground
user action explaining that any still-uncommitted attempt for this ID will be
prevented from opening later. Cold start/reconnect never sends this command.

Under the same operation lock and authorization:

1. An Incident exists: prove original reporter and exact scope, return FOUND;
   no write and no additional INCIDENT_OPENED.
2. Matching retirement exists: return ABSENT; no new write/audit.
3. Neither exists: insert the immutable retirement row and its audit atomically;
   commit before returning ABSENT. Every later Incident POST must reject this ID.
4. Existing Incident/retirement belongs to another reporter/session: uniform
   non-disclosing denial. Never retire someone else's committed report.

The command has the same FOUND/ABSENT schemas as GET; UNKNOWN is only a GET
outcome. Loss of the resolution response leaves Native ambiguous; a later GET
discovers the committed retirement or report. No generic mutation retry is added;
explicit resolution retries are idempotent.

### Narrow server entity

Proposed table `incident_recovery_retirements` / model
`IncidentRecoveryRetirement`, containing exactly:

- `incident_id UUID`, `organization_id UUID`: composite primary key;
- `location_id UUID`, `valet_session_id UUID`;
- `retired_by_membership_id UUID` (server-derived);
- `retired_at TIMESTAMPTZ(3)` (database time).

Composite tenant-safe FKs mirror Incident's Organization/Location/session and
membership relations, with delete restriction. No FK to incidents: absence is
the reason the row exists. Primary-key lookup is sufficient; no list index or
payload fingerprint. No status field, retry counter, body, type, severity, draft,
expiry worker or generic command kind. Rows are retained; runtime cannot change
or delete them. This is a permanent rejection of one exact ID, never a report.

The new POST guard applies to **all** calls of the existing Incident POST,
including Employee Web and old Native clients; do not leave a legacy bypass.
It runs after current creation authorization and existing original-result
checking, under the same lock, before INSERT. A retired ID produces HTTP 409
`INCIDENT_RECOVERY_RETIRED`, without revealing its owner or scope. The existing
four-field POST body and successful exact-payload semantics remain unchanged.
Retirement is a new, explicit terminal state of an **uncommitted operation ID**,
not a change to an existing Incident's lifecycle.

## 5. Authorization matrix and disclosure boundary

Common prerequisites for recovery: active authenticated User, active current
OrganizationMembership in the session's persisted Organization, active
Organization and Location, explicit current membership_location_access to that
exact Location, and current role VALET_EMPLOYEE or VALET_SUPERVISOR. Resolve the
session to derive scope; do not trust the marker as authority. FOUND additionally
requires original `reported_by_membership_id` equality; ABSENT additionally
requires retirement membership equality. Same User with another membership is
not the same reporter. No management-role inheritance.

Creation below is existing behavior, not newly granted permission. “Eligible”
means all common predicates, non-COMPLETED session, active Shift at the exact
Location, and Employee state/task relationship where applicable.

| Actor / condition | CREATE new Incident | RECOVER exact report / retirement |
| --- | --- | --- |
| Original VALET_EMPLOYEE, same membership/current Location | Eligible only; state-specific Employee task/check-in relationship required | Allow own ID; no current Task ownership requirement |
| Original VALET_SUPERVISOR | Eligible; no Task ownership requirement | Allow own ID only |
| Different Employee, same Location | Eligible for their own new report | Deny original report/retirement |
| Different Supervisor, same Location | Eligible for their own new report | Deny original report/retirement; no supervisor override |
| LOCATION_MANAGER | Deny | Deny; independent Dashboard permission is not this route |
| ORG_ADMIN | Deny | Deny; no password-only admin widening |
| Same User, different OrganizationMembership | Evaluate only their own current scope for a new report | Deny original membership's report/retirement |
| Wrong Location / missing exact access | Deny | Deny |
| Revoked/inactive membership | Deny | Deny |
| Inactive User | Deny | Deny; auth may reject first |
| Inactive Organization | Deny | Deny |
| Inactive Location | Deny | Deny |
| Shift ended, other recovery predicates valid | Deny unless independently eligible through a new active Shift | Allow own committed report/retirement; no Shift needed |
| ValetSession COMPLETED | Deny, including current POST retry | Allow own committed report/retirement; no custody continuation |
| Anonymous | Deny | Deny, 401 |
| Cross-tenant attacker | Deny | Deny without existence/content disclosure |

Resolution of an existing report/retirement uses the same read matrix. Creation
of a retirement where **no row exists** uses the common recovery scope predicates,
not Shift/Task ownership: it must work after a rollback followed by Shift end or
session completion. There is no original reporter row to authenticate in that
case. The caller is binding a previously unused random ID to their own current
membership, not proving a client assertion about historical authorship.

This is an explicit security tradeoff of the retirement-only variant: an
authorized same-Location actor who learns an uncommitted UUID could retire it
first and prevent its submission. UUID knowledge grants no read of a different
actor's eventual/existing report. Existing creation can already contest a known
unused UUID, but this route permits retirement without an active Shift/Task.
Keep IDs out of diagnostics, use CSPRNG, test the race and non-disclosure, and
require owner review of this denial-of-service surface. If that additional
capability is unacceptable, **do not implement this variant**: a pre-POST
server-owned actor-bound intent reservation needs a revised Proposed contract.
Do not pretend client membership metadata solves this missing-row problem.

No response includes session state, other actor identity or report count for an
unowned ID. GET uses UNKNOWN for missing and foreign Incident IDs within otherwise
authorized scope; the matrix's “deny” means no report/retirement projection.
Missing/foreign/forbidden session scope shares a non-disclosing denial shape.
Resolution may reject a contested ID rather than retire it; it reveals no other
actor or content and remains subject to the explicit §5 tradeoff. The route
does not accept arrays, pagination, search, time windows or reporter selectors.

## 6. POST/read serialization and definitive outcomes

Existing code uses:

```text
pg_advisory_xact_lock(hashtextextended(organizationId + ":incident:" + incidentId, 0))
```

PostgreSQL transaction advisory locks release at transaction end and require
application cooperation. They serialize conflicting lock acquisition, not future
requests. This follows PostgreSQL's [advisory-lock documentation](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS).

Counterexample against unmodified A:

```text
POST A: BEGIN; authorization/Shift work; paused before advisory lock
GET B:  acquires same advisory lock; SELECT no Incident; COMMIT; says ABSENT
POST A: acquires released advisory lock; INSERT Incident + audit; COMMIT
```

An even earlier POST lock does not fix “GET finishes before delayed POST arrives.”
Session FOR SHARE locks do not conflict with one another. SERIALIZABLE does not
by itself outlaw the perfectly serial order GET-before-POST. HTTP cancellation,
Process-A death, elapsed time and absence from pg_locks are not proof that the
server can no longer commit.

Proposed ordering:

1. Use the existing runtime pool and one client/transaction. Explicitly use
   READ COMMITTED for the new recovery executors and the touched POST executor;
   do not rely on an unverified deployment isolation default.
2. Authenticate, lock active User, resolve/lock session scope, prove and lock
   membership/Organization/Location/access. POST additionally preserves its
   Shift and Task checks. Match the existing lock acquisition order; recovery
   must not acquire the Incident advisory lock and then wait for Shift/Task rows.
3. Acquire the identical organization-plus-ID advisory lock. Perform Incident
   and retirement SELECTs as **subsequent statements**, not a single CTE with
   the lock function. At READ COMMITTED each statement gets a fresh committed
   snapshot; see [PostgreSQL isolation semantics](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED).
4. POST returns an authorized exact prior result, rejects retirement, or inserts
   Incident + INCIDENT_OPENED. Resolution returns a prior report/retirement or
   inserts retirement + its audit. GET writes neither.
5. Keep all required locks until COMMIT/ROLLBACK. No early unlock, no session-level
   advisory lock, no release of the client between checking and writing.

| Interleaving | Required result |
| --- | --- |
| POST holds operation lock, then commits | GET/resolution waits; subsequent SELECT sees FOUND |
| POST holds lock, then rolls back | GET returns UNKNOWN unless already retired; explicit resolution retires ID and returns ABSENT |
| POST has not acquired operation lock when GET runs | GET cannot declare ABSENT without a retirement; returns UNKNOWN |
| Resolution wins before POST takes lock or arrives | Retirement commits; GET can now say ABSENT; delayed POST checks fence and cannot insert |
| Resolution rolls back, including audit failure | No fence/success claim; GET remains UNKNOWN if no Incident |
| Resolution response lost | GET finds committed report/fence or remains UNKNOWN; no assumption from transport |
| Two authenticated processes read | Same-ID reads serialize without writes; same committed fact, subject to fresh authorization |
| Two resolution processes race | One inserts fence/audit; authorized retry observes it; foreign binding receives non-disclosing denial |
| Lock timeout/deadlock/database unavailable | Roll back; never ABSENT. Show unavailable, allow explicit safe read retry |

After a committed fence, an already-running POST may still finish its transaction
but cannot commit an Incident INSERT for that ID. The durable fence, not the GET
lock alone, makes negative proof survive the read's transaction boundary.
Hash collisions can cause extra waiting, not incorrect identity matching: SQL
always matches the full IDs. Never infer identity from the hash.

## 7. Device storage, ordering and privacy contract

Although Option B is recommended, it still needs Option A's minimal local ID.
This is a **new command-specific storage usage**, not permission inferred from
DEC-072 auth SecureStore. No new dependency is proposed: current Native uses Expo
~57.0.19, expo-secure-store ~57.0.3 and expo-file-system ~57.0.6.

### Exact durable data

`IncidentRecoveryStore` is an injected asynchronous boundary with strict
read/validate, write, redact/block and delete operations, serialized by one
Incident owner. Use one namespaced SecureStore entry per installation, not a
collection. Allow at most one unresolved Native Incident operation at a time.
This deliberately blocks all new Native Incident forms while recovery is
unresolved; it does not lock custody, Shift, Guest Access or other work.

The strict version-1 pending envelope contains exactly:

```text
version: 1
state: "PENDING"
incidentId: UUID
sessionId: UUID
membershipId: UUID
organizationId: UUID
locationId: UUID
installationGeneration: bounded string from installation adapter
apiOrigin: normalized configured HTTPS origin (no path/query/credentials)
createdAt: UTC timestamp
```

Membership/scope values come from freshly loaded authenticated context and
are **local equality/purge checks only**. Current `staff-context.ts` exposes
membershipId and Organization/Location, not userId; do not invent a Native User
projection or persist a guessed ID. Account binding is the exact membership
present in the freshly authenticated User's context, plus the logout/account
generation barrier. Server membership ownership resolves User identity. API derives its own scope. Origin
binding prevents test/prod environment crossover; it is a configuration value,
not arbitrary caller input. No Shift ID is stored: Shift termination does not
invalidate ownership of an already-created report. Session binding is exact.

On expiry or definitive identity/scope retirement **while unresolved**, replace
the envelope with this non-identifying fail-closed sentinel:

```text
{ version: 1, state: "BLOCKED_REDACTED" }
```

It carries no prior account, UUID, Location or outcome. It keeps Native Incident
creation disabled across process restarts, including another login. It neither
restores the old workflow nor exposes old identity to a new account. This harsh
availability consequence is Proposed and requires explicit owner acceptance;
there is no automatic reset button or implicit reset-on-login in this child.
A recovery/reset policy after evidence has been erased is an unresolved owner
input (§12), not something the implementation may improvise.

Forbidden in either representation: description, type, severity, complete POST
body, hashes/fingerprints of content, report response, vehicle/plate/customer data,
navigation origin/history, Task or workflow snapshots, Authorization/header maps,
Staff access/refresh token, Guest bearer, pickup code, QR/proof, payment secret,
arbitrary JSON, diagnostic/error text or queued commands. Auth refresh retains
only its separately Accepted auth store; it is never copied here.

### Platform behavior

Propose SecureStore key `vaylet.employee.incident-recovery.v1`, distinct service
`com.vaylet.employee.incident-recovery`, with iOS
`WHEN_UNLOCKED_THIS_DEVICE_ONLY` and no biometric `requireAuthentication` gate.
Use foreground recovery after unlock; locked/inaccessible storage is unavailable,
not empty. Installation-generation validation is a new Incident-specific use of
the existing pattern, never authentication. Avoid sharing auth write queues or
writing Incident data into the refresh envelope.

Expo documents encrypted Android Keystore-backed storage and iOS Keychain,
different uninstall behavior, and required backup exclusions. Treat these as
platform capabilities, not a guarantee against rooted-device extraction or data
loss. See [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/).
The requested v57 documentation URL failed during audit; the current official
page identifies SDK-57-generation SecureStore. No dependency upgrade is inferred.

Current `app.json` disables the default SecureStore backup configurator because
`plugins/with-native-push-backup-exclusion.cjs` supplies exclusions for SecureStore
and the **push** installation file, including Android backup/device transfer.
It does not currently exclude the auth installation file. The child must exclude
the installation-generation file actually used by Incident recovery as well;
do not infer that all installation metadata is already excluded. Preserve
existing exclusions and test this entry through the existing plugin. Do not claim
backup is excluded merely from the package dependency. iOS Keychain survivors
with a missing/mismatched installation generation are ineligible; redact/block,
never silently restore. Web storage is not an adapter fallback.

### Required write/delete ordering and failures

1. Restore auth and authoritative context before loading/presenting scoped recovery.
   A same-scope no-Shift context is sufficient for recovery. No active Task or
   contextual navigation target is required to show the narrow receipt.
2. Validate current form input in memory; create CSPRNG UUID; complete and verify
   durable marker write **before** dispatching the original Incident POST. Fence
   auth/scope generation around the awaited write and again before dispatch.
3. Write rejected, corrupt, unverifiable or unavailable: no Incident POST. A
   partial/uncertain write is treated as potentially pending on the next read;
   never overwrite it with a different ID. No plaintext fallback.
4. Cold start reads only after auth/context restoration and local binding checks.
   PENDING allows canonical GET only. Neither startup, reconnect nor background
   scheduling sends an Incident POST or a resolution command.
5. FOUND from an authorized response is success proof; ABSENT from a committed
   fence is non-success proof. Verify response ID/session/reporter against the
   envelope before publication. Fence stale async callbacks by generation.
6. After FOUND, keep the marker until the receipt has been presented and the user
   explicitly acknowledges leaving that result (the existing return action may
   serve this purpose). This also applies to an ordinary successful POST. Clearing
   immediately on network success would reopen a second death window before the
   user sees the result. A restart before acknowledgment must re-read the receipt.
   After that acknowledgment, or after authoritative ABSENT, delete the marker.
   FOUND may be shown even if delete fails, but no new Incident ID/form may
   replace the stale entry
   until cleanup succeeds. After process death it safely re-resolves via GET.
   ABSENT with failed delete similarly remains a retired ID, never resubmittable.
7. Read failure/corruption is not “no pending recovery”: disable Incident creation.
   Retry storage access safely; persist BLOCKED_REDACTED where possible. Unknown
   schema/version must not be treated as empty or migrated into an arbitrary draft.
8. Logout, definitive auth loss, account switch, membership/Organization/Location
   change or revoked scope immediately fence memory work. Redact unresolved
   identity to BLOCKED_REDACTED before claiming local purge complete. If overwrite
   fails, retain fail-closed state and report purge unconfirmed; do not expose old
   data to another account. Use the existing awaited identity purge boundary.
   Confirm scope retirement through fresh authoritative context/auth results;
   a concealed resource 404 alone does not identify which scope predicate failed.
   Unexplained resource denial remains blocked, not a fabricated auth-loss fact.
9. Mere background, temporary network failure, context-loading gap, ended Shift,
   Task reassignment or completed session is not definitive identity/scope loss.
   Clear Process-A content as existing lifecycle policy requires, but preserve
   recovery metadata for the same authorized scope. Split workflow clear from
   durable recovery retirement; do not let `incident.clear()` erase ambiguity.

The adapter must test crash cuts and stale-write-after-purge ordering. A
single-process promise queue does not prove multi-process file atomicity. The
MVP has one Native runtime owner per installation, no headless command service.
Separate authenticated devices have separate stores; server locking protects
their same-ID interactions. If multiple app writers become possible, stop and
resolve the adapter's cross-process ownership contract before enabling them.

## 8. TTL, retention, scope purge and duplicate limits

**No current source selects an Incident marker TTL.** Owner input is required
before implementation: choose a finite `T_local` appropriate to the actual
field recovery/support interval. Do not borrow the auth session's 30-day lifetime
as operational retention authority or invent an eight-hour Shift duration.

Recommended semantics for that value: an absolute, non-sliding age from
`createdAt`; rereads/retries never extend it. At expiry, discard identity by
replacing the envelope with BLOCKED_REDACTED and display marker-expired, never
ABSENT. Clock rollback/future timestamps fail closed; timestamps are local
retention hints, never server admission proof. A terminated application cannot
execute a timed deletion: enforce expiry before reading/disclosing recovery on
the next launch/unlock, and while foregrounded. Do not promise wall-clock erasure
while the OS keeps the app dead. An owner requiring that guarantee must reject
this storage contract and choose another platform mechanism.

Server retirements have **no automatic TTL**. They are minimal retained operation
history. Deleting a fence can enable a delayed request to create the old ID again;
there is no accepted maximum request admission lifetime to make deletion safe.
Incident and audit history retention is unchanged. Any later tombstone compaction
or time-bounded acceptance protocol requires a new decision and compatibility
proof; this child adds no cleanup worker.

BLOCKED_REDACTED stores one constant safety bit and no identity/content. Its
retention is until an independently accepted reset/remediation, not a hidden
local queue. Ordinary account switch/logout cannot reset it. If the owner will
not accept this loss of availability, settle a different purge/recovery policy
before acceptance. Simply erasing an unknown operation and opening a blank form
cannot satisfy duplicate prevention.

The guarantee covers one tracked operation ID and compliant client behavior.
No architecture here can prove that separately entered reports with new IDs on
different devices/accounts describe the same real-world occurrence. Do not claim
global semantic deduplication. Uninstall/data destruction can destroy recovery
evidence and is not process-death recovery; do not prescribe reinstall or Web
resubmission as a safe way to resolve an unknown Incident.

## 9. User-visible states and required cases A–O

| Conceptual state | Truth and permitted continuation |
| --- | --- |
| No pending recovery | Valid store read is empty and no blocked sentinel; explicit new report may begin under current creation authority |
| Checking previous Incident result | Auth/context restored; scoped GET pending; no new Incident POST |
| Previous Incident confirmed | FOUND proves original receipt; clear marker with cleanup barrier; no Process-A draft restored |
| Previous Incident definitively not committed | ABSENT means permanently retired ID and no report; empty non-success form only after cleanup and current creation eligibility |
| Recovery unavailable / outcome unknown | Preserve bounded pending identity, no new report; explicit read retry and explicit resolution action only while authorized |
| Recovery invalidated by identity/scope | Purge identity, keep non-identifying block if unresolved; never infer report outcome or show it to new identity |
| Marker expired | Identity redacted, reporting blocked; no fake absence or success; no silent resubmission |

No “queued,” “will sync,” automatic POST, or success before canonical proof.
Use EN/AR, RTL identifier isolation and existing employee presentation primitives.
Recovered receipt must work without protected vehicle detail or the original
route; do not bypass detail authorization merely to satisfy today's success UI.

| Case | Required disposition |
| --- | --- |
| A: marker written, POST never sent, process dies | GET UNKNOWN; explicit resolution permanently retires unused ID → ABSENT; no Incident/audit opening |
| B: POST reaches server without committing | Wait if it owns lock; otherwise UNKNOWN; explicit resolution wins a fence or finds eventual commit |
| C: commit, lost response, death | GET FOUND for exact ID; one Incident and one INCIDENT_OPENED |
| D: caller disconnects, unknown outcome | Disconnect is not rollback; same GET/resolution protocol; no new UUID while unresolved |
| E: restart overlaps original request | Lock holder waits; pre-lock/late-arrival request must see committed retirement before insert; no false ABSENT |
| F: API unreachable | Retain pending until TTL/purge; block new report; no replay |
| G: different account | Do not query or display old scoped record as new account; redact/block; no identity carryover |
| H: original membership revoked/inactive | Deny recovery, fence/purge scoped state; never map denial to ABSENT |
| I: Organization/Location authority changed | Re-prove server authority; changed local scope redacts/blocks unresolved identity; no cross-tenant disclosure |
| J: Shift ended | Own report/retirement remains readable and ID can be retired under current recovery scope; new report still requires creation eligibility |
| K: session COMPLETED | Same narrow recovery allowed; no Incident creation, custody reopening or Task recreation |
| L: another legitimate Incident exists | Exact ID only; no latest/list matching; distinct IDs remain independent |
| M: wants changed type/severity/description | No old body exists in Process B. Resolve old ID first. FOUND is original success, not an editable draft; ABSENT permits explicit new ID/new input after cleanup. Same-process changed committed-ID payload still conflicts |
| N: stale marker | TTL expiry redacts/blocks without inventing outcome; deletion/reset is not absence proof |
| O: write fails before POST | Fail closed before network mutation; local input may remain in memory; no unprotected send |

Same-process exact-payload manual retry stays available under current POST
authorization until the user chooses resolution/retirement. Once resolution
starts, locally fence POST attempts; a committed retirement prevents even a late
server retry. Same ID after retirement never means “start again.” A legitimately
different new Incident is an explicit new operation after the old one resolves,
not an automatic reaction to a network failure or changed draft.

## 10. Audit, DB/runtime and rollout consequences

Incident creation keeps exactly one append-only INCIDENT_OPENED, atomic with the
Incident insert. Exact retry and GET add zero opening events. Existing audit
metadata retains incidentId/severity/status/type and excludes description.
No Incident, Task, ValetSession, custody, payment or release transition is added.

First retirement adds exactly one **new Proposed** audit event
`INCIDENT_RECOVERY_RETIRED`, entity type `INCIDENT_RECOVERY`, entity ID incidentId,
with server-derived Organization/Location/session/actor and database retirement
time. Metadata is exactly `{ incidentId }`; no text/body/reason. Insert it in the
retirement transaction. Audit failure rolls back retirement; retry adds no event.
This distinguishes preventing an unused operation from opening an Incident.

**DB impact of future implementation is not NONE:** one new forward-only migration
named `<next-coordinated-timestamp>_incident_recovery_retirements` creates only the
table/PK/FKs specified in §4; no existing migration rewrite. Update Prisma/schema
docs and fixtures. `audit_events.event_type` is TEXT, so this audit event requires
no enum migration. No Incident table/index change is required for UUID lookup.
Cross-table exclusion is enforced by the shared lock/check on every writer, not
by pretending two table primary keys provide cross-table uniqueness. Integration
tests must prove Incident and retirement cannot coexist for the same scoped ID.

DEC-059 already supplies Incident SELECT for the query; **no additional incidents
privilege** is needed. New retirement table requires runtime SELECT/INSERT only,
with UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER and PUBLIC denied. Use the existing
provision/verify boundary; no hard-coded deployment role in migration. Audit
privileges and authority-row lock grants remain unchanged. No direct device DB
access. Test actual runtime credentials, not only an admin fixture.

Rollout must install schema/grants and deploy the fence-aware POST on **every API
replica before enabling resolution** or the new Native flow. Old replicas that
ignore retirement invalidate ABSENT. Do not claim a rolling mixed-version window
is safe. A rollback may disable resolution/new Native creation while leaving
the server fence check in place. Once retirement rows exist, reverting to an
unfenced POST is unsafe; do not drop the table or grants as a rollback shortcut.
Employee Web can continue unrelated work; it cannot be used to blindly resubmit
an unresolved Native occurrence with a new ID.

## 11. Exact implementation child handoff and test obligations

**MOB-023B-INCIDENT-RECOVERY-IMPLEMENTATION** becomes legal only after owner
acceptance, independent decision review and resolution of §12 inputs. Fetch
fresh main, inspect current focused status and allocate the migration with its
owner. Keep one implementation writer; split focused files before approaching
300 lines. This is one Incident recovery feature, not MOB-024A or generic offline
infrastructure. No dependency change is expected.

Paths marked new are proposed future files, not files created by this branch.

| Area | Exact future file map / responsibility |
| --- | --- |
| Contracts | New `packages/contracts/src/incident-recovery.ts`: strict GET FOUND/ABSENT/UNKNOWN union, resolution FOUND/ABSENT union, empty query/body and UUID parameter schemas; reuse opening receipt. Export through `src/index.ts`; new `src/incident-recovery.test.ts`. Existing `src/incidents.ts` four-field body unchanged |
| Portable | New `packages/employee-client/src/incident-recovery-{types,store,state,transport}.ts` and focused `.test.ts` files: neutral envelopes, adapter interface, validation/retention/generation rules and explicit transports. `src/index.ts` exports only needed types/schemas/helpers; never import Expo/React Native/Node/DOM. Do not broaden `recovery-policy.ts` mutation retries |
| API query | New `apps/api/src/modules/incidents/incident-recovery-query.ts`, `incident-recovery-authorization.ts`, `incident-operation-lock.ts`: narrow transactional read, full scope/reporter checks, shared exact lock identity |
| API command | New `incident-recovery-resolution-command.ts`, `incident-recovery-retirement.ts`: immutable fence insert/check and atomic narrow audit; update `incident-reporting-command.ts` with mandatory pre-insert retirement guard and explicit isolation |
| API transport/wiring | New `incident-recovery.controller.ts`, `incident-recovery.service.ts` under existing incidents directory; wire in `apps/api/src/modules/staff/staff.module.ts`, same runtime pool, principal resolver, operation runner and exactly-once request-ID middleware. Preserve reporting controller/service contract; integrate new safe error mapping in existing HTTP error boundary if needed |
| API proof | New `apps/api/test/incident-recovery-{authorization,serialization,retirement}.integration.test.ts` and focused harness; extend `staff-incident-reporting.integration.test.ts`, `staff-valet-session-harness.ts`, `feature-module-ownership.test.ts` only where needed |
| Native store | New `apps/valet-native/src/incident/expo-incident-recovery-store.ts`: namespaced SecureStore pending/sentinel entry, platform options, strict failures. Existing auth storage remains auth-only. Preserve/test `plugins/with-native-push-backup-exclusion.cjs`; no generated native project edits |
| Native orchestration | New `src/incident/native-incident-recovery.ts`; integrate `native-incident-session.ts` with write-before-POST, singleton pending guard and resolution cleanup. `src/auth/native-auth-runtime.ts`, `identity-state-boundary.ts`, `src/shell/native-production-bootstrap.ts`, `native-workflow-scope-retirement.ts`, `src/shift/native-shift-retirement.ts`: awaited purge/restore and distinguish Shift end from identity retirement. Extract runtime composition if necessary; no god-file growth |
| Native presentation | `src/incident/native-incident-{types,screen,form,copy}.ts(x)` as appropriate; new recovery panel; existing EN/AR dictionary owners and shell composition. Receipt independent of custody detail; recovery available in same-scope no-Shift shell; `native-contextual-route.ts` remains non-durable |
| Native proof | New `test/native-incident-recovery-{store,process-death,scope,parity}.test.ts(x)`; extend `native-process-death-recovery.test.ts`, `native-process-death-routing.test.ts`, incident repair/success lifecycle suites and identity-purge tests |
| DB | `packages/database/prisma/schema.prisma`, one new coordinated `prisma/migrations/<timestamp>_incident_recovery_retirements/migration.sql`, focused DB invariant tests; `scripts/runtime-table-privileges.mjs` / `verify-runtime-table-privileges.mjs` plus focused retirement privilege helper/tests if size demands extraction |
| Docs | After acceptance coordinate DEC status and `docs/08_DECISIONS_LOG.md` mirror, `docs/03_DATABASE_SCHEMA.md`, relevant security/recovery docs and `docs/20_EMPLOYEE_NATIVE_EXECUTION_PLAN.md` links. Update MOB-023B evidence only after implementation/review; never close parent or G7 from decision acceptance alone |

### Deterministic future test plan

Use real PostgreSQL for server lock/transaction proof. Gate transactions at known
points using separate clients; observe blocking/lock ownership, release the gate,
then assert persisted rows and outcomes. Timing sleeps or a mocked mutex are not
proof. Cut responses after COMMIT independently of the Process-A client result.
Process B is a fresh production owner, sharing only permitted durable storage and
server persistence, never serialized Process-A snapshots or drafts.

1. Marker confirmed → POST commits → response lost → Process A dies → Process B
   GET FOUND; exactly one Incident and one INCIDENT_OPENED, zero replay.
2. Marker confirmed, no POST commit → GET UNKNOWN → explicit resolution commits
   retirement → GET ABSENT; no fake success or opening event.
3. POST already holds advisory lock → Process-B GET waits → commit gives FOUND;
   rollback gives UNKNOWN until resolution. Real PostgreSQL required.
4. POST transaction rollback, including audit insertion failure → retirement
   then ABSENT; zero Incident/INCIDENT_OPENED.
5. API unavailable during recovery → ambiguous, pending retained, no new POST.
6. Same-process same-ID exact normalized payload retry returns original result.
7. Changed description/type/severity or session with the same committed ID
   conflicts when current authorization allows reaching idempotency checks.
8. Different authenticated actor cannot read/resolve an existing report or
   retirement ID; GET UNKNOWN is indistinguishable from an unused ID in the same
   authorized scope, resolution denies, and no report content leaks.
9. Wrong Organization/Location, absent access, inactive Organization/Location and
   anonymous callers denied; spoofed marker fields grant nothing.
10. Account switch fences late responses/writes; old identity is redacted and
    never queried/displayed under the new account; unresolved block persists.
11. Logout/definitive auth loss redacts pending metadata; purge failure is
    unconfirmed/fail-closed; restart does not restore the prior workflow.
12. Membership/Location revocation race: authorization locks order before
    disclosure/write or observe revocation; fail closed after revocation wins.
13. Shift ends after report commit, before recovery → FOUND without active Shift.
14. Session completes after report commit, before recovery → FOUND without
    session-detail/Task prerequisite; no custody write.
15. Multiple legitimate Incidents for a session → only exact ID returned;
    identical type/severity/description on distinct IDs is not deduplicated.
16. Store write failure before original POST → transport sees zero Incident POSTs.
17. Store delete failure after FOUND/ABSENT → no new ID or POST; fresh owner
    re-resolves the stale marker; repeated recovery adds no opening audit.
18. Process death after marker write but before POST dispatch → explicit
    resolution yields retirement/ABSENT; no request body survives.
19. Death immediately after dispatch → test request not yet in executor,
    authorization blocked before advisory lock, and transaction holding lock.
20. Canary description/type/severity, Authorization/access/refresh tokens,
    Guest bearer/proofs and body fields absent from actual recovery adapter
    writes, backups, logs/diagnostic sinks, errors and navigation persistence.
21. Reconnect, foreground and cold start cause GET only; no automatic Incident
    POST or automatic resolution POST; no background mutation service.
22. Reporter read has no list/search/pagination/reporter/time-window interface;
    malformed/extra query/body fields rejected; no Dashboard delegation.
23. Critical counterexample: pause POST before its lock; GET UNKNOWN; resolution
    retires; resume POST → retired conflict, zero Incident. Repeat with POST
    arriving only after resolution/ABSENT completed and through a legacy client.
24. Two reads and two resolution commands from authenticated processes converge
    to one fence/audit or one report/opening audit; test both winner orders,
    response loss, rollback and cross-actor reservation race from §5.
25. Retirement audit failure rolls back fence; retirement response loss recovered
    by GET; both report and fence for one Organization/ID is an invariant failure.
26. READ COMMITTED post-lock separate SELECT sees winner commit; injected lock
    timeout/deadlock/unsupported isolation never produces ABSENT.
27. TTL boundary, clock skew, unknown version, corruption, secure read/overwrite
    failure and process death during purge preserve the block and disclose no
    old identity; TTL and logout never unlock a duplicate report.
28. Android backup/device-transfer exclusions, locked storage and uninstall
    distinction; iOS device-only Keychain/install-generation behavior and
    same-source build smoke. Automated results are not physical proof.
29. Real provisioned runtime can SELECT/INSERT retirements and incidents but
    cannot update/delete retirement/Incident/audit history or gain PUBLIC access;
    migration on empty and representative existing data preserves all history.
30. Rollout gate rejects enabling recovery with any unfenced API writer;
    rollback keeps permanent rejection of retired IDs. No generic outbox appears.
31. Crash after canonical FOUND/ordinary POST success but before receipt display
    or acknowledgment retains the marker and re-reads the receipt; only explicit
    result acknowledgment can clear a committed report's recovery identity.

Run affected contracts/API/database, portable and Native tests/lint/typecheck,
relevant builds, architecture check, targeted Prettier and diff checks under the
plan's C-API/C-UI profiles. Record remote CI separately. EN/AR recovery/parity,
physical process-death/SecureStore evidence and iOS smoke retain their stated
downstream gates; this document claims none of them.

## 12. Owner inputs, consequences, fallback and non-goals

Acceptance must explicitly resolve:

1. Accept the retirement-only Option B variant, new table/audit/explicit command
   and mixed-version rollout restriction, or request a revised design. A bare
   advisory-lock GET cannot be accepted as definitive absence.
2. Accept the unused-ID retirement authority/denial-of-service tradeoff in §5,
   or require pre-POST server actor binding in a revised intent design.
3. Select finite `T_local` using field/support needs; accept next-execution
   expiry enforcement, permanent server fences and the redacted safety sentinel.
4. Accept that unresolved expiry/logout/scope purge disables Native Incident
   creation on that installation, or define an independently reviewable safe
   remediation/reset policy **before implementation**. This document does not
   authorize reset through logout, reinstall, elapsed time or an “I understand”
   button. A lighter design must state which guarantee it changes.

These are material owner decisions, not developer discretion. Until resolved,
the implementation child remains BLOCKED even if the architectural direction is
preferred. Exact retention numbers and a safe reset authority are not inferred
from unrelated Accepted decisions.

Benefits: exact positive proof, durable negative proof against late requests,
no content at rest on device, no replay, preserved reporter privacy and terminal
Shift/session recovery. Costs: migration and permanent small negative records,
explicit recovery interaction, conservative availability after evidence purge,
new unused-ID retirement authority, and rollout compatibility discipline.

Fallback before acceptance is the current truthful blocked Incident recovery
behavior. Preserve existing reports/audits. Do not “fix” it by regenerating IDs,
persisting a body, calling Dashboard as Employee or fabricating a success.
If the owner rejects these costs, revise the decision; do not implement only
positive recovery and claim MOB-023B is complete.

Non-goals: durable drafts, generic queue/journal/outbox, automatic or background
mutations, Incident list/search/edit/resolve/close business workflows, changes to
custody/Task/payment/auth policy, Guest proof persistence, new dependencies,
third-party infrastructure, cross-device semantic deduplication, MOB-024A,
release/pilot acceptance or physical-evidence claims.

**MOB-023B remains BLOCKED pending owner acceptance + implementation + independent
review. G7 remains OPEN. Physical evidence remains: DEFERRED — owner deferred
physical evidence gate.** Stop after this documentation branch is committed and
pushed for independent ChatGPT and owner decision review.
