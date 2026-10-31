# Issue #333 U-002 falsification — exact test and failure matrix

Scope: test-only design verification from
`a4f5f2c6589b6be01b7db99cac4e6829986007f1`, private Windows/PG17
laboratories, 2026-10-31/2026-11-01. No production remediation exists.
**PASS means the test assertion passed; a test deliberately proving an unsafe
mechanism remains a security-design RED.** A failed strict security assertion
is never reported as a passing security control.

## Executed commands and truthful results

| Exact command from its isolated worktree | Environment / test count | Result and primary evidence |
| --- | --- | --- |
| `node --test apps/api/test/issue333-u002-http-response.test.mjs apps/api/test/issue333-u002-http-cancellation.test.mjs` | Prime; Node24.19; 9 transport cases | **PASS 9/9**, `w4/HTTP_TRANSPORT_FALSIFICATION.md`; synthetic only |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite issue333 -TestFile test/dashboard-issue333-u002-capacity.integration.test.ts` | Prime private PG17, 2 tests | **PASS 2/2**; run `79b84285001a4fb38d9eccd521e7dabc`; pressure hazard verified, not GREEN route |
| Same Issue333 runner, `-TestFile test/dashboard-issue333-u002-lease.integration.test.ts` | Worker W2 private PG17, then independent Prime PG17 | **PASS 2/2** each as candidate falsifiers; W2 `d3d6aeda711245229a54fd0c05e48f46`; Prime `774fe4d63ffc47a5b4efe681d63515c3`; **L-001 design RED** |
| Same Issue333 runner, `-TestFile test/dashboard-issue333-u002-emergency.integration.test.ts` | Worker W3 plus two independent Prime runs; two authenticated compiled Nest API processes and supported CLI, PG17 | **FAIL 1/1** each, intentional post-COMMIT protected disclosure; W3 `7b5f093c900d4f46b4d3bc0c92bebec4`; Prime `cb1a56adc19b4d7db2978d2756dc1dea` and post-extraction `16ef8938d9734a0f9666ec8fe2385bf0`; **E-001 confirmed RED**, cleanup true |
| Same Issue333 runner, `-TestFile test/dashboard-issue333-u002-locks.integration.test.ts` | Worker W5 private PG17 | **PASS 6/6**; run `259ba7c47d294a39a1d4d55555b3a5ec`; SQL lock graph, 40P01 and pool |
| Same Issue333 runner, `-TestFile test/dashboard-issue333-u002-lock-http.integration.test.ts` | Worker W5 private PG17 and authenticated MFA CA writer | **PASS 1/1**; run `2d0f25b552f742868b1f78e6694314a1`; grant count 0 and audit 1 |
| `powershell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-333/w4-visit-contacts/run-private-lab.ps1` | Prime private W4 PostgreSQL17, real authenticated Management HTTP | **FAIL 4/6**, intentional original C1/C2/C3 and new P001 RED; **2/6 PASS** authorization negatives; run `70b157865ca544fb8eee35d12534d15b` |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite audit` | Prime private PG17, #319 | **PASS 89/89**, 20 files; run `36efd0b18e1445509c399355f9e6f181` |
| Same private runner `-Suite baseline` | Prime private PG17, #315 | **PASS 28/28**, 4 files; run `062e8b834f9441ccba32257be3a4b9c5` |
| `pnpm --filter @valet/api typecheck` | Prime worktree, post-extraction test-only integration | **PASS**, 0 TS errors; build previously PASS |
| `pnpm --filter @valet/api lint` | Prime post-extraction worktree | **PASS**, 0 lint errors |
| `pnpm --filter @valet/contracts build` and `pnpm --filter @valet/api build` | Prime, compiled test peers and contracts | **PASS / PASS**; recheck after final diff if changed |
| `node scripts/architecture-check.mjs`, `node scripts/architecture-line-policy.mjs`, `node --test scripts/test-harness/issue333-private-classification.test.mjs` | Prime, final post-extraction test infrastructure | **PASS / PASS / PASS 2/2**; baseline grandfathered file warnings only |
| `pnpm exec prettier --check` on all 15 new or edited `.ts`/`.mjs` test sources; `git diff --check` | Prime post-extraction | **PASS / PASS**, formatted physical-line counts within 300 for newly authored source |

The original W5 5/6 attempt (run
`96d8ed9544ca44589a801b2b253524b8`) failed its exact two-sided
blocker-observation assertion after the PostgreSQL deadlock detector ran.
The W5 test-only assertion was narrowed to verify one exact blocker edge,
then the actual `40P01` (or `55P03`) and surviving transaction progress;
later 6/6 passed. The original failed logs remain unchanged. This is a
test-harness timing correction, **not** weakened product security policy.

Every above PostgreSQL runner created a fresh random task-owned cluster
and checked identity before use. Completed runs reported `removed=True`
or `OWNED_CLUSTER_DIRECTORY_REMOVED=True` with zero remaining child
databases and connections. The historical retained W3 PGDATA was inspected
read-only and **not deleted**.

## Security scenario matrix

| Required schedule / boundary | Route or primitive | Actual result | Security classification and limit |
| --- | --- | --- | --- |
| Ordinary grant, reader-first post-SQL pre-HTTP | F333-A Live Map | Historical strict RED; this run did not rerun F333-A | **CONFIRMED VULNERABILITY** in historical accepted PG/HTTP evidence; proposed GREEN **UNVERIFIED** |
| Ordinary grant, reader-first post-SQL pre-HTTP | F333-B Dashboard Locations | Historical strict RED; separate W3 emergency red confirmed | **CONFIRMED VULNERABILITY** for DEC-108 grant test; U-002 fix **UNVERIFIED** |
| Ordinary grant, reader-first after authorization but before aggregate SQL | F333-C1 and new P001 A+B | Pre-revoke A+B viewer scope captured; actual private HTTP **201** revoke and grant 0; later SQL used stale scope, old HTTP **200** contains A; B-only fresh 200 count **1** vs old **2** | **CONFIRMED VULNERABILITY**; post-projection A+B variant still UNVERIFIED |
| Ordinary grant, reader-first customer history | F333-C2 | Actual W4 strict private HTTP RED, fresh no A marker | **CONFIRMED VULNERABILITY**, tested route only |
| Ordinary grant, reader-first vehicle history | F333-C3 | Actual W4 strict private HTTP RED, fresh no A marker | **CONFIRMED VULNERABILITY**, tested route only |
| Revoke first, then fresh authorized request | #319 and W4 Management | 89/89 #319; fresh C1 B-only excludes A, three original W4 fresh projections no marker | **VERIFIED SAFE IN TESTED CONTRACT** for fresh, tested endpoints only |
| Revoke rollback or stale CAS | #315/#319 original regressions | 28/28 and 89/89 suites PASS; stale-CAS rollback scenario retained | **VERIFIED SAFE IN TESTED CONTRACT** where asserted by those specific suites |
| SHARED reader first, EXCLUSIVE writer, intact PG backend | C001/W5 synthetic session advisory | Writer blocks on exact PID, proceeds after unlock/HTTP `finish` | **VERIFIED SAFE IN TESTED CONTRACT** only for intact synthetic lease |
| Watchdog expiration before HTTP finish | L-001 synthetic HTTP + real canonical revoke | Two independent PG17 runs, writer 201 before later synthetic finish | **FALSIFIED U-002 CANDIDATE**; five-route GREEN unverified |
| PG backend `pg_terminate_backend` before HTTP finish | L-001 same | Authenticated canonical revoke 201, lock 0, HTTP 200 marker after commit | **FALSIFIED U-002 CANDIDATE**; no new runtime change |
| Emergency global User disable, reader-first | E-001 Dashboard Locations | Two private two-process runs, disable COMMIT, User/session/audit DB witness, old HTTP 200 sentinel | **CONFIRMED VULNERABILITY** against DEC-081 for tested path |
| Emergency first / fresh read and queued admission | E-001 Dashboard Locations | HTTP 401; exact user-security advisory blocker graph | **VERIFIED SAFE IN TESTED CONTRACT** for those fresh/queued schedules |
| Emergency during paused post-SQL reader | E-001 | Canonical disable completed before old response and did not wait indefinitely in tested schedule | **CONFIRMED VULNERABILITY** for current response; slow network socket still **UNVERIFIED** |
| Reader disconnect | E-001 + W4 Node transport | `AbortError`, `close` without `finish`, no post-close protected output | **VERIFIED SAFE IN TESTED CONTRACT** only for observed abort case |
| ACK to CLI consumer lost, same operation replay | E-001 canonical security-disable | One audit after replay and session still revoked | **VERIFIED SAFE IN TESTED CONTRACT** for output-suppression only; true PG COMMIT-ACK loss **UNVERIFIED** |
| CA+CA, CA+LM, LM+LM+writer | W5 real PG17 SQL locks | Exact blockers/ordering and completion; 6/6 PASS | **VERIFIED SAFE IN TESTED CONTRACT** for synthetic SQL graph; five-route HTTP **UNVERIFIED** |
| SHARED-to-EXCLUSIVE under two readers | W5 PG17 counterexample | W5 sample observed actual `40P01` deadlock victim; test permits `40P01` or `55P03` after an exact first blocker edge; cleanup succeeds | **FALSIFIED lock-upgrade variant**; CA bypass required, not yet runtime protected |
| Role hint changed to Supervisor | W5 actual CA HTTP role writer | 201, persisted role recheck differs from stale hint | Role transition **observed**; proper future response denial/restart **UNVERIFIED** |
| Four held readers / pool pressure | C001 real PG + W5 | Pool max 4 exhausted, fifth acquisition timeout; p50/p95 local measured | **CONFIRMED CAPACITY HAZARD** in proposed design; production performance **UNVERIFIED** |
| Cross-Organization, ungranted Location, inactive history | W4 original negative and #315/#319 regressions | W4 2 PASS; regression suites green | **VERIFIED SAFE IN TESTED CONTRACT** for specified tested negatives only |
| Supervisor without eligible Shift; CA MFA expired | #315/#319 accepted regressions | Focused original suites green; no new U-002 protected-delivery schedule | U-002 in-flight boundary **UNVERIFIED** |
| Two API processes, one held response, controlled User disable | E-001 | Actual PIDs and separate PG witness | **CONFIRMED VULNERABILITY** for demonstrated schedule |
| Hard API process kill, socket stall, real DB socket partition, lost cross-replica cancel ACK | Proposed coordinator only | No complete experiment yet | **UNVERIFIED** |
| Cross-Location C2/C3 aggregate, cursor metadata in new candidate | Visit Contacts | C1 A+B aggregate RED; C2/C3 original route RED | Proposed recomputation/fail-closed **UNVERIFIED** |
| Bounded retries, pool p95 under multiple Organizations, non-acknowledging replica | Proposed mechanism | No implementation exists | **UNVERIFIED**, no production SLO claim |

No newly tested endpoint is called universally race-safe.
**No documented threat-model exclusion** was invoked to mask a RED.
Historical #333 private fixtures and accepted #315/#319 tests were not
deleted or weakened. No Dashboard/Policies Studio UI was changed.
