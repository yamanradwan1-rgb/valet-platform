# Issue #300 R2 — W1 Contract and Historical Confidence Oracle

## Scope, authority, handoff

- **Owner authorization:** R2 final execution and UI-M1 approved for *local implementation only*. No release, PR, push, merge, deployment, or Issue closure.
- **Worktree / branch:** `D:\kndoom\valet-platform\tmp\issue-300-r2-w1-contracts`; `codex/issue-300-r2-w1-contracts`.
- **Base:** `ef5a0554fa20fe6ee6fcc0a4ceeffdc83d6e5687`.
- **Authority:** R2 §7.1, §8.3, §8.8 W1, U-002/U-003, original Issue300 Master Plan, `AGENTS.md`, `docs/17_AGENT_CODE_STRUCTURE_RULES.md`, DEC-068/102/103.
- **Entities:** AuditEvent, KeyCustodyEvent, DispatchEvent, Incident, Task, ValetSession and current Vehicle. This test makes **no** state transitions, DB/schema/index/policy changes, API writes, or UI edits.
- **Files:** new `packages/contracts/src/issue300-closure-contract.test.ts` only, plus this report. Five permitted existing `audit-investigation-*.ts` schemas were inspected and left unchanged. `packages/contracts/src/index.ts` remains Prime-owned and unchanged.

## G1 exports and compatibility — frozen, no DTO changes

Consumers continue using existing `@valet/contracts` exports:

- `auditInvestigationEvidenceQualitySchema`: `RECORDED | PARTIAL | UNVERIFIABLE`.
- `auditInvestigationCoverageSchema` and `auditInvestigationCoverageStatusSchema`: four source-scoped statuses and existing `PARTIAL / INTEGRITY_ANOMALY` option.
- `auditInvestigationSearchQuerySchema`, `auditInvestigationSearchResponseSchema`, `auditInvestigationSearchItemSchema`, `auditInvestigationMatchReasonSchema`.
- `auditInvestigationTimelineQuerySchema`, `auditInvestigationTimelineResponseSchema`, `auditInvestigationTimelineEventSchema`, `auditInvestigationTimelineKeySchema`.
- `auditInvestigationEventDetailSchema`, `auditInvestigationDetailParamsSchema`, `auditInvestigationFilterQuerySchema`, `auditInvestigationFilterResponseSchema`.
- `auditInvestigationCursorPayloadSchema` version 1, `auditInvestigationCurrentLabelSchema`, source/role/scope schemas and their existing inferred types.

**No new wire schema, quality enum, coverage field, pagination state or cursor version is needed.** Runtime consumers import existing package exports only. The following names are **test-only independent oracles**, exported solely from the test module for reviewers, *not* from `@valet/contracts`: `issue300ClosureFacts`, `issue300ExpectedAssociation`, `issue300ExpectedHistory`, `issue300ExpectedCoverage`, `issue300ExpectedPaging`, `issue300ExpectedParkedLink`.

## R2 §7.1 independent fact/conclusion matrix

| Evidence case | Session association | Individual confidence | Coverage versus paging |
| --- | --- | --- | --- |
| Independently consistent direct link, visible source and Session | Admit exact scoped Session | `RECORDED` for persisted fact, **not** physical truth | `AVAILABLE` only when eligible source admission has no proven gap; page may still continue |
| Legacy direct NULL birth, full cutover attested | Admit supported direct fact; never synthesize XID | `PARTIAL` where historical relationship assurance is limited | Without cutover proof, strong read fails closed; a NULL is not a fictitious timestamp |
| Legacy indirect with no independent source-to-Session anchor | No guessed Session | No actor or Session enrichment | Generic authorized Location-only `PARTIAL/INTEGRITY_ANOMALY`, no rejected IDs/counts |
| Independently attested indirect source+parent, born-visible at S0 | Admit only with safe independent anchor | `RECORDED` only if source fact is supported; `PARTIAL` where event-time link unproved | No new source family or causal claim |
| Parent uncommitted or born after S0 | Exclude at old S0; fresh S1 may reconsider | Late parent's existence alone cannot prove event-time association | Late exclusion **is not automatically an integrity anomaly** |
| Conflicting / orphan Task, Incident, PARKED hint, wrong parent type/scope, present JSON NULL | Refuse inferred Session; do not coalesce arbitrary hints | `UNVERIFIABLE` only when a separate safe anchor exists | Independently provable Location-only anomaly is generic; no foreign reference/actor/count |
| Unknown Audit event with direct safe Session anchor | Admit minimal safe event | `UNVERIFIABLE`, no raw event-type, metadata or actor attribution | Does not imply an entire source family is unavailable |
| Source failure or unauthorized source | No fabricated complete page | Confidence cannot repair a missing source | Error/unavailable state and unsuccessful continuation, not `AVAILABLE` |

**Important distinction:** the standalone oracle deliberately uses synthetic source IDs, declared independent anchors, insertion-visibility classes and historical confidence labels, **not SQL results**. Its classifications are expectation inputs for W2/W3/W7, not implementation of their SQL/HTTP guards.

## Source identity, paging and current identity

- Identity is `(source,eventId)`, never UUID alone. Different source facts at the same time remain distinct. Timeline tie order: event time ASC, `AUDIT=0`, `KEY_CUSTODY=1`, `DISPATCH=2`, `INCIDENT=3`, UUID ASC.
- Historical search's U01 qualification remains **same-Session AND** between separate in-window slot and membership witnesses; union record count deduplicates by source/id. W2 must prove the window `[from,to)`, negative outside-window case and cross-source witness algebra against application SQL; this test oracle models admission/order and does not pretend to run the query.
- `nextCursor === null` indicates no further page; it **does not** establish source coverage, confidence, complete physical custody or historical certainty.
- U-003 filtered continuation with a mutable CURRENT make/model/plate and no proven bounded whole-cohort revision detector must return **safe 503**, not a forged completed page, silent S0 refresh, auto-replay or an invented stable matched set. The UI asks for **explicit Apply** with a fresh query. Source failure, auth loss and expired signed cursor have different transport/UI handling.
- Timeline point detail is an **independently freshly authorized** read. It must not claim to replay the Search/Timeline S0 snapshot.

## Coverage and privacy boundaries for consumers

W2/W3 should use existing per-source `coverage` (including `INTEGRITY_ANOMALY`) and per-event `quality` independently. A truly unassociated Audit row cannot create a Session-level problem badge, actor, Task reference, or cross-tenant inference. If only a Location-level anomaly is provable for current authorized scope/window, report only generic Location-level `PARTIAL`, **without** rejected event IDs/counts or raw metadata. A source query error must fail the request rather than present three of four as complete. Unknown event safe projection is W3's responsibility: the current strict timeline DTO permits an actor field even with `kind: UNKNOWN`, so the runtime projector must enforce `actor: null` and empty participants; widening the shared wire DTO was unnecessary and not undertaken.

## Tests and limits

The new test file remains **297 physical lines after Prettier** (hard cap 300), defines an independent 11-row synthetic source/cohort matrix, and executes four targeted Vitest cases: S0/S1+legacy/unknown confidence; four-source ties/dedup; source integrity versus paging; real canonical PARKED/legacy Task and malformed/late hints. The matrix exercises unsupported indirect-only, contradiction, orphan, Vehicle-only/foreign exclusions through the classifier; no G2/PostgreSQL/runtime/HTTP/browser claim is made.

Verification commands/results are recorded at the W1 commit:

- `pnpm install --offline --frozen-lockfile` — succeeded on isolated worker checkout, no lockfile change.
- `pnpm --filter @valet/contracts exec vitest run src/issue300-closure-contract.test.ts` — four test cases PASS.
- `pnpm --filter @valet/contracts typecheck` — PASS.
- `pnpm --filter @valet/contracts lint` — PASS.
- `pnpm exec prettier --check packages/contracts/src/issue300-closure-contract.test.ts` — PASS.
- `pnpm architecture:check` — PASS (exit 0); only pre-existing grandfathered size warnings on unrelated paths.

### Required W2/W3/W5/W7 follow-up

W2: prove independent U01 witness AND, same-Session/tenant/Location predicates, selector parity, partial coverage and U-003 503 with **actual** query/controller/DB tests. W3: enforce source-anchored `PARTIAL/UNVERIFIABLE` and unknown safe projection without fabricated roles; preserve canonical VALET_SESSION PARKED writer and distinct Task/Incident visibility fences. W5: show coverage/record confidence separately from pagination status; explicit restart and no auto paging. W7: independent signed first→page2 S0/fresh S1, real runtime MFA/grants/privileges, legacy migration race and full T01–T70 / R01–R09 acceptance.

This is **contract/oracle unit evidence only**. It does not declare any unresolved Issue300 HTTP, G2, migration, security, UI or performance gate complete and confers no publication authority.
