# U-002 test, failure and evidence matrix

This is an audit ledger, **not** a passing security suite. Source baseline `9079706ad322e87f6f33fb61335fdc3b6bfd2528`. Current design has **no runtime fix** and therefore **no five-route repaired GREEN**. The W3 retained database artifact has not been deleted or touched. Every new disposable PG run must verify its private database, port, role, process and cleanup ownership before stopping or removing its own files; never target QA, production or another task's data.

## Fixed observations (prior runs, exact scope)

| ID / tested boundary | Execution and proof | Security interpretation |
| --- | --- | --- |
| F333-A, Live Operations Map | Issue333 original audit + five-route tests, real PG17 and authenticated HTTP canonical LocationAccess writer; indexed in `docs/validation/issue-333/` | **CONFIRMED VULNERABILITY**, intentional strict RED; no runtime fix |
| F333-B, Dashboard granted Location discovery | Same original real PG/canonical writer, old protected HTTP after COMMIT, fresh access corrected | **CONFIRMED VULNERABILITY**, intentional strict RED |
| F333-C1/C2/C3, Contact search/customer/vehicle history | Private W4 real authenticated PG17; CA valid MFA revocation and previously authorized LM HTTP; original 3 no-private-sentinel assertions failed at `issue333-w4-visit-contact-race.ts:160` | **CONFIRMED VULNERABILITY** ×3, intentional strict RED |
| E-001, global User emergency disable | Current design-branch run `f77cffe4a02b4164b6c71dbac854d228`, two real compiled API instances, private PG17, canonical User-disable CLI; persisted DISABLED witness **23:47:22.806Z**, old private HTTP200 finished **23:47:22.811Z**, fresh401; original strict line243 | **CONFIRMED VULNERABILITY** vs DEC081, strict 1/1 FAIL exit1, own PG removed. Pre-build run `ba613741dc804e9f9d7670bf1792bdb1` was **BLOCKED** by missing compiled artifacts, not RED. See `E001_CURRENT_STRICT_RED_EVIDENCE.md` |
| P-001, mixed A+B contact aggregate before SQL | Corrected final private PG17 run `bc0fcd5495b54eaf80afd357778a234a`: after auth captured A+B, before aggregate SQL; CA MFA POST revoke A HTTP201, persisted A grant0, old HTTP200 A plate plus count **numeric 2**, fresh B-only HTTP200 count **numeric 1**, A absent | **CONFIRMED VULNERABILITY — strict RED at helper line160** after correcting two JSON-number expectations; original C1/C2/C3 also strict RED. **4 FAIL / 2 PASS / 6, exit1**, cleanup 0/0/removed. Historical malformed first-failure attribution is superseded; after-aggregate-SQL A+B gate remains UNVERIFIED. See `P001_CORRECTED_STRICT_RED_EVIDENCE.md` |
| L-001, PG session advisory lock falsifier | Two private PG17/socket tests: backend termination/watchdog releases session lock, HTTP holder may still emit; real canonical revoke | **DESIGN CANDIDATE FALSIFIED** 2/2 characterization PASS, not authorization GREEN |
| C-001, response-held pool saturation | Private pool max4 with four held reader connections; five contended connection-acquisition samples p50/p95 386/386 ms, five uncontended samples, plus one blocked writer | **CAPACITY FAILURE** of held-DB-session mechanism; not production latency |
| Lock upgrade | Real PG `40P01` SHARED→EXCLUSIVE on same advisory key, 6/6 experiment checks PASS | **DEADLOCK MECHANISM VERIFIED**; not production code race proof |
| Node transport | Existing transport-only 9/9 checks | `end` return, `writableFinished` and `finish` differ; partial protected prefixes survive abort, no global-fence proof |
| #315 security regression | Current design-branch private runner `-Suite baseline`, run `d3bcb7dd02db4f7ab822c85c4198a3a7`, task-owned PostgreSQL17, **28/28 PASS**, 4 files; 0/0 cleanup, removed=True | **VERIFIED historical regression preserved in tested contract**, no U002 repaired-runtime inference |
| #319 security regression | Current design-branch private runner `-Suite audit`, run `c6144404aa9643049fee0cc292953d7e`, task-owned PostgreSQL17, **89/89 PASS**, 20 files; 0/0 cleanup, removed=True | **VERIFIED historical regression preserved in tested contract**, no new broad endpoint race claim or U002 repaired-runtime inference |

For archived unaltered proof see `docs/validation/issue-333/u002-falsification/`:
`PRIME_E001_INDEPENDENT_REPRODUCTION.md`, `PRIME_L001_INDEPENDENT_REPRODUCTION.md`, `w3/EMERGENCY_W3_RESULT.md`, `PRIVACY_P001_SOURCE_AND_TEST_GATE.md`, `CONSOLIDATED_TEST_AND_FAILURE_MATRIX.md`, `w5/lock-order-experiment.md`, `w4/HTTP_TRANSPORT_FALSIFICATION.md`, `CAPACITY_C001_TEST_CONTRACT.md`, `FINAL_ADVERSARIAL_REVIEW.md`. Immutable commit SHA is 9079706a; the current corrected P001 test belongs to the *new* design branch, never silently relabel historic results.

## Future acceptance schedules (no completed repaired-runtime GREEN)

| Case | Deterministic barrier/order and required witness | Current classification |
| --- | --- | --- |
| 1. F333-A | LM grant A, held Live Map after auth/SQL/pre-send; MFA CA canonical revoke A COMMIT; server terminal bytes must be A-free/denied. Repeat reader-first/revoker-first | **CONFIRMED current RED; proposed GREEN NOT RUN** |
| 2. F333-B | LM grant A, held Dashboard discovery before SQL and before HTTP; authorized revoke; fresh scope/Location list/cursor checked | **CONFIRMED current RED; proposed GREEN NOT RUN** |
| 3. F333-C1 | C1 actual row, count, latest, association, search and cursor after A-only revoke, B retained; after-auth/after-SQL/pre-send gates | **CONFIRMED current RED; proposed GREEN NOT RUN** |
| 4. F333-C2 | Customer visit history A+B prior sessions, cursor and `returningContact`; same canonical writer | **CONFIRMED current RED; proposed GREEN NOT RUN** |
| 5. F333-C3 | Vehicle history subject, nested vehicle/location association, prior visits, cursor; writer-first too | **CONFIRMED current RED; proposed GREEN NOT RUN** |
| 6. E-001 | Canonical global User disable, current old read, fresh reader, pre-byte and mid-byte, different API processes; actual DB/sessions/push/audit and terminal proof | **CONFIRMED current RED; proposed GREEN NOT RUN** |
| 7. A+B aggregate | LM grant A+B, CA revoke A, exact B-only oracle count/latest/vehicles/cursor; gate **after SQL** and before HTTP plus pre-SQL | **Pre-SQL P001 current RED; after-SQL UNVERIFIED** |
| 8. Admission races | Reader-first vs writer-fence-first, two readers/one writer, two writers, same User with multi-Org memberships | **UNVERIFIED proposed protocol** |
| 9. Backend termination | Kill PG backend holding fence while process alive with socket writable; observe lock release and late delivery vs writer COMMIT | **L001 old candidate falsified; new protocol UNVERIFIED** |
| 10. Lease/partition | Coordinator misses A ACK or lease expires; A remains alive+HTTP writable, B attempts bounded commit, A resumes | **ARCHITECTURAL COUNTEREXAMPLE DERIVED; actual new protocol UNVERIFIED** |
| 11. Crash versus live replica | Identical missing-ACK histories with crash/OOM vs DB-partitioned live process; egress quarantine actually terminates socket or writer refuses COMMIT | **UNVERIFIED; necessary gate** |
| 12. Slow/disconnect | Reader socket pauses, backpressure, partial protected write, verified close/abort/finish, writer deadline, status/content | **Node characterization only; new security contract UNVERIFIED** |
| 13. Writer rollback | Canonical grant revoke transaction rolls back after fence; no revocation/audit side effect; gate safely reconciles, retries reauthorize | **UNVERIFIED proposed protocol** |
| 14. Unknown COMMIT ACK | Writer commit succeeds but HTTP/DB acknowledgement lost; durable grant+audit witness, replay and fence persistence, no premature reopen | **UNVERIFIED; previous W3 suppressed CLI output was not a DB COMMIT-ACK loss** |
| 15. Stale CAS | Concurrent grant/role update, stale expectedVersion rejected and rolled back, authoritative scope retained | **Historical P1-B stale-CAS PASS; new cross-instance admission UNVERIFIED** |
| 16. Deadlock/timeout | Real `40P01`, relevant `55P03`, `57014`, `40001` only when reachable; bounded cancellation and retry exhaustion | **40P01 lock-upgrade verified; proposed lock graph/retries UNVERIFIED** |
| 17. Capacity | Four-connection pressure, many held HTTP and ordinary writers, p50/p95/N, bounded DB and memory queue | **C001 prior synthetic FAIL; candidate UNVERIFIED** |
| 18. Tenant/Location | Foreign Org, same Org ungranted A, LM B retained, inactive historical Location DEC094, two distinct authenticated principals | **Existing negatives partly PASS; new fence UNVERIFIED** |
| 19. Roles/MFA/Shift | CA current MFA and commercial restrictions; LM scope, Supervisor eligible Shift, denied VALET_EMPLOYEE, expired/insufficient MFA, session replacement | **Historical #315/#319 partly PASS; in-flight status contracts separately scoped** |
| 20. Global disable | Disabled User, inactive membership, multi-Org, session logout/refresh, attention endpoint revocation, emergency racing grant revoke | **E001 current RED; proposed GREEN UNVERIFIED** |
| 21. Post-commit reader | Fresh read after confirmed revoke and disable must deny A; B-only can pass when authorized | **Historical fresh requests correctly denied A; proposed protocol UNVERIFIED** |
| 22. End-to-end safety | Repeat all five original strict RED files **unaltered**, with real canonical writer, SQL commit witness and HTTP terminal proof | **NOT RUN against any repaired runtime (none exists)** |

The strict security success criterion for every repaired path is **absence of all revoked private markers and A-derived metadata from post-COMMIT protected server delivery**, plus independent B-only correctness. A test passing merely because it prints a stale-disclosure observation is not a security GREEN.

## Method and required evidence per future test

Each run must record: repository and source SHA; private PostgreSQL 17 data-directory identity, port, role and PID; two authenticated actors; canonical writer endpoint/CLI + MFA; row keys and version/CAS before and after; SQL tx PID/isolation/snapshot/blocking PIDs/lock order; barrier signal and writer COMMIT/ROLLBACK/UNKNOWN outcome; first protected byte vs transport finish/close; exact status; sanitized sentinel booleans and derived count/cursor; bounded duration p50/p95/N; cancellation/retry; child DB and process cleanup proof. Never store credentials, tokens, MFA seeds or raw private production records.

Supported private W4 runner:
`powershell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-333/w4-visit-contacts/run-private-lab.ps1`.
It verifies dependency presence, creates a random task-owned PG17 cluster with loopback port, isolates environment, hashes test sources, checks zero child databases/other clients, and only removes its *own new cluster* after stopped/clean. If dependencies unavailable, report **BLOCKED**; do not substitute shared QA/production DB. Intentional RED suite normally returns exit 1 and must be reported **FAIL security**, not normal test PASS.
