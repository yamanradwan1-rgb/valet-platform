# U-002 deterministic test and failure matrix (design gate)

Status: **planned acceptance scenarios; NOT a GREEN execution result**.
The detailed W6 test-only design is
`../w6/U002_GREEN_ACCEPTANCE_ARCHITECTURE.md` in the Issue #333 validation
tree. Preserve all original RED sources and raw evidence without edits.

## Actual-five-route schedule map

Each row below means **five separate authenticated HTTP test cases**, one
per F333-A, B, C1, C2, C3. No helper-only mock can replace a real response,
real canonical Company Admin MFA writer, and PostgreSQL state/lock evidence.
Record the exact reader principal/membership, Organization and Location,
real server `finish` vs aborting `close`, independent writer COMMIT witness,
grant count/version/audit, private A/B sentinels, backend PID and blocker graph.

| ID | Deterministic schedule, barrier and needed PostgreSQL witness | Allowed outcome under DEC-108 | Current security result |
| --- | --- | --- | --- |
| S01 | Authorized LM A+B, reader completes `finish` before revoke begins; committed baseline grant | A protected body before commit, then fresh read excludes A | **NOT RUN** this design phase |
| S02 | CA MFA canonical revoke first; await commit and independent zero-grant witness; fresh reader | A omitted/denied, B retained where allowed | Historically fresh-negative PASS, not rerun |
| S03 | Reader authorizer entered, pause before grant SQL; start revoke | Either SHARED fence prevents commit until `finish`, or reauth excludes A | **NOT RUN** with new fence |
| S04 | Reader completes real SQL projection, pause before HTTP serialization; revoke concurrently | Original stale-after-commit disclosure must disappear; no A byte after commit | **CONFIRMED VULNERABILITY** original five RED schedules |
| S05 | Reader pauses after bytes serialized but before `response.end`; revoke starts | No unlocked check-to-send gap; actual `finish`/writer COMMIT order witnessed | **NOT RUN** |
| S06 | Buffered body `end` enqueued; network writes slow; revoke blocks until true `finish` or safe abort | Revoke cannot COMMIT before protected finish unless post-commit A bytes provably absent | **NOT RUN** |
| S07 | Two LM readers on same Org shared fence, then one canonical revoker | Both actual server response ends precede revoke COMMIT, or later reader denies A | **NOT RUN** |
| S08 | Readers on independent Organizations X/Y and Locations A/B | X revoke cannot corrupt Y scope; no X private data in Y body | **NOT RUN** |
| S09 | Revoke after initial auth; downstream SQL uses stale snapshot | New snapshot after lock and protected delivery serialized | **CONFIRMED VULNERABILITY** old five; proposed GREEN **NOT RUN** |
| S10 | Writer performs actual grant mutation then transaction/audit failure and ROLLBACK | Grant/version/audit reconciled unchanged; A read allowed under valid grant | **NOT RUN**; stale-CAS rollback is separate historical PASS |
| S11 | Writer COMMIT acknowledgment lost after COMMIT sent, independent connection reconciles | Security outcome follows **actual** persistence/commit, not HTTP success/failure | **NOT RUN** |
| S12 | Stale CAS competing grant writer rejected; one reader continues | 409 writer conflict, grant unchanged; body and audit correct | Historical P1-B rollback PASS; not rerun |
| S13 | Two CA GETs and a mixed CA+LM pair while a revoker queues | CA read path cannot hold SHARED session while requesting EXCLUSIVE org xact; no lock upgrade/deadlock | **NOT RUN / CRITICAL FALSIFIER** |

## Failure, pressure and cancellation matrix

| ID | Reproducible fault + witness | Required fail-closed and liveness assertion | Status |
| --- | --- | --- | --- |
| F01 | One reader disconnects before auth SQL and after `end`; watch `close` vs `finish` | No later A writes, exactly once lock/lease release, writer able to proceed | NOT RUN |
| F02 | Explicit server-side request abort, shutdown or elapsed finite deadline | Response terminated *before* fence relinquishment; no stale private bytes | NOT RUN |
| F03 | PG lease watchdog expiry before slow client `finish` | Prove abort-before-unlock; if impossible reject session-lock candidate | **UNVERIFIED / BLOCKING** |
| F04 | Real PostgreSQL backend kill/network failure while protected bytes pending | No continuing HTTP delivery after premature lock loss; safe dispose/no reuse | **UNVERIFIED / BLOCKING** |
| F05 | Actual `55P03` lock timeout at valid guarded route | Fail closed, bounded wait, clean rollback and pool recovery | Route NOT RUN; raw PG historical PASS |
| F06 | Actual `57014` statement/query cancel | No private body or held lock; healthy next request | Route NOT RUN; raw PG historical PASS |
| F07 | Real `40001` if chosen isolation makes it reachable | Expected actual behavior from contract; no invented 40001 assertion | NOT RUN; old synthetic throw is not real conflict |
| F08 | Real conflicting lock order / `40P01` deadlock | Deterministic lock acquisition, bounded victim recovery, no retry loop | NOT RUN |
| F09 | Bounded retry exhaustion + failed writer | No partial grant or tenant audit; bounded HTTP failure, no leak | NOT RUN |
| F10 | Pool max 4: three readers + writer + unrelated query; queue metrics and `pg_blocking_pids` | No pool self-deadlock, finite admission, no second checkout under held fence | NOT RUN |
| F11 | Multiple Location grants A+B, revoked A, C1 aggregated search count/cursor | Complete A-free recalculation or deny entire response; valid B remains | NOT RUN |
| F12 | Multi-Organization memberships, two users/two sessions, foreign customer/vehicle and ungranted Locations | No foreign/private A marker in status, errors, JSON or metadata | NOT RUN |
| F13 | Expired/missing MFA CA, ineligible Supervisor Shift, inactive Location history, disabled User/session | Enforce each its own Accepted contract; no U-001 policy invention | NOT RUN |
| F14 | Role downgrade and grant revoke simultaneously | Prove writer locks, result scope, CAS and audits; in-flight role timing separately evaluated | NOT RUN |
| F15 | Emergency/security disable during paused and slow protected reads | No indefinite delay of DEC-081 new/current access cut-off; multi-instance preemption proof | **UNVERIFIED / BLOCKING** |
| F16 | Emergency disable vs ordinary revoke, reader disconnect just before disable, multiple readers | Witness actual user/session state and response termination; no lock inversion | NOT RUN |
| F17 | LM to CA (or CA to LM) role transition between preflight and fenced recheck | Deny/restart without attempting an EXCLUSIVE-under-SHARED lock upgrade | NOT RUN |

### Performance and exact evidence requirements

- Observe server response `finish`/aborted `close` through a **test-only**
  hook at real Nest/Express transport, not only `fetch().text()` client receipt.
  Register hooks before awaits; latch actual HTTP emission with bounded timeout.
- Use the canonical
  `POST /v1/staff/management/organizations/:organizationId/staff/:membershipId/location-access/revoke`
  with validated Company Admin session, five-minute sensitive MFA, current
  membership CAS and a committed persisted grant-count witness.
- For each of five paths inspect synthetic marker **inside actual response
  body**, including denied errors. C1 must assert aggregate counters, latest
  visit and vehicle association; C2/C3 per-visit phone/plate/location.
- Record `pg_backend_pid()`, transaction ID where available, lock wait state,
  `pg_blocking_pids()`, advisory key domain, SQL snapshot/isolation, writer
  COMMIT/ROLLBACK, server finish ordering, connection cleanup and pool counters.
  Raw authorization tokens, private contacts, TOTP, DB credentials and
  unredacted payloads are forbidden in committed evidence.
- Record p50, p95, n, route, contended/uncontended, slow client, disconnect,
  writer wait, peak checked-out connections and bytes buffered. These are
  **local PG measurements** only; production SLO is not claimed. Failure
  without observed barrier or missing cleanup is FAIL/BLOCKED.
- Use task-owned disposable PostgreSQL and existing ownership-attested
  `scripts/validation/issue333/run-owned-postgres.ps1`; W4 private tests
  require their *own* guard/runner. Do not weaken safeguards or touch the
  preserved W3 PGDATA.

## Evidence classification at this gate

| Item | Status | Supporting record |
| --- | --- | --- |
| F333-A/B/C1/C2/C3 current postcommit Location exposure | **CONFIRMED VULNERABILITY** | `../U001_OWNER_CONTRACT_AND_REMEDIATION.md`; original tests, Live Map and W4 PG17 records |
| #315 regression 28/28; #319 89/89 | Historical PASS only | `../U001_OWNER_CONTRACT_AND_REMEDIATION.md`; #319 acceptance docs |
| P1-B stale-CAS rollback | Historical PASS only | `apps/api/test/dashboard-issue333-scope-rollback.integration.test.ts` |
| W6 raw PG advisory blocking / 55P03 / 57014 | Historical PASS, **not** HTTP GREEN | `../w6/U002_GREEN_ACCEPTANCE_ARCHITECTURE.md:244-254` |
| Any revised five-route HTTP delivery fence | **UNVERIFIED**, not implemented | No runtime GO |
| Runtime emergency preemption and lost-lease delivery | **UNVERIFIED / DESIGN BLOCKER** | `ARCHITECTURE_DECISION.md` E-001/L-001 |
| Threat-model exclusions | None newly documented | Existing DEC-108 client receipt boundary only |

No strict RED evidence has been removed or converted into a passing security
test. These matrices are a test design specification and do not assert
execution of the proposed checks.
