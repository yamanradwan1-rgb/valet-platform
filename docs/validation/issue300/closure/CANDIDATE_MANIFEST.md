# Issue #300 — R2 Local Candidate Manifest

Status: **G0 preflight — local implementation authorized; not accepted for release**.
Date: 2026-10-18 (Asia/Amman).

## Owner authority and preserved baseline

- The Owner explicitly approved `ISSUE_300_FINAL_CLOSURE_MASTER_PLAN.md` R2 (`OWNER-DECISIONS-2026-10-18`), U-001–U-005, its exact UI-M1/19-file manifest, and local C0–C5 implementation. This later authorization lifts the earlier Issue #300 implementation freeze.
- All changes are local only. No push, PR, merge, deployment, shared/production migration or Issue closure is authorized.
- Frozen source: `codex/issue-300-prime`, `ef5a0554fa20fe6ee6fcc0a4ceeffdc83d6e5687`, worktree `tmp/issue-300-prime-integration`; verified clean at G0 and untouched.
- Isolated Prime candidate: `codex/issue-300-final-closure-r2`, `tmp/issue-300-final-closure-r2`, created clean from that exact SHA.
- The user-uploaded R2 and Owner authorization were copied with normalized LF line endings to `tmp/issue300-r2-owned/` within Prime and each worker's **Git-ignored** worktree. Normalized SHA256 of R2: `1eb1b7b13e8f41732a250d70c5c3858242de2a203f23da7f2976b0012ecfe9a1`; Owner directive: `c64b34c69266adab332fdb44bda79445e4896bb3aab0c2200ba7b9a02893dfea`.

## Isolated resources / explicit leases

- Historical G2 `issue300_g2_pg17`, volume `issue300_g2_pgdata`, `127.0.0.1:55480`: preserved, currently exited (255); restart was attempted only after container/volume identity guard and failed because Windows excludes host port 55480. Historical 96/96 evidence is **not** current runtime acceptance.
- New disposable PostgreSQL: Docker `issue300_r2_pg17`, Docker label `com.vaylet.task=issue300-r2`, private volume `issue300_r2_pgdata`, database `issue300_r2`, PostgreSQL **17.10**, `127.0.0.1:57285` loopback. Exact container/label/DB/role verified by read-only SQL; initial `_prisma_migrations` table absent, so **0→96 migration proof remains pending**.
- Credential file `tmp/issue300-r2-owned/pg.env` is Git-ignored, for the owned disposable instance only. Do not print its values or commit it. Never touch shared `localhost:5432/valet` or unverified containers.
- PostgreSQL heavy lease: **W6 exclusive initially**, following Prime identity attestation. W4 actual-role, then W7 signed HTTP/load, later; no concurrent heavy DB runners.
- Browser acceptance lease: **not yet allocated**; W7 only after integrated candidate and resource declaration. No existing shared API or Dashboard service may be killed/restarted to force tests.

## Ownership (seven disjoint worker worktrees)

All created clean at the frozen SHA. Exact source ownership follows R2 §8.8, §8.9 and §10.

| Role | Worktree / branch suffix | Sole owned source / proof |
|---|---|---|
| W1 | `issue-300-r2-w1-contracts` | Five bounded investigation contracts *only if needed*, independent contract oracle and W1 report |
| W2 | `issue-300-r2-w2-search` | Five R2 Search and selector files, focused Search tests and W2 report |
| W3 | `issue-300-r2-w3-timeline` | Four R2 Timeline files, focused Timeline tests and W3 report |
| W4 | `issue-300-r2-w4-security` | Direct source-boundary file, security tests and W4 report |
| W5 | `issue-300-r2-w5-ui-m1` | Exactly 19 approved UI-M1 frontend files, listed focused tests and W5 report |
| W6 | `issue-300-r2-w6-migrations` | New migration/actual-role proof scripts and W6 report; applied migrations read-only |
| W7 | `issue-300-r2-w7-acceptance` | New signed-HTTP/load/browser acceptance scripts and independent W7 report; no production source edits |

Prime alone owns integration/wiring, candidate ledger/manifest, and **conditional** local gate/guard, schema and forward-only migration if proven necessary. Prime must never concurrently edit W5's frontend files. W1 contract/oracle freeze precedes W2, W3 and W5 source edits. W6 provides true-role preflight before W4's runtime validation; serialized W6 → W4 → W7 database leases precede final UI/browser acceptance.

## Defects, gaps and exit conditions

- **Confirmed static P1** F01: unsafe Audit association exclusions can be mislabeled coverage AVAILABLE. Must classify scoped integrity conservatively without guessed Session.
- **Confirmed static P1** F02: direct/indirect detail `FOR SHARE` evidence locks conflict with ordinary append-only evidence privilege model; real-role manifestation unproven.
- **Confirmed static P1** F03: selector PARKED Task/metadata parity does not match canonical Search/Timeline rejection.
- **Confirmed P1 product limitation** F04: frozen frontend rejects `nextCursor`; now specifically authorized UI01–UI06 additions only.
- **Measured concern** F05: earlier warm Search SQL p95 `1968.88 ms` exceeds approved 1500 ms local gate; final candidate/role/workload not retested.
- **Verification gaps** F06–F09: signed indirect HTTP pagination, confidence/legacy envelope, actual migration/runtime/browser proof and SHA-specific evidence reconciliation.
- Keep default/local unsupported cohorts HTTP 503 fail closed; no fabricated XIDs, historical actor attribution, causality or current-as-historical labels.
- C1 contracts/strict role/DB harness; C2 query, correctness, approved UI delta; C3 signed HTTP + migration/actual role; C4 100k/1m/load + genuine zoom/settings; C5 T01–T70/U05-R01–R09 independent review and exact closure verdict.
- Do not declare the candidate ready until every blocking assertion passes or evidence is properly reused at the exact integrated SHA. Final push/PR/merge/deploy/issue closure requires separate Owner instruction.
