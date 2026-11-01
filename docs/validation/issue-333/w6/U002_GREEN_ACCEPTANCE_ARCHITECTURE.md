# Issue #333 U-002 — W6 deterministic GREEN acceptance architecture

Status: **verification design only; production remediation NOT authorized**.
Worktree: `D:/kndoom/valet-platform/tmp/issue-333-u002-w6-tests`.
Branch: `audit/issue-333-u002-w6-tests`.
Audited HEAD: `d8c342d5305fd688261312a7c777553ad3c1b4ac` (clean before this report).
Reference: Accepted `DEC-108`, `DEC-081`, U-001 evidence, #315 28/28 and #319 89/89 historical checks.

## 1. Result and authority

**DECISION REQUIRED** for the exact production response-delivery fence and a
separate Owner implementation GO. This document defines falsifiable acceptance
for tests only. The five historical location-grant disclosures remain original
RED evidence. Nothing here downgrades, deletes, modifies or excuses them.

**LOCKED:** Once the authentic Staff Management LocationAccess revoke commits,
a former grant holder cannot receive revoked-Location protected data in an HTTP
response whose protected server delivery has not finished. Unaffected, still
authorized Locations may remain. An earlier SQL snapshot, handler return or
client-side receipt timestamp cannot satisfy the contract
(`DEC-108:15-42`). Emergency/security disable has a stronger immediate
access/session-revocation rule (`DEC-081:19-34`).

**DERIVED:** Strict GREEN requires a server delivery witness plus a persisted
revoke-commit witness, authenticated HTTP, actual protected-body inspection and
bounded PostgreSQL ordering evidence. A fresh denied read alone cannot pass.

**UNRESOLVED:** Which response fence, lock lifetime and slow-client policy the
Owner approves; the bounded emergency preemption threshold; whether to add a
new test-only transport probe and explicit opt-in GREEN suite. No final
implementation mechanism is selected here.

## 2. Source and verified baseline inventory

| Boundary | Live sources and existing test | Proof now |
| --- | --- | --- |
| P1-A Live Map | `tracking/live-map-query.ts:117-198`; `live-map-read-authorization.ts:17-77`; `test/dashboard-issue333-live-map.integration.test.ts:70-159` | `REPEATABLE READ`; original test **observes** stale disclosure but currently *passes* the characterization. Real old PG diagnostic PID/snapshot recorded in `p1a-live-map-evidence.md`. |
| P1-B Location directory | `dashboard-scope-discovery.service.ts:77-158`; `test/dashboard-issue333-scope-races.integration.test.ts:200-241` | Strict **RED** after real SQL/service result before HTTP: canonical revoke `201`, grant `0`, stale exact `items[].locationId`, fresh exclusion. |
| P1-C1 contact search | `management-visit-contact.service.ts:91-102`; `test/issue333-w4-visit-contacts.integration.test.ts:217-227` | Strict **RED** in five native PG17 runs; synthetic name marker. |
| P1-C2 customer history | `management-visit-contact.service.ts:104-134`; W4 test `:229-243` | Strict **RED**; actual customer-history GET with route-specific marker. |
| P1-C3 vehicle history | Same service; W4 test `:245-259` | Strict **RED**; actual vehicle-history GET with route-specific marker. |

The five canonical GET paths:

1. `/v1/staff/locations/:locationId/live-operations-map`.
2. `/v1/staff/dashboard/organizations/:organizationId/locations`.
3. `/v1/staff/management/organizations/:organizationId/visit-contacts?name=...`.
4. `/v1/staff/management/organizations/:organizationId/visit-contacts/:customerId/visits`.
5. `/v1/staff/management/organizations/:organizationId/visit-vehicles/:vehicleId/visits`.

All five invalidations must use a real MFA-assured Company Admin
`POST /v1/staff/management/organizations/:organizationId/staff/:membershipId/location-access/revoke`,
the current expected membership version, `locationIds`, HTTP `201`, and
an independent **committed** membership/grant query after the writer responds.
The fixture's seeded visit/vehicle records may be test-only inserts; those do
not prove any canonical visit creation write. The grant invalidator must be
authentic. Existing `staff-management-mutation.service.ts:136-183` invokes
`staff_management_set_location_access`, atomic tenant audit and a transaction;
`management-authorization.ts:111-116` holds the organization-keyed exclusive
advisory lock.

## 3. Deterministic transport and database witnesses

A W6-only fixture probe (if approved) should attach to the actual Nest HTTP
server **before request handling**, matching a one-off opaque test request ID
and one of these five route patterns. It records only ordered event names,
monotonic times, status, a boolean body-marker presence, byte count and a
test-only connection identifier. Observe actual
`ServerResponse.finish`, `close`, `writableFinished`, `headersSent`
and whether any protected bytes were queued; never log headers, tokens,
codes, private names, entire bodies, credentials or raw DSNs. Distinguish a
normal `finish` from premature `close`. A test latch at the final pre-byte
transport enqueue can hold an HTTP response before its first protected byte;
prove it actually fired, with a finite deadline and a `finally` release.

Record writer progress from a **real** independent PostgreSQL connection:
exact backend PID, `pg_blocking_pids`, transaction/wait state, and persisted
grant/version/audit after success. For precise commit ordering, use a test-only
writer transaction hook immediately before/after the real `COMMIT`, or an
independent post-commit witness. HTTP `201` proves the canonical writer
completed its commit, but it is later than the commit itself. A response
finishing before a *writer HTTP reply* alone does not prove the response
finished before the *writer commit*. Use actual commit observation when
classifying allowed schedules.

A safe acceptance decision for a revoked marker is:

| Observed ordering | Acceptable server result |
| --- | --- |
| Reader protected server `finish` precedes successful revoke COMMIT | Pre-revoke marker permitted for that fully delivered response. |
| Revoke COMMIT precedes reader protected server `finish` | No revoked-Location protected bytes **after COMMIT**; fail closed/omit the projection, and record any already-delivered partial bytes separately. |
| Reader disconnects before `finish` | No subsequent protected enqueue; locks, reservations and leases released, writer drains. |
| Commit outcome unavailable | Reconcile from persisted grant/version/audit and the actual delivery events; cannot assume commit or rollback. |

If alternative fencing causes the writer to wait, the test must observe
the pending writer's exact blocker graph until reader delivery finishes. If
the implementation denies/filters instead, prove no bytes disclosed after
the actual commit; do not demand a particular lock implementation.

## 4. Schedule matrix, repeated independently for each of five routes

| Schedule | Barrier | Strict assertion |
| --- | --- | --- |
| R0 baseline | Fresh authorized LM, Location A and retained B, private synthetic A/B markers | HTTP `200` contains only authorized Locations; no A leakage into other-tenant or ungranted reads. |
| R1 writer-first | Await canonical revoke HTTP `201` and persisted A grant=0 before starting GET | No A marker, irrespective of denial or narrowed `200`; B may remain if route allows. |
| R2 reader-first, pre-enqueue | Await real authorization/projection and test transport latch, then start writer; release only after proving PG block or an explicit safe deny/omit route | Either protected server `finish` precedes writer COMMIT, or writer COMMIT precedes `finish` with no post-commit A bytes. The original stale-after-commit trace is a **FAIL**, never an allowed green observation. |
| R3 two readers/one writer | Independently authenticated HTTP reads reach two gates; launch one real revoker | Witness separate readers/PIDs or bounded transport identities, a single canonical writer, and authorized/denied delivery order for **both** reads. No indefinite wait. |
| R4 writer/read cancellation | Cancel one gated HTTP reader and close socket before `finish` | Abort/no later A bytes, writer progresses, no leaked PG clients, no stuck lock; surviving read remains correct. |

For P1-A additionally observe that an RR snapshot taken before revoke cannot
be reused to authorize a response delivered after commit. For P1-B test
`items[].locationId` exactly: a marker anywhere in JSON is weaker evidence.
For C1/C2/C3 use independent real HTTP routes, private markers and *actual*
contact/visit item inspection, plus `fresh`/retained-B checks.

The Dashboard Organization list
`GET /v1/staff/dashboard/organizations` is **additional** coverage for role,
membership status and multiple Organizations. A grant revoke does not
automatically remove an otherwise active LM Organization under
`dashboard-scope-discovery.service.ts:31-75`; do not invent that U-001 rule.
Likewise ordinary role downgrade and membership deactivation stale HTTP
behavior remain separately classified **UNVERIFIED by U-001**
(`DEC-108:71-75`). Their canonical paths are the existing `/role` and
`/deactivate` writers, not a direct fixture UPDATE.

## 5. Distinct identity/authorization negatives

For each route, use an active LM with A+B grants, another active same-Org
LM with no A, and an independent Organization/User; assert A cannot leak to
either unauthorized identity. Test a User with memberships in Organizations
X and Y, ensuring the exact X grant revocation does not disable independent
authorized Y visibility; do not collapse User and OrganizationMembership.
Recheck current role/membership/User/session, exact MFA-assured CA writer,
inactive Organization/Location, Supervisor active Shift on Live Map,
CA's independent MFA-gated Live Map path, same-Org ungranted IDs and direct
foreign customer/vehicle IDs. Preserve granted **inactive Location history**
when otherwise authorized (DEC-094), without treating inactivity as revoked
access. Assert no plaintext token, TOTP, phone, private sentinel or grant
detail in public logs or audit metadata. No Shift/Task/ValetSession mutation
is part of U-002: only test seed data and authorized Staff grant writers.

## 6. Failure, locking and rollback acceptance

1. **Real post-mutation rollback:** Test-only spy surrounds the real
   `setStaffLocationAccess` repository call, lets the SQL mutation finish *inside
   the real writer transaction*, records its same-transaction effect, then
   raises a controlled audit/write failure before COMMIT. Independent DB
   sees no uncommitted change, HTTP writer fails, and final grant, membership
   version and tenant audit remain at their original values. Reader may still
   deliver correctly authorized A. A stale CAS `409` is a useful separate
   test but is not post-mutation rollback.
2. **Unknown COMMIT acknowledgment:** Inject transport loss or an equivalent
   transaction-boundary fault *after COMMIT send, before reliable client ack*,
   on the owned test database only. Do **not** force a guessed winner. Reopen a
   separate connection, reconcile `membership_location_access`, membership
   version and count of matching audit events; accept only exactly one
   consistent committed or rolled-back state. Then assess reader delivery
   against the reconciled commit. A simulated thrown exception *after a
   confirmed COMMIT* proves acknowledgment handling but does **not** prove
   naturally ambiguous commit behavior. Explicitly label these tiers.
3. **Two readers and writer:** Match actual session/PID blockers and ordered
   locks. The existing W6 `dashboard-issue333-harness.integration.test.ts:104-138`
   proves SHARED/EXCLUSIVE advisory behavior in raw PG only. It does not
   establish that any of the five HTTP paths holds that lock.
4. **Timeout/cancel:** Prove real `55P03` and `57014` against a canonical
   route's contested resources, safe HTTP mapping, rollback, no A disclosure
   and healthy next query. W6 `:140-171` already demonstrates these SQLSTATEs
   on independent clients only. `40001` in W6 `:173-190` was *synthetically
   raised*, not a natural serialization conflict; prove a real conflict if
   reachable or mark this row NOT EXERCISED.
5. **Deadlock/retry exhaustion:** Include opposed concurrent grant/role writers
   and multiple X/Y Organization locks with deterministic total order. Observe
   `40P01`/finite recovery if naturally reachable; no generic retry claim
   without a real writer witness. A losing writer must preserve CAS, audit
   uniqueness and tenant confinement.
6. **Emergency disable:** Under DEC-081, a slow HTTP client must not indefinitely
   postpone immediate current-access/session revocation. Exercise both
   emergency-first and paused-reader-first; obtain an Owner-approved finite
   deadline/response behavior before declaring full GREEN.

For failures always drain reader/writer Promise settlements in `finally`,
release every test latch, restore spies, close HTTP clients, and keep finite
timeouts on the gate itself and all cleanup phases. A test timeout, orphaned
client or missing barrier is **BLOCKED/FAIL**, never security PASS.

## 7. Capacity, transport, performance and cleanup

The current native fixture uses actual loopback Nest HTTP + `fetch(...).text()`
(`staff-auth-native-fixture.ts:131-135,187-213`); the latter marks **client
receipt**, not server `finish`. Runtime PG defaults to `max=4` pool,
2s acquisition/lock, 3s statement, 2s idle transaction and 5s transaction
budgets (`runtime-postgres-policy.ts:3-10,38-42,95-105`).
A proposed two-lease fence therefore needs a real 4-lease saturation case:
simultaneous readers, one writer, one unrelated request, finite queue admission,
bounded waiter count, no hold-and-wait for a second lease and no pool deadlock.
Measure actual `totalCount/idleCount/waitingCount` and server diagnostic
peaks before, during and after cancellation.

Collect separate p50/p95 with `n`, method, route, scenario and unit for
uncontended reads/writes, held-lock writes, slow clients, disconnect, pool
pressure and retries. Capture lock-held duration and response-body bytes,
never private payload. Development measurements are not production SLOs;
do not set an invented acceptance millisecond budget without approval.

Run solely via the W6 owned runner, after an exact live cluster attestation:
`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite issue333 [-TestFile test/dashboard-issue333-...integration.test.ts]`.
It creates a new random private PG17 data directory beneath **this W6
worktree**, loopback random nonstandard port, verifies owner/port/PGDATA/version,
migrates a child DB and provisions non-superuser runtime role. The postrun
cleanup requires child DB count `0`, other child connection count `0`,
successful own-cluster stop and owned path removal. A failed identity or
cleanup attestation halts testing and retains only the new run's evidence
directory for inspection; no global sweeper, shared DB, old W3 cleanup or
manual aggressive teardown. Redact bootstrap credentials and bearer material.

The W4 original three RED files have a **different** owner, environment and
PGDATA guard (`issue333-w4-private-lab.ts:19-40`) and are **not** selected
by W6 `vitest.config.mjs:6` or `run-owned-postgres.ps1:2-5`. A GREEN
acceptance suite must explicitly include three new W6-owned C-route tests
using a W6-attested fixture (the existing
`ManagementVisitContactTestFixture` extends
`ManagementControlPlaneTestFixture`) or run the isolated W4 runner as
its own separate approved cluster. Do not bypass W4 attestation or edit
its immutable RED assertions. Keep new authored code files <=300 lines.
Possible test-only files: `dashboard-issue333-green-transport.ts`,
`dashboard-issue333-green-scenarios.ts`,
`dashboard-issue333-green-live-map.integration.test.ts`,
`dashboard-issue333-green-scope.integration.test.ts`,
`dashboard-issue333-green-visit-contacts.integration.test.ts`,
and a separate opt-in strict GREEN Vitest config/runner mode. The test suite
may intentionally remain RED until an authorized runtime fix exists.

## 8. W3 artifact, read-only protection

Historical stopped W3 PGDATA:
`D:/kndoom/valet-platform/tmp/issue-333-w3/tmp/issue-315-pg-qa/issue319-issue333-w3-c9de2faf0847446cb24af327bf9cdaa7/.issue315-private-cluster`.
On 2026-10-31 a read-only `Test-Path` attested directory present,
`PG_VERSION` present, `global/pg_control` present, and
`postmaster.pid` absent. No credential/secret was opened, no database
connection was made, no process restarted, and nothing was removed or edited.
The committed W3 report records a residual child DB after teardown timeout;
this is U-003's separately governed cleanup, never W6's.

## 9. Current validation/evidence and gaps

| Item | Status |
| --- | --- |
| W6 branch/SHA and source-first review | PASS — clean `d8c342d5`, existing code inspected. |
| W6 raw PG two-readers/one-writer lock; 55P03, 57014 | Historical PASS 4/4 suite, per `w6/README.md`; no new execution in this task. |
| P1-A/B/C original five disclosure schedules | FAIL (expected security RED), evidence in U-001 report; original tests preserved. |
| Combined five-route strict GREEN authenticated HTTP suite | NOT RUN / NOT IMPLEMENTED, pending runtime fence and test transport witness. |
| Post-mutation rollback, genuinely unknown COMMIT, real 40001, disconnect | NOT VERIFIED at canonical five-route boundary. |
| HTTP server finish/close ordering, pool pressure and latency | NOT VERIFIED; current fixture only returns completed client body. |
| Actual CI / production relevance | NOT CLAIMED. Historical #315 28/28 and #319 89/89 remain prior evidence. |

No runtime source, migration, schema, dependency, grant, UI, PR, merge or
deployment change is within this task. **Verdict: DECISION REQUIRED** for
implementation strategy and GO; deterministic acceptance conditions are
specified but security GREEN is not established.
