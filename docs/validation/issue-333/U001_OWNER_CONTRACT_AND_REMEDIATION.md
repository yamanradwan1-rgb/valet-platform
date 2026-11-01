# Issue #333 — Owner-accepted U-001, security findings and conditional remediation

Status: **Owner U-001 accepted; runtime remediation NOT authorized**.
Verification baseline: `origin/main c638a437749cae1f78a8c8a417fd4d53e6a34920`.
Follow-up worktree: `audit/issue-333-authorization-concurrency-verification`.
Owner direction: 2026-10-31. Previous immutable evidence snapshot: commit
`22360d666539f1817ea1dc221f53e17d2a2c4b86`.

## 1. LOCKED security contract

The Owner has accepted **U-001** in
[`DEC-108`](../../decisions/DEC-108_LOCATION_ACCESS_REVOCATION_DELIVERY.md):
after the supported `LocationAccess` revocation commits, no protected data from
the revoked Location may be delivered to its former grant holder, including a
previously authorized HTTP request that has not finished response delivery.
Previously populated data or a PostgreSQL snapshot is no exception. Data from
other independently granted Locations may still be returned.

Binding cross-check (all named focused files have their own `Accepted` status):

| Decision | Binding rule and U-001 interaction |
| --- | --- |
| DEC-023 (`docs/08_DECISIONS_LOG.md:625-655, 719-775`) | Database-backed Staff identity/session; no tenant, role or grant claim in credential. Already-resolved logout/session handling cannot justify continued Location disclosure. No new global session-cancellation contract. |
| DEC-049 (`docs/decisions/DEC-049_*:127-145`) | Location-specific Live Map roles, grants, Supervisor active Shift, private movement. DEC-080 subsequently amends Company Admin map visibility with MFA. |
| DEC-032 and DEC-045/046 | Supervisor Shift eligibility is per membership and task-scoped map privacy is preserved; no whole-Shift or cross-Organization tracking. |
| DEC-078 (`DEC-078_*:15-37`) | Exact Staff-session assurance, five-minute sensitive MFA, no change to refresh/rotation/replay. |
| DEC-080 (`DEC-080_*:15-35, 47-56`) | Company Admin may view Organization operations with MFA, no field custody authority, and current persisted request authority. |
| DEC-081 (`DEC-081_*:14-34, 67-97`) | Staff role/grant writer has CAS, authoritative target/actor rechecks, tenant audit and serialized mutation. **Emergency/security disable still blocks new and current access immediately and revokes sessions**, a stricter rule. |
| DEC-084 (`DEC-084_*:13-29, 42-46`) | Visit Contact search and history are scoped to currently visible Organization/Locations and role-minimized private fields. |
| DEC-069 and DEC-079 | Employee recognition remains narrower than visit management; tenant/admin/security audit types and private-metadata exclusions stay unchanged. |
| DEC-072 and DEC-075/076 | Native staff session transport and privacy-safe push attention/session fencing are separate contracts; U-001 does not amend them. |
| DEC-094 (`DEC-094_*:13-36, 50-54`) | Historical data survives Location deactivation and remains visible if otherwise authorized; inactivity alone is not grant revocation. |

Entities: `User`, `StaffAuthSession`, `Organization`, `OrganizationMembership`,
`MembershipLocationAccess`, `Location`, `Shift`, `TaskTrackingSession`,
`ValetSession`, `Customer`, `Vehicle`, `AuditEvent`. No Task/Dispatch or
ValetSession state transition and no schema, index or configuration change is
approved. Tenant and exact-Location scope derive from persisted state.

## 2. Reader/writer dependencies and observed transaction behavior

| Boundary | Real reader and projection | Invalidating canonical writer | Observed interleaving |
| --- | --- | --- | --- |
| P1-A Live Map | `GET /v1/staff/locations/:locationId/live-operations-map` → `tracking/live-map-query.ts:117-198` and `live-map-read-authorization.ts`. `REPEATABLE READ`, private vehicle/GPS projection. | CA sensitive-MFA `POST /v1/staff/management/organizations/:organizationId/staff/:membershipId/location-access/revoke`. | PostgreSQL RR reader held earlier grant snapshot; writer returned `201` and grant count `0`; pending `200` still contained synthetic vehicle descriptor. |
| P1-B Dashboard scope | `GET /v1/staff/dashboard/organizations` and `GET .../:organizationId/locations` → `dashboard-scope-discovery.service.ts:31-157`. Session recheck plus READ COMMITTED membership/grant reads. | Same canonical grant revoke, role update, membership status command. | Original W3 SQL barrier failed. Follow-up real-PG gate after the service transaction completed and before HTTP delivery returned a revoked Location after writer commit. Role/status transitions produced similar observations, without assuming U-001 governs those separate transitions. |
| P1-C Visit Contacts | `GET .../visit-contacts`, `GET .../visit-contacts/:customerId/visits`, `GET .../visit-vehicles/:vehicleId/visits` → `management-visit-contact.service.ts` and authorization. READ COMMITTED, captured aggregate LM Location grants, private contact/vehicle history. | Same canonical CA MFA Location grant revoke. | All three routes: writer HTTP `201`, grant count `0`, paused HTTP `200` with private Location A marker, fresh HTTP `200` without marker. |

Supported role/status/grant writers use the same organization-keyed exclusive
`pg_advisory_xact_lock(hashtextextended('staff-management-org:' || orgId, 0))`
inside the Staff Management transaction, with CAS/version and append-only tenant
audit. The inspected P1 reader paths do not acquire a compatible retained
organization grant fence through HTTP response delivery. Existing session locks,
REPEATABLE READ snapshots, later SQL rechecks and fresh-request denial do not
by themselves close this delivery window.

## 3. Evidence-based classification, after Owner U-001

| Finding | Classification | Severity | Proof and limits |
| --- | --- | --- | --- |
| **F333-A: Live Map stale Location delivery** | **CONFIRMED VULNERABILITY** | **P2** | `p1a-live-map-evidence.md`: private PG17 PID `29332`, RR snapshot `1906:1906:`, reader `idle in transaction`, `pg_blocking_pids=[]`; canonical HTTP `201`, persisted grant `0`, pending `200` protected vehicle marker, fresh `404`. This is one demonstrated Location/role schedule; no production exploitation or cross-tenant disclosure established. |
| **F333-C1: contact search** | **CONFIRMED VULNERABILITY** | **P2** | `w4-visit-contacts/reproduction.md`: five independent private PG17 runs, strict synthetic private marker assertion RED each run; canonical `201`, grant `0`, stale `200` marker present and fresh excluded. |
| **F333-C2: customer visit history** | **CONFIRMED VULNERABILITY** | **P2** | Same five runs, distinct authenticated HTTP route and synthetic history marker; diagnostic latest reader PID `22908`, READ COMMITTED snapshot `1967:1967:`, no blockers. |
| **F333-C3: vehicle visit history** | **CONFIRMED VULNERABILITY** | **P2** | Same five runs, independent vehicle visit route; latest reader PID `22908`, READ COMMITTED snapshot `1990:1990:`, no blockers. |
| **F333-B: Dashboard granted-Location directory delivery** | **CONFIRMED VULNERABILITY** | **P2** | Two independent private PG17 runs (`7dd658d4…`, `5692b1fc…`) of `dashboard-issue333-scope-races.integration.test.ts` hold the real `listLocations` SQL result before HTTP delivery, await canonical CA MFA revoke `201` and confirm persisted grant count `0`, then release an HTTP `200` including the revoked Location ID. A fresh HTTP `200` excludes it. Unlike W3's failed SQL-client spy, this gate was observed. Exact transaction snapshot/PID was not captured: gate is after service transaction and before HTTP response, which is sufficient for this particular delivery rule. |
| P1-B Organization list role downgrade / membership deactivation | **UNVERIFIED as a security violation** | Source/test characterization | Authenticated canonical HTTP role/status writes succeeded `201` while completed pre-change Organization projections remained paused, then delivered `200` with previously eligible Organization; fresh `200` excluded it. These are actual observations, **not U-001-confirmed breaches**, because ordinary role/status in-flight contract was not extended by the Owner direction. |

These are genuine private PostgreSQL and authenticated HTTP observations. The
earlier Live Map *characterization test* passed its orchestration assertions;
that green status is not a passing security result. The three original Visit
Contact RED tests and all their evidence remain unchanged. P2 here reflects a
demonstrated confidential Location-data disclosure within the bounded test
preconditions; no P0/P1, arbitrary tenant bypass, or production exploit is claimed.

## 4. Conditional narrow remediation proposal — **NOT APPROVED TO IMPLEMENT**

1. Treat the canonical writer **commit versus protected HTTP delivery** as the
   ordering boundary. Define the same current persisted Location grant/role
   checks for the reader and writer. An already assembled result does not carry
   an irrevocable right to be sent later.
2. Reuse the existing `staff-management-org` advisory-lock domain where
   appropriate. Evaluate a reader SHARED admission fence and canonical writer
   EXCLUSIVE fence under a proven lock order, with authority rechecked after
   acquisition. For multi-Organization scope, acquire deterministically ordered
   locks and revalidate membership/scope under the final set. Do not infer a
   global Organization grant from one Location or the first page of grants.
3. **Keep the protection through actual protected response delivery**, or
   provide an equivalent linearizable last-mile denial. A transaction-scoped
   advisory lock released at query/handler completion cannot alone satisfy U-001;
   a last-moment unlocked recheck also leaves a commit/send race. Consider a
   bounded response-delivery fence that buffers the private projection, commits
   no revoke until protected delivery finishes, and fails closed on disconnect.
   The exact server transport/transaction lifetime and scalability design need
   an owner-approved engineering change; no new lock primitive is selected here.
4. Apply one reviewed mechanism to P1-A RR Live Map, P1-C aggregate Location
   Visit Contacts and P1-B scope discovery, with route-specific eligibility
   still checked in their existing authorizers. Preserve DEC-049 Supervisor
   active-Shift proof, DEC-080 CA MFA, DEC-084 minimization, DEC-094 inactive
   history and DEC-081 stronger emergency-disable behavior.
5. Preserve canonical Staff Management CAS, desired-state semantics, tenant
   audit atomicity and lock order with Location lifecycle/session/MFA locks.
   No new endpoints, role permissions, schema, migration or UI interaction.
   An emergency/security-disable command under DEC-081 **must not wait behind
   an arbitrarily slow HTTP reader** to revoke current access. Its design must
   preempt/cancel outstanding protected delivery and revoke affected sessions
   promptly, with deterministic emergency-first/read-first tests. Ordinary
   grant-revoke serialization cannot be reused blindly for emergency disable.

**Failure and performance gates before any production fix acceptance:** prove
reader-first and revoker-first linearization with real HTTP/canonical writer;
two readers/one revoker; concurrent role/grant writes; genuine writer rollback;
ambiguous writer COMMIT outcome with reconciliation; cancellation/disconnect;
lock timeout (`55P03`), statement cancel (`57014`), real serialization conflict
(`40001`) if reachable, deadlock victim handling and finite retry exhaustion.
Measure p50/p95 with sample counts for uncontended/contended reads/writes,
pool occupancy, held lock duration and slow/disconnected clients. The existing
W6 4/4 lock harness is feasibility evidence only: its `40001` was injected, not
a naturally induced serialization error. These development samples cannot
certify production latency or an SLO.

## 5. Verification continuation ledger

| Test/schedule | Result | Exact evidence |
| --- | --- | --- |
| P1-A reader-first revoke commits before HTTP disclosure | **FAIL — security RED, confirmed P2** | `p1a-live-map-evidence.md`, actual PG17 RR PID/snapshot, canonical writer and body marker |
| P1-A revoker-first, same-Organization ungranted, foreign-Organization | **PASS — verified safe only for these fresh reads** | `p1a-live-map-evidence.md` |
| P1-C contact search/customer visits/vehicle visits reader-first | **FAIL 3/3 strict RED; confirmed P2** | `w4-visit-contacts/reproduction.md`, five real PG17 runs |
| P1-C fresh revoke, role downgrade and positive aggregate Location scope | **PASS in exact tested contract** | `w4-visit-contacts/reproduction.md` |
| P1-B multi-Org, fresh grant revoke, password-only CA denied | **PASS 3/3 fresh HTTP negatives; no concurrency claim** | `w3-scope-discovery/source-and-blocker-report.md`; `dashboard-issue333-scope-negatives.integration.test.ts` |
| P1-B in-flight grant/role/deactivation from original W3 | **BLOCKED / UNVERIFIED** | W3 SQL barrier never fired; test timeout and cleanup blocker recorded |
| P1-B after-real-SQL/before-HTTP `LocationAccess` revoke | **FAIL 1 strict U-001 assertion in each of two independent runs — confirmed security RED** | Private PG17 runs `7dd658d403d8443da4726553ab443b5a` and `5692b1fcb9c54b9386e743753e261cd2`; canonical HTTP `201`, grant count `0`, paused `200` includes Location, fresh `200` excludes; each `tests.txt` trace `ISSUE333_P1B_POST_COMMIT`; both isolated clusters removed, child databases/connections `0/0` per run. |
| P1-B after-real-SQL/before-HTTP role downgrade and membership deactivation | **PASS 2/2 observational schedule assertions; security outcome UNVERIFIED** | Same real PG17 run: canonical HTTP `201` each, old Organization still present, fresh excluded. No assumption that these green observations establish security safety. |
| P1-B canonical writer stale CAS rolls back | **PASS 1/1 — verified safe for this rejected-writer branch** | `dashboard-issue333-scope-rollback.integration.test.ts`, real owned PG17 run `e1160774182b4e5b8d281a4db97b7039`: CA MFA HTTP writer returned accepted `VERSION_CONFLICT` status `409`; persisted grant count remained `1`; pending and fresh authenticated LM reads both retained Location. Child DB/connections `0/0`, owned cluster removed. This does not cover a writer that executes its mutation and later rolls back. |
| Full #333 private suite with new P1-B files | **FAIL: 1 strict RED + 13 passing scenarios across five files** | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite issue333`, run `7dd658d403d8443da4726553ab443b5a`, native PG17. Test failure is the requested security-negative evidence, not a passing verification. |
| Final #333 private suite, with exact projected-item check and rollback test | **FAIL: 1 strict U-001 RED + 14 other scenario passes across six files** | Run `b2d8f10e52b2418cb4d98ed65be3e25f`: canonical `201`, real persisted grant `0`, pre-delivery paused HTTP `200` contains the exact revoked Location inside `items`, fresh excludes; rollback test `409` preserved grant. Native PG17, child databases/connections `0/0`, private cluster removed. |
| Focused P1-B independent reproduction | **FAIL: 1 strict RED + 2 observational schedule passes** | Same runner with `-TestFile test/dashboard-issue333-scope-races.integration.test.ts`, run `5692b1fcb9c54b9386e743753e261cd2`, native PG17, owned cleanup `0/0`, directory removed. |
| W6 direct shared/exclusive lock, `55P03`, `57014`, injected `40001` | **PASS 4/4 targeted infrastructure only** | `w6/README.md` |
| #315, #319 accepted regressions | **PASS 28/28 and PASS 89/89, independently rerun on this follow-up worktree** | `-Suite baseline` run `b42899ace4ce480898000983286903c0`, four files, 28 tests; `-Suite audit` run `48a94b2b658f42e080ee08582cec1428`, 20 files, 89 tests. Both owned PG17 clusters stopped/removed after `0/0` cleanup. |
| Two readers/one canonical writer; paired role/grant revokes; post-mutation rollback; uncertain COMMIT; reader disconnect; exact MFA/session transition/Shift race | **UNVERIFIED / NOT RUN for this route set** | The new stale-CAS rollback check covers only the rejected-writer branch; no post-mutation failure or ambiguous commit was induced. No invented PostgreSQL/interleaving evidence. |
| #321 legacy 42-versus-43 classification count | **FAIL 11/12, pre-existing historical regression; no waiver** | `node --test scripts/test-harness/classification.test.mjs`, unchanged classifier expectation |

## 6. Remaining contract and execution gates

- **U-001 RESOLVED** by DEC-108. No further product-policy choice is necessary
  to classify P1-A, P1-B Location delivery or three P1-C disclosures under
  the accepted rule.
- **U-002 engineering definition:** exact server response-delivery fence for
  buffered versus streamed bodies and behavior on slow clients/disconnect must
  be approved with implementation design. No assertion about when remote client
  physically receives network bytes is inferred from a server-side `finish`.
- **U-003 cleanup:** previously stopped W3 private PostgreSQL data directory
  with one residual child database must be inspected for exact task ownership,
  port/PID and no active processes before any cleanup authorization; do not
  delete it as part of #333 evidence preparation.
- **Implementation GO required:** approve the narrow runtime remediation and
  its locking/response strategy separately. Preserve #315/#319, DEC-081
  emergency behavior, every production security contract and **GLOBAL UI
  FREEZE**. No runtime edits, PR, merge, deployment or issue closure here.

This is a scoped verification and proposal, not a statement that every
Dashboard route has been race-tested or that development tests certify the
deployed production environment. Issue #333 remains **open** for Owner review.

Development-only P1-B forced-gate elapsed sample (both runs, three scenario
types): `n=6`, p50 `60 ms`, nearest-rank p95 `161 ms`, values `34, 36, 56,
64, 81, 161 ms`. This measures synthetic gate-to-fresh-read orchestration,
**not** isolated HTTP read/write latency, lock contention or a production SLO.

## 7. Exact verification command ledger

All commands below ran in Windows PowerShell 5.1 from the isolated Prime
worktree at HEAD `22360d666539f1817ea1dc221f53e17d2a2c4b86` plus
uncommitted verification-only changes. Each PostgreSQL command created a fresh,
attested, localhost-only PostgreSQL 17 test cluster with a migration-owning
bootstrap identity and a distinct nonsuperuser application runtime identity.
No production/shared QA database URL or server was used.

| Exact command | Outcome | Evidence/limit |
| --- | --- | --- |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite baseline` | **PASS 28/28** | Run `b42899ace4ce480898000983286903c0`; four #315 files, cluster cleaned. |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite audit` | **PASS 89/89** | Run `48a94b2b658f42e080ee08582cec1428`; 20 #319 files, cluster cleaned. |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite issue333` | **FAIL 1 strict U-001 RED / 14 other PASS** in latest run | Run `b2d8f10e52b2418cb4d98ed65be3e25f`, six files, exact `items`-level proof. An earlier run `7dd658d403d8443da4726553ab443b5a` gave one RED and 13 other PASS before adding rollback test. This is a real prohibited response, not a harness crash. |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite issue333 -TestFile test/dashboard-issue333-scope-races.integration.test.ts` | **FAIL 1 strict U-001 RED / 2 observations PASS** | Independent run `5692b1fcb9c54b9386e743753e261cd2`, cluster cleaned. |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite issue333 -TestFile test/dashboard-issue333-scope-rollback.integration.test.ts` | **PASS 1/1** | Stale CAS writer `409`, grant persisted, run `e1160774182b4e5b8d281a4db97b7039`, cleaned. |
| `node --test scripts/test-harness/issue333-private-classification.test.mjs` | **PASS 2/2** | New private files classified outside ordinary CI. |
| `node --test scripts/test-harness/classification.test.mjs` | **FAIL 11/12** | Historical count `43` actual versus `42` expected; no #321 waiver or unrelated test-count edit. |
| `pnpm --filter @valet/api typecheck` | **PASS** | TypeScript, includes the two new test files. |
| `pnpm architecture:check` | **PASS** | New source/test files below 300 lines; warnings only for grandfathered files. |
| `pnpm lint` | **PASS 11/11 tasks** | API task reran; other package task caches are explicitly reported by Turbo. |
| `pnpm exec prettier --check apps/api/test/dashboard-issue333-scope-races.integration.test.ts apps/api/test/dashboard-issue333-scope-rollback.integration.test.ts scripts/test-harness/issue333-private-classification.test.mjs docs/decisions/DEC-108_LOCATION_ACCESS_REVOCATION_DELIVERY.md docs/validation/issue-333/U001_OWNER_CONTRACT_AND_REMEDIATION.md` | **PASS** | Changed/new focused tests and documents formatted. |
| `pnpm build` | **NOT RUN on this documentation/test-only follow-up** | Previously PASS 10/10 at #333 verification HEAD; no production files were touched in the follow-up. |

Retained ignored raw log folders are named in the evidence columns above. Only
sanitized booleans, outcome codes, synthetic entity references, ordering and
database identity are recorded in the committed report. The original P1-A and
three P1-C RED tests were not edited or weakened.

## 8. Independent review and decision status

Independent read-only security review agreed that the observed P1-A, P1-B
Location grant and three P1-C deliveries breach Owner-accepted U-001, with
**P2** confidential Location-data impact in these demonstrated schedules. It
challenged whether P1-B's gate established overlapping PostgreSQL transaction
snapshots; the answer is **no**: the P1-B gate intentionally pauses after the
real service transaction has finished and before protected HTTP delivery.
This proves the response-delivery boundary and does not prove a PostgreSQL
snapshot or lock-wait race. Reader-completion timing instrumentation was refined
to capture actual awaited HTTP completion, resolving the reviewer's initial
diagnostic concern. A second read-only reviewer agreed with that precise test
interpretation.

The reviewers' live final-diff reads were interrupted by connector/tool
failure. Consequently their independent final-diff, complete Accepted-DEC
cross-check and full cleanup audit are **INCOMPLETE**; the Prime independently
read the binding decisions, examined the changed files, reran safety checks,
and inspected the private cleanup ledgers. This must not be presented as an
unqualified independent approval or authorization to merge. The correct
planning verdict is **DECISION REQUIRED** for a separate runtime remediation
GO and response-fence design. The security conclusion is
**CONFIRMED VULNERABILITY — REMEDIATION APPROVAL REQUIRED**, with several
requested race/robustness branches still **UNVERIFIED**. Keep Issue #333 open.

### Read-only investigation of the retained W3 cluster

The W3 report identifies one residual child database
`valet_mob007_auth_13504_7c6f1e24` and zero other child connections after a
timed-out teardown. A new read-only file/process inspection found the exact
task-owned PGDATA still present under
`tmp/issue-333-w3/tmp/issue-315-pg-qa/issue319-issue333-w3-c9de2faf0847446cb24af327bf9cdaa7/.issue315-private-cluster`.
Its `PG_VERSION` is `17`; `postmaster.pid` is absent; local port `59326` has
zero TCP listening processes. The specific owner-run `server.log` reports
ready at `2026-10-31 22:38:04 +03` and clean shutdown at
`2026-10-31 22:40:59 +03`. The parent directory retains `init.log`,
`server.log` and a private bootstrap-credential file, which was **not read**.
Disk-level ownership and residual database identity are supported by the W3
run's attestation and teardown log, but an offline file inspection does not
independently re-enumerate catalog rows. **No service was restarted; no file,
database or directory was deleted or moved.** Any later cleanup must match
the attested data directory, live process/port absence, exact child DB inventory
and approved task-specific cleanup boundary.
