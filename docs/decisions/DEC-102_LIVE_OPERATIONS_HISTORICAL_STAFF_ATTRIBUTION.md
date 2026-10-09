# DEC-102 — Live Operations historical staff identity and canonical Parking completion proof

Status: **Accepted**
Date: 2026-10-09
Owner: VAYLET product owner
Scope: Issue #276 / Task 5, package-local `Issues272–278/U-003` plus canonical completion proof and minimum DTO
Extends: DEC-037, DEC-079, DEC-080, DEC-081, DEC-082, DEC-088
Implementation branch: `fix/issue-276-live-operations-staff-history`
Supersedes: the unresolved *decision choices* in the Issue #276 diagnostic proposals, not their unverified test or QA status

## Decision and authorization boundary

The owner explicitly accepted the six recommendations for Issue #276 on 2026-10-09. This authorizes a **narrow, read-only repository implementation** of historical staff facts for the Live Operations page after the stated implementation-time security/domain checks. It does **not** approve the final UI pixels under package-local `Issues272–278/U-004`, grant a new Management Audit (#277) disclosure, authorize a PR/merge/deployment/production migration, or mean PostgreSQL/QA tests have passed.

### 1. Historical actor identity and minimum privacy

- A currently authorized viewer may read the complete **current canonical first and last name** of the original session check-in membership and proven Parking-completion actor even when that historical subject has subsequently been disabled, demoted, lost current Location access or ended their Shift. The historic subject's *current* grants do not constitute the viewer's read authority.
- Both name components must be present, valid and from the **same-Organization stored membership**. An incomplete, missing, invalid, foreign or unprojectable identity yields `null`; never infer from email, account ID, plate, audit JSON or unrelated membership.
- These are **read-time names**, not event-time name snapshots. Do not backfill or persist reconstructed history.
- Newly projected historical identity contains **no email, membership ID, User ID, role, grant, raw metadata or credential**. No email fallback if names are missing. The already-approved email semantics of *current active* assignee are not changed.
- `checkedInBy` identifies `valet_sessions.checked_in_by_membership_id`: the **original check-in association**, not necessarily the actor who finished the final Check-in command. UI copy must be semantically accurate and separately reviewed.

### 2. Purpose-specific Live-only API and DTO

- Accept **Option B**: a separate, authorized Live Operations-only read endpoint and **strict purpose-limited response schema**, preserving the existing `SessionOverviewEntry` / `readSessions` contract for Vehicles and other consumers byte-for-byte. Do not rely on merely hiding extra fields in Vehicles UI.
- No global historic-person lookup endpoint, broad directory query, per-row HTTP lookup, generic cross-surface identity service, or Management Audit enrichment.
- Existing `activeTask.assignee`, `currentAssigneeMembershipId`, Task/Session state, filters, page cardinality, keyset cursor meaning, and Retrieval Queue behavior remain unchanged. A queued unassigned Retrieval Task must never inherit the historical Parker as current assignee.
- Any new Live-specific cursor must be endpoint/purpose- and exact Organization/Location/filter-bound, with existing request authorization always rechecked; cursor contents are never an authority token. Handle old-client/new-API strict schema compatibility.

### 3. Viewer current-session and Location authorization

- Require the *exact current* Staff Session access verifier and generation plus present viewer Organization, role, exact active Location grant/ownership, active account and membership, `LOCATION_DASHBOARD_READ`, current `DASHBOARD_ACCESS` entitlement and applicable Company Admin MFA, all revalidated within the **same transaction before historical name reads**.
- Both Company Admin (CA) and Location Manager (LM) must be protected. LM does **not** acquire a new routine MFA requirement. Neither history nor a stale cached scope creates operational mutation authority.
- Respect the existing **staff-user-security advisory lock before exact Staff-session lock/recheck**, then compatible Organization/actor membership/Location-grant/lifecycle and commercial authorization synchronization, without inverting accepted writer lock order. Hold sufficient proof through the history read. A late, unlocked LM scope SELECT is insufficient.
- Before production implementation is considered review-ready, prove compatible ordering with actual logout/session refresh, grant/role/Organization/Location revocation, MFA/entitlement writers, including concurrent interleavings and deadlock absence on an isolated PostgreSQL harness. If a safe lock order cannot be proved, **STOP for a focused security revision** rather than weakening a shared Dashboard auth helper.
- On auth/scope/session/role/Location change or denial, fence stale responses and tear down protected rows and open history drawers; `A→B→A` cannot resurrect names solely because Location A is selected again.

### 4. Canonical Parking completion and Parker provenance

- `tasks.updated_at` is mutable at the database privilege boundary and **cannot** establish historical completion ordering.
- The historical Parker must be established only from an exact-scope, coherent **Task (`PARKING`, `COMPLETED`) + `DispatchEvent(COMPLETED)` + `AuditEvent(VALET_SESSION_PARKED)` pair**. Require the same Organization, Location, ValetSession, Task relationship and the canonical event-time/status/version metadata; require the single Dispatch completion actor and new assignee, canonical Audit actor and stored completed Task assignee to agree and be non-null.
- For each candidate Task require **exactly one** coherent Dispatch completion event and corresponding canonical Parking Audit event; a missing, duplicate, malformed, orphan, cross-scope or contradictory event is an integrity anomaly. Validate contradictory completion events on nonterminal/cancelled Tasks and orphan Parking audits; do not hide them with an event-first inner join or select an older coherent candidate while skipping suspect history.
- Use the approved completion **event `occurred_at`** for chronology, not Task `updated_at`; after all exact-scope evidence is validated, select the latest unambiguous *proven* completion. Distinct Tasks tied at the maximum event timestamp result in `UNVERIFIABLE`, not UUID-based purported physical order. Timestamps must be verified against migration/runtime write privileges during integration.
- No new completion writer, task backfill, migration, trigger or synthetic data repair is authorized by this decision. The current DEC-037 atomic writer contract remains unchanged.

### 5. Fail-closed historical provenance

- Exactly three server-authoritative, non-PII `parkingCompletionProof` values:
  - `PROVEN`: a coherent, unambiguous canonical completed Parking operation exists.
  - `NO_RECORD`: no completed Parking Task **and no contradictory completed Dispatch or canonical Parking Audit evidence** for that scoped session.
  - `UNVERIFIABLE`: missing, duplicated, orphan, malformed, tied-at-maximum or conflicting evidence; this includes completed Tasks without valid event pairing.
- A strictly validated Live-only DTO contains nullable `checkedInBy` and `parkedBy` (each, when non-null, only complete first/last canonical names) plus `parkingCompletionProof`. Whenever proof is not `PROVEN`, `parkedBy` **must be null**. Proof may be `PROVEN` while `parkedBy=null` because the identity is unprojectable.
- No `Parked By` person is fabricated from `checkedInBy`, current assignment, cancelled/queued Tasks or a guessed fallback. Do not present `NO_RECORD` or `UNVERIFIABLE` as an established historical Parking actor.
- For a verified completion with unknown safe name, use a truthful Unknown only in an explicitly labeled proven-completion context. The final rendering and wording remain subject to U-004.

### 6. Read-only bounded implementation and exact UI freeze

- Resolve history only **after a bounded, authorized session page**, preserving one output row per session, current cursor/filter/row counts and task semantics. All same-scope candidate Tasks/Dispatch/Audit evidence must be examined sufficiently to detect anomalies; page limits by themselves are not a cap on history work.
- Prove query budget and `EXPLAIN (ANALYZE, BUFFERS)` on a **verified disposable** PostgreSQL instance with both dense and sparse history; if bounded performance cannot be established without a migration/index/new numerical cap, **STOP for a focused decision**. Do not select a speculative cap or weaken fail-closed classification.
- Only the exact Live Operations historical employee label/fact delta is eligible for U-004 review. Preserve existing six-column table, row density, theme, typography, header/navigation, keyboard/accessibility, EN/AR RTL/LTR and Vehicles drawer/UI. No broad `OperationalStaff` behavior change or client directory fetch.
- Actual U-004 sign-off requires before/after captures from matched fixtures: EN/AR × Light/Dark, wide/narrow, long names, 200% zoom, queued/active Tasks, missing/conflicting history and stale-scope denial. Approval of product semantics is not approval of their actual pixels.

## Mandatory validation and release gates

1. Separate Live-only strict contract/endpoint and original Vehicles API regression, with no additional private identity keys.
2. Isolated PostgreSQL tests for event integrity, actor equality, ties, missing/orphan/duplicated evidence, current viewer auth, concurrent session/Location/entitlement revocation and deadlock-free ordering.
3. Performance/EXPLAIN, page cardinality, filter/cursor stability, no N+1 and **zero domain writes** in read path.
4. Mounted Dashboard and E2E tests for roles, historical vs active assignment, scoped cache teardown and approved bilingual visual parity.
5. Three independent final reviews (security/authority; PostgreSQL/domain; UI/a11y); no unresolved P0/P1.
6. Authorized read-only local QA reproduction; truthful NOT RUN if unavailable.
7. Owner U-004 exact visual sign-off **before merge**. No PR/merge/deploy/issue closure is implied by this DEC.

## Acceptance record

- **Package decision:** `Issues272–278/U-003` (not other repository-global `U-003` usages).
- **Status:** Accepted by the VAYLET product owner in this conversation on 2026-10-09, expressly approving the six preceding recommended decisions.
- **Implementation enabled:** narrowly scoped #276 Live-only server/contract/UI code, subject to the above security/domain tests.
- **Still pending:** implementation itself; reproducible PostgreSQL privilege/lock ordering proof and EXPLAIN; client/UI runtime evidence; `Issues272–278/U-004` final visual sign-off; authorized QA; independent final code reviews; separate PR/merge/deploy/closure instruction.

See `docs/validation/ISSUE_276_U003_HISTORICAL_IDENTITY_SECURITY_PROPOSAL.md` (pre-acceptance investigation) and `docs/validation/ISSUE_276_CANONICAL_PARKING_COMPLETION_EVIDENCE.md` (diagnostic evidence, not physical/database proof).
