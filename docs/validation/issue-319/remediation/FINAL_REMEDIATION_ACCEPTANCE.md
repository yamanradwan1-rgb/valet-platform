# VAYLET Issue #319 — post-remediation security acceptance and Owner handoff

Date: **2026-10-23**. Scope: the Owner-approved five P2 read-revocation /
MFA failures **F319-01 through F319-05**, with isolated real PostgreSQL and
Nest HTTP evidence. This document supplements, **does not replace**, the
historical security audit checkpoint at `../ISSUE_319_FINAL_ACCEPTANCE.md`.

## A. Executive security decision

**FOCUSED SECURITY GO:** All five confirmed original P2 reproductions have
scoped backend fixes with red-to-green and real canonical-writer tests in the
approved path families. Independent READ-ONLY reviewer accepts their tested
security and compatibility properties: **0 confirmed surviving P0, 0 P1 and
0 P2 within those five exercised boundaries**.

**ISSUE #319 CLOSURE / DEPLOY / MERGE: NO-GO.** Several adjacent independent
Company Admin RR readers are **source-level candidates** for similar early
snapshot behavior and have not been tested against canonical MFA recovery.
The 85 registered core GET patterns are inventoried but not all raced.
No PR, merge, deployment or Issue closure is authorized by this report.

## B. Repository lineage and precise source changes

- Repository: `yamanradwan1-rgb/valet-platform`, isolated worktree
  `/valet-platform/tmp/issue-319-audit`.
- Existing branch: `audit/issue-319-dashboard-revocation-coverage`;
  historical audit/evidence SHA
  `af62a11add5d97ec291ca0dbf49fdd29be88f708`.
- Original vulnerable application baseline / audited `origin/main`:
  `20998a069eb5d576895c0e6c149271a4a0e4028b`.
- Focused existing source commits: `667a7362` (F319-01), `4bf5007f`
  (F319-02), `5bcbe67b` (F319-03), `1b4c81ba` (F319-04).
- F319-05 focused source commit:
  **`6660ee8117edae1baccedcd1404da7822be5d5c5`** changes only
  `apps/api/src/modules/dashboard/physical-resource-overview-transaction.ts`.
  The separate QA/evidence commit and exact final remote-tracking SHA are
  recorded in the Git handoff after the non-forced branch push; embedding a
  commit's own SHA inside itself would not be an immutable identifier.

| Finding | Confirmed historical disclosure | Narrow corrected source | Proven protected behavior |
|---|---|---|---|
| F319-01 Physical Resources, P2 | LM GET returned 200 with Key Slot after real CA Staff Management grant revoke 201; RR overview reused stale snapshot | `physical-resource-authorization.ts`, `physical-resource-read.service.ts`, new `physical-resource-overview-transaction.ts` | LM RC SHARED canonical org advisory and exact post-lock grant recheck; RR LM obtains SESSION SHARED org advisory before RR snapshot; CA separate Management path |
| F319-02 legacy Configuration, P2 | Stale LM GET 200 disclosed ten settings after canonical grant removal | `dashboard-configuration-command.ts` | LM-only transaction SHARED org fence through all ten settings/inheritance projection; fresh denied 404; no CA fallback or mutation redesign |
| F319-03 Branding, P2 | Stale branded synthetic name HTTP 200 after canonical grant remove | `branding-command.ts` | LM BASIC_BRANDING exact recheck under shared grant fence through branding projection, 404 after prior commit |
| F319-04 Subscription, P2 | Stale scoped subscription HTTP 200 after grant removal | `subscription-read.ts` | LM exact shared fence through subscription projection, no CA fallback, still accessible if DASHBOARD_ACCESS entitlement disabled |
| F319-05 CA RR MFA recovery, P2 | **HTTP 200 and protected synthetic Key Slot present after real MFA factor RETIRED** while RR snapshot existed before MFA authority | `physical-resource-overview-transaction.ts` | Fresh pre-RR non-authoritative CA eligibility/MFA check; canonical RR CA authority; exact persisted session-bound ACTIVE factor `FOR SHARE` through projection/commit; stale factor update aborts/retries full transaction fresh, resulting 403/no Key Slot |

Only **six API Dashboard implementation files** differ from the original
application baseline. No UI, API response-shape redesign, existing migrations,
Prisma schema, runtime SQL grants or shared infrastructure behavior changed.
The affected entities are Staff session, MFA factor, Organization membership,
Location grant, Resource/Configuration/Branding/Subscription projections.
There are no ValetSession or Dispatch state transitions in this change.

## C. Vulnerability reproduction and exact green evidence

Historical logs must remain immutable. The original #319 audit
`../logs/audit-tests.txt` was **25/25 PASS while deliberately reproducing
F319-01/02**; the separate original F319-03/04 RED file
`logs/adjacent-audit-tests.txt` was **2/2 PASS only as vulnerability
reproduction**. The F319-05 RED file
`logs/ca-rr-mfa-confirmed-audit-tests.txt` was **0/1 PASS (expected security
FAIL)**, with `responseStatus=200 containsSyntheticKeySlot=true` after real
MFA recovery HTTP had committed factor retirement. Never count those outcomes
as remediation passes.

The **identical strict F319-05 reproduction test** (same PostgreSQL RR
snapshot and canonical recovery HTTP interleaving) was rerun after the fix:
`logs/ca-rr-mfa-fixed-audit-tests.txt` **1/1 PASS**, now
`responseStatus=403 containsSyntheticKeySlot=false`, fresh 403. Its two
additional deterministic real recovery schedules are **2/2 PASS** in
`logs/ca-rr-mfa-concurrency-audit-tests.txt`:

- Reader-first: a correctly MFA-fenced CA 200 Overview finishes while actual
  recovery writer waits on that reader's backend PID, then factor retirement
  commits and fresh reads deny.
- Revoker-first: canonical factor retirement writer queues behind an isolated
  owner gate, the RR reader queues behind the writer, and only after retirement
  commits does the HTTP reader return 403 without a Key Slot. The tested
  sessions are distinct and their MFA state remains truthful.

For F319-01/02, `logs/races-first-audit-tests.txt` proves **6/6** real
CA MFA-assured Staff Management HTTP reader-first/revoker-first races;
F319-03/04 `logs/adjacent-ca-races-first-audit-tests.txt` separately proves
**4/4** real CA HTTP races with exact backend PID blockers. These focused
runs are included or represented in the combined suite; **do not add their
counts to 73 as distinct tests**. Seven actual Physical GET route patterns
all allowed current authorized Location data and denied fresh post-revocation
access in `dashboard-issue319-physical-matrix.integration.test.ts` (one
parameterized route-matrix test), including:

1. `/physical-resources/overview`
2. `/physical-resources/key-slots`
3. `/physical-resources/parking-spots`
4. `/physical-resources/parking-zones`
5. `/physical-resources/key-slots/:resourceId/custody`
6. `/physical-resources/key-slots/:resourceId/label`
7. `/physical-resources/parking-spots/:resourceId/label`

Five non-overview Physical patterns had reader-first canonical SQL writer
tests; full two-direction real CA HTTP was selectively run for key-slots and
RR Overview, **not** all seven distinct route patterns in both orders.

## D. Executed validations (exact commands and counts)

All PostgreSQL test commands ran from the #319 worktree root with the
repository-owned `run-lab.ps1` opt-in safety guards and unique disposable
PostgreSQL 17.11 loopback clusters. Each `-RunTag` writes exact `tests`,
`identity` and `cleanup` raw UTF-8 logs under `remediation/logs/`.

| Command suffix after `-File docs/validation/issue-319/run-lab.ps1` | PASS/FAIL/SKIP | Time | Evidence |
|---|---|---:|---|
| `-Suite audit -Evidence remediation -RunTag ca-rr-mfa-fixed -TestFile test/dashboard-issue319-ca-mfa-rr-candidate.integration.test.ts` | 1/0/0 | 29.08s | `logs/ca-rr-mfa-fixed-audit-tests.txt` |
| `-Suite audit -Evidence remediation -RunTag ca-rr-mfa-concurrency -TestFile test/dashboard-issue319-ca-mfa-rr-regression.integration.test.ts` | 2/0/0 | 22.08s | `logs/ca-rr-mfa-concurrency-audit-tests.txt` |
| `-Suite audit -Evidence remediation -RunTag physical-ca-regression -TestFile test/dashboard-issue319-physical-matrix.integration.test.ts` | 1/0/0 | 19.05s | `logs/physical-ca-regression-audit-tests.txt` |
| `-Suite audit -Evidence remediation -RunTag final-five-fixes` | **73/0/0**, 13 files | **192.90s** | `logs/final-five-fixes-audit-tests.txt` |
| `-Suite baseline -Evidence remediation -RunTag final-five-fixes` | **28/0/0**, 4 files | **79.93s** | `logs/final-five-fixes-baseline-tests.txt` |
| `-Suite audit -Evidence remediation -RunTag final-five-fixes-performance -TestFile test/dashboard-issue319-performance.integration.test.ts` | 1/0/0 | 22.59s | `logs/final-five-fixes-performance-audit-tests.txt` |

Additionally, all four commands completed **exit 0 / PASS**:

```powershell
pnpm --filter @valet/api typecheck
pnpm --filter @valet/api lint
pnpm architecture:check
pnpm --filter @valet/api build
```

Architecture check emitted only pre-existing grandfathered oversized-file
warnings; no new >300-line authored code or newly expanded legacy-oversized
file was reported. No build/lint/typecheck baseline failure remained.

## E. PostgreSQL, lock and performance acceptance

Test cluster roles: `issue315_owner` private superuser for synthetic schema
bootstrap, uniquely named `valet_runtime_*` runtime role **without**
SUPERUSER/CREATEDB/CREATEROLE. The `TEST_DATABASE_URL` and
`MIGRATION_DATABASE_URL` were explicitly directed to verified loopback-only
test `/postgres`; ambient `DATABASE_URL` removed; test opt-in
`ISSUE319_EPHEMERAL_PG=I_OWN_THIS_CLUSTER` required. Source/data directory,
PostgreSQL version, host/port, roles and cleanup are in logs. Full five-fix
suite cluster port **57760**, #315 **58162**, final performance **58318**;
each cleanup shows **zero child DBs, zero child connections, owned unique
cluster directory removed**. No production/shared PostgreSQL was accessed.

Measured final local, uncontended HTTP latency, **n=80 per route**
(`logs/final-five-fixes-performance-audit-tests.txt`):

| Path | Historical pre-fix p50 / p95 (ms) | Five-fix p50 / p95 (ms) |
|---|---:|---:|
| Dashboard Overview keys | 13.98 / 20.95 | 9.31 / 17.01 |
| Physical key-slots LM | 8.44 / 14.05 | 8.23 / 12.58 |
| Scope discovery | 12.16 / 25.32 | 6.27 / 9.10 |
| Physical RR overview LM | Not measured | 10.42 / 17.51 |
| Physical key-slots CA | Not measured | 6.92 / 10.22 |
| **Physical RR overview CA MFA** | **Not measured** | **11.99 / 17.46** |
| Legacy Configuration LM | Not measured | 7.12 / 10.72 |

These cross-cluster descriptive loopback observations are **not** production
SLOs or causal latency estimates; particularly no before/after CA RR
percentage is claimed. Reader/revoker blocker PIDs, organization cross-talk,
two LM readers, lock_timeout `55P03`, statement timeout `57014`, cancellation,
rollback/retry and ambiguous advisory lease quarantine have deterministic
proof in `logs/final-five-fixes-audit-tests.txt` and supporting focused logs.
**No deadlock observed** in executed interleavings; broad pool-saturation
soak, contended p95 and every optional cancellation ordering were **NOT RUN**.
The F319-05 automatic `40001` retry is source-visible and HTTP outcome
verified, but internal retries/SQLSTATE were **not individually instrumented**.

## F. Independent reviewer, limitations and Owner decision

Independent READ-ONLY Worker 5 inspected actual five-fix source and logs,
did not author either code or test execution, and signed the focused
**SECURITY GO / Issue #319 CLOSURE NO-GO** verdict in
`independent-security-review.md`: **P0=0, P1=0, P2=0 confirmed survivors
inside the verified five-fix scope**, not a universal Dashboard safety claim.

Still unverified (not confirmed vulnerabilities): CA RR eligibility-before-MFA
source patterns in `dashboard/analytics-kpi-snapshot-transaction.ts`,
`management/management-company-analytics.service.ts` and
`management/company-report-read-service.ts`. Company report export has an
additional fresh READ COMMITTED finalizer whose effect was not raced. Other
independent read families, entire 85-route interleaving matrix, contended
pool soak, and already-resolved bearer cancellation beyond DEC-023 remain
outside proven guarantees; noncooperative privileged SQL and bytes already
sent cannot be retroactively fenced. Do not classify these as secure or
confirmed new P2s without actual evidence and approval.

**UI-FROZEN:** no frontend, CSS, icons, typography, Dashboard navigation,
theme, translations, customer app or native source changed. **DB:** no new
migrations, shared DB changes or expanded runtime table privileges. **External:**
only disposable test clusters; no PR, main merge, deployment, CI run, Issue
closure or unrelated issue operation.

**Owner handoff:** the five focused repairs are ready for Owner source and
evidence consideration. Issue #319 remains **OPEN / NO-GO closure** until the
unverified independent CA RR readers receive a separate scoped decision and
normal branch/CI/merge checks are explicitly authorized. No further
production remediation beyond F319-01..05 was silently undertaken.
