# Issue #276 — Dense100 authenticated HTTP, regression, and release gates

**Later recovery checkpoint:** the P1 same-bearer read-lock serialization
described below has been corrected with Live-only SHARED user/session,
membership and CA MFA/factor locks. The updated 26/26 combined Nest HTTP +
PostgreSQL race matrix, including LM16 and CA16, passed, and an independent
security reviewer found no new P0/P1 lock-order blocker. See
[ISSUE_276_FINAL_READINESS_2026_10_10.md](ISSUE_276_FINAL_READINESS_2026_10_10.md)
for the authoritative latest disposition. The original failure and
environmental stress evidence below is intentionally retained.

**Status: correctness PASS; full stress/performance NO-GO.** Recorded
2026-10-10 inside protected WIP branch
`fix/issue-276-live-operations-staff-history` at `6545d6f0`.
No commit, merge, production connection, migration or approved release.

## Safety and fixture

- Windows PostgreSQL **17.11** checked at loopback **127.0.0.1:55449**,
  `valet276test`, data directory
  `D:/kndoom/valet-platform/tmp/issue-276-disposable-pg-0d8a6d3a254e/data`.
  Test harness creates and drops an isolated migration/runtime-role child DB
  for each run. Excluded unverified developer DB at **5432** was untouched.
- New `apps/api/test/live-history-dense100-http.integration.test.ts` seeds
  100 RFC-compliant UUID Vehicles/ValetSessions; 4,000 COMPLETED Parking
  Tasks, 4,000 actual COMPLETED Dispatch events and 4,000 canonical
  `VALET_SESSION_PARKED` Audits. One Location Manager's exact Staff bearer,
  a real NestJS HTTP endpoint, runtime PostgreSQL privileges, page=100 and
  strict response Zod contract are exercised.
- It checks all 100 results as `PROVEN`, with canonical `Dense Parker`
  historical and check-in identity, and exact stable HTTP response hashes.
  It tests 1/4/8/16 requests after a warm-up. The two accepted DEC-103 indexes
  can be created **only in the per-run owned child DB**, not the fixture
  template/source, and catalog validity is asserted before the tested read.
- After the dense correctness check, the same exact HTTP route receives an
  Audit referring to a valid Task in the **wrong Location** by C-only
  `taskId` and a separate foreign-Organization Audit referring to the same
  Task ID. Result: exactly **1 UNVERIFIABLE** `parkedBy=null`,
  **99 PROVEN**, and foreign evidence does not affect the authorized page.
  This anomaly pass was observed in a standalone full test run.

## Side-by-side before/after DEC-103 evidence

An initial standalone pass measured the same true HTTP read with and
without the two DEC-103 indexes and compared complete response hashes:

| Concurrent requests | No candidate indexes (group wall) | Both DEC-103 indexes |
|---|---:|---:|
| 1 | 265.46ms | 141.12ms |
| 4 | 846.31ms | 556.71ms |
| 8 | 1201.14ms | 1171.68ms |

Every response had 100 `PROVEN` identity records. Another successful
full read-only parity/anomaly run measured no-index 255.60/857.98/1215.46ms
and indexed 159.48/712.55/1405.70ms (1/4/8 respectively), proving the
performance values vary even on the same local fixture. The test creating
both indexes completed with `indisready=true,indisvalid=true`.
These are short synthetic warm observations, **not p95 or an SLA**.

## Critical stress finding — real 503 under concurrent load

The application runtime's hard budgets in
`apps/api/src/common/database/runtime-postgres-policy.ts` are:
`DATABASE_POOL_MAX=4` by default in development, connection acquisition
**2s**, lock **2s**, statement **3s**, transaction **5s**. Do not extend any
of these by guesswork.

The first combined execution of Dense100 + native HTTP + modeled PG
authorization races resulted in **25/26 PASS**, with a real
`503 INTERNAL_ERROR: Service temporarily unavailable` from Dense100.
The other 9/9 native HTTP cases and 16/16 PG interleavings passed.
The heavy test initially also exercised the unindexed worst-case under
the same runner's contention; this is not an acceptable deployment state,
since the candidate requires DEC-103 indexes.

We therefore moved mandatory candidate testing to a test-owned child
with both DEC-103 indexes validated **before the first heavy HTTP read**,
retaining the earlier unindexed performance evidence above. Repeating
the combined three-suite run still yielded **25/26 PASS**, with a 503 at
the highest (16-request) Dense100 burst. The indexed read returned 100
correct `PROVEN` histories at lower concurrency, but observed wide tail
variance including 7.64s for a successful individual HTTP request. An
independent standalone indexed attempt also reached 503 at 16 requests,
after a ~6.62s successful individual request. This is a **P1 performance/
availability release blocker**, not evidence that indexing alone solves
the endpoint's high-concurrency envelope.

A test-only `DATABASE_POOL_MAX=8` experiment then exited abnormally
during NestJS initialization (`vitest-pool` worker exited unexpectedly,
no test cases executed). It offers **no valid performance evidence** and
does not authorize raising runtime limits. A read-only subsequent query
verified the isolated PostgreSQL cluster retained only the baseline fixture
and system databases; no leaked test DB/role remained.

**Diagnosis still open:** Isolate PostgreSQL statement time/lock wait,
runtime pool waitingCount and connection-acquire timeout, the Node event
loop/CPU/GC budget, and concurrent test-harness startup pressure. The 503
code alone does not conclusively identify a single trigger. Test on
representative Windows QA loads, then design the smallest route-scoped
remediation. No global timeout or DB concurrency widening without
measured safety and connection-envelope approval.

## Other verified gates and U-004

- Native NestJS restricted-runtime Staff Auth, MFA, cross-company denial,
  token generation/logout, real Company Admin grant/role/deactivation,
  real Location stop-intake/deactivation and a real read-lock vs writer
  race: **9/9 PASS** in earlier full run.
- PostgreSQL modeled Staff session, grant, organization/entitlement, role,
  Location lifecycle, refresh generation, factor retirement
  reader-first/writer-first interleavings: **16/16 PASS**.
- API TypeScript + focused ESLint PASS for newly added tests and current
  history code, with 250-line dense test and 291-line native test.
- Mounted Playwright `playwright.issue-276.config.mjs`: **6/6 PASS**
  after retesting: history details, A→B→A scope and stale responses,
  logout teardown, Retrieval Queue scope, EN/AR Light/Dark, narrow
  responsive geometry and focus. Dev-server logging revealed an existing
  **Retrieval Queue** HTML nesting/hydration warning (`<div>` under
  `<tbody>`) when drawer is open, outside the Live history change.
  Do not claim the separate Queue problem is fixed or U-004 approved.
- Eight reproducible synthetic visual captures exist in
  tmp/issue276-u004-evidence: EN/AR × Light/Dark × desktop (1440)
  /narrow (480). The visual Playwright matrix was rerun 1/1 PASS, with
  the development-only Next indicator hidden in screenshots. This is not
  an Owner sign-off or a true browser 200%-zoom acceptance test.
- External/Owner U-004 evidence remains: EN/AR × Light/Dark wide/narrow
  and 200%-zoom **matched screenshots** and explicit visual sign-off.
- Independent whole-diff security reviewer was unavailable in this run;
  previous focused reviews do **not** count as a fresh approval of all
  new Dense100 and SECURITY DEFINER wiring. Organization commercial/role
  writer path coverage beyond the native operations listed above remains
  a separate test/sign-off gate.

## Release decision

**NO-GO for merging, closing or deploying #276.** Dense100 attribution
correctness/tenant isolation is demonstrated on local test data, but the
indexed HTTP stress tail is not reliable at 16 concurrent requests.
Before a GO decision, isolate and repair this P1 without relaxing security
budgets blindly; rerun mixed real HTTP + native writer tests, the U-004
visual acceptance matrix, and independent read-only security review.
The previous DEC-103 index rollout-and-rollback rehearsal applies only to
owned disposable test databases; it is not a real QA/Production migration.
