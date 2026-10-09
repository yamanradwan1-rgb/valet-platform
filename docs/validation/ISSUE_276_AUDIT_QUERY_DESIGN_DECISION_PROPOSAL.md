# Issue #276 — Audit query cost: focused index/schema design decision

**DRAFT — NOT ACCEPTED. NO REAL-ENVIRONMENT MIGRATION APPROVAL.** 2026-10-09.

## Authority and measured reason for escalation

Accepted DEC-102 defines strict historical Parking proof, original check-in association, minimized current canonical names, and no invented Parker. Accepted DEC-103 approves three-reference Audit discovery and evaluation of two partial Audit indexes on a truly disposable PostgreSQL instance **only**. This document neither reopens those decisions nor authorizes a third production index, table, trigger, generated column, materialized cache, migration, backfill, PR, merge or deployment.

Current uncommitted C-reference discovery, apps/api/src/modules/dashboard/operational-history-audit-discovery.ts:62-70, produces a broad **24,105-Audit Sequential Scan** under the synthetic 50/100-session page benchmark. Five distinct query shapes across four sparse/dense pages and three repetitions generated **60 actual EXPLAIN (ANALYZE, BUFFERS) plans**. Median existing-query sparse100/dense100 **18.953/49.832 ms**. Batched task-reference array lookup avoids the global scan and improves sparse100 to **4.881 ms**, but dense100 regresses to **84.749 ms**. Batched materialized alternative dense100 is **71.550 ms**. All five preserve exact (Audit ID, implicated session ID) fingerprints on the tested four pages; none proves both good dense scaling and absence of broad Audit scans.

### Independently measured A1–A5 cost attribution

All values are warm-cache medians of three EXPLAIN runs on **isolated** PostgreSQL 17.11; stages are not additive.

| Stage | Sparse100 ms | Dense100 ms | Dense100 shared buffer hits |
|---|---:|---:|---:|
| Authorized-like page Tasks/Session | 1.163 | 0.813 | 5 |
| A: Audit session reference IDs | 1.149 | 2.482 | 310 |
| B: Audit entity reference IDs | 0.867 | 2.533 | 343 |
| C: Audit task-reference IDs | 2.029 | 26.264 | 4,167 |
| A/B/C unique Audit/session references | 3.308 | 34.183 | 4,820 |
| Final full Audit row hydration | 4.139 | **52.574** | **16,826** |

Dense100 has 4,000 synthetic completed Parking Tasks, all relevant. The C index lookups plus full Audit hydration dominate. In contrast, isolated CPU benchmarking of the actual classifier over 100 sessions, 4,000 Tasks and 4,000 Audit rows yielded about **1.624 ms median**; optimizing TypeScript classification is not the main lever.

### Why the dense case cannot be dismissed

Current application writers queue PARKING only from AWAITING_PARKING and complete a Task with an IN_PROGRESS/version/owner check plus Session PARKING/version check. They do not normally create 40 completed Parking Tasks in one custody episode. **However**, PostgreSQL's partial uniqueness covers **active** (session,task type), not all historic COMPLETED records, and accepted DEC-034 reserves future legitimate terminal-task recurrence. Runtime grants and legacy/import paths can insert or change historical rows; there is no binding DB maximum or terminal Task immutability trigger. Present classification: **APPLICATION_PROHIBITED_BUT_DB_NOT_ENFORCED**; retaining dense/adversarial cost and fail-closed checks is necessary.

## Experiments already rejected as release evidence

1. Hash/Semi and baseline three-arm JOIN still perform full 24,105-Audit Sequential Scans.
2. Batched arrays and materialized Task-ID subqueries remove global scans, but dense100 cost is above the baseline and grows with thousands of relevant events.
3. LATERAL produced a full scan plus repeated index probes.
4. Separate Audit ID batch/Bitmap Heap hydration dropped shared hits from ~16,826 to ~5,294, yet dense100 single-run maximum was **85.882 ms** and did not prove safe scaling.
5. A revised **disposable-only** partial Task reference index including Audit ID failed to produce an Index Only Scan; still visited 4,000 matched index tuples. Merely adding INCLUDE(id) is **not an established fix**. Visibility-map/heap and write-cost review remain necessary.
6. Disposable-only extended expression statistics estimated about 2 rows for a dynamic 4,000-matching-key lookup and did not establish a viable plan.

Exact queries, raw repetition timings/plan nodes, result fingerprints and disposable restoration evidence belong to ISSUE_276_DEC103_POSTGRESQL_EXPERIMENT.md. No fabricated latency SLA is inferred from these synthetic warm-cache samples.

## Reviewable alternatives needing a *new* focused decision

### Option A — Revised partial-index layout, then narrow evidence

Authorize a *disposable-only* experiment on keys/INCLUDE columns for the Task reference path that explicitly measures index-only eligibility, **actual** Heap Fetches, visibility map, B-tree size, write amplification, memory, no per-task probes, and one-time final Audit JSON hydration. The tested simple INCLUDE(id) layout was insufficient. Do not put full large Audit JSON in an index without separate byte-size/write-cost proof. A production index migration requires a separate approval after measured representative and adversarial 50/100-page evidence.

### Option B — Normalized append-only Audit reference relation

Review a typed, indexed reference relation that records **all independent references for one physical Audit ID**: session FK, entity UUID, and *raw taskId text*. Preserve the possibility that one contradictory Audit implicates two separately authorized page sessions. The relation must be populated **atomically** with append-only canonical Audit writer activity, backfilled/reconciled against every legacy malformed/null-linked Audit, and remain authoritative for new contradictory inserts. Validate same-Organization/page Task scoping, DB grants, append-only privilege policy, migration rollback, backfill/concurrent-write race, data-size/write cost and exact cardinality. Deduplicate by (Audit ID, implicated session), then hydrate each required full Audit once. This is a **hypothesis**, not a tested or approved schema.

### Option C — Integrity-aware per-session evidence materialization

More complex and higher-risk: any summary must update correctly on new inconsistent Audit/Dispatch/Task evidence, actor/name membership changes, cross-session links, and viewer session/role/entitlement revocations, without leaking historical identity or choosing an older convenient Parker. Not recommended as a performance-only shortcut without a separate security/domain review.

### Not permitted

No arbitrary Task history cap, assuming max-one based solely on current writers, ignoring Task-only/null-linked/cross-linked evidence, changing PROVEN/NO_RECORD/UNVERIFIABLE meaning, guessing Parker, using mutable Task.updated_at as event chronology, making global planner settings persistent, or performing any shared/production schema operation.

## Next decision and acceptance evidence

The Owner should select **a specific, separately scoped disposable index/schema experiment**, not retroactively approve current WIP. Before real-environment approval it needs (1) independently expected valid/orphan/duplicate/wrong-scope/actor/version/timestamp/crosslink evidence and final classifier outputs, not just inter-query parity; (2) repeated EXPLAIN JSON for realistic and adversarial 50/100 pages and **expanded history**, median and maximum execution, buffers, loops, heap fetches, planner estimates, index size/write cost, full Live transaction budget and request concurrency; (3) no global Audit scan, pathological per-Task probes, N+1, missing contradictory implications, unauthorized names or changes to Vehicles/Retrieval behavior; and (4) separately verified current Staff Session/CA/LM/grant/entitlement/lifecycle concurrency, independent SQL/domain and security reviews, and U004 Owner visual signoff before release.

**Current gate: P1 BLOCKER — INDEX/QUERY DESIGN DECISION REQUIRED.** Keep #276 production files uncommitted; no PR, merge, deployment, shared migration or issue closure.
