# Issue #319 post-fix transaction and revocation matrix

The original evidence package is retained under `../logs/` at audit commit
`af62a11add5d97ec291ca0dbf49fdd29be88f708`, with baseline source
`20998a069eb5d576895c0e6c149271a4a0e4028b`. Its 25/25 PASS includes
intentional **positive vulnerable** HTTP 200 reproductions and must never be
counted as fixed. In particular, the later adjacent `logs/adjacent-audit-tests.txt`
2/2 PASS likewise confirms two additional stale disclosures.

## First post-fix milestone before adjacent source patches

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-319/run-lab.ps1 -Suite audit -Evidence remediation -RunTag patched-full
```

Result: **9 files, 52 PASS / 0 FAIL / 0 SKIP** in
`logs/patched-full-audit-tests.txt`, elapsed **140.15 seconds**. PostgreSQL
17.11 private loopback cluster owner `issue315_owner`, local port `55055`,
child runtime role non-superuser. `logs/patched-full-audit-identity.txt`
records the exact data directory; `logs/patched-full-audit-cleanup.txt`
confirms **0 child DBs / 0 child connections / owned directory removed**.

| Authorized reader and writer | Reader-first | Revoker-first | What was actually proven |
|---|---|---|---|
| Physical key-slot GET vs real MFA-assured CA Staff Management HTTP grant revoke | PASS | PASS | Held SHARED org fence blocks writer; queued writer completes first, later reader HTTP 404; synthetic keySlotId absent from denial |
| Physical RR overview vs real CA Staff Management HTTP grant revoke | PASS | PASS | LM shared advisory acquired before RR snapshot, real protected overview authorized only after fresh recheck |
| Legacy Configuration GET vs real CA Staff Management HTTP grant revoke | PASS | PASS | Saved synthetic setting default=false / Location override=true visible only to reader already fenced; queued/committed prior revoker yields HTTP 404 |
| Other five Physical GET routes vs canonical SQL grant writer | PASS reader-first each | Not individually executed | Five exact HTTP projections hold the shared fence across the revoke; seven total Physical routes have separate current-authority 200/fresh-deny 404 sequential matrix |
| Scope discovery after grant revocation | Not a held reader-first fence proof | PASS after initial Staff recheck paused | Fresh grant SELECT yielded HTTP 200 with empty item list under selected interleaving |
| Staff native refresh and CA refresh | Three LM and one CA in-flight cases PASS | Not a complete session matrix | Already-resolved old LM bearer may complete under accepted DEC; fresh old bearer denied 401; CA recheck denies |
| Company Admin MFA retirement (RC key-slots) | n/a | PASS synthetic direct SQL factor retirement | Read's MFA assurance rejects 403 after synthetic factor change; **does not establish RR Overview's initial-snapshot behavior** |
| Two independent LM readers and one writer | PASS | n/a | Exact `pg_blocking_pids` EXCLUSIVE writer blocked by two then one SHARED reader backend PIDs; cross-org parallel progress |
| Lock timeout, statement timeout, cancellation and rollback | PASS selected failure paths | n/a | `55P03`, `57014`, fresh retry, safe pool/session advisory cleanup; see `lock-cleanup-and-performance.md` |

`logs/races-first-audit-tests.txt` separately records the original **6/6**
real CA HTTP bidirectional races; `logs/extension-locks-retry-audit-tests.txt`
records **6/6** lock recovery and graph tests; `logs/physical-lease-audit-tests.txt`
records **2/2** fresh-lease/rollback tests. These are separate runs of cases
also included in the first 52/52 full milestone; do not sum them as unique
test coverage. The initial `extension-locks-audit-tests.txt` timed out one
ordering-sensitive assumption and was retained; the order-independent retry
and full suite both passed without dropping its exact PID blocker checks.

## After additional Owner GO for F319-03 and F319-04

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-319/run-lab.ps1 -Suite audit -Evidence remediation -RunTag adjacent-fixed-first -TestFile test/dashboard-issue319-adjacent-candidates.integration.test.ts
```

**2 PASS / 0 FAIL / 0 SKIP**, `logs/adjacent-fixed-first-audit-tests.txt`:
for Branding and Subscription, a canonical SQL Location-grant revoker
completed before the paused initial LM authorization hint resumed; the
post-fix SHARED fence then rechecked current authority and returned HTTP 404
without branding sentinel or subscription scope data. Both fresh GETs denied.
`logs/adjacent-fixed-first-audit-cleanup.txt` verifies private cluster removal.

Dedicated **real CA HTTP reader-first/revoker-first** Branding/Subscription
test command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-319/run-lab.ps1 -Suite audit -Evidence remediation -RunTag adjacent-ca-races-first -TestFile test/dashboard-issue319-adjacent-remediation-races.integration.test.ts
```

**4 PASS / 0 FAIL / 0 SKIP**, one file, **91.01 seconds**. In
`logs/adjacent-ca-races-first-audit-tests.txt`: two valid reader-first
held-fence HTTP 200 responses precede CA revocation 201; in each, the real
CA writer's `pg_blocking_pids` contains the reader's exact PostgreSQL
backend PID. Both revoker-first cases verify the reader's queued SHARED
advisory behind the CA EXCLUSIVE writer, CA 201 before denied HTTP 404, and
fresh denial with no synthetic Branding/Subscription sentinel. The owned
private cluster at port `56170` was removed after zero child databases and
zero child connections (`logs/adjacent-ca-races-first-audit-cleanup.txt`).

The exact eligibility matrix was run separately:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-319/run-lab.ps1 -Suite audit -Evidence remediation -RunTag adjacent-eligibility-first -TestFile test/dashboard-issue319-adjacent-eligibility.integration.test.ts
```

**14 PASS / 0 FAIL / 0 SKIP**, one file, **54.62 seconds**, 18 actual HTTP
GET assertions, detailed role/tenant/commercial cases in
`logs/adjacent-eligibility-first-audit-tests.txt`. Its owned PG17 cluster
on port `56318` cleaned with 0 child DBs/connections and directory removed.
Full final suite and separate CA RR MFA candidate test are reported in
`FINAL_REMEDIATION_ACCEPTANCE.md` after execution.

## Additional Owner GO — F319-05 CA RR MFA factor recovery

The **same unchanged 198-line** F319-05 reproducer from the historical RED
`logs/ca-rr-mfa-confirmed-audit-tests.txt` was run against the corrected
Physical RR Overview transaction with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-319/run-lab.ps1 -Suite audit -Evidence remediation -RunTag ca-rr-mfa-fixed -TestFile test/dashboard-issue319-ca-mfa-rr-candidate.integration.test.ts
```

**1 PASS**, post-recovery HTTP **403** and synthetic key slot **absent**,
versus the previously verified HTTP 200 and key slot present. Exact original
RR snapshot/commit barrier was preserved; the separate fresh GET also denies.
`logs/ca-rr-mfa-fixed-audit-{tests,identity,cleanup}.txt` records PG17.11
port 57597, non-superuser runtime, and complete private cleanup.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-319/run-lab.ps1 -Suite audit -Evidence remediation -RunTag ca-rr-mfa-concurrency -TestFile test/dashboard-issue319-ca-mfa-rr-regression.integration.test.ts
```

**2 PASS**: actual HTTP recovery with a distinct unassured Staff session;
reader-first recovered writer backend PID 30296 blocked by reader PID 29436
while its factor `FOR SHARE` fence remained held through authorized 200;
revoker-first controlled factor gate PID 40128 held canonical recovery writer
PID 37140 while CA reader queued behind the writer, then real recovery
committed before 403/no Key Slot. Both fresh Staff sessions denied after
retirement. `logs/ca-rr-mfa-concurrency-audit-{tests,identity,cleanup}.txt`
records PG17.11 port 57709 and full private cleanup. These are concrete
PostgreSQL lock-graph observations; an internal `40001` retry is supported by
source and conflict topology but is **not directly instrumented** in the test
log, so avoid calling the SQLSTATE itself runtime-observed.

## Combined five-fix validation after F319-05

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-319/run-lab.ps1 -Suite audit -Evidence remediation -RunTag final-five-fixes
powershell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-319/run-lab.ps1 -Suite baseline -Evidence remediation -RunTag final-five-fixes
```

The patched #319 suite is **13 files, 73 PASS / 0 FAIL / 0 SKIP**,
`logs/final-five-fixes-audit-tests.txt`, **192.90 seconds**. It includes the
exact F319-05 original 403/no-keyslot reproducer, both new factor recovery
lock-graph tests, all seven Physical GET current-grant routes, CA/LM and tenant
negatives, all four adjacent Branding/Subscription bidirectional authenticated
CA HTTP races, timeout/rollback/pool and 80-sample latency checks.

The complete accepted #315 regression suite at the **same five-fix source**
is **4 files, 28 PASS / 0 FAIL / 0 SKIP**,
`logs/final-five-fixes-baseline-tests.txt`, **79.93 seconds**. This includes
real PostgreSQL advisory writer/reader race families, RR KPI snapshots and
bounded serialization retry, active session/MFA Company Admin, and
same-Organization and cross-Organization negative controls.

Both runs used independently created PostgreSQL 17.11 loopback clusters:
ports **57760** (#319) and **58162** (#315), role `issue315_owner`,
test-runtime `valet_runtime_*` without superuser/CREATEDB/CREATEROLE, and
guarded `ISSUE319_EPHEMERAL_PG=I_OWN_THIS_CLUSTER`. The matching
`logs/final-five-fixes-{audit,baseline}-{identity,cleanup}.txt` record exact
data directories and **0 leftover child databases, 0 child connections and
owned directory removed**. No shared/production PostgreSQL resource was used.
