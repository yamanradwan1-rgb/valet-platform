# Issue #333 U-002 — Prime architecture resolution and Owner decision gate

**Planning verdict: DECISION REQUIRED.** Independent reviewers' source findings and Prime's partition counterexample reject a runtime implementation GO under the current demonstrated architecture. **Security verdict: CONFIRMED VULNERABILITY — REMEDIATION APPROVAL REQUIRED.** This document records a design gate, not an Accepted Decision, repaired-runtime GREEN, or production certification.

This report should be read with [the proof](ARCHITECTURE_FAILURE_PROOF.md), [alternatives and five-route dependency map](ALTERNATIVES_AND_RESOURCE_BOUNDS.md), [test/failure ledger](TEST_AND_FAILURE_MATRIX.md), and [independent adversarial review](INDEPENDENT_ADVERSARIAL_REVIEW.md).

## 1. Repository facts discovered

- GitHub repository: `yamanradwan1-rgb/valet-platform`, Issue `#333` OPEN at preflight.
- Actual fetched `origin/main`: `c638a437749cae1f78a8c8a417fd4d53e6a34920`. These references were fetched and verified against current remote, not assumed stale.
- Accepted immutable evidence: original audit `d8c342d5305fd688261312a7c777553ad3c1b4ac`, previous U002 design `a4f5f2c6589b6be01b7db99cac4e6829986007f1`, current falsification `9079706ad322e87f6f33fb61335fdc3b6bfd2528`.
- Prime isolated worktree `tmp/issue-333-u002-resolution-prime`, branch `audit/issue-333-u002-resolution-prime`, from 907; independent Workers have distinct isolated worktrees. The original /valet-platform root contained two unrelated untracked Owner runbook/handoff files; they were preserved.
- Verification time: 2026-10-31 UTC (host Windows/PowerShell; local test clock had crossed to Nov 1). Final pushed SHA, cleanliness and validation commands are recorded in the end-of-task delivery update, not presumed here.
- Authorized changes: these sanitized documents and a two-assertion JSON numeric type correction in a private intentional-RED test. No production/controller/authorizer/schema/migration/UI/dependency file changes.

## 2. Binding requirements

- Accepted `DEC-108_LOCATION_ACCESS_REVOCATION_DELIVERY.md`: a response containing revoked Location A data must **finish/abort protected server-side delivery before the canonical revoke COMMIT**, or any response that finishes afterward must provably contain no A-protected data. Even pre-existing reads lose A permission; B remains independently available. Finish SQL ≠ finish HTTP.
- Accepted `DEC-081_STAFF_ROLE_AND_ACCESS_LIFECYCLE.md`: emergency global User/security disable revokes current and new Staff access immediately, sessions and attention endpoints, independent of membership-specific ordinary grant revoke.
- Accepted DEC-023 (in decisions log) and DEC-032/049/078/080/084/094 govern authentication/session lifetimes, Shift eligibility, live tracking, MFA, Company Admin, visit-contact privacy and inactive historical Location.
- Accepted security Decisions and tenant/Location authorization, CAS, audit atomicity and privacy concealment remain fixed. Historical #315/#319 suites are **regression evidence**, not themselves new Accepted policy. No blanket interpretation of DEC-023 permits stale Location disclosure. Only documented authority—not a historic inventory—is a policy source.
- Absolute Dashboard/Policies Studio and all product UI freeze.

## 3. Existing implementation patterns

- Five actual GETs: `/v1/staff/locations/:locationId/live-operations-map`, `/v1/staff/dashboard/organizations/:organizationId/locations`, `/v1/staff/management/organizations/:organizationId/visit-contacts`, `/v1/staff/management/organizations/:organizationId/visit-contacts/:customerId/visits`, `/v1/staff/management/organizations/:organizationId/visit-vehicles/:vehicleId/visits`.
- Their controller promises use `ApiOperationRunner.run` and Nest handles later HTTP serialization. Session revalidation and service SQL transactions finish before actual HTTP delivery. Live Map uses REPEATABLE READ; Dashboard Discovery short READ COMMITTED, Contacts authorized scoped query/aggregates.
- Staff Management canonical LocationAccess revoke uses current authenticated CA/LM and required MFA, Organization advisory EXCLUSIVE transaction lock, membership version/CAS, persisted grant rows and audit, then COMMIT. Controlled global User disable separately takes operation + User security locks, disables User, invalidates sessions/push, writes audit and commits.
- PostgreSQL session lease loss and HTTP transport failure are independent. A response-held database connection can starve the four-slot synthetic pool. Real lock upgrade produced `40P01`.
- The precise five-route reader/writer/privacy matrix appears in `ALTERNATIVES_AND_RESOURCE_BOUNDS.md`.

## 4. LOCKED decisions

| Contract | Exact source | Required |
| --- | --- | --- |
| Grant revocation response delivery | DEC-108 Accepted sections 1–4 | No revoked A bytes finishing server-side after revoke COMMIT, even prestarted responses |
| Emergency current/new block | DEC-081 Accepted sections on emergency/security disable | Global User disabled means no surviving current or future Staff access; sessions/attention endpoints invalidated |
| Role/scope/MFA/history | DEC-023/032/049/078/080/084/094 + #315/#319 | No role expansion; LM granted exact Locations, CA sensitive MFA, Supervisor active eligible Shift; private visits masked across tenant/Location |
| Data/audit/CAS | AGENTS.md, docs/05/06/17 and accepted management mutation decisions | No new public mutation, no audit deletion, no unsafe SQL/HTTP exposure, 300-line ceiling |
| Owner phase boundary | Current Issue333 Owner direction | Tests/docs permitted, no production runtime or UI changes; no Accepted D001–D006 without Owner |

## 5. DERIVED conclusions

- **Impossible on current proven assumptions:** coordinator or PostgreSQL sees identical missing-ACK observations for a dead API A and a live but partitioned A that retains a client socket. A bounded writer COMMIT based on TTL lets live A send A data afterward. Waiting unbounded for A terminates safety uncertainty but breaks emergency immediacy. This is a reasoned impossibility counterexample, **not a newly executed partition exploit**.
- No bare PostgreSQL session SHARED lock, heartbeat, short session recheck, buffered JSON, unlocked final check, ordinary cancel RPC, or separate durable epoch closes this last-hop race. L001 already falsified sole session lease.
- A possible future composite protocol needs atomic admission/fence **and independently provable final egress termination** for all old readers before writer COMMIT. No existing gateway/sidecar supervisor with such failure-domain properties has been inspected or accepted.
- Whole-response denial is protective only before first protected byte. A partially written response requires positive abort/egress termination before COMMIT; delivered prefix cannot be retracted.
- Stale A+B Contact search can leak through count, latest, associated vehicle, cursor or search matching even after row-only filtering; B-only must be completely re-derived or the entire response rejected before bytes.
- E001 proves old HTTP200 after emergency COMMIT, while fresh401 proves only new-request protection; P001 proves actual old A+count2, with pre-aggregate SQL timing; original five F333 strict RED remain.

## 6. UNRESOLVED decisions

| ID | Required Owner decision; no option silently selected | Prime recommendation for future separate approval |
| --- | --- | --- |
| D-001 | What atomic cross-instance admission and definitive terminal-delivery/fence protocol is operated and trusted? | Reject lease-only/TTL; authorize **architecture/infrastructure feasibility proof** for an enforceable egress-fence authority with positive acknowledgement and atomic scoped ticket ordering. No runtime implementation until proven. |
| D-002 | What happens when a replica is live but unacknowledging during immediate emergency User disable? | **Blocking:** specify a trusted bounded force-quarantine/kill of even existing sockets, with independent proof; if impossible, the contracts cannot both be met under current failure assumptions. No implicit DEC081 relaxation. |
| D-003 | Temporary fail-closed containment and acceptable availability cost while U002 remains RED? | Consider explicitly authorized denial/suspension of affected protected reads and audited emergency operations pending valid egress control; recognize existing active sockets remain unsafe. Require dedicated operational GO. |
| D-004 | Durable coordination, restart/COMMIT-unknown reconciliation, storage authority and migrations? | If chosen, persist admission/generation/op identity and conservative recovery. A database row or TTL alone **never** proves remote socket death; new schema/infrastructure separately approved. |
| D-005 | Complete B-only projection recomputation versus whole-response prebyte denial/abort for C1/C2/C3? | Conservative deny before protected bytes until comprehensive B-only SQL equivalence and transport-fence proof; neither policy is Accepted yet. |
| D-006 | Maximum active readers, memory bytes, queue/DB pool, p50/p95, writer and emergency deadlines, timeout and recovery criteria? | Set measurable acceptance thresholds and load failure model before engineering GO; no production SLO inferred from C001. |

Other material unresolved U-issues: atomic admission/writer fence under concurrency; multi-Organization User disable; actual transport terminal ACK semantics; writer rollback/ambiguous PostgreSQL COMMIT; crash-safe cleanup and stale CAS; session/Shift/MFA in-flight contract boundaries distinct from U001; live-partition trusted enforcement capability.

## 7. Risks / boundary violations

| Severity / confidence | Evidence | Decision implication |
| --- | --- | --- |
| P1 **CONFIRMED** E001 | Two Nest processes, real task-owned PG17, global User disable COMMIT and disabled/session/audit witness preceding old HTTP200 | DEC081 current-access violation. No existing immediate response-kill mechanism proven |
| P2 **CONFIRMED** F333 A/B/C1/C2/C3 | Existing strict RED and canonical LocationAccess revocation | DEC108 Location response-delivery violation, no repaired runtime GREEN |
| P2 **CONFIRMED** P001 C1 A+B data disclosure | MFA CA canonical revoke A, old A plate + count2 after COMMIT; fresh B-only count1; gate before aggregate SQL | Complete projection privacy issue. Two numeric expectations were corrected and the task-owned PostgreSQL 17 strict RED was rerun at helper line160; 4 FAIL / 2 PASS / 6, exit1 |
| P1 **FALSIFIED CANDIDATE** L001 and 40P01 | PG backend death while Node socket alive, real lock-upgrade deadlock | Reject sole lease and lock upgrade; design fail-safe lock ordering |
| P2 **CAPACITY** C001 | Four held DB connections exhaust tested pool; fifth times out | Do not hold DB client through slow HTTP |
| P1 **DERIVED blocker**, untested at runtime | Dead vs live-partition indistinguishability and lack of egress fencing | No protocol selected, no implementation GO |
| P3 **evidence hygiene — resolved** | Archived P001 quoted-numeric expectation failed before shared strict no-A assertion | Two JSON-number comparisons corrected; final source-sha run reached unchanged strict no-A helper line160. Historical original evidence retained |

No broader cross-tenant disclosure or production exploitation was inferred from these specific tests.

## 8. Proposed implementation plan

**Completed authorized scope:** source audit, Accepted Decision review, writer/reader/HTTP dependency mapping, failure/partition proof, candidates compared, adversarial independent review, test-only P001 evidence correction and private safety checks where executable.

**Conditional future work after Owner design GO:**

1. Commission exact egress-fencing contract and independent failure-domain proof; specify what controls established TLS/TCP sockets under an unacknowledged, live API replica. This is the first stop/go gate.
2. Specify atomic typed User/Organization/membership/Location admission generation and canonical writer prepare/COMMIT/reconciliation; no session-held DB connections or SHARED→EXCLUSIVE upgrades.
3. Integrate actual response transport emission and terminal/abort acknowledgements with bounded client backpressure/response size and lost-ACK conservative recovery. Keep no protected response emitted after revoke COMMIT.
4. Build emergency User-global admission/egress termination with bounded timeout *that cannot mean 'assume dead'*. Multi-Org, old response and newly queued requests need proof.
5. For C1/C2/C3 choose full B-only SQL/count/latest/vehicle/cursor recomputation or prebyte denial policy. Test A+B after-SQL and partial emission.
6. Validate real PostgreSQL 17/authenticated HTTP writers, partition and process failure, rollback/unknown-commit, pool/locks and #315/#319; independent re-review before PR or deployment approval.

No runtime code will be modified by this design deliverable.

## 9. Test matrix

The complete 22-case schedule matrix with real-vs-conditional evidence, writer COMMIT/ROLLBACK/UNKNOWN witness, backend death, live partition, two writers, slow socket, partial bytes, pool and roles is in `TEST_AND_FAILURE_MATRIX.md`. Current-runtime six security failures (five F333 + E001) remain intentionally RED; P001 adds a corroborating mixed C1 trace. L001/C001/HTTP transport characterization can PASS while demonstrating an unsafe candidate. Future repaired-runtime five GREEN are **NOT RUN** because no repaired runtime exists.

#315 was independently **rerun in this design worktree** on owned PG17: **28/28 PASS** (4 files, run `d3bcb7dd02db4f7ab822c85c4198a3a7`), as was #319: **89/89 PASS** (20 files, run `c6144404aa9643049fee0cc292953d7e`); both exited 0 with 0/0 cleanup and owned-cluster removal. These preserve the tested historical regressions and do not prove U002 safe. The corrected final P001 private PostgreSQL 17 run `bc0fcd5495b54eaf80afd357778a234a` is **strict security RED 4 FAIL / 2 PASS / 6, exit1**, reaching the original no-A helper assertion at line160, cleanup 0/0/removed. See `P001_CORRECTED_STRICT_RED_EVIDENCE.md`.

## 10. Files expected to change

Actual design-only branch: `docs/validation/issue-333/u002-resolution/ARCHITECTURE_FAILURE_PROOF.md`, `ALTERNATIVES_AND_RESOURCE_BOUNDS.md`, `TEST_AND_FAILURE_MATRIX.md`, `OWNER_DECISION_GATE.md`, `INDEPENDENT_ADVERSARIAL_REVIEW.md`, `P001_CORRECTED_STRICT_RED_EVIDENCE.md`, `E001_CURRENT_STRICT_RED_EVIDENCE.md`, validation/scope report, and `apps/api/test/issue333-w4-mixed-privacy.integration.test.ts` **two JSON numeric expectation literals only**. No original F333/E001 assertion edited, weakened or removed.

Runtime files **reviewed and untouched**: tracking live-map reader/authorization/query/controller; dashboard scope reader/controller; management contact authorizer/search/history/service/controller; Staff Management revoke/CAS transactions; global security-disable CLI; PostgreSQL transaction/lease/pool; Staff session revalidation; HTTP ApiOperationRunner. See dependency matrix for conditional integration points.

Not justified without separate GO: new schema/table/migration, transport interceptors, infra sidecar/gateway, global API/session policy changes.

## 11. Explicitly out of scope

No production authorizer, controller, business state, API contract, session/MFA/role policy, database schema/migrations or grants, dependencies or deployment configuration. **Absolutely no Dashboard or Policies Studio or other UI changes**. No production/shared database access. No deletion of retained W3 PG data. No PR creation, merge, deployment or Issue333 closure.

## 12. Ready-to-implement verdict

**DECISION REQUIRED** — applies specifically to **U-002 production runtime remediation**. Under the hostile live-and-partitioned-replica schedule, current demonstrable infra lacks a nonbypassable, positively acknowledged old-socket egress fence. A complete new protocol cannot be declared safe, independently verified or ready to implement without D-001/D-002 decisions. E001 makes emergency behavior a separate hard gate; D-003–D-006 set operational, privacy, persistence and capacity choices.

**Independent security reviewer verdict: implementation NO-GO** (see separate report). **Security verification conclusion: CONFIRMED VULNERABILITY — REMEDIATION APPROVAL REQUIRED** for the documented schedules; future cross-instance safety is UNVERIFIED. Issue333 must **remain OPEN** for Owner review. A scoped documentation branch push is not authorization for runtime work.

### Owner handoff — twelve direct answers

1. **Recommended mechanism:** conditional two-layer atomic admission + writer pre-COMMIT fence plus **trusted, enforced, positively attested final egress termination**; not currently available/proven. No implementation selected.
2. **Proof:** only the conditional A1–A5 theorem in the architecture proof; A2/A3 have **not been established** for a live partitioned replica, and no such distributed fault test was executed.
3. **Can revoked A arrive after COMMIT today?** Yes: five F333 current RED and P001; E001 also current disable RED.
4. **Check-to-send gap:** only an enforceable right held through actual terminal transport and ordered before COMMIT eliminates it; SQL recheck or coordinator TTL cannot.
5. **Slow/disconnect:** must be bounded, with observed finish or positively established abort/quarantine; missing ACK is an UNKNOWN state, not success.
6. **Emergency:** currently **no**, E001 proves old current response; a global forced egress cut remains required and unverified.
7. **Locks/connections:** existing short DB xact locks only. Proposed protocol may not pin DB connection to client finish; C001 exhausts pool4.
8. **Deadlocks/starvation:** total lock ordering, no upgrade; bounded ticket queues/memory and no response-held DB connection; future measurable tests.
9. **Runtime files if approved:** the five readers/controllers/query/transport boundary, canonical revoke, global disable and session admission are definitely relevant; a global User-disable solution also requires a **complete inventory of every current Staff protected response emitter and attention consumer**, beyond these five, before narrowing implementation scope. No production edit now.
10. **Five strict GREEN tests:** replay original five unchanged strict RED with authenticated CA writer/real PG and recorded HTTP terminal, plus E001, A+B aggregate, cancel/partition; not yet executable against a repaired runtime.
11. **Unverified:** partitioned live HTTP, definitive egress kill, partial-byte cut, unknown COMMIT, post-aggregate A+B, cross-instance and capacity/latency future candidate.
12. **Owner decisions:** D001–D006, above; D001/D002 blocking first, followed by separate explicit production implementation GO only if a safe mechanism passes proof and adversarial review.
