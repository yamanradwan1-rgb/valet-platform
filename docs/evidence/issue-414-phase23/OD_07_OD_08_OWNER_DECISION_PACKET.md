# Issue #414 — OD-07 and OD-08 Owner Decision Packet (DRAFT)

**State: PROPOSED / NOT ACCEPTED.** Neither this file nor implementation authorization accepts any permissions, event grouping, Seen persistence or financial projection. The team must stop affected code until the Owner approves exact focused contracts.

**Provenance:** Prime baseline `5a844f70d5efcda0a618f153b46871e6137a1d36` (PR #430); Master Plan §14, Issue #414, Accepted DEC-109 and other source-specific Accepted Decisions. Prior Master Plan descriptions of Phase 1 as unimplemented are historical; PR #430 merged five Phase-1 categories. DEC-107 is explicitly **Proposed**, though Issue #352 takeover behavior has separately approved directions.

## OD-07 — Phase 2 source exposure, occurrence identity and Seen

### Verified constraints

1. **ALT-05 takeover:** `emergency_task_takeover_operations` has a committed per-Organization `operation_id` with exact Task/Location/Dispatch/Audit linkage; an identical successful takeover replay is not a second occurrence. DEC-107's final compatibility status is still Proposed. New Management Alert receipt/source-detail access is not implied by takeover-command permission.
2. **ALT-07 handoff:** `verify-handoff-command.ts` records failed attempt audits; only persisted `terminalized=true` failures should qualify. Those audit records do not carry the corresponding `handoff_verification_id` for a directly provable group. A Supervisor Override is an independent committed event, not proof of release. Handoff secrets and attempt metadata must not be exposed.
3. **ALT-09 tracking:** `geofence_evaluation` emits committed VIOLATION records with random event UUIDs; a violation may be restricted-area entry or outside-all-allowed-areas, so `areaId` alone cannot describe its semantic type. Event `occurred_at` is based on GPS sample captured time, not necessarily the server commit time. Per-tracking repeat grouping and attention timing need verified source choices. Route/GPS authority is not generic Dashboard authority.
4. **Seen:** existing Phase-1 preview does not have occurrences or Seen; no approved Seen table/write contract. Receipt identity must be scoped to authenticated User+Organization+category+committed source occurrence. Event source reauthorization and seven-day eligibility must hold inside the same mutation transaction. A UUID alone is not an access token.

### Smallest approval requested

**OD-07/A — Source-specific recipients and safe projections.** Approve an explicit allowlist for ALT-05/07/09 after actual current-source checks, with Company Admin and only those exact-granted Location Managers who have the corresponding owning-source read authority. Approve only bounded event time, safe source label and exact-source navigation; never raw audit reason, pickup proof/code, private custody metadata, GPS coordinates/route or employee tracking data. Alternative: keep each unproven category disabled until its source authority is separately accepted. **Do not grant universal audit, takeover, route or tracking rights.**

**OD-07/B — Occurrence identities and grouping.** Approve ALT-05 keyed by committed `(organization_id,operation_id)`. For ALT-07, approve either a proven one-to-one terminal failure audit ID as each committed occurrence **or** a focused, independently verified proof-episode linkage extension before grouping (no guessed link across attempts); Supervisor Override is a separate audit occurrence. For ALT-09, specify whether each committed VIOLATION event is independently attention-eligible or define an evidence-backed grouping boundary by tracking segment, violation subtype/area and repeat episode. Explicitly define seven-day attention anchor for delayed GPS samples (`recorded_at` versus source `occurred_at`); do not silently derive grouping from UUID sort or local GPS coordinates.

**OD-07/C — Seen persistence/interaction.** Approve the exact source-qualified uniqueness key, own-user category-specific transactional reauthorization and seven-day equality/expiration rule, stored timestamp authority and retention policy. Prefer explicit per-item `Seen` confirmed by server over implicit panel-opening writes; if source-opening counts as Seen, approve its exact server-confirmed action and race/revocation semantics. Do not add a polymorphic universal FK with no valid target or mutate source histories. Authorize one focused forward-only migration only after this shape is approved.

**OD-07/D — Chronology correctness.** Source review indicates Task/Dispatch and READY operation timestamps can be captured at transaction start, before contested locks. Existing Phase-1 queue history proof does not establish Phase-2 stage-entry clock truth. Approve either an independently proven current-stage ordering/clock contract with explicit fail-closed legacy behavior, or a separately specified smallest source clock/ordering writer change with Postgres same-ms/lock-delay/rollback tests. Until then ALT-04/06 may remain internally studied but not activated based on an unproven elapsed time.

**Recommendation:** source-specific least privilege (**A**) with unsupported groups/timestamps explicitly disabled until proved. Broad generic audit/GPS access (**C**) is unacceptable.

## OD-08 — Phase 3 financial, security, Location and restricted-shell rights

### Verified constraints

1. Current `payment-projection-authorization.ts` operational detail authorizer excludes `ORG_ADMIN`; Dashboard financial aggregate is not exact Payment authority. Location Manager exact payment projection does not expose collection-operation internals. `OUTCOME_UNKNOWN` is set before a provider call; definitive `FAILED` follows only authoritative provider/reconciliation evidence. `REFERENCE_ATTACHED` handling remains unapproved.
2. `shift_force_end_closures` represents committed force-end occurrences; runtime role is explicitly denied direct SELECT on this sensitive table. Normal Shift end does not create the same closure. The raw audit path can reveal protected force-end reasons.
3. Staff audit role-change and Location-access-revocation events are Organization scoped; exact security-event audiences/sensitive-role transition allowlist are not currently Management Alert grants. An existing Supervisor audit exception is not Supervisor alert authority.
4. Newly created Locations may default `INACTIVE` and `accepting_intake=false`; that combination is not an operational intake stop. The effective `dashboardAccessEnabled` entitlement, not `SUSPENDED` label alone, governs Dashboard. Existing CA subscription-only read is a separate restricted utility and must not be converted to a Dashboard entitlement bypass.

### Smallest approval requested

**OD-08/A — Payment projections and ALT-10/11 overlap.** Approve a **narrow, read-only, redacted per-Payment and per-collection-operation alert projection** for CA and an exact granted LM only if this matches current business policy. No broad financial permission, provider secrets or collection commands. ALT-10 only for authoritative definitive FAILED with current unresolved-UNKNOWN ALT-11 taking precedence. Decide whether `REFERENCE_ATTACHED` continues to count as unresolved ALT-11 or retires it pending confirmation; use verified operation guard time and DEC-109 IMPORTANT 120s default, 60–600s setting. **900s CRITICAL remains disabled.**

**OD-08/B — Durable administrative occurrences.** Approve ALT-13 recipients under exact current Shift/Location authority, safe projection from the committed force-end record without granting general table SELECT or emitting raw reasons; approve ALT-15 **CA-only** sensitive role change / Location-access-revocation audit allowlist and what qualifies as sensitive. Neither may reveal protected audit/free-text content to LM, Supervisor or revoked staff. Seen follows separately accepted OD-07/C.

**OD-08/C — Active Location intake restrictions.** Approve ALT-16 only when an **active** current authorized Location actually has intake disabled, with retirement on resumed intake/deactivation, exact CA/LM source rights, and no Seen. Do not use a default inactive new Location or unproven stop-start timestamp as evidence.

**OD-08/D — Commercial restricted shell.** Approve ALT-17 **CA-only** minimal effective-entitlement restriction in the *existing subscription-only authorized utility*, even when the ordinary Dashboard entitlement denies Dashboard access. No bell or Management API bypass in a denied shell, no LM/employee/guest exposure, no invented commercial override or CRITICAL escalation.

**Recommendation:** narrow source-specific projection approvals (**A**) and separate, explicit `REFERENCE_ATTACHED`, staff sensitivity and restricted-shell decisions. Blanket finance/audit grants (**C**) violate least privilege.

## Authorization and implementation consequences

- No OD decision may be inferred from this DRAFT or from a passing source test. Until explicit approval, relevant workstreams remain `DECISION REQUIRED`.
- Exact Category → source → recipient → safe detail → identity/retirement → Seen writer → negative tests must be recorded in the WBS ledger.
- No approval here changes Task ownership, custody, payment collection, cash reconciliation, Shift policy, tracking, MFA or general Dashboard entitlement.
- ALT-14 remains **EXTERNAL / DEFERRED / DISABLED**. No all-17 claim.
- The combined Phase 2 and Phase 3 PR remains subject to distinct acceptance gates, verified tests, independent reviews and **separate Owner PR/merge approval**; no production work is authorized.
