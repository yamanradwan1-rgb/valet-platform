# DEC-109 — Issue #414 Phase-1 Management Alerts Policy

Status: **Accepted — Owner decision for OD-01..OD-06; technical evidence gates still open**
Date: 2026-11-04
Owner: VAYLET product owner
Issue: #414
Related plan: `docs/plans/ISSUE_414_MANAGEMENT_IMPORTANT_CRITICAL_ALERTS_MASTER_PLAN.md`

## Scope and precedence

On 2026-11-04 the Owner approved the recommended **OD-01 through OD-06** decisions in the Issue #414 master plan. This is a binding **product/contract decision**, not evidence that software, source chronology, migration, tests, CI or deployment is complete. It refines the earlier *proposed* recommendations in #414 §10A only for the Phase-1 subjects below. Follow all existing Accepted DEC rules (notably DEC-078/079/080/082/083/088/095/100/108), the strict feature-only UI Freeze, source-specific permissions, and the original 17-category phased target.

## OD-01 — Accepted delay bounds

All values are **integer seconds**, minimum/maximum inclusive, measured against authoritative source/server time.

| Category | Default (seconds) | Allowed min–max (seconds) |
|---|---:|---:|
| ALT-01 — notification grace after persisted Retrieval SLA breach | 0 | 0–60 |
| ALT-02 — initial unassigned queue episode | 60 | 0–300 |
| ALT-03 — post-decline uncovered episode | 0 | 0–120 |
| ALT-04 — current ACCEPTED/IN_PROGRESS stage stuck | 300 | 60–900 |
| ALT-06 — READY/HANDOFF_PENDING readiness episode | 300 | 60–900 |
| ALT-11 — unresolved payment OUTCOME_UNKNOWN IMPORTANT warning | 120 | 60–600 |

Server and SQL constraints must enforce accepted inclusive ranges; UI may show a bounded subset. Breach/elapsed comparisons use **strict greater-than**; equality does not cross. ALT-01 cannot change saved SLA or fabricate a NULL SLA. No new per-user delay/disable for other immediate or sensitive occurrence families, and no personal polling setting. ALT-11's optional CRITICAL escalation remains **NOT APPROVED/DISABLED**. These initial pilot bounds require operational/performance proof before rollout.

## OD-02 — Accepted folded uncovered Task case

One current uncovered-Task case, one reason and one timer, per **proven** queue episode. An initial QUEUED episode selects ALT-02 and the queue event clock. A committed decline/requeue episode selects ALT-03 and the decline/requeue event clock. Assignment, progression, terminal state or a genuinely new queue episode retires/replaces the old episode. Never use both timers, their minimum, stale declined history, random UUID order or mutable `tasks.updated_at` to manufacture eligibility.

## OD-03 — Accepted chronology safety policy, unresolved proof

First investigate whether current persisted Dispatch facts establish the actual sequence under same-millisecond/concurrent commits using real PostgreSQL tests. `(occurred_at,id)` with random event IDs is **not** proof of chronological order.

If an episode cannot be ordered unambiguously, **omit that alert/fail closed** and report missing coverage. For unprovable existing chronology, propose the smallest per-Task monotonic marker, full transactional writer/lock/rollback/migration/legacy implications and a new **focused Owner decision before implementing the source-domain change**. No marker or Dispatch migration is approved merely by this decision.

Thus the Owner's **decision procedure** is accepted; the source evidence gate remains OPEN for ALT-02/03 and later ALT-04. Do not declare Phase 1 fully READY on policy approval alone.

## OD-04 — Accepted personal preference architecture, writes and security

One typed record per **(Organization, User)**, tenant-safe composite membership identity, six integer-second columns, monotonic nonnegative revision and server-owned update time. No shared Company/Location settings modification, generic JSON, local-only truth, or outbound `Notification` reuse. A missing record yields defaults and revision `0` without writing; first changed save yields revision `1`.

Approve **own-user GET effective full values/revision** and **own-user PUT complete six values + expectedRevision**; concrete route and symbol spelling must follow inspected repository conventions. Determine User/Organization from the authenticated persisted Staff session, not caller-supplied owner IDs. CA and LM with current active exact Location authority can edit only their own Organization preference, subject to current role, membership, entitlement, session and accepted MFA.

For a changed write, enforce authorization **before** guarded mutation within one DB transaction; unique first insert and revision CAS: exact desired-state retry is no-op with canonical result and no duplicate audit; matching revision changed value increments once; stale differing state returns typed `409` conflict; unauthorized/expired/revoked request returns nondisclosing denial with no write. Prove unknown-outcome and concurrent insertion retries under real PostgreSQL.

CA preference **writes are SENSITIVE actions**: require DEC-078 5-minute MFA freshness. LM keeps its current accepted session/grant checks, not newly invented TOTP. Personal reads, alert polling, token-renewal/transitive subscription/context reads must not extend admin idle assurance. Other interactive calls retain their accepted MFA behavior.

Changes must receive **one atomic safe tenant Management audit**, with approved focused event `MANAGEMENT_ALERT_TIMING_PREFERENCES_CHANGED`: authenticated actor membership, own User+Organization target, bounded changed-key names and revision before/after only; **no preference values, credentials, secrets or personal metadata**. No audit on GET, denied operation or exact no-op retry. Preserve existing audit readers' permissions; no new LM/Supervisor audit visibility. Only reuse an existing writer if its scope/entity contract fits, otherwise stop for a narrow compatible design review. Approve a focused forward-only preference migration/contract as **future implementation scope only**, not execution.

## OD-05 — Accepted Phase-1 recipient/source policy

For ALT-01/02/03/08/12, **Company Admin and currently exact-Location-authorized Location Manager only**, under actual source-specific permission and current Dashboard entitlement/MFA/session. No Supervisor, Employee or Guest Management bell. CA's operational alerts are for the **selected authorized active Location**; LM for its **currently granted active selected Location**, not a company-wide view. No generic financial/audit/tracking permission inheritance.

ALT-01 requires active authorized retrieval attempt and saved SLA; ALT-02/03 current authorized Task and **proven** episode; ALT-08 persisted HIGH/CRITICAL OPEN/INVESTIGATING Incident; ALT-12 currently pending/unexpired and *viewer-specific* `canReview=true` with no self-review. Enforce source authorization before candidate query, filtering, correlation, pagination, count, badge, preview and deep-link detail. Use privacy-minimal DTO, fresh exact source reauthorization on click, nondisclosing denial, and stale-response fencing. A read failure must not display an authoritative zero. **Phase 1 has active condition cases only; no per-occurrence Seen writes are approved until a future source-specific contract.** Later-phase recipient rows still require OD-07/08.

## OD-06 — Accepted minimal feature-specific UI placement

Add an **isolated personal Alert Timing subsection to the actually mounted `/policies` Policies Studio** accessible to eligible CA and LM; do not repurpose its CA-only Company/Location sending settings. Add a minimal management-only topbar bell and panel through feature-local shell wiring. Narrowly add source-authorized exact-item read/selection to existing Task/Incident/Retrieval/Presence views; no guessed URLs or first-page-only drawer selection.

Preserve **STRICT feature-only additive UI FREEZE** and existing Policies Studio dirty/draft/navigation, source layout, menus, filters, global style and #415 Live Operations behavior. If the addition requires a broader visual change, stop for distinct Owner approval. Require AR/EN, RTL/LTR, accessibility, dark/light and responsive evidence.

## Remaining gates and exclusions

**Technical gates still unresolved:** chronology proof or separately approved marker, source-specific query/detail and concurrency proofs, exact DTO/route/writer compatibility, MFA-neutral activity tests with MFA bypass OFF, real-PG indexing/performance, mounted visual regression and actual CI/release checks. OD-07/OD-08 remain later-phase decisions; DEC-107 stays Proposed pending separate reconciliation. ALT-14 Cash Reconciliation is **EXTERNAL / DEFERRED / DISABLED** and outside this work. No new source-domain Cash, payment collection or Shift workflow is approved; #415 remains deferred.

This Accepted policy and associated docs-only merge **do not authorize implementation, migrations, feature activation, source-code merge, CI bypass for future implementation, or deployment**. Before implementation, follow `AGENTS.md` and the VAYLET guardians; stop on any Accepted DEC contradiction.

Affected documentation: `docs/08_DECISIONS_LOG.md` and the Issue #414 master plan. Align Issue #414's earlier proposed-section status in documentation; do not silently present §10A historical candidates as current policy.
