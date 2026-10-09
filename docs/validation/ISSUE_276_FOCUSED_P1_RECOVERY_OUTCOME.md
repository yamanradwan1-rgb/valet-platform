# Issue #276 — Focused P1 Recovery: verified outcome

**Date 2026-10-09. Status: PRODUCTION SQL P1 BLOCKER; NOT CODE REVIEW READY.**

Accepted DEC-102 and DEC-103 remain binding. U-003 is not reopened. U-004 Owner visual signoff is pending. Original branch start: ad8999828d16c716eaca53491023c4440c3cc14d. All production/API/Contracts/Dashboard work remains **uncommitted and not shipped**.

## 1. Isolation and benchmark evidence

Only the task-owned, independently manifest/PID/SQL-verified PostgreSQL 17.11 data directory under D:/kndoom/valet-platform/tmp/issue-276-disposable-pg-0d8a6d3a254e/data and localhost port **55449** was used. Its synthetic benchmark child is valet276_dec103_w2_40c1a097d8. Never connect to the original shared local PostgreSQL 5432. Two previously Accepted partial indexes were retained; a modified test-only INCLUDE(id) index and expression statistics were independently restored/dropped. There was **no shared/real migration**, no customer data, no arbitrary history cap and no production DB change.

The preceding experiment evaluated five SQL shapes across sparse/dense 50/100 session pages, three EXPLAIN ANALYZE BUFFERS runs each (60 plans); both the current C join and alternate batched forms failed to meet the simultaneous no-global-scan and dense-history scaling requirements. See ISSUE_276_DEC103_POSTGRESQL_EXPERIMENT.md §§8–9.

### Cost attribution (measured cumulative query shapes, warm-cache medians; not additive or a production SLA)

| Stage | Sparse100 median ms | Dense100 median ms | Dense100 shared hits |
|---|---:|---:|---:|
| Scoped session/page query | 1.163 | 0.813 | 5 |
| A: audit session reference IDs | 1.149 | 2.482 | 310 |
| B: audit entity reference IDs | 0.867 | 2.533 | 343 |
| C: audit Task-reference IDs | 2.029 | 26.264 | 4,167 |
| Three arms + distinct audit/session pairs | 3.308 | 34.183 | 4,820 |
| Full wide Audit row hydration | 4.139 | **52.574** | **16,826** |

Dense100 matches 4,000 real synthetic completed Task/Audit pairs. C expression indexing and final Audit heap hydration dominate; 4,000 PK lookups were observed. Narrow INCLUDE(id) index remained Index Scan, **not Index Only Scan**, despite favorable all-visible page stats, and did not prove a safe fix. Separate batched Bitmap Heap hydration reduced cache hits to about 5,284 but dense100 median **56.402 ms** (versus exact current WIP SQL median **49.832 ms** with a broad 24,105-event Seq Scan); the indexable batched Task aggregation reached **84.749 ms** dense100. Expression statistics still estimated only about 2 matches versus 4,000 real matches. Actual classifier CPU median about **1.624 ms** for 100×40 Task/Audit cases; PostgreSQL dominates.

**P1 exact source:** apps/api/src/modules/dashboard/operational-history-audit-discovery.ts:62-70. No tested query/partial-index variation passed the simultaneous query cost, history-scaling, and evidence requirements. No production SQL change was made.

## 2. Cardinality and independent semantic oracle

Independent domain review: current production writers allow one normal Parking completion per custody episode, but the partial DB unique index enforces only one **active** same-type Task. Completed terminal Task history has no DB-wide upper bound or guaranteed post-completion immutability, and accepted DEC-034 reserves future repeat terminal history. Classification today: **APPLICATION_PROHIBITED_BUT_DB_NOT_ENFORCED**. Forty completed Tasks/session are adversarial to the current app, but DB-possible; cannot be silently capped or skipped.

The independent expected Audit/session relation was reconstructed from deterministic synthetic fixture IDs and known malformed/orphan/crosslinked rows, rather than from a competing implementation. Exact expected sorted pair counts and MD5 matched all four measured query outputs:

| Page | Pairs | Independent expected MD5 |
|---|---:|---|
| Sparse 50 | 56 | 360c2fcf6350a0251c2913596d3cf805 |
| Sparse 100 | 106 | 804cdd8c6058e75bdad5b243de121493 |
| Dense 50 | 2,000 | f6319eda9dc4b6ee8a2147de7be1ae30 |
| Dense 100 | 4,000 | 6196c48febcde7605327fd58cec72b3f |

Source and seven-question domain review: ISSUE_276_DOMAIN_CARDINALITY_REVIEW.md. No new focused classifier P0/P1 was found against the accepted canonical proof semantics, but matching this fixture is not complete real-PG end-to-end history integrity or real HTTP authorization proof.

## 3. Real PostgreSQL security concurrency and remaining authority boundary

The isolated test fixture was repaired and a real PostgreSQL current-authority race suite completed **16/16 PASS** on separate uniquely generated child databases with zero remaining test-created DBs/roles. Each run observed actual Lock waits through pg_stat_activity before its competing commit, without an observed deadlock. The suite covered two interleaving directions for Staff session revoke, Location grant revoke, Dashboard entitlement disable, CA MFA factor retirement, Location lifecycle deactivation, Staff refresh/access token verifier rotation, membership-role loss, and Organization-status mutation.

The test does **not** prove all possible security races, or that directly synthesized entitlement/Organization status writes invoke an actual management endpoint (none was found in source for those two). The actual Live API holds session/role/Location/grant/entitlement locks through the bounded page + history transaction. No historical email or membership ID is returned by the strict name DTO.

Independent security review found a **separate P1 response oracle** in the uncommitted Live authorization: a stale CA role hint could emit a distinguishable MFA step-up error before the current locked location/membership authority ultimately denied that location (apps/api/src/modules/dashboard/live-history-read-authorization.ts original hint :21-30 and MFA :132-140). A narrow **uncommitted** patch now defers only known MFA/Unauthorized errors until current locked authority is proved; denied scope returns generic denied, valid CA gets its normal MFA error, and MFA-before-organization lock order stays unchanged. **7/7 focused unit cases PASS**, including two new denied/valid CA factor cases; final independent review of this change remains required. No shared auth service was rewritten.

## 4. Dashboard and final release gates

Prior mounted Chromium on synthetic data **5/5 PASS** for Live historical/current names, correct PARKED versus queued/current assignment behavior, Vehicles shared drawer isolation, A-to-B-to-A stale result fencing, logout teardown and EN/AR Light/Dark/narrow cases. The Live-only body portal resolves its pre-existing div-inside-tbody hydration problem while preserving six columns/focus. This does **not** test the standalone Retrieval Queue view: the earlier claim of broad Queue parity was overstated; independent UI reviewer also found a pre-existing separate Queue drawer-inside-tbody issue, not introduced or fixed by Issue #276. Owner U004 matched screenshots and 200 percent zoom/visual parity evidence **NOT CAPTURED**, U004 approval **PENDING**.

The independent read-only UI reviewer found no additional new Live diff P0/P1, but standalone Queue and U004 evidence remain gaps. Full integrated canonical Audit/query performance, total real Live transaction latency, expanded-history scaling, remaining exact owner/tenant cases and all final production-diff approvals remain incomplete.

## 5. Precise decision required

The separate reviewable **DRAFT, NOT ACCEPTED** proposal ISSUE_276_AUDIT_QUERY_DESIGN_DECISION_PROPOSAL.md presents further disposable-only partial index/narrow Audit evidence work versus a normalized append-only typed Audit reference relation, including migration and backfill security requirements. The Owner must separately accept any novel production index/schema experiment or real-environment migration. No third index, schema, backfill, trigger or arbitrary completion limit is silently authorized.

**Final disposition: TASK 5 BLOCKED — INDEX/QUERY DESIGN DECISION REQUIRED.** Preserve the dirty worktree, do not stage/release the unverified production source, do not open a PR, fast-forward merge, deploy, apply shared migrations or close Issue #276. Documentation-only delivery is allowed, explicitly distinguished from production review readiness.
