# Issue #414 W7 — foreground-tab cadence + real bearer HTTP test design

**Status:** The original isolated W7 branch only implemented the harness and did **not** execute HTTP+PG. After independent review, Prime integrated its test-only files into the feature route branch, tightened each measured response's live payload checks and both Task reason exact HTTP proofs, and **ran an actual local PG17.11 + mounted Nest HTTP profile on 2026-11-04**. All three simulated-tab cohorts passed, including token rotation, CA/LM HTTP authorization and MFA-neutral read checks. This is local evidence, **not** a browser-tab or production SLA certification.

### Actual Prime integrated HTTP evidence (all synthetic data, no production traffic)

| Simulated visible tabs | Warmup successful | Measured successful | HTTP p95 | HTTP max | Observed successful GET/s | Peak active runtime PG | Peak waiting PG |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 25 | 25/25 | 25/25 | 222.148ms | 239.015ms | 0.4240 | 2 | 0 |
| 100 | 100/100 | 100/100 | 84.203ms | 136.497ms | 1.6673 | 2 | 0 |
| 200 | 200/200 | 200/200 | 101.788ms | 239.064ms | 3.2591 | 3 | 0 |

Real bearer HTTP response codes: 200 for all **650 warmup+measured GETs**; each validated no-store, a full current 20-item overflow envelope, current Incident + Task content, with both Task reasons independently reauthorized by exact CA/LM HTTP source detail before/after the cohorts. Missed in-flight ticks 0, pool maximum 4, deadlock/statement/lock/query/acquisition timeout deltas 0, sampler errors 0. The 200ms sampler observed 2 positive lock-wait samples in the 100-tab cohort and 3 in the 200-tab cohort (peak 1 backend each): these are **observations, not proof of absence of shorter waits**. No request error was observed. After successful suite completion the repository exclusive PG17 harness cleaned **db=0 roles=0 children=0**. Source record: `docs/validation/issue414/ISSUE414_HTTP_FOREGROUND_TABS_PG17_METRICS.json`; test-only commit provenance is in the Phase-1 integration ledger.
This is a new, separate capacity question from W7's already measured
ALT-02/ALT-03 SQL reader microbenchmark. Do **not** copy the SQL benchmark
p95 into a full bearer HTTP/aggregate/polling performance claim.

## Confirmed route and isolated-branch limitation

The original isolated W7 branch `feature/414-w4-dispatch` contains its
current uncovered Task reader and original SQL performance evidence, but
**does not contain the Phase-1 alert preview HTTP controller**.
Read-only inspection of Prime's separate Issue #414 integration worktree
found the mounted endpoint
`GET /v1/staff/dashboard/locations/:locationId/alerts/preview` in
`management-alert-preview.controller.ts`. It is protected by
`MANAGEMENT_ALERTS_PHASE1_ENABLED=enabled`, active persisted Staff
bearer, current CA/LM Location authorization, Dashboard entitlement,
session/MFA checks, exact source security and a configured Dispatch
post-lock cutover. The isolated W7 branch cannot truthfully measure this
endpoint until Prime independently reviews and integrates **only the
test files** onto a branch that contains the real controller.

The opt-in HTTP integration test explicitly **refuses before creating
any test database** when the controller source is absent. No production
code, root migration, cross-worktree file or HTTP controller is supplied
or changed by this follow-up.

## Capacity model versus observed evidence

The published 60-second foreground cadence gives the following **pure
arithmetic offered load**, assuming exactly one GET per visible tab per
minute. It is **NOT measured throughput**, a concurrency guarantee or
evidence that the backend can handle these numbers.

| Simulated foreground tabs | Intended GETs per 60 seconds | Arithmetic offered GET/s |
|---:|---:|---:|
| 25 | 25 | 0.4167 |
| 100 | 100 | 1.6667 |
| 200 | 200 | 3.3333 |

The test-only deterministic scheduling function distributes initial tab
phases across one minute and adds repeatable **0–3-second jitter** around
each tab's nominal 60-second timer. It simulates **two cycles for each
cohort**: first cycle warmup (one GET per tab); second measured (one GET
per tab). Thus each of the 25, 100, 200 cohorts has 25/100/200 warmup
requests and 25/100/200 measured requests. One full run spans roughly
**6+ minutes**, plus isolated DB creation, MFA enrollment and seeding;
success requires each measured and warmup GET to complete with valid
response, and neither overlapping requests nor missed ticks. If a prior
GET remains in flight at its next same-tab timer, the dispatcher
**skips and records that tick**, never launches a duplicate.

These are **simulated** foreground tabs driven by real Node timers, not
200 browser processes, Playwright pages, foreground visibility handlers
or a proof of Dashboard UI polling-controller behavior. They reuse two
genuine independently authenticated CA/LM Staff sessions and alternate
viewers within each cohort—**not 200 separate users or sessions**.
Synchronized visibility-resume bursts, offline tabs and fan-out from
multiple API instances are not measured by this staggered profile.

## What the authorized HTTP harness will measure once integrated

The opt-in test creates only a new disposable PG17 database, applies real
existing migrations and provisions the least-privileged runtime role.
It starts the **real Nest application on a random loopback port** with
MFA bypass explicitly OFF and the alert feature explicitly enabled.
It logs in a CA and enrolls the CA's actual TOTP factor, creates an
active LM with the exact Location grant, and uses their genuine bearer
tokens. Another Location is present for scope isolation. The fixture
seeds 20 active initial QUEUED, 20 current declined QUEUED Task cases,
160 historical terminal Tasks, per-Task Dispatch/Audit history and six
open HIGH Incidents. The synthetic-only cutover is explicitly set to
DB-rounded **one day before** this synthetic event history. That is a
test fixture input, **not valid real-world release cutover provenance**.

Before measuring, CA and LM must each receive HTTP **200** with a
structurally valid 20-item/hasMore preview and `Cache-Control: no-store`;
an invalid bearer must return 401 and no protected items. Request
timings include the complete loopback HTTP pipeline—bearer resolution,
authorization, multi-source aggregate SQL, transport, JSON parse—rather
than a direct reader call. Between 25/100 and 100/200 cohorts, the
fixture rotates each Staff token using the real refresh endpoint,
requires the next bearer to work, and after the profile verifies
preview/refresh never extended MFA assurance or CA admin-idle activity.

The result records for each cohort: actual warmup/measured attempts and
successes, status/error counts, p50/p95/max HTTP latency, measured
schedule lateness, true first-send-to-last-completion duration and
achieved-success GET/s. It inspects **the actual mounted application's
bounded PostgreSQL pool** (not an extra synthetic query pool):
configured max (explicitly 4 in this profile), observed active/waiting
peaks, acquisition/query/statement/lock timeouts and the lifetime
admission high-water mark. Separate PG activity sampling at **200 ms**
records observed blocked/active backends and deadlock deltas. These
samples can miss sub-200-ms waits. The admin sampler itself adds load.
Every network request has an independent request ID, 10-second abort
deadline, real bearer, and validates response shape/no-store.

The harness writes only **aggregate redacted metrics** to the isolated
test working directory's `tmp/issue414-w7-owned/http-foreground-tabs.json`;
it neither prints nor persists bearer tokens, user email, session IDs,
Location IDs, incident descriptions or guest details. Failure writes
`complete=false` rather than a successful benchmark. Synthetic source
seeding is **not proof of canonical production writer behavior**.

## Reproduction requirements — originally NOT EXECUTED on isolated W7

Run only **after independent test review**, on an integration worktree
that actually contains the alert preview controller and approved
dispatch reader, with Prime-confirmed *currently free* exclusive PG
lease. The test **must be invoked through** the repository's
`run-owned-tests.mjs`; do not manually fabricate
`VAYLET_TEST_CLUSTER_RUN_ID`. Use a local PG17 parent URL via
`TEST_DATABASE_URL` if explicitly configured; otherwise the harness and
native fixture share the project's standard **local-only** PostgreSQL
target fallback. The test guard requires loopback `127.0.0.1`, a valid
nonprivileged port and the actual owned lease; never use production.

```text
# Illustrative environment names; do not use a production DB or print its credentials.
# Optional if the canonical local PG17 test cluster is configured:
TEST_DATABASE_URL=<task-owned local PostgreSQL 17 parent URL>
ISSUE414_W7_HTTP_TABS_PROFILE=I_OWN_EXCLUSIVE_LOCAL_PG17

# From apps/api working directory:
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/issue414-http-foreground-load.integration.test.ts
```

Absent explicit opt-in, the integration suite is **skipped**. An absent
controller throws before starting the disposable DB. The harness must
stop the mounted app, drop its disposable DB and runtime role, restore
the feature/MFA/pool environment, and release the repository-owned
exclusive cluster lease. Independently verify cleanup
`db=0 roles=0 children=0` in the harness log before reporting PASS.

Unit-only schedule validation:
`pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/issue414-http-foreground-cadence.test.ts`
does **not** require or access PG, does not assert real HTTP latency
and does not prove the production 60-second controller cadence.

## Release gates remain open

Do not infer a production 25/100/200-tab SLA from a test definition,
the mathematical GET/s rates, previously measured W7 SQL timings or
synthetic local hot-cache HTTP results. Even an eventual passing local
HTTP run requires independent verification of aggregate+HTTP p95, burst
and 429/backoff behavior, larger production-scale datasets, role/tenant
revalidation, full browser foreground/visibility/offline checks,
MFA-neutral assurance, cutover provenance, CI and owner release review.
Only the harness's test/documentation files were integrated locally into
Prime for validation. They were not pushed, deployed or made production-active.
