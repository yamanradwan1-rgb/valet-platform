# Phase 7 Dashboard Execution Plan

Status: Binding execution plan

Version: 1.2 (dashboard common-action latency target restored)

Date: 2026-08-21

Task: VAL-009

Issue: #179

## Purpose

This document locks the implementation sequence and invariants for **Phase 7 — Dashboard (backend)**.

It translates the Founder & Product Blueprint v1.0 contract

```text
Dashboard = Config + Analytics + Reports
```

into an executable backend-first sequence for **VAL-009A through VAL-009E**.

It is an execution bridge, not a replacement for the Founder & Product Blueprint v1.0 or focused Accepted decisions. It must not create new product semantics merely to make implementation easier. Where binding authority does not yet define enough detail, this plan registers a **REQUIRED DECISION GATE** instead of inventing behavior.

**VAL-009 itself is DOCUMENTATION ONLY.** It changes no code, schema, migration, contract, dependency, lockfile or UI.

## Authority and reviewed sources

Implementation follows the authority order in `AGENTS.md`.

This plan was reconciled against:

- GitHub Issue #179 and the VAL-009 execution contract supplied by the Project Owner;
- `AGENTS.md`;
- `docs/00_SOURCE_OF_TRUTH.md`;
- `docs/15_BLUEPRINT_V1_REBASELINE.md` (Founder & Product Blueprint v1.0 bridge);
- `docs/01_PRODUCT_SCOPE.md`;
- `docs/02_DOMAIN_MODEL.md`;
- `docs/03_DATABASE_SCHEMA.md`;
- `docs/04_VALET_SESSION_STATE_MACHINE.md`;
- `docs/05_ENGINEERING_RULES.md`;
- `docs/06_SECURITY_AND_DATA_RULES.md`;
- `docs/07_DEFINITION_OF_DONE.md`;
- `docs/08_DECISIONS_LOG.md`;
- `docs/11_REQUIREMENTS_TRACEABILITY.md`;
- `docs/12_AGENT_EXECUTION_PLAN.md`;
- `docs/13_COLLABORATION_WORKFLOW.md`;
- `docs/14_PROJECT_STATUS.md`;
- `docs/17_AGENT_CODE_STRUCTURE_RULES.md`;
- `docs/20_PHASE5_MAPS_TRACKING_EXECUTION_PLAN.md`;
- `docs/21_PHASE6_PAYMENTS_EXECUTION_PLAN.md`;
- Focused Accepted decisions: DEC-011 (tenant role contract), DEC-017 (Configuration First precedence), DEC-018 (Location timezone/currency authority), DEC-023 (Production Staff Authentication / MFA boundary), DEC-045 through DEC-049 (maps/tracking/live-map privacy/map-setup authority), DEC-047 (Phase 5 Map Setup Write Authority), DEC-050 through DEC-057 (typed financial configuration, validation/tips/cash/refund authority, currency minor units, collection operations, provider events, release guard and safe financial projections).

GitHub determines what is actually implemented. GitHub does **not** override an Accepted DEC defining required behavior. Contradictions are not silently reconciled; see *Repository contradiction check* below.

## Verified baseline

Verified against the actual working tree at branch creation, not inferred from documentation alone:

```text
branch          = docs/VAL-009-phase7-dashboard-execution-plan
base HEAD       = 58dc4c69515c725e11eb8acc3343e64d555b078d
                ("test: prove phase 6 provider-ready core gate")
working tree    = clean
migrations      = exactly 28 forward-only migrations; latest =
                  20260816002800_phase6_payment_collection_operation
phases complete = Foundation, Core Check-in, Operations, Retrieval,
                  Maps/task-scoped tracking, provider-neutral Phase 6 core
phase 6 status  = PHASE 6 CORE = PROVIDER_READY;
                  REAL DIGITAL PROVIDER = NOT YET ACTIVATED
dashboard app   = scaffold-only Next.js shell (no product features)
```

Migrations 1–28 are immutable. Phase 7 begins from a stable database baseline.

### Current repository capability inventory (actual code inspected)

Implemented API modules (`apps/api/src/modules/**`) with real TypeScript:

```text
anti-abuse, audit, auth, check-in-api, dispatch, guest-access, keys,
map-setup, parking, payments, retrieval, shifts, staff, tracking,
valet-sessions, vehicles
```

Placeholder modules (README only, no implementation yet):

```text
customers, handoff, incidents, locations, notifications, organizations,
reporting, vehicle-photos
```

Existing management-relevant backend capability:

- **Live Operations reads** (`tracking` module): Task/Vehicle-centric live map and historical route reads implementing DEC-049 — `LOCATION_MANAGER` with explicit persisted Location access, or `VALET_SUPERVISOR` with explicit access plus an ACTIVE Shift at that exact Location; password-only `ORG_ADMIN` denied; 60-second LIVE/STALE freshness contract; Guest receives no exact coordinates.
- **Map setup writes** (`map-setup` module): narrow `SECURITY DEFINER` functions per DEC-047; write/read authority is an ACTIVE `LOCATION_MANAGER` with explicit access to the exact Location; `ORG_ADMIN` denied pre-MFA; mutations append safe same-transaction AuditEvents.
- **Financial projections** (`payments` module): staff session-Payment projection route per DEC-057 — `LOCATION_MANAGER` without a Shift; Employee/Supervisor only with their own active exact-Location Shift; `ORG_ADMIN` denied; Guest projection is bearer-owned and exact-session.
- **Shift reconciliation**: immutable close-time `cash_expected` / `cash_reported` / `cash_variance` snapshots per DEC-052.
- **Check-in KPI instrumentation**: successful Complete Check-In carries elapsed intake time derived from persisted `created_at -> checking_in_completed_at`.
- **No analytics/KPI/reporting implementation exists.** The `reporting` module is a placeholder. There is no dashboard aggregation, export, or scheduling code anywhere in the repository.
- **No Dashboard UI exists.** `apps/dashboard` contains only scaffold files/placeholders.
- Stream A's Employee UI task-queue read projection lives on a separate remote branch stack and is **not present at this base**; see *Parallel-stream / shared-hot-zone coordination*.

## Founder Blueprint Phase 7 contract

From the Founder & Product Blueprint v1.0 (via `docs/15_BLUEPRINT_V1_REBASELINE.md`, `docs/01_PRODUCT_SCOPE.md`, `docs/12_AGENT_EXECUTION_PLAN.md`):

- Approved development order: Foundation -> Core Check-in -> Operations -> Retrieval -> Maps -> Payments -> **Dashboard** -> Reliability -> Pilot Hardening.
- Dashboard product surface includes: Overview, Live Operations, Vehicles, Tasks, Employees & Shifts, Locations, Maps & Zones, Keys, Payments, Validations, Incidents & Claims, Customers/Guests limited, Analytics, Reports, Policies, Roles & Permissions, Integrations, Branding/White Label, Billing/Subscription, Audit Log.
- Founder-defined Location Settings include: operating hours, currency & timezone, language defaults, valet fee, payment methods, tips, photo policy, plate scan settings, key system, parking spot requirement, tracking on/off, route history retention, geofence alerts, release policy, notification templates, SLA target, validation rules, allowed roles.
- Configuration inheritance direction: `Company default -> Location override`. This is **not** authorization for one untyped generic settings blob (DEC-017).
- Role expectations: LOCATION MANAGER manages authorized Locations (shifts, revenue, KPIs, keys, incidents, reports) and does **not** automatically see other company Locations; COMPANY ADMIN manages company Locations, employees, prices, policies, white label and billing configuration, and privileged production access requires MFA.
- Role changes, data exports and similar sensitive admin actions must be audited.
- Founder acceptance criteria relevant to Phase 7: configuration changes apply without deployment; Tenant A cannot read Tenant B data.
- Reports direction: daily email/portal summary, weekly operations, monthly executive summary, PDF/CSV download, Location timezone respected. Automated-report requirements must not be silently discarded; where scheduling infrastructure belongs partly to Reliability, the composition/dependency is documented explicitly (see gate G6).

## Phase 7 objective

Deliver the sellable-MVP **Dashboard backend** so that, after VAL-009E:

- authorized managers can read safe operational overview data scoped to their explicitly authorized Locations;
- the already-typed Company-default / Location-override configuration can be distinguished (default, override, effective) and safely mutated within accepted authority;
- core operational KPIs compute from authoritative persisted facts with Location-timezone correctness, and unsupported metrics are absent rather than fabricated;
- daily/weekly/monthly report definitions plus CSV/PDF download foundations exist with audited, authorized export behavior;
- strict tenant/location isolation, least privilege, non-disclosing failures and append-only audit semantics hold end to end;
- no Dashboard UI is implemented.

Phase 7 adds **no domain behavior change**: no ValetSession transition, no Task/Dispatch transition, no key custody, map/tracking, incident, payment, refund or handoff semantic changes. Dashboard reads/configuration are management capabilities **over** existing authoritative domain behavior. The Dashboard must not become a second state machine, and analytics/read models must derive from authoritative facts rather than mutate operational truth.

## Backend-first / UI-later boundary

Per binding Project Owner instruction:

```text
VAL-009   Phase 7 Dashboard Execution Contract        (documentation only)
VAL-009A  Dashboard Authorization & Operational Scope Foundation
VAL-009B  Typed Configuration Management Foundation
VAL-009C  Operational Overview Projections
VAL-009D  Core Operational Analytics / KPI Foundation
VAL-009E  Reports / Export Foundation
```

Dashboard **UI/frontend work is explicitly deferred until AFTER VAL-009E is complete and reviewed**, and then begins only as a separate frontend stream/task sequence. No VAL-009A–E slice may add Dashboard UI implementation, frontend routes, or UI-oriented cosmetic contracts.

Reliability remains the following phase after Phase 7 backend, and Pilot Hardening follows Reliability.

## Role / authorization matrix

Server-derived authority only. Caller-supplied `organizationId`, `locationId`, membership IDs or role claims are never authorization evidence. Every protected read/mutation re-derives current User status, ACTIVE membership, ACTIVE Organization/Location and explicit `membership_location_access` from persistence, following the existing repository patterns (for example `tracking/live-map-authorization.ts`, `payments/payment-projection-authorization.ts`).

| Capability class | LOCATION_MANAGER | VALET_SUPERVISOR | VALET_EMPLOYEE | ORG_ADMIN (password-only) | Guest |
|---|---|---|---|---|---|
| Operational overview reads for an explicitly authorized Location | Yes | Only where separately accepted (e.g. DEC-049 live/history reads with ACTIVE Shift) | No | **Fail-closed until MFA gate** | No |
| Cross-location / company-wide aggregation | No (only explicitly granted Locations) | No | No | **Fail-closed until MFA gate** | No |
| Set/clear typed Location override | Per VAL-009B focused authority decision (DEC-047 precedent: LM with explicit access) | No | No | **Fail-closed until MFA gate** | No |
| Update Company default policy | No | No | No | **Fail-closed until MFA gate (G1/G2)** | No |
| KPI/analytics reads for authorized Location(s) | Yes (granted Locations only) | Not by default; only if a focused decision grants it | No | **Fail-closed until MFA gate** | No |
| Report/export execution | Yes for authorized Locations, audited | No unless a focused decision grants it | No | **Fail-closed until MFA gate** | No |
| Existing live-map / route-history / financial-projection reads | Unchanged per DEC-049/DEC-057 | Unchanged per DEC-049/DEC-057 | Unchanged per DEC-057 (own active Shift) | Denied (unchanged) | Bearer-owned own-session only |

Rules:

- A manager never receives another Location's data merely because it belongs to the same Organization; explicit Location scoping is enforced on every read.
- Cross-tenant and wrong-Location failures remain non-disclosing.
- Venue Client restricted visibility remains a deferred dedicated schema/access decision and is not invented in Phase 7.
- VAYLET Super Admin remains platform-level and out of scope.
- No generic permission-set engine is introduced.

## MFA boundary and decision gates

Current staff auth (DEC-023) is password-only and does **not** assert MFA. Production Company Admin (`ORG_ADMIN`) privileged APIs and all VAYLET Super Admin APIs remain unavailable until a separate accepted MFA decision provides a server-validated assurance value bound to the session. This plan does **not** weaken DEC-023.

Consequence for Phase 7, recorded explicitly:

- Company Admin capabilities that require privileged production access — company-wide overview/aggregation across Locations, Company-default policy mutation, Roles & Permissions administration, branding/billing administration — remain **gated and unavailable** until the MFA contract/implementation is accepted.
- DEC-047 is used as precedent, not as a general license: Phase 5 allowed explicitly authorized `LOCATION_MANAGER`-only map setup while `ORG_ADMIN` stayed fail-closed. Each Phase 7 surface must either (a) fit inside already-accepted per-Location manager authority, or (b) stop at its own REQUIRED DECISION GATE. DEC-047 is not automatically generalized to every future Dashboard operation.

### Required decision gates (register)

| ID | Gate | Owning slice | Notes |
|---|---|---|---|
| G1 | Privileged Company Admin (`ORG_ADMIN`) Dashboard access before MFA exists | Deferred to the future MFA decision/task | All such surfaces stay fail-closed. Never authorize merely because the role enum exists. |
| G2 | Management mutation authority for configuration: confirm `LOCATION_MANAGER` set/clear of Location overrides (DEC-047-style, per explicitly authorized Location) and that **no** principal may update Company defaults pre-MFA | VAL-009B — **CLOSED by DEC-058** (`docs/decisions/DEC-058_PHASE7_TYPED_LOCATION_CONFIGURATION_AUTHORITY.md`) | Accepted: LM-only set/clear with explicit access, no Company-default mutation pre-MFA, narrow SECURITY DEFINER boundary, optimistic concurrency, atomic single AuditEvent. |
| G3 | Typed persistence design for each Category-B Founder setting (operating hours, language defaults, plate scan settings, key system policy, parking spot requirement, geofence alert enablement, notification templates, SLA target, allowed-roles policy) | Future focused tasks; triggered when a setting's Dashboard management becomes required | One typed decision per policy area; no generic JSON blob; forward-only migrations; single active migration owner; tenant/location constraints; audit. |
| G4 | SLA target persistence/semantics | With G3-SLA before any SLA KPI appears | Until then, SLA compliance metrics are absent, never zero-filled. |
| G5 | Exact KPI formulas, attribution and time-boundary semantics for each supported metric | VAL-009D | Formula catalog must be accepted in the slice decision/contract before aggregation ships. |
| G6 | Automated report delivery composition: scheduling/background-job ownership (partly Reliability), email/messaging channel activation | VAL-009E documents composition; implementation deferred | Report definitions and manual CSV/PDF download are Phase 7; automated delivery needs the scheduling decision plus messaging-provider activation. |
| G7 | Export/PDF generation dependency and data-export authority matrix (who may export what, retention of generated artifacts, artifact access control) | VAL-009E | New dependency = lockfile/hot-zone coordination + package-security review; export actions audited. |
| G8 | Founder sellable-MVP placement of basic white-label branding and basic subscription/billing admin controls (exact slice/persistence) | Focused Accepted decision required before Phase 7 backend is declared fully complete or the Dashboard UI stream begins | Basic white label is part of the Founder product direction and basic subscription/admin controls are part of the sellable MVP; advanced white label remains V2. Must not be silently deferred without gate/resolution. |

Unresolved items must not become accepted behavior through prose in implementation PRs. Prefer documenting the gate and assigning it to the correct slice.

## Configuration First contract

Binding precedence (DEC-017):

```text
Company default -> optional Location override -> effective value
```

Phase 7 requirements:

- The Dashboard backend must distinguish, where relevant: the **Company default** value, whether a **Location override** exists, and the **effective** value for a Location. Effective resolution is always `COALESCE(location.*_override, organization.*)`.
- Configuration changes apply without deployment (persisted policy evaluated at command time, as already implemented by every existing guard).
- Typed contracts only. No untyped catch-all JSON settings object. Category-B settings get typed persistence only through their own focused decisions (G3).
- Safe configuration mutation concepts (defined now, implemented only in VAL-009B after G2):
  - **Update Company default** — gated behind MFA (G1/G2).
  - **Set Location override** — intended for an ACTIVE `LOCATION_MANAGER` with explicit persisted access to the exact Location, subject to G2.
  - **Clear Location override** (return to inheriting the Company default) — same authority as set, subject to G2; clearing is an explicit mutation with audit, not a null patch side effect.
- Exact route names are **not** locked by this document. Implementation follows the existing controller conventions (`/v1/staff/...`, feature-owned controllers) and locks exact routes in the VAL-009B contract.
- Configuration mutation responses should return the post-mutation default/override/effective triple so clients cannot guess resolution.

## Existing typed configuration inventory (verified against `schema.prisma`)

Category **A — already typed/persisted and available to expose/manage safely** (exact persisted names verified; each Organization column pairs with a nullable `locations.*_override` column resolved as Company default -> Location override):

| Founder setting | Organization default column | Location override column |
|---|---|---|
| Photo policy (check-in photos required) | `organizations.check_in_photos_required` (default false) | `locations.check_in_photos_required_override` |
| Release policy — secure handoff method | `organizations.handoff_standard_method_policy` (`PICKUP_CODE \| DYNAMIC_QR \| EITHER`, default EITHER) | `locations.handoff_standard_method_policy_override` |
| Tracking on/off | `organizations.tracking_enabled` (default false) | `locations.tracking_enabled_override` |
| Route history retention | `organizations.raw_gps_retention_days` (default 30, positive check) | `locations.raw_gps_retention_days_override` |
| Valet fee | `organizations.valet_service_fee` (`numeric(14,3)`, >= 0, default 0) | `locations.valet_service_fee_override` |
| Payment methods | `organizations.payment_methods_policy` (`CASH_ONLY \| DIGITAL_ONLY \| CASH_OR_DIGITAL`, default CASH_ONLY) | `locations.payment_methods_policy_override` |
| Service payer (Customer/Venue pays) | `organizations.payment_service_payer` (`CUSTOMER \| VENUE`, default CUSTOMER) | `locations.payment_service_payer_override` |
| Tips | `organizations.tips_enabled` (default false) | `locations.tips_enabled_override` |
| Validation rules (enablement) | `organizations.validation_enabled` (default false) | `locations.validation_enabled_override` |
| Release policy — payment-required release | `organizations.release_requires_payment` (default false) | `locations.release_requires_payment_override` |
| Currency & timezone | `organizations.timezone` (Company/default timezone only) | `locations.timezone` and `locations.currency` are **authoritative Location values** (not overrides; DEC-018) |

Notes:

- Effective financial-policy evaluation already exists (`financial-policy-resolver.ts`) and Payment initialization snapshots effective policy and Location currency; later policy changes never rewrite canonical Payments (DEC-050). Configuration management therefore changes **future** behavior, never historical financial meaning.
- `DIGITAL_ONLY` remains fail-closed for positive due amounts until a real provider is activated (VAL-008I gate). Configuration management must not pretend digital is operative.

Category **B — Founder-required but not yet represented by accepted typed persistence** (storage/semantics require focused decisions per G3; do **not** manufacture storage now):

operating hours; language defaults; plate scan settings (OCR assistive configuration); key system policy (QR key system is currently fixed MVP behavior, not a configurable policy); parking spot requirement; geofence alert enablement policy (geofence evaluation/alerting exists operationally, typed on/off policy does not); notification templates (Notification rows record sends with `template_key`; template content/management is not persisted); SLA target (G4); allowed-roles policy (membership/location access is operational; a Location-level "allowed roles" policy is not persisted).

Category **C — Founder sellable-MVP obligations pending accepted placement (REQUIRED DECISION GATE G8)**: basic white-label branding (part of the Founder product direction) and basic subscription/billing admin controls (part of the sellable MVP). Their exact implementation placement — including whether any part belongs inside VAL-009A–E — is not yet accepted; they are therefore registered under gate G8 rather than implemented opportunistically or silently deferred. Phase 7 backend must not be declared fully complete, and the Dashboard UI stream must not begin, while these obligations remain unresolved without gate/resolution.

Category **D — deferred / V2 / Enterprise or separately phased** (not in VAL-009A–E): Advanced white label (V2; basic white label is not deferred — see Category C/G8), Integrations (POS/PMS V2 unless pilot-required), Roles & Permissions engine (generic permission-set engine excluded by AGENTS.md), Audit Log UI surface (audit reads for managers would need their own slice assignment; not silently added here).

## Missing Founder settings / decision register summary

Every Category-B/C/D item above is registered, with owning gate where applicable, in the decision-gate register (G3–G8). None may be implemented opportunistically inside VAL-009A–E. If a Phase 7 slice discovers a new material gap, it stops for a focused decision instead of expanding scope.

## Operational Dashboard overview boundary (VAL-009C scope)

Evaluated from actual existing persistence/code only. Candidate overview domains and their authoritative sources:

| Domain | Authoritative source (exists today) | Boundary notes |
|---|---|---|
| Active sessions / vehicles on site | `valet_sessions` where `state <> 'COMPLETED'`, indexed `(location_id, state)` | Count/list per Location; vehicle identity exposure follows staff-safe projections (plate data is staff-visible; guest-forbidden data never crosses) |
| Session-state counts | `valet_sessions.state` grouped counts | Canonical states only; no new states |
| Retrieval queue | `retrieval_requests` (`OPEN`/`ACCEPTED`) + `Task(type=RETRIEVAL)` lifecycle | Queue depth/age; assignment state comes from Task, not session |
| Tasks | `Task` rows + `DispatchEvent` history | Status/type counts; current owner is `Task.current_assignee_membership_id` only |
| Active shifts | `shifts` partial-unique ACTIVE rows per `(location_id, status)` | Membership attribution preserved |
| Keys status/accountability | `key_slots.status` + occupied slots via current `valet_sessions.key_slot_id` + `key_custody_events` history | Slot identity is operational data; never exposed to Guest |
| Incidents | `incidents(location_id, status)` | Counts/open items; lifecycle unchanged |
| Live operations | Existing DEC-049 live-map/route-history read APIs (60s LIVE/STALE) | Reused as-is; not duplicated |
| Safe financial summaries | `Payment` status/amount/currency snapshots; `CashEntry` aggregates; Shift close `cash_expected/reported/variance`; Refund totals; current Validation rows | Exposed only under the DEC-057-style role matrix; no provider internals, correlation/idempotency/audit internals |

Constraints:

- Do **not** duplicate Stream A's Employee UI-specific task-queue/read models merely because they exist on the remote stack; Dashboard overview models are management projections with their own contracts.
- Unsupported domains (e.g., guest ratings — no rating persistence exists) produce **no metric at all**, never fake zeros.
- Any new read model gets its own typed contract and authorization test; no generic "dashboard data" dump endpoint.

## Analytics / KPI contract (VAL-009D scope)

For every planned KPI, VAL-009D must identify: authoritative source facts, time boundary/timezone semantics, and the missing persistence/formula if unresolved. Fabricated metrics and zero-fills for unsupported metrics are forbidden.

Source-supported KPI candidates (facts already persisted; exact formulas locked in VAL-009D per G5):

| KPI | Source facts | Time boundary basis (Location timezone) |
|---|---|---|
| Check-in duration | `valet_sessions.created_at -> checking_in_completed_at` (already instrumented) | per-session; aggregated over report day |
| Parking duration | `parking_started_at -> parked_at` | per-session |
| Retrieval wait (official) | `retrieval_requested_at -> ready_at` | per-session |
| Retrieval start latency (auxiliary only) | `retrieval_requested_at -> retrieval_started_at` | per-session; auxiliary metric only — must never be labeled Retrieval Wait |
| Handoff time (official) | `ready_at -> completed_at` | per-session |
| Sessions by state (incl. active count) | `valet_sessions(location_id, state)` index | point-in-time snapshot |
| Retrieval queue depth/age | RetrievalRequest OPEN/ACCEPTED + RETRIEVAL Task lifecycle | point-in-time + requested-time age |
| Cars handled per day | session counts completed in period (`completed_at`) | Location-timezone day |
| Cash expected vs reported vs variance | Shift immutable close snapshots (DEC-052) | shift close time |
| Collected amount / tips / refunds / validation totals | Payment/CashEntry/Refund/current-Validation facts (currency = immutable Payment snapshot) | transaction time |
| Digital vs cash mix | Payment `collection_method`/status facts | transaction time (digital remains non-operative until provider activation) |
| Incident counts by type/severity | `incidents(location_id, status/severity/type)` | opened time |
| Key exceptions | key custody events + incidents of type KEY | occurred time |

Explicitly **unresolved/absent** (must not appear until their gates close): SLA compliance (G4); cars-per-employee attribution formula (G5 — derivation across memberships/shifts is not yet accepted); guest rating (no persistence — absent); employee adoption/friction and manager-reliance measures (not persisted — absent); predictive/demand metrics (excluded per AGENTS.md).

Aggregation rules:

- Aggregates derive only from committed authoritative rows; no read-model mutation of operational truth; no second state machine.
- Money aggregates keep the Payment currency snapshot and `numeric(14,3)` precision; any monetary input crossing a boundary obeys DEC-053 minor-unit representability.
- Metrics are computed per Location; any multi-Location rollup is gated by G1 (company-wide views pre-MFA).

## Reports / export contract (VAL-009E scope)

Scope for Phase 7 backend:

- **Daily operational report** (portal/download): sessions, durations, queue, tasks, keys, incidents, cash/variance for one Location-day in the Location timezone.
- **Weekly operations report**: rolling/aggregated weekly view over the accepted daily facts.
- **Monthly executive summary**: month-to-date aggregates of accepted KPIs; unsupported metrics omitted, never zero-filled.
- **CSV export**: deterministic, UTF-8, locale-neutral values (ISO timestamps, ISO currency, raw numbers); column order stable and documented.
- **PDF export**: allowed as a Phase 7 goal but blocked on G7 (dependency selection = lockfile/hot-zone coordination + security review). If G7 defers PDF, CSV ships first and PDF is recorded as pending — not silently dropped.
- **Location timezone correctness**: every period boundary (day/week/month) computed in the Location's authoritative timezone (see next section).
- **Authorization/data-export audit**: exports are sensitive actions; each executed export appends an AuditEvent (actor, Organization/Location scope, report kind, period, row bounds) atomically with the export transaction boundary defined in VAL-009E. Export authority follows the Phase 7 role matrix; bulk PII minimization applies (exports contain operational/business fields needed for the report, not secrets, not raw GPS beyond DEC-049 authority, not verification/payment credential material).
- **Automated delivery composition/dependency**: daily email/portal push requires (a) a background-scheduling ownership decision (shared with Reliability phase planning) and (b) messaging/email channel activation. VAL-009E documents this composition and hands off cleanly; it does not implement a scheduler framework (G6). The Founder requirement is thereby preserved explicitly, not discarded.

## Timezone / international reporting rules

- Timestamps persist as PostgreSQL `timestamptz(3)` UTC; database/server time is authoritative (binding conventions, `03_DATABASE_SCHEMA.md`).
- **Location.timezone is authoritative** for all display/reporting day boundaries (DEC-018): day/week/month bucketing uses the Location timezone (SQL `AT TIME ZONE` against the persisted column), never a single global or Organization-wide timezone.
- An Organization spanning multiple countries/Locations produces per-Location reports in each Location's own timezone/currency; cross-Location rollups remain MFA-gated.
- Currency: operational summaries use the immutable Payment currency snapshot; Location currency governs Location-context presentation. Monetary inputs obey DEC-053; no silent rounding anywhere.
- Backend contracts stay locale-neutral (ISO codes/timestamps); Arabic/English and RTL/LTR rendering is a Dashboard UI-phase concern built on these neutral contracts.

## Audit / privacy / security rules

Preserved unchanged through Phase 7:

- Strict tenant isolation; exact Location scoping; server-derived authority; least privilege; current membership/access state honored on every request.
- Non-disclosing cross-tenant/wrong-Location failures everywhere.
- Sensitive management actions — configuration mutations, exports, any future role-change capability — append AuditEvents (safe metadata only) atomically with their transactions where the owning contract requires it.
- No plaintext OTP/pickup codes, passwords, guest/customer access tokens, payment card data, provider secrets, or raw GPS beyond DEC-049-authorized surfaces in logs, exports, metrics, error bodies or AuditEvent metadata.
- Vehicle photos stay private; no public URLs in any projection/export.
- Guest-forbidden exact vehicle/key-slot/coordinate data never enters Dashboard-facing contracts consumed by non-staff actors.
- Runtime database-role privileges remain least-privilege; Phase 7 read models use SELECT-only access consistent with existing grants; no privilege widening without a focused accepted decision (map-setup SECURITY DEFINER pattern remains the precedent for any unavoidable elevated write, which Phase 7 configuration tables should not need).
- Anti-abuse/rate limiting considerations apply to any externally usable endpoint; Dashboard endpoints are staff-authenticated and inherit existing staff auth/anti-abuse boundaries.

## Performance / query design expectations

Per the Founder & Product Blueprint v1.0 preliminary NFR target, common
Dashboard actions usually target completion in under 2 seconds. This is a
distinct product-level target: it is not the employee check-in KPI of roughly
15–20 seconds, and it is unrelated to the DEC-049 live-data freshness/staleness
intervals. Long-running report/export generation is not a "common Dashboard
action" and remains governed by VAL-009E and gates G6/G7 bounded execution
behavior rather than this target. Binding query-design expectations:

- Use existing required indexes (`valet_sessions(location_id, state)`, `valet_sessions(location_id, retrieval_requested_at)`, `shifts(location_id, status)`, `incidents(location_id, status)`, etc.); new aggregate queries must be EXPLAIN-checked against indexes during the owning slice.
- List-style reads follow the established keyset-cursor pattern (`tracking/live-map-cursor.ts`, `route-history-cursor.ts`); bounded page sizes; no unbounded scans; no N+1 fan-outs.
- Aggregations are scoped by Organization + Location and time-bounded; cross-tenant scans are structurally impossible (tenant predicate in every query).
- No new caching infrastructure (Redis remains unavailable until a demonstrated need per `05_ENGINEERING_RULES.md`). Long-running report generation must define bounded execution/job behavior as part of G6/G7 rather than blocking HTTP indefinitely.

## Parallel-stream / shared-hot-zone coordination

Stream A (Employee UI / Antigravity) develops in parallel on a separate remote stack; Stream B owns Phase 7 Dashboard backend. Both streams remain BRANCH-ONLY branch stacks; task count never triggers a PR or merge; any integration/merge to main requires an explicit Project Owner-approved SYNC POINT.

Shared hot zones include at minimum:

```text
packages/contracts/**
apps/api/src/app.module.ts
pnpm-lock.yaml
```

Binding rule for every later Phase 7 implementation task:

1. Before touching a shared-hot-zone file, inspect Stream A's **CURRENT REMOTE stack** (fetch and review the live branch state).
2. Do not duplicate a contract/module already introduced there.
3. Do not rename/restructure the same contract/module independently.
4. No broad shared-hot-zone refactor.
5. New dependencies (e.g., PDF generation, G7) require lockfile coordination and package-security review.

This rule is recorded deliberately **without** hardcoding any Stream A commit SHA into this long-lived plan; SHAs rot — inspect the current remote stack instead.

## VAL-009A detailed slice — Dashboard Authorization & Operational Scope Foundation

Purpose: establish the reusable, server-derived authorization/scoping boundary for all management reads that follow.

Contents:

- Internal authorization helpers/tests proving the Phase 7 role matrix: ACTIVE user + ACTIVE same-Organization membership + ACTIVE Organization/Location + explicit `membership_location_access`; `LOCATION_MANAGER` as the production per-Location management authority; supervisor variants only where separately accepted (DEC-049 pattern); `ORG_ADMIN` fail-closed pre-MFA; employees/Guests denied.
- Authorized Location-enumeration primitive for a manager (which explicitly granted, ACTIVE Locations may this actor manage?) — the foundation for per-Location dashboards; company-wide enumeration remains gated.
- Non-disclosing failure classification shared by later slices.
- Reuse of existing patterns (`live-map-authorization.ts`, `payment-projection-authorization.ts`); no duplication of eligibility logic where a compatible primitive exists.

Must not: add HTTP routes (or only the minimum the slice contract locks), mutate configuration, add analytics, touch Stream A read models, weaken any existing boundary.

Required proof: role-matrix tests (grant/deny per role × location-access × org/loc status), cross-tenant/cross-location isolation, non-disclosing failure equivalence, ORG_ADMIN fail-closed assertion, architecture/lint/typecheck/test/build green, 300-line policy green.

## VAL-009B detailed slice — Typed Configuration Management Foundation

Purpose: expose and safely mutate the Category-A typed configuration under the Company default -> Location override contract.

Contents (after G2 closes):

- Typed read contracts returning default / override-present / effective triples for the ten typed policy pairs (plus authoritative Location timezone/currency reads).
- Mutation commands: set Location override; clear Location override (explicit inherit-again action). Update Company default remains **unimplemented** pending G1/G2.
- Typed Zod contracts in `packages/contracts` (hot zone: inspect Stream A first).
- Optimistic concurrency for contested configuration mutation following the repository's established token pattern (e.g., `updated_at`-based, as used by Vehicle identity corrections) — exact mechanism locked in the slice contract.
- Atomic AuditEvent per configuration mutation (safe metadata: field, scope, previous/new effective values; no secrets).
- Fail-closed validation mirroring existing DB checks (non-negative fee, positive retention, controlled enums, DEC-053 representability for fee inputs).
- Exact route names locked here following existing `/v1/staff/...` conventions.

Must not: introduce generic settings JSON; implement Category-B storage; allow Company-default updates; rewrite historical Payments/policy snapshots.

Required proof: effective-resolution tests (null override inherits; explicit false beats true, matching the documented photo-policy semantics), set/clear round-trips, unauthorized role/location denial, concurrent-mutation conflict, audit atomicity, no-deployment-needed behavior demonstration (policy change affects subsequent guards without restart).

## VAL-009C detailed slice — Operational Overview Projections

Purpose: management read models over the overview-domain table above.

Contents:

- Scoped, paginated projections per domain (sessions/state counts, retrieval queue, tasks, active shifts, keys accountability, incidents, live-operations reuse, safe financial summaries under the DEC-057-style matrix).
- One typed contract per domain; no omnibus dump endpoint.
- Explicit reuse of the existing DEC-049 live-map/route-history APIs rather than new duplicates.
- Coordination duty: verify Stream A's current remote contracts before adding anything resembling a task-queue read in `packages/contracts`.

Must not: mutate operational truth; expose provider/correlation/audit internals; fabricate unsupported domains (ratings et al.).

Required proof: tenant/location isolation per domain, role matrix enforcement, pagination bounds, absence (not zero) for unsupported domains, financial-summary authorization parity with DEC-057.

## VAL-009D detailed slice — Core Operational Analytics / KPI Foundation

Purpose: accepted-formula KPI computation from authoritative facts.

Contents (after G5 formula catalog is locked):

- KPI formula catalog as the slice's accepted contract (sources, attribution, time boundary, Location-timezone bucketing) covering the source-supported table above.
- Aggregation read models/endpoints per Location with bounded ranges; per-KPI authorization from the VAL-009A boundary.
- Absent-metric contract shape so unsupported KPIs are structurally absent, never zero.
- Index-aligned aggregate queries with EXPLAIN evidence.

Must not: create persistent denormalized analytics stores, data-warehouse structures, or predictive metrics; gate-hop into company-wide rollups.

Required proof: formula unit/integration tests against seeded periods including timezone edge cases (day boundaries, DST-affected zones where applicable), tenant/location isolation, money-precision preservation, absent-vs-zero distinction.

## VAL-009E detailed slice — Reports / Export Foundation

Purpose: report definitions + CSV/PDF download foundations with audited export behavior.

Contents:

- Daily/weekly/monthly report definitions composed from accepted VAL-009C/D facts, period boundaries in Location timezone.
- CSV generation backend; PDF pending/explicitly sequenced behind G7 if the dependency decision defers it.
- Export authorization + atomic AuditEvent (actor, scope, kind, period, bounds).
- Documented composition/dependency for automated delivery (G6) and handoff language for Reliability — the Founder automated-report requirement stays visible, not silently dropped.

Must not: implement schedulers/email sending; leak raw GPS/secrets into artifacts; bypass export audit.

Required proof: period-boundary correctness (timezone edges), authorization + audit atomicity, artifact content minimization, CSV determinism, retry/idempotent regeneration semantics as locked in the slice contract.

## Per-slice dependency chain and required proof (summary)

```text
VAL-009A -> VAL-009B -> VAL-009C -> VAL-009D -> VAL-009E
   (each stacks only after independent review/approval on the branch stack;
    CI must pass; task count never triggers a PR or merge)
```

Every slice additionally proves: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm architecture:check`; 300-line structure policy; tenant/location negative tests; non-disclosing failures; audit atomicity where mutations/exports occur; no migration/schema/lockfile change unless its gate authorizes it (then: focused decision, forward-only migration, single migration owner, fixture/doc updates per AGENTS.md §11).

## Explicitly deferred scope (not in VAL-009A–E)

- All Dashboard UI/frontend implementation (until after VAL-009E review).
- Company Admin (ORG_ADMIN) privileged surfaces pre-MFA (G1) and any MFA implementation.
- Venue Client and VAYLET Super Admin persistence/access.
- Generic permission-set engine; generic untyped settings storage.
- Category-B Founder-setting persistence (G3) and SLA semantics (G4).
- Basic white-label branding and basic subscription/billing admin controls pending gate G8 (Founder sellable-MVP obligations; placement decision required — must not be silently deferred past Phase 7 completion or Dashboard UI start).
- Automated report scheduling/email delivery (G6; Reliability composition).
- Real digital-payment provider activation (VAL-008I/J/K remain mandatory before Phase 6 can be called MVP-complete; unrelated to Phase 7 sequencing).
- POS/PMS/SSO integrations; advanced BI/data warehouse; predictive analytics; SmartStack AI; Predictive Retrieval; Demand Autopilot; ClaimShield; NFC/BLE keys; smart-key vault hardware; microservices/Kubernetes/event streaming; multi-region infrastructure.
- Reliability/offline synchronization implementation; Pilot Hardening.
- Updates to `docs/14_PROJECT_STATUS.md` merely because planning started (owner instruction).

## Repository contradiction check

This plan is aligned/reconciled with GitHub Issue #179 and the VAL-009 execution contract supplied by the Project Owner.

No material contradiction between the VAL-009 contract, binding docs, Accepted DECs and the actual repository state was found during preparation of this plan. One non-blocking observation is recorded honestly:

1. Focused Accepted files exist for DEC-045 through DEC-049 and DEC-050 through DEC-057 while `docs/08_DECISIONS_LOG.md` carries their canonical summaries; no material conflict was found between the two forms for the topics this plan relies on.

## Phase 7 completion gate

Phase 7 backend is complete only when:

- VAL-009A through VAL-009E are complete on the branch stack with CI green; integration to main happens only at an explicit Project Owner-approved SYNC POINT;
- the role matrix and MFA gates are proven by tests (including ORG_ADMIN fail-closed assertions);
- configuration default/override/effective behavior is proven end to end without redeployment;
- overview, KPI and report backends prove tenant/location isolation, timezone correctness, absence-not-zero semantics and audited exports;
- no schema/migration change exists unless individually gate-authorized; migration count remains 28 otherwise;
- no Dashboard UI exists yet;
- all decision gates opened by this plan are either closed by focused Accepted decisions or remain explicitly tracked with owners.

Only after VAL-009E review, and once gate G8 is either closed by a focused Accepted decision or explicitly resolved by the Project Owner, may the Dashboard UI stream begin as a separate frontend sequence consuming these backend contracts. Reliability is the next phase after Phase 7 backend; Pilot Hardening follows Reliability.

## Merge discipline

There is **NO automatic PR or merge to main** during the current parallel streams. Task count never triggers a PR or merge. Stream B remains branch-stack only; any integration/merge to main happens only at an explicit Project Owner-approved SYNC POINT. Work proceeds branch-only per `docs/13_COLLABORATION_WORKFLOW.md`.

---

*End of Phase 7 Dashboard Execution Plan (VAL-009, documentation only).*
