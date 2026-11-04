# Issue #414 — Workstream E: Financial Alerts OD-08 Decision Packet

**Status: PROPOSED — DECISION REQUIRED. No Phase-3 financial source authorization or alert activation is approved.**

**Inspection baseline:** `5a844f70d5efcda0a618f153b46871e6137a1d36` (`feature/414-p23-e-finance`). **Scope:** WBS 414-03-01/03-02, ALT-10/11 only. This is a reviewable proposal, not an Accepted Decision, new API, migration or claim of runtime validation.

## 1. Repository facts discovered

- `docs/decisions/DEC-057_PHASE6_FINANCIAL_RELEASE_AND_PROJECTIONS.md:46-80` and `apps/api/src/modules/payments/payment-projection-authorization.ts:14-55` limit **exact staff Payment projection** to active `LOCATION_MANAGER` with exact LocationAccess or operational Supervisor/Employee with an active Shift. They expressly **deny ORG_ADMIN**. The staff endpoint in `staff-payment.controller.ts:45-78` is session-scoped; it does not confer Management alert authority.
- `payment-projection-query.ts:50-132` selects canonical Payment, current Validation and Refunds, but **not** `payment_collection_operations`. `overview-financial-query.ts:41-85` counts statuses by currency for active visits, so aggregate Dashboard authority does not establish per-Payment, per-operation or cross-location detail access.
- `digital-collection-transitions.ts:15-40` commits `OUTCOME_UNKNOWN` and server-authored `dispatch_guarded_at` **before** `digital-collection-command.ts:268-281` makes the provider call. A thrown or unknown result leaves the operation unresolved. `REFERENCE_ATTACHED` retains `dispatch_guarded_at` and `resolved_at = NULL` (`digital-collection-transitions.ts:42-87`); reference attached is **not** a verified outcome.
- `provider-event-collection.ts:52-180` accepts an authenticated, matching, authoritative `COLLECTION_FAILED`/`COLLECTION_SUCCEEDED` provider event only against `OUTCOME_UNKNOWN` or `REFERENCE_ATTACHED`. In the same transaction it sets operation `RESOLVED` and Payment `FAILED`/`PAID`, respectively. An ignored/mismatched/duplicate callback is not authoritative. `digital-collection-transitions.ts:90-116` sets a provider initiation `REJECTED` operation without setting Payment `FAILED`.
- `digital-collection-repository.ts:199-215` resets an eligible `FAILED` Payment to `UNPAID` when preparing a **new** attempt. Payment `updated_at` is mutable and there is no persisted `failed_at` or failure-generation column (`packages/database/prisma/schema.prisma:1785-1844`).
- `payment_provider_events` persists the processed provider event identity but not normalized `kind` (`provider-event-repository.ts:260-289`). The same committed provider transaction appends `audit_events` with type `PROVIDER_EVENT_COLLECTION_FAILED`, `entity_type = PaymentCollectionOperation`, `entity_id = operation.id`, `metadata_json.payment_id`, and DB-authored `occurred_at` (`provider-event-audit.ts:17-49`). A failure episode must prove this correlation rather than infer it from `Payment.updated_at` or any provider event row.
- Migration `20260816002800_phase6_payment_collection_operation/migration.sql:43-93` enforces state/time invariants and a **partial unique index** allowing at most one unresolved `PREPARED`/`OUTCOME_UNKNOWN`/`REFERENCE_ATTACHED` operation per `(Organization, Payment)`. Existing historical index covers `(organization_id,payment_id,created_at,id)`; query performance for future alert scans remains unverified.
- Management commercial access depends on current **typed** `dashboard_access_enabled`, never subscription `status` text (`management-commercial-access-policy.ts:14-45`, DEC-088). `management-alert-audience-authorization.ts:7-52` intentionally admits only Phase-1 ALT-01/02/03/08/12; `management-alert-source-detail-query.ts:16-96` has no financial category or operation-detail support.

## 2. Binding requirements

- Issue #414 §§2–4, §10B and Master Plan §§6–9 require ALT-10 **IMPORTANT** only for **definitive current FAILED** Payment; ALT-11 **IMPORTANT** for aged unresolved collection, without false financial failure, provider mutation, blind retries, or sensitive provider detail exposure. The 17-category inventory is eventual scope; ALT-14 remains disabled. Strict UI FREEZE applies.
- Accepted DEC-109 §OD-01 fixes ALT-11 per-User + Organization delay to **120 seconds default, inclusive 60–600**, with **strict elapsed `>`** crossing; exactly-equal is not due. Its optional **CRITICAL 900-second escalation is disabled**. The setting changes presentation timing, not provider/domain timeouts. DEC-109 §OD-05 approves the CA/LM audience only for five *Phase-1* categories; OD-08 remains open.
- Accepted DEC-054/055 preserve collection-operation idempotency, pre-provider dispatch guard, unresolved-state uniqueness and authenticated provider reconciliation. Accepted DEC-057 keeps the operational staff payment endpoint's purpose-specific authorization unchanged. DEC-078 requires Company Admin MFA and activity-neutral polling; DEC-088 prevents commercial lapse from touching guest or valet financial operations.
- No Accepted contract currently grants Company Admin per-Payment details, grants a new operation-detail read, exposes provider references in Management alerts, authorizes a future financial deep link, or defines the payment failure episode/`REFERENCE_ATTACHED` alert policy.

## 3. Existing implementation patterns

`authorizeDashboardReadLocation` in `dashboard-read-authorization.ts:27-119` establishes exact active Location, current entitlement, CA session/MFA or LM LocationAccess and revocation fencing; the Phase-1 alert audience additionally rechecks the exact Staff session and suppresses CA idle-activity recording. Phase-1 source readers then independently authorize each category *before* deriving, counting or revealing candidates. This pattern is a base Management gate, **not** a grant of financial source authority.

## 4. LOCKED decisions

1. Neither `OUTCOME_UNKNOWN` nor `REFERENCE_ATTACHED` proves failed or successful collection; the provider callback is the canonical financial reconciliation (`DEC-054/055`).
2. Current `Payment.status = FAILED` is a necessary ALT-10 source condition; a confirmed collection failure is different from initiation `REJECTED` (`provider-event-collection.ts:110-179`).
3. ALT-11 warning uses `dispatch_guarded_at`, DB/server time, the current viewer's authorized `alt11UnknownPaymentSeconds`, and strict `>`; null guard cannot establish elapsed age (`DEC-109:13-26`, migration 028:43-74).
4. Phase-1's source-specific, per-Location, current-session, MFA/entitlement requirements must remain effective; no new financial roles or permissions have been accepted (`DEC-109:52-66`, `DEC-057:74-80`).

## 5. DERIVED conclusions

- A newly inserted `PREPARED` operation has no dispatch guard, so it cannot age as ALT-11. An `OUTCOME_UNKNOWN` operation has a valid guard by DB constraint. An attached provider reference alone does not resolve that operation; both states can still receive authenticated late callbacks.
- With a fresh attempt, a past FAILED episode is retired when the canonical Payment becomes `UNPAID`; a later failed attempt has a different operation ID. Identity based only on Payment ID would conflate separate failure generations.
- `REJECTED` and `RESOLVED` operations are terminal, with `resolved_at`; they cannot remain ALT-11 cases. `REJECTED` does **not** qualify for ALT-10 without a separate authoritative Payment failure source.
- If an unresolved operation coexists with a `FAILED` Payment (including inconsistent legacy or contested data), uncertainty takes precedence and ALT-10 cannot assert a currently definitive failure. Suppression must examine **current source state**, even when ALT-11's user-delay threshold has not crossed.

## 6. UNRESOLVED decisions — minimum Owner OD-08 packet

| Decision | Narrow proposed answer (requires Owner acceptance) | Alternative / impact |
|---|---|---|
| **OD-08A: per-Payment audience** | CA with current protected session, MFA, Dashboard entitlement and **selected active Location**; LM only with current **exact active Location grant** and entitlement. Define an independent *read-only* financial-alert permission for specific Payment and current linked operation. Never change DEC-057 operational staff projection. | CA-only is narrower, but would remove LM financial visibility. Neither choice is accepted by DEC-109. No Organization-wide CA candidate scan or generic CA Payment grant. |
| **OD-08B: detail content** | Restrict preview to category/level, generic reason, location, source/episode identity and authoritative time. Permit safe exact-payment/operation lookup only after renewed OD-08 authority; avoid amount, payer, provider, provider reference, safe result code, payment credentials and raw callback details in alert previews. | Additional amounts/currency, provider labels or investigation fields require separately approved audience and sanitized DTO. Existing staff Payment endpoint and aggregate are not substitutes. |
| **OD-08C: REFERENCE_ATTACHED** | **Recommend** considering it the same unresolved collection family as `OUTCOME_UNKNOWN`, retaining the **original dispatch guard clock**, with user-facing wording such as “collection awaiting confirmed outcome”. It remains active until authoritative reconciliation, never represents failure. | Limiting ALT-11 to literal `OUTCOME_UNKNOWN` hides stuck post-reference verification; including `REFERENCE_ATTACHED` can alert during normal asynchronous settlement. Owner must choose before implementation/tests. |
| **OD-08D: ALT-10 episode identity** | Recommend `(organization_id, payment_id, resolved_failed_operation_id)` after proving the matching **committed authoritative** `PROVIDER_EVENT_COLLECTION_FAILED` audit (and its exact tenant/session/operation relationship). Episode time from its server-authored committed audit `occurred_at`. Verify the Payment currently remains FAILED and no unresolved operation supersedes the result. | Payment ID/`updated_at` alone is insufficient; `payment_provider_events` alone does not distinguish failure kind. Audit-reader/source capability, historical incomplete rows and operational correlation need a separate proof gate. |
| **OD-08E: ALT-11 identity / overlap** | Recommend `(organization_id, payment_id, payment_collection_operations.id)`; one unresolved operation per Payment is DB-enforced. ALT-11 takes precedence over ALT-10 while canonical operation is unresolved, **before the 120-second display delay**. ALT-10 becomes eligible only after definitive reconciliation and if Payment is FAILED. | Whether `REFERENCE_ATTACHED` counts and whether to fold an older failure that has no proven audit remains owner-gated. |
| **OD-08F: navigation and retention** | Fresh source-authorized exact-case detail; no automatic payment initiation, retry, reconciliation, refund, settlement or provider call. Active financial conditions retire immediately when canonical state is no longer eligible; no Seen receipt. | Current Management alert detail and staff projection cannot serve CA payment-operation details. New endpoints/DTOs/navigation are approval-gated and UI FREEZE-limited. |

The proposed scope is **one selected authorized Location**. It does not give CA bulk per-Payment reports or financial data for every company Location, LM a grant-free overview, Supervisor/Employee/Guest Management financial alerts, or access after commercial restriction. Do not infer payment-source authorization from `LOCATION_DASHBOARD_READ` alone.

## 7. Risks / boundary violations

- **Critical privacy:** reusing staff Payment read would deny CA; broadening it to CA would contradict Accepted DEC-057. Reusing CA financial aggregate as detail authority would leak protected records.
- **Significant false failure:** treating initiation `REJECTED`/`OUTCOME_UNKNOWN`/`REFERENCE_ATTACHED` as `FAILED`, or reporting an old FAILED episode after new attempt, confuses unresolved collection with provider-confirmed failure.
- **Significant episode ambiguity:** processed callback rows lack event kind; audit correlation and current status must be proven. If the historical chain is incomplete, **omit the case and report missing coverage**. Do not invent timestamp/episode from `updated_at`.
- **Significant source availability:** absence of authorized reader, audit read right or detail route is not an empty financial badge. Denials and failures must not reveal existence through count/detail/overflow.
- **Performance:** per-location Payment + operation + allowed audit scan requires `EXPLAIN (ANALYZE, BUFFERS)` and bounded source-first filtering. Existing indexes alone do not prove p95 or safe page limits.

## 8. Proposed implementation plan — blocked until OD-08 acceptance

1. Prime owns the accepted Management Alert source reader integration and any changes to shared correlation/contracts. Define a dedicated **internal, transaction-aware, read-only financial alert source boundary**; do not call an HTTP endpoint from the source reader. It must accept verified Staff session + selected Location and return only source-authorized, bounded candidates.
2. Revalidate Staff session, live CA/LM authority, active Organization/Location, exact LM grant, commercial entitlement, CA MFA, and a **new accepted per-Payment/per-operation financial detail capability** before candidate lookup, counting, pagination and exact-detail correlation. Use supported advisory/transaction fences to prevent stale grants after revocation; no ID may prove permission by itself.
3. For ALT-11, join canonical Payment and unresolved operation by `(organization_id,payment_id)`; require valid `dispatch_guarded_at` and server-now `>` boundary + own effective delay. Verify same canonical source at exact-item click and on every refresh. For ALT-10, require Payment FAILED, no unresolved operation, and an unambiguous committed failed-operation audit identity. Reject contradictory/legacy-ambiguous evidence.
4. Merge/fold **at most one case per Payment** after source permission and canonical eligibility, then apply bounded ordering/overflow. Retire on authoritative resolution or new attempt; retain only stable source identity for different episodes.
5. Under a **separate approved** source/detail contract, add exact financial action navigation through feature-only additive UI. Verify no payment/provider mutation is reachable from a preview/GET/seen action; the user must still use the existing authorized domain workflow for money actions.
6. A new schema or migration is **not currently authorized**. Existing operation identity and audit evidence may suffice after real SQL proof; if an immutable failure-generation marker or new audit permission is actually necessary, obtain a focused Owner decision first.

## 9. Test matrix — requirements, not executed validation

| Test family | Required evidence before enabling ALT-10/11 |
|---|---|
| Time | DB clock, exact equality excluded, `+1ms` included for 60/120/600s; own User A/B thresholds; no clock from Payment `updated_at`; `PREPARED` and null guard excluded. |
| Provider uncertainty | Guard persists before provider call, timeout/exception remains UNKNOWN, `REFERENCE_ATTACHED` remains unresolved, no retry from alerts GET, callback late success/failure transitions correctly. |
| Failure generations | First verified COLLECTION_FAILED → FAILED with stable operation/audit; subsequent new attempt → UNPAID/retire; later verified failure of new operation produces a **different** case; `REJECTED` never shown as failed. |
| Callback idempotency | Same provider event duplicate, conflicting reference/provider, wrong operation/tenant, refund-only and `NO_FINANCIAL_CHANGE` cannot create wrong failure episode; rollback yields no source/audit case. |
| Overlap | Unknown operation suppresses stale FAILED **before and after** its alert delay; after trusted FAILED reconciliation ALT-11 retires, ALT-10 may appear once; PAID retires both. |
| Authorization | CA with current exact selected Location and MFA; LM exact grant only; inactive Organization/Location, revoked session/membership/grant, other Location/tenant, employee/supervisor/guest, commercial entitlement disabled, subscription-only CA shell all denied before count/detail. |
| Privacy/deep link | No identifiers, amounts or provider details beyond approved projection; no safe-detail route until approved; source reauthorization after selected scope/role/entitlement switch. |
| Performance | Real disposable PG17 fixtures: dense multi-tenant payment/operation/audit, post-filter counts, old history, index review and bounded p95; no PG test on a shared database without exclusive lease. |

The existing `packages/contracts/src/management-alert-timing-preferences.test.ts:10-73` already verifies the **locked** ALT-11 `120s` default and inclusive `60–600s` validation. No new correlation test is meaningful until OD-08C/D/E decide which source states and failure identities are eligible; such a test would otherwise promote a proposal into an unsupported contract. No provider/DB tests were run for this decision packet.

## 10. Files expected to change **after** approval

Proposed new focused internal finance-source reader and test files under `apps/api/src/modules/dashboard/management-alert-sources/` and `apps/api/test/`, with Prime-owned contract/aggregation/detail integration as needed. Reuse current source authorization and typed preferences without modifying `apps/api/src/modules/payments/**`, provider callbacks, DB operation persistence or existing operational staff Payment endpoint. Any detail DTO/route, new index, audit-reader contract or navigation path requires its own approved implementation contract and owner of contentious files.

## 11. Explicitly out of scope

No global CA Payment permission, broad audit permission, provider SDK/callback changes, new payment mutation, new provider dispatch/retry, refund/reconciliation workflow, new Seen schema, critical 900-second escalation, ALT-14 cash reconciliation, flag activation, dashboard UI redesign, main merge, deploy or production changes.

## 12. Ready-to-implement verdict

**DECISION REQUIRED.** Existing canonical sources permit planning a narrow financial alert reader, but **not** enabling or exposing ALT-10/11 to CA/LM. Obtain explicit OD-08A–F Owner acceptance, prove failure/audit episode linkage and exact current financial read authority under real PostgreSQL, then implement and validate through Prime's separate integration/security gates.
