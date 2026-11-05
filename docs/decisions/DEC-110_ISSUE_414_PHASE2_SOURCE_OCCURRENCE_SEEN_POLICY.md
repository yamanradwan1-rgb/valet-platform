# DEC-110 — Issue #414 Phase 2: Source Access, Occurrence Identity and Seen

Status: **Accepted — Owner-approved OD-07A–D policy; source mechanisms and acceptance tests pending**
Date: 2026-11-04
Issue: #414
Scope: Phase 2 ALT-04/05/06/07/09 and committed-occurrence Seen receipts used by Phase 3.

## Decision authority and boundary

The Owner expressly approved OD-07A–D in the 2026-11-04 Phase 2/3 resume instruction, superseding the **proposed policy choices** in Master Plan §14 and the earlier OD-07/OD-08 draft packet. This is **binding policy**, not evidence of source timing, occurrence grouping, schema compatibility, implementation or delivery. Preserve Accepted DEC-109, DEC-078/088/094/095/108 and the separately approved Issue #352 takeover commands. DEC-107's standalone status remains **Proposed**.

### OD-07A — Narrow owning-source read authority (LOCKED)

- Management Alerts may be read by an authenticated, current, protected **Company Admin** for the owning Organization, active selected Location when applicable, effective entitlement and required MFA, or by a **Location Manager** with a current exact active Location grant **and the corresponding owning-source read authority**. An LM grant to a Location alone does not confer custody, takeover or tracking event access.
- No Supervisor, Employee or Guest access. Ordinary Dashboard access is not a source permission. Do not grant general audit, takeover-command, custody, GPS, route-history or verification permissions.
- Permit the smallest separately guarded read-only source projection where existing current authority is insufficient; existing command roles, writes and unrelated endpoints remain unchanged.
- Preview, count, detail and exact source navigation must reauthorize the persisted tenant, current User/Staff session, Organization, applicable Location, source authority, entitlement and MFA. Resolve authorization **before** candidate selection, correlation, pagination and counting.
- Return only safe category-specific titles, severity, time, scoped source identifiers and exact authorized navigation. **Never** return raw coordinates/tracks, private custody facts, takeover free-text reasons, proof/pickup codes, audit private metadata, guest tokens or secrets.

### OD-07B — Durable committed occurrence identities (LOCKED policy; DERIVED mechanism must be proven)

- **ALT-05**: use the actual committed Emergency Takeover `(organization_id, operation_id)` identity. Successful idempotent replay is the **same** occurrence, not a duplicate; source operation/audit/Task attribution must be proven.
- **ALT-07**: eligible only upon source-proven **terminalized handoff verification failure**; ordinary wrong-code attempts are not eligible. A committed Supervisor Override is an **independent** occurrence and never proof of successful release. Use a single terminal event identity only when actual persisted evidence proves it, and group retries only via real proof-episode relationships; do not infer joins from UUID sort or nearby timestamps.
- **ALT-09**: committed Geofence VIOLATION with proven tracking/Task/area/violation subtype and current recipient authority. Group repeats only with authoritative deterministic boundaries; `areaId` alone is insufficient. A historical violation is not a claim the vehicle is still outside. Account for delayed sample captured-at versus database-recorded-at provenance when establishing the seven-day occurrence window.
- Prime may choose the **smallest technically correct, evidenced source mechanism**. This approval does not authorize fabricated event sequences, historical backfill or a substantial new source-state model.

### OD-07C — Focused Seen Receipts (LOCKED)

- Explicit **per-item Seen** mutation, accepted only after **server confirmation**. Opening bell or panel does not mark anything Seen.
- Only eligible, **committed OCCURRENCE** categories; never current ACTIVE conditions. The source event must be within **seven days** of authoritative occurrence attention time.
- Receipt belongs to current authenticated **User + Organization + category + proven source occurrence**; enforce uniqueness in PostgreSQL. Different users are independent. Same-user concurrent tabs and replay after unknown successful commit converge idempotently; different occurrence identities stay distinct.
- In **one protected transaction**, authenticate/resolve current User and Organization, find and reauthorize persisted source + exact current grant/role/Location/entitlement/MFA, prove committed event/attention window, then guarded receipt insert or authorized idempotent read, followed only by any already-authorized required audit and commit. Neither denied/expired/revoked IDs nor existing receipt retries may leak protected source existence.
- Receipt never acknowledges, modifies, resolves or deletes source event/domain history; Seen affects only that user's unseen attention count. Retention policy for receipts must be documented separately from seven-day attention eligibility; **no unapproved destructive cleanup**.
- One minimal forward-only Seen migration is authorized **after** schema, FK/reference integrity, authorization transaction and concurrency proof. Do not fabricate a universal polymorphic foreign key.

### OD-07D — ALT-04/ALT-06 evidence-first chronology (LOCKED safety; mechanism TECHNICAL EVIDENCE PENDING)

- ALT-04 current Task ACCEPTED/IN_PROGRESS stage requires a **proven authoritative stage-entry clock**, stage resets, correct current attempt and Session READY retirement even when Task remains IN_PROGRESS; same-attempt ALT-01 overdue suppresses ALT-04.
- ALT-06 uses the original **current READY episode** anchor across READY → HANDOFF_PENDING without reset on handoff initiation; correct abort, reinitiation, release, terminal retirement and exact Session/Location authority.
- DEC-109 per-user ALT-04/06 delay default 300 seconds, inclusive 60–900 seconds; strict threshold crossing must be proven. Do not use mutable Task `updated_at` as a stage-entry clock or random UUID to resolve tied millisecond timestamps.
- Prove current source timestamp provenance under contested locks, same-ms writes, rollback and legacy ambiguity using actual PostgreSQL. **Fail closed** when original timing or episode identity cannot be proven.
- A minimal source-writer correction may be investigated, but any **substantial** domain marker/new state model or new product/security contract needs a further focused Owner approval. No new source chronology is Accepted by this decision.

## Acceptance and exclusions

Accepted policy alone does **not** mark Phase 2 PASS. Actual five category implementations, Seen persistence/API/UI, source-specific negative/race/retirement tests, real PG17, mounted HTTP, browser/UI Freeze, performance, and independent reviews are mandatory. Preserve the five merged Phase-1 categories and current feature flags OFF. ALT-14 remains EXTERNAL / DEFERRED / DISABLED. No merge, production migration, deployment, rollout or flag activation is authorized by this DEC.
