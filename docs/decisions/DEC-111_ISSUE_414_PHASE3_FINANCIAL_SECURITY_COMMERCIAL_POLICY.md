# DEC-111 — Issue #414 Phase 3: Financial, Shift, Staff and Commercial Alerts

Status: **Accepted — Owner-approved OD-08A–G policy; source mechanisms and acceptance tests pending**
Date: 2026-11-04
Issue: #414
Scope: Phase 3 ALT-10/11/13/15/16/17, reusing DEC-110 occurrence-only Seen.

## Authority and common rules

The Owner expressly accepted the narrow OD-08A–G recommendations on 2026-11-04. This supersedes earlier **proposed policy choices** in Master Plan §14 and OD-08 packets, but does not prove implementing source contracts, authorization readers, payment/clock identities, UI or database tests. Preserve existing Accepted payment, audit, Shift, staff, Location, commercial/MFA and revocation Decisions. No command permission or unrestricted financial/audit/GPS access expansion.

### OD-08A — Financial read boundary (LOCKED)

- **ALT-10/11** use a **separate focused read-only alert projection**, never a broadened existing operational Payment endpoint.
- Company Admin needs current protected session, required MFA, Organization, **active selected Location**, applicable commercial entitlement and source-specific alert authority. LM needs all of those applicable checks plus an **exact active Location grant** and **owning financial-source authority**. A CA aggregate-finance view is not a per-Payment detail grant, and a Location grant alone is not universal finance permission.
- Preview and reauthorized exact detail must expose only minimal safe data. Never leak payer/private provider data, tokens, credentials or private provider references; unauthorized count/ID/detail must be nondisclosing.
- No alert read or action triggers charge, retry, capture, refund, reconciliation, provider dispatch, payment mutation or other financial side effects.

### OD-08B — ALT-11 unresolved financial outcome (LOCKED)

- Both `OUTCOME_UNKNOWN` and `REFERENCE_ATTACHED` belong to **one unresolved ALT-11 IMPORTANT family** until authoritative reconciliation. Attaching a reference **does not** resolve uncertainty.
- Retain the original authoritative `dispatch_guarded_at` clock across those transitions; no timer restart. DEC-109 personal threshold default **120 seconds**, allowed **60–600**, strict **greater-than** crossing.
- Reconciliation/source-defined resolution retires the current uncertain condition, including late provider callback. No blind retry and no assertion the Payment definitively FAILED.
- The proposed **900-second CRITICAL escalation is rejected**, not pending or implicitly approved.

### OD-08C — ALT-10 definitive Payment FAILED / correlation (LOCKED)

- Eligible only for current **definitive FAILED** Payment supported by committed authoritative provider/reconciliation evidence; initiation `REJECTED` does not mean definitive FAILED.
- Prove current failure generation from canonical payment operation/provider/audit link; separate failed attempts remain distinct without inventing episodes from mutable `Payment.updated_at`.
- A new collection attempt retires older failure if canonical Payment returns to non-failed. A currently unresolved collection operation **suppresses overlapping ALT-10 even before ALT-11's delay has elapsed**. No duplicate Payment case.

### OD-08D — ALT-13 Forced Shift end (LOCKED)

- An authorized CA and a current exact-granted LM may see **committed force-end occurrence only if their actual source-specific Shift/Location authority permits**. Use a bounded safe event projection; **never** grant general SELECT on sensitive closure tables or reveal private force-end reason/unrelated Shift data.
- Normal Shift end is ineligible. Idempotent force-end retry is the same occurrence. Seven-day unseen attention and DEC-110 Seen apply. Do not change cash state or implement ALT-14.

### OD-08E — ALT-15 staff security occurrence (LOCKED)

- **Company Admin only**, current source/Organization authority and protected MFA; deny LM, Supervisor, Employee, Guest and revoked staff.
- Exactly committed `STAFF_ROLE_CHANGED` and `STAFF_LOCATION_ACCESS_REVOKED` source event families, with real sensitive role change or revocation. Routine profile edits are excluded. Use actual audit event identity and sanitized projection; no unrestricted audit visibility or raw private metadata.
- Seven-day attention and DEC-110 Seen apply, with fresh source grant/role/MFA reauthorization.

### OD-08F — ALT-16 active Location intake stopped (LOCKED)

- Current **ACTIVE** Location with `accepting_intake=false`, CA or exact-granted LM with source/Location authority. Newly created/default **INACTIVE** Location is not a stop.
- Retirement on intake resumption, Location deactivation or loss of authorization. Repeated stop/resume follows actual **current** source state, not old stop events. Never infer stopped-since time from an unproven field; no Seen for this ACTIVE condition.

### OD-08G — ALT-17 current effective commercial restriction (LOCKED)

- **Company Admin only**, protected current MFA and **effective Dashboard/commercial entitlement** denying ordinary Dashboard; `SUSPENDED` text alone does not prove a restriction. Retire on actual restoration.
- Render only a safe, minimal restriction case inside the **existing authorized subscription-only utility**; the ordinary restricted Dashboard bell must **not** become accessible and commercial authorization is not bypassed. Deny LM/Supervisor/Employee/Guest. No CRITICAL escalation or Seen.

## Evidence still required

Approved policy does not authorize guessing source event joins, timestamps, financial state transitions or an unsupported restricted shell. Prove payment operation generation and callbacks, current status, source authorization, exact Location, Shift event projection, committed audit allowlist and effective entitlement against current code, DB constraints and real PG. Phase 3 PASS additionally requires Phase 1/2 regression, PG/HTTP/browser/security/performance and independent code review, with ALT-14 excluded. No merge, production migration/deployment/cutover or feature activation is approved by this DEC.
