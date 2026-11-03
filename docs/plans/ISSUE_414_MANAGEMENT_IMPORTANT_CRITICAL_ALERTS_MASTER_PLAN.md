# Issue #414 — Management Important & Critical Alerts: Complete Master Implementation Plan

**Status:** PLANNING ONLY — PHASE-1 OWNER POLICY ACCEPTED (DEC-109); SOURCE AND VERIFICATION GATES OPEN.
**Planning verdict:** **DECISION REQUIRED** for unresolved technical/source evidence and later-phase policy. **OD-01..OD-06 policy is now Owner-approved in Accepted DEC-109**; this plan is not itself an Accepted Decision or implementation authorization.
**Prepared:** November 4, 2026.
**Repository:** [yamanradwan1-rgb/valet-platform](https://github.com/yamanradwan1-rgb/valet-platform) · [Issue #414](https://github.com/yamanradwan1-rgb/valet-platform/issues/414).
**Immutable inspection baseline:** [`3ab80f98940147a71ab37262eeff5080234eb6e8`](https://github.com/yamanradwan1-rgb/valet-platform/tree/3ab80f98940147a71ab37262eeff5080234eb6e8).
**Authority:** Issue #414 §§0–11 and §10A, **Accepted DEC-109 (2026-11-04; later binding Phase-1 Owner policy supersedes relevant §10A candidates)**, other Accepted Decisions and source-of-truth hierarchy, and the historic pinned source inspection.
**Scope boundary:** Exactly 17 eventual categories, IMPORTANT/CRITICAL only; ALT-14 remains EXTERNAL DEPENDENCY / DEFERRED / DISABLED; no Cash Reconciliation implementation or Issue #415 Live Operations auto-refresh.
**Evidence legend:** `LOCKED` = binding contract; `DERIVED` = mechanics that follow from LOCKED contracts and verified source; `UNRESOLVED` = choices or recommendations requiring Owner/source verification; `CONTRADICTED` = evidence conflicts with a stated claim. Tests and runtime checks are explicitly distinguished from source inspection.

**Executive technical verdict (2026-11-04):** Owner-approved **Phase-1 product/contract policy** is now binding through DEC-109: T-01 ranges, folded ALT-02/03, current-source CA/LM audience for five categories, typed own-user preferences/CAS/MFA/audit, and additive UI placement. This approval does not implement alerts or prove Dispatch ordering, exact source queries, atomic writer compatibility, MFA-neutral reads, navigation or real PG/browser/performance checks. Phase 1 is **NOT READY TO RELEASE**; code implementation remains separately authorized.

**الملخص التنفيذي (2026-11-04):** تم اعتماد قرارات OD-01 إلى OD-06 رسميًا ضمن DEC-109، بما فيها حدود التأخير والصلاحيات الخاصة بالمرحلة الأولى وآلية إعدادات المستخدم وموضعها. لم يتم تنفيذ الميزة؛ ترتيب أحداث Dispatch لا يزال بحاجة لإثبات، والحالات غير القابلة للترتيب تُستبعد بدل اختلاق ترتيب. أي Marker أو تعديل Source Schema يحتاج موافقة مستقلة. اختبارات الصلاحيات وMFA وPostgreSQL وواجهة المستخدم والأداء لم تُنفّذ لهذه الميزة. ALT-14 يبقى مؤجلًا وخارج نطاق Cash Reconciliation.

---

## 1. Baseline and Git Synchronization

| Check | Verified result |
|---|---|
| Repository | [yamanradwan1-rgb/valet-platform](https://github.com/yamanradwan1-rgb/valet-platform) |
| Remote | `origin` points to that repository |
| Latest verified `origin/main` | `3ab80f98940147a71ab37262eeff5080234eb6e8` |
| Baseline commit date | November 4, 2026, 00:47:08 UTC+03:00 |
| Baseline subject | `security(ci): automated scans on every push and PR (#420)` |
| Original local branch / HEAD during audit | `main` / `eba55b76916a6892059e45622252b87483f4cb1e` |
| Divergence at review | Local main 243 commits behind remote, no local-only commits |
| Original working tree | Two pre-existing untracked user files |
| Original local main fast-forward | **Not performed**; current checkout did not satisfy the clean-working-tree condition |
| Planning source | Immutable remote commit SHA above, used for all source reads and Worker assignments |

The original untracked files were `VAYLET_COMPLETE_LOCAL_RUNBOOK.md` and `VAYLET_META_SANDBOX_HANDOFF.md`. They were preserved. The planning run performed no checkout, merge, reset, stash, source edit, migration, commit, push, issue edit or deployment.

All repository source references in this plan refer to the pinned commit, not to the original older local checkout. This document's later Owner-authorized publication is a **documentation-only** operation on a dedicated task branch and does not change the planning findings or authorize feature implementation.

## 2. COS Worker Execution and Provenance

The four required VAYLET skills were actually loaded and applied: COS Prime, Planning Guardian, Code Review and Implementation Guardian. Their decision hierarchy, planning gates, adversarial checks, migration controls and 300-line structural requirements governed the investigation.

| COS Worker | Assigned responsibility | Actual result |
|---|---|---|
| `worker-1` — W1 | Issue, requirements and Accepted Decisions | Completed; delivered 17-category requirements audit and decision reconciliation |
| `worker-2` — W2 | T-01, preferences, timestamps and concurrency | Completed; identified significant Dispatch event-ordering gap |
| `worker-3` — W3 | T-02 authorization and MFA | Failed during model-selection startup; **no Worker findings claimed** |
| `worker-4` — W4 | Canonical source architecture | Failed during model-selection startup; **no Worker findings claimed** |
| `worker-5` — W5 | Dashboard, UI Freeze, performance and QA | Completed; identified active Settings integration and indirect MFA dependency |
| Prime | Coordination, source investigation and reconciliation | Independently inspected authorization, MFA, payment, dispatch, handoff, Presence, audit, geofence and schema sources |

W3 and W4 failed to start because the COS chat did not report back during model-selection/startup timeout; Prime performed their read-only scope directly. W1 was then reused for an independent adversarial cross-review of Prime/W2/W5's proposals. W5 also independently verified the mounted Policies Studio and security/refresh behavior.

All investigations were read-only. Worker reports establish source-inspection evidence, not successful implementation tests.

## 3. Issue #414 Scope and Decision Audit

The [complete current Issue #414](https://github.com/yamanradwan1-rgb/valet-platform/issues/414), including §§0–11 and §10A, was reviewed. **§10A proposes T-01 and T-02 answers; it does not approve them.**

The repository authority hierarchy places Accepted focused Decisions above the Blueprint bridge and supporting domain documentation. Later Accepted amendments control where they refine an earlier decision.

| Requirement | Authority and pinned source evidence | Current capability / gap | Classification | Owner action |
|---|---|---|---|---|
| R01 — Exactly 17 IMPORTANT/CRITICAL Management categories | Issue §§0–2, §10 | Canonical sources exist; Management alert facade absent | `LOCKED` | None on scope |
| R02 — Derived current cases and selected durable occurrences | Issue §4, P02 | Operational tables and Dispatch/Audit/Geofence events exist; no alert correlation | `LOCKED` | Approve detailed source contracts |
| R03 — Personal User+Organization timing | Issue §3/§10A; DEC-083/**109** | Owner-approved typed preference/limits; implementation absent | `LOCKED` | API/SQL/PG tests and audit compatibility remain |
| R04 — Phase-1 source-specific role/Location eligibility | Issue §5/§10A; DEC-059/080/082/100/**109** | Phase-1 CA/LM audience approved; exact source readers absent | `LOCKED` | Prove source authority; later-phase T-02 remains open |
| R05 — Saved retrieval SLA history | DEC-095:19–42,68–86; `schema.prisma:1722–1740` | Saved snapshot exists; NULL means uncovered; grace is new | `LOCKED` | Do not change SLA |
| R06 — User-specific Seen receipts, occurrences only | Issue §4/§9 | No source-linked User+Org receipt table or endpoint | `LOCKED` | Approve detailed storage/transaction contract before P2 |
| R07 — No polling-induced Company Admin MFA activity | Issue §5; DEC-078 | Preview can suppress activity; subscription/context reads still record it | `DERIVED` | Implement and prove narrow closure |
| R08 — STRICT additive Dashboard UI Freeze | Issue §6, P06 | Topbar/Policies Studio exist; alerts absent | `LOCKED` | Agree exact additive placement |
| R09 — Foreground polling and bounded source queries | Issue §7 | Client patterns exist; alert-query cost unmeasured | `DERIVED` | Performance proof before activation |
| R10 — Phase boundaries and #415 exclusion | Issue §§6,8,11 | Existing Live Operations is separate | `LOCKED` | None |
| R11 — ALT-14 exclusion pending cash retirement | Issue §§10A–11; DEC-052/081 | Forced-Shift closure exists; no cash completion/retirement | `UNRESOLVED` | External dependency only; disabled |
| R12 — Emergency takeover authority | Issue ALT-05; DEC-107; `schema.prisma:1337–1375` | Committed operation exists; focused DEC-107 remains Proposed | `UNRESOLVED` | Reconcile compatibility before ALT-05 |
| R13 — Post-revocation delivery | DEC-108:18–45 | Fresh requests respect revocation; bounded already-authorized response can finish | `LOCKED` | Preserve accepted boundary |
| R14 — Issue cross-reference | Issue §0 references §8 although §6 contains UI Freeze restrictions | Editorial mismatch | `CONTRADICTED` | Optional documentation repair |

**Verified Accepted focused Decisions:** DEC-052, 059, 078, 079, 080, 081, 082, 083, 088, 094, 095, 099, 100 and 108. **DEC-107 remains Proposed** with some Issue #352 Owner policies and code already implemented. It must not be relabeled Accepted. See `docs/08_DECISIONS_LOG.md:5–29` and `docs/decisions/DEC-107_EMERGENCY_TASK_TAKEOVER.md:3`.

Specific reconciliation:

- DEC-094 governs Location lifecycle; DEC-095 governs saved immutable SLA snapshots (NULL/no default, equality compliant).
- DEC-059's original Company Admin restrictions were amended by later Accepted text; use DEC-059 and DEC-080 together.
- DEC-082 Supervisor audit visibility does **not** grant a Supervisor the #414 Management bell.
- DEC-083 Company/Location typed settings must remain separate from the Owner's new personal alert timing feature.
- DEC-079 separates tenant/account audit scope; do not reuse outbound Notification or unrestricted audit detail.
- DEC-088 prohibits using commercial restrictions to mutate custody state.
- DEC-108 accepts bounded in-flight response completion after a revocation, but newly authorized requests must fail without a current grant.
- DEC-081/052 distinguish normal Shift cash snapshots from forced-ended cash PENDING/NULL state. No authoritative cash retirement exists for ALT-14.

No verified material conflict between **two Accepted decisions** requires a `REPOSITORY CONTRADICTION` verdict. The §0→§8 UI cross-reference is editorial; §6 and P06 govern.

## 4. Current Architecture and Source Evidence

The modular monolith contains the underlying sources; Issue #414 should add a focused Management read/attention layer, with only approved personal-preference and occurrence Seen persistence.

| Existing module or relation | Verified pinned evidence | Reuse and gap |
|---|---|---|
| Dashboard authorization | `apps/api/src/modules/dashboard/dashboard-read-authorization.ts:27–119` | Company Admin MFA-aware/Manager exact Location read; missing alert source eligibility |
| Manager Location grant | `apps/api/src/modules/dashboard/dashboard-location-authorization.ts:19–75` | Active membership/Location/grant checks |
| Company Admin authority | `apps/api/src/modules/management/management-authorization.ts:80–175` | Organization, MFA, locks, entitlement; not universal source permission |
| MFA assurance | `apps/api/src/modules/auth/mfa/mfa-assurance-policy.ts:17–58,108–175` | 30m idle/8h maximum/5m sensitive freshness; activity write closure needed |
| Tasks/Dispatch | `packages/database/prisma/schema.prisma:1279–1335`; `dispatch/dispatch-event-writer.ts:12–58` | Current status and event time; same-ms chronological proof missing |
| Retrieval SLA | `schema.prisma:1722–1740`; DEC-095 | Saved target/retrieval timestamp |
| Incident reads | `dashboard/incidents-query.ts:37–145` | Paginated reader; separate bounded safe alert query/exact detail |
| Presence reviewability | `management/presence-management-exception.ts:11–32,61–101` | Per-viewer `canReview` calculation exists; pending list alone insufficient |
| Emergency takeover | `schema.prisma:1337–1375`; `dispatch/emergency-takeover-history.ts:9–76` | Durable operation ID; DEC-107 reconciliation outstanding |
| Handoff proof | `retrieval/verify-handoff-command.ts:59–117` | Failed-attempt audit includes `terminalized`; reject ordinary bad attempts |
| Geofence | `tracking/geofence-evaluation.ts:152–180,201–228` | Durable VIOLATION with tracking attribution |
| Digital payments | `schema.prisma:1801–1823`; `payments/digital-collection-transitions.ts` | UNKNOWN before provider result differs from definitive FAILED |
| Forced Shift | `schema.prisma:1003–1019`; `management/staff-shift-force-end-repository.ts:19–61` | Committed ALT-13, cash still PENDING |
| Staff security | `management/staff-management-mutation.service.ts:64,167` | Role/grant audit events; sensitive recipient policy missing |
| Intake/subscription | `schema.prisma:621,2460–2472`; `management-commercial-access-policy.ts:14–45` | Effective current state; event/status labels alone insufficient |

Proposed canonical flow:

~~~mermaid
flowchart TD
    S["Canonical operational records and committed events"] --> A["Fresh Staff session, Organization, Location and source authorization"]
    A --> E["Eligibility, authoritative clock and episode derivation"]
    P["Current User + Organization timing preferences"] --> E
    E --> C["Overlap, correlation and severity"]
    C --> B["Bounded sanitized previews and authorized count"]
    B --> U["Dashboard bell and compact panel"]
    S --> O["Eligible committed occurrence"]
    O --> R["Fresh source authorization and seven-day validity"]
    R --> W["Idempotent user-specific Seen receipt"]
    W --> C
~~~

This flow is **proposed**. No named alert route, reader, table or migration is claimed to exist. The existing `Notification` infrastructure handles outbound communication and must not be reused as a general Management inbox. Do not add a queue, broker, generic worker or redundant event-writing system by default.

**Critical source fact 1 — Dispatch chronology:** `tasks` has mutable `updated_at`, no canonical queue/stage-entry clock. `dispatch_events` stores `occurred_at` plus random UUID ID; operation time is rounded to milliseconds in `apps/api/src/modules/dispatch/dispatch-transaction.ts:28–38`. Ordering by `(occurred_at,id)` produces deterministic display but **does not prove chronological order** for tied timestamps. Even the Task audit metadata version does not establish an explicit Dispatch-event-to-Audit-event total-order linkage. ALT-02/03 and ALT-04 must use a proven episode order or fail closed on ambiguity. An atomic monotonic marker/migration is conditional on explicit source contract approval.

**Critical source fact 2 — retrieval phase overlap:** `retrieval/mark-ready-command.ts:100–114` moves a ValetSession to READY while returning `taskStatus: IN_PROGRESS`; `initiate-handoff-command.ts:43–75` keeps the original READY clock. ALT-04 cannot alert solely because a Task remains IN_PROGRESS after READY. The current Session phase must retire ALT-04 and allow ALT-06 instead.

## 5. T-01 Owner-Approved Phase-1 Policy (DEC-109)

**Owner-approved (DEC-109):** one typed timing preference set per authenticated User + Organization, integer seconds, optimistic concurrency, and tighter pilot maxima than the historical §10A recommendations. Domain SLA and other users' settings are untouched; implementation is still pending.

**These exact defaults and inclusive ranges are Owner-approved in DEC-109** (initial pilot contract, not measured production safety).

| Category | Approved default | Approved inclusive range | Historical §10A candidate | Rationale |
|---|---:|---:|---:|---|
| ALT-01 — SLA grace | 0 s | 0–60 s | 0–120 s | The alert is already beyond a saved SLA; another two minutes is difficult to justify without pilot evidence |
| ALT-02 — Initially uncovered queue | 60 s | 0–300 s | 0–600 s | Avoid hiding ten minutes of unassigned work |
| ALT-03 — Decline requeue | 0 s | 0–120 s | 0–120 s | Prompt coverage after an explicit decline |
| ALT-04 — Stage stuck | 300 s | 60–900 s | 60–1,800 s | A 30-minute suppressible stuck stage is excessive for a pilot |
| ALT-06 — Ready/handoff delay | 300 s | 60–900 s | 60–900 s | Preserve a practical handoff window |
| ALT-11 — Unknown payment outcome | 120 s | 60–600 s | 60–600 s | Allow routine reconciliation without masking prolonged uncertainty |

DEC-109 accepts the tighter pilot bounds. Wider §10A values remain historical alternative proposals, **not** active approved maximums. Validate pilot performance before enabling polling.

ALT-11 remains IMPORTANT only. The proposed 900-second CRITICAL escalation is **disabled** unless separately approved. All other categories are immediate upon an eligible current source condition or a committed occurrence; no new user-configurable delay is inferred.

### Approved storage/write policy — implementation not run

DEC-109 accepts the **architecture/scope** of a focused forward-only PostgreSQL preference migration, **only for future separately authorized implementation**. Exact schema symbols/HTTP route spelling require inspection of repo conventions; no migration has run.

| Field or constraint | Recommendation |
|---|---|
| Primary identity | `(organization_id, user_id)` |
| Identity integrity | Composite FK to existing unique OrganizationMembership `(organization_id,user_id)` |
| Values | Six explicit integer-second columns |
| Revision | Nonnegative integer, incremented on actual change |
| Metadata | Server-owned `updated_at` |
| Constraints | SQL CHECKs for each approved min/max and matching application DTO validation |
| Missing row | Effective defaults, revision `0`; no read-time insert |
| Initial changed save | Insert revision `1` |
| User control | Own settings only; no trusted client-supplied user/tenant ownership |
| Location behavior | Same preferences across user's authorized Locations within one Organization |
| Exclusions | No Company/Location override, JSON catch-all, polling preference, disable toggle or Location SLA mutation |

DEC-109 accepts **GET own effective preferences** (six values/revision) and **PUT own complete preferences** (six values/`expectedRevision`) under live session, User/Organization and current role/grant checks. Concrete route/DTO symbols must follow existing conventions.

For each write, use one protected transaction to resolve and revalidate current Staff session, User, OrganizationMembership, role, active Organization, applicable Location grant for LM, commercial entitlement and Company Admin MFA. Serialize the per-(Organization, User) key, compare persisted revision and enforce:

- **Same desired state:** return canonical state without a revision increase or duplicate audit, including retries after an unknown response.
- **Matching expected revision + changed state:** persist values atomically and increment revision.
- **Stale revision + differing state:** typed conflict (HTTP `409` proposed) and no mutation.
- **Expired/revoked/wrong tenant/entitlement/MFA failure:** nondisclosing denial and no mutation.

First-write races with no row require a unique database constraint plus deterministic concurrent insertion; a uniqueness exception may not silently overwrite. DEC-109 requires one safe atomic tenant Management audit on actual changes: approved event `MANAGEMENT_ALERT_TIMING_PREFERENCES_CHANGED`, own User/Organization and actor membership, bounded changed-field names and before/after revision **without values/secrets**. No audit on reads, exact no-ops or denials and no audit-reader permission expansion. Audit-writer scope compatibility must be verified before implementation.

DEC-109 requires **SENSITIVE Company Admin MFA within five minutes** for changed personal preference writes. LM uses accepted active-session/Location grants, not newly added TOTP. Reads and automatic renewals are activity-neutral; unrelated Management calls are unchanged.

### Clock and episode contract

Alert delays use server time and authoritative source timestamps, not browser clocks or mutable `updated_at`.

ALT-01 eligibility requires a still-current covered retrieval attempt, non-NULL saved SLA target, unfinished relevant retrieval phase and strict inequality:

`t_server > retrieval_requested_at + saved_sla_seconds + ALT01_grace_seconds`

Equality is **not** a breach. Old cancelled attempts cannot be reused for later requests. Changes to Location SLA targets never rewrite the snapshot. See `docs/decisions/DEC-095_MANAGEMENT_KPI_SOURCE_CONTRACTS.md:19–42,68–86` and `packages/database/prisma/migrations/20260917004300_mgt_be_10_kpi_analytics/migration.sql:44–92`.

DEC-109 approves **one uncovered Task case per proven queue episode** with reason-specific precedence: initial QUEUED uses ALT-02 delay anchored at the QUEUED event; a fresh DECLINED requeue uses ALT-03 delay anchored at the DECLINED event. Do not add, minimize or run both timers concurrently. The episode key must be proven from canonical history; assignment/progression retires it. **Owner policy is accepted; same-millisecond chronological source proof remains a mandatory implementation gate.**

ALT-04 uses the current ACCEPTED/IN_PROGRESS stage-entry source event, resets on a real new stage and retires when retrieval Session reaches READY. ALT-06 starts at the original `ready_at` and continues through HANDOFF_PENDING; it must not reset at handoff initiation.

## 6. T-02 Accepted Phase-1 Audience; Later-Phase Proposed Matrix

Under DEC-109, `A` = **approved Phase-1 CA/LM audience**, still requiring currently verified source authorization in API/list/count/detail; `P` = proposed later-phase audience; `G` = later-phase source policy/reader contract not yet approved; `D` = denied; `X` = disabled. Approval of the audience does **not** establish a working source query or new financial/audit permission.

| ALT | Company Admin | Location Manager | Supervisor / Employee / Guest | Source permission and scope condition |
|---|---|---|---|---|
| 01 | A | A | D | Current authorized retrieval attempt and saved SLA, exact Location |
| 02 | A | A | D | Current authorized Task queue and proven uncovered episode |
| 03 | A | A | D | Current Task plus latest decline/requeue evidence; folded with 02 |
| 04 | P | P | D | Task stage-event visibility and current Session phase |
| 05 | G | G | D | Committed takeover operation, sanitized detail; DEC-107 gate |
| 06 | P | P | D | Current retrieval Session and original READY episode |
| 07 | G | G | D | Terminalized handoff/override audit permission; never proof secrets |
| 08 | A | A | D | Persisted authorized HIGH/CRITICAL Incident, exact Location |
| 09 | G | G | D | Geofence event metadata under precise tracking source visibility |
| 10 | G | G | D | Specific FAILED Payment authority; aggregate finance insufficient |
| 11 | G | G | D | Specific payment operation UNKNOWN/REFERENCE_ATTACHED authority |
| 12 | A | A | D | Current per-viewer Presence `canReview=true`; self-review forbidden |
| 13 | G | G | D | Committed forced-Shift closure/audit visibility, exact Location |
| 14 | X | X | D | External cash retirement absent; globally disabled |
| 15 | G | D | D | CA-only sensitive role/grant revocation event, proposed |
| 16 | P | P | D | Current active authorized Location with intake stopped |
| 17 | G | D | D | CA-only subscription utility under effective entitlement restriction |

A proposed audience is not proof that the source reader already exposes suitable alert detail. Each source must pass a focused contract gate. Examples that constrain the design:

- `apps/api/src/modules/payments/payment-projection-authorization.ts:14–49` admits LM and operational roles but **excludes ORG_ADMIN**; aggregate CA Dashboard finance is not CA payment-detail authority. LM's exact session payment projection also omits payment collection operation details, so ALT-11 needs a new safe reader contract.
- `apps/api/src/modules/tracking/route-history-authorization.ts:12–73` admits Manager/Supervisor for eligible ended tracking sessions, but does not establish CA raw GPS/route detail rights.
- `apps/api/src/modules/management/management-audit-authorization.ts:233–263` admits narrow Supervisor audit reads per DEC-082. That does **not** authorize Supervisor Management alert visibility.

**Scope:** CA can receive source-authorized Organization and selected Location cases. LM can receive only exact currently granted active Location cases. Tenant/Location switches must clear old cases, preferences, badges, Seen operations and cache. Organization-only ALT-15/17 cannot be duplicated for Locations or shown to LM.

### Authorization proof obligations

For preview/list/count, verify the exact current Staff session, persisted role/membership, Organization/Location grants, commercial entitlement, MFA and **category-specific source authority before candidate query, correlation, pagination and counting**. Client-selected Organization/Location parameters cannot establish ownership.

The badge and preview use the same authorized, correlated eligible case set. Filtering after the first twenty source rows is invalid. A `20+` badge must prove at least 21 distinct actionable, authorized cases after folding. Do not leak inaccessible data through exact counts, overflow, empty/error status or navigation.

For permitted future Seen writes, a single transaction must recheck User, Organization, current source permission, committed allowlisted occurrence identity and seven-day window; insert unique `(user,organization,category,source occurrence)` receipt, or return existing receipt idempotently. **Active cases cannot be marked Seen.** No source event or domain custody/payment status changes. If source access is revoked, the action fails nondisclosing; never confirm existence through response differences.

DEC-108 permits bounded completion of a previously authorized request after a revocation commit, while all **new** requests must respect revocation. Client scope/identity epochs must still discard stale in-flight responses.

### MFA-neutral read closure

Preserve DEC-078's 30-minute idle, eight-hour maximum and five-minute sensitive-action assurance. Preview must explicitly suppress CA activity recording where supported (`dashboard-read-authorization.ts:27–35,97–108`).

That alone fails for transitive reads: `management-commercial-read.service.ts:44` and `management-context.service.ts:203` unconditionally record CA activity, and credential refresh can trigger subscription/context revalidation. The narrowly identified **subscription and selected context** CA reads must become activity-neutral **for all callers** (including manual calls), retaining session/current authority/MFA/lock behavior. Do not blindly change the unrelated organizations/locations list reads at `management-context.service.ts:114,163`.

A **real PostgreSQL 17** HTTP/integration test with MFA bypass **OFF** must demonstrate repeated preview + token renewal + subscription/context revalidation cannot move `staff_auth_sessions.last_admin_activity_at` or extend an otherwise idle MFA session. Verify valid interactive Management mutations still refresh activity and require their current assurance.

## 7. ALT-01..ALT-17 Complete Design Matrix

**Active** = attention persists only while the authoritative current condition remains true and retires automatically on resolution. **Occurrence** = a committed eligible event retains unseen attention up to seven days and can acquire an authorized per-user Seen receipt. Source authority, temporal identity and query indexes must be proven individually. All proposed identities/timers below remain conditional contracts.

| ID / Phase | Severity; source and proposed identity | Timing, eligibility and retirement | Overlap, navigation, verification and readiness |
|---|---|---|---|
| **ALT-01 / P1** | CRITICAL; saved retrieval request/session SLA snapshot; current retrieval attempt ID | Active if strict overdue saved target+grace, NULL excluded; retire READY/cancel/terminal or superseding attempt | Suppresses same-attempt ALT-04. Exact authorized Session/retrieval. Test NULL/equality/historical target/cancel/retry. **Policy accepted; code/evidence pending** |
| **ALT-02 / P1** | IMPORTANT; `tasks` + `dispatch_events.QUEUED`; Task+initial uncovered episode | Current QUEUED/unassigned beyond delay; retire on assignment/progression/terminal | Fold with ALT-03. Exact Task; queue and same-ms tests. **Blocked episode/T-01/T-02** |
| **ALT-03 / P1** | IMPORTANT; `dispatch_events.DECLINED`; Task+requeue episode | Current uncovered QUEUED after committed decline; use decline clock, retire on assignment/progression | Same ALT-02 family, never second badge. Repeated decline and old-history tests. **Blocked episode/T-01/T-02** |
| **ALT-04 / P2** | IMPORTANT; ACCEPTED/IN_PROGRESS Task + authoritative stage-entry Dispatch event | Active when current eligible stage duration exceeds delay; reset at stage transition; retire on progression or retrieval READY | ALT-01 wins overdue retrieval overlap; ALT-06 starts after READY. Test same-ms, reset, READY+Task IN_PROGRESS. **Blocked chronology** |
| **ALT-05 / P2** | CRITICAL; `emergency_task_takeover_operations.operation_id` | Occurrence at committed `occurred_at`; Seen or seven-day expiry | Sanitized authorized Task/audit, distinct operation/replay tests. **Blocked DEC-107/source contract** |
| **ALT-06 / P2** | IMPORTANT; ValetSession original `ready_at`; Session+READY episode | Active after personal delay across READY and HANDOFF_PENDING; retire on actual release/terminal progression | Separate ALT-01/04 phase. Exact Session. Handoff/initiate/abort/reinitiate clock tests. **Conditional T-01/source proof** |
| **ALT-07 / P2** | CRITICAL; terminalized `HANDOFF_VERIFICATION_FAILED` or distinct `HANDOFF_SUPERVISOR_OVERRIDE` source occurrence | Only proven terminal failure/committed override qualifies; source event time, seven-day/Seen | Group actual terminal proof episode, keep override separate. Sanitized custody/audit; wrong code attempts excluded; secret-leak tests. **Blocked grouping/source authority** |
| **ALT-08 / P1** | HIGH Incident→IMPORTANT, CRITICAL Incident→CRITICAL; `incidents.id` | Active persisted relevant status/severity; created-at ordering; retire on canonical resolution/ineligibility | Exact Incident detail; severity/resolve/older-page/authorization tests. **Blocked T-02/exact detail** |
| **ALT-09 / P2** | CRITICAL; `geofence_events.VIOLATION`; tracking session+approved repeat group | Occurrence at committed geofence `occurred_at`, seven-day/Seen; no claim of current out-of-bound state | Track-only authorized summary, no raw GPS; delayed samples/areas/repeat tests. **Blocked grouping/source permission** |
| **ALT-10 / P3** | IMPORTANT; definitive FAILED Payment source; payment/failure generation | Active after committed definitive failure, retire after effective resolution/status change | ALT-11 suppresses concurrent uncertainty. Authorized exact payment; callback/retry tests. **Blocked financial T-02** |
| **ALT-11 / P3** | IMPORTANT; `payment_collection_operations.id` | Active for unresolved `OUTCOME_UNKNOWN` after delay from source dispatch guard; whether `REFERENCE_ATTACHED` also qualifies is UNRESOLVED and requires source-policy approval; retire on authoritative resolution | Overlap ALT-10; safe operation detail; no blind retry. Timeout/late callback/reconciliation tests. **Blocked T-01/financial T-02** |
| **ALT-12 / P1** | IMPORTANT; `shift_presence_exceptions.id` | Active only while current principal's `canReview` true; retire on review, expiry or eligibility loss | Exact authorized review; self/expiry/challenge/revoke/filter-before-limit tests. **Blocked T-02/focused query** |
| **ALT-13 / P3** | IMPORTANT; `shift_force_end_closures` Shift/operation identity | Durable forced-closure occurrence at `ended_at`; Seen/window/source-authority retirement | Ordinary Shift end excluded. Shift/audit; retry/multiple Shift tests. Future overlap ALT-14. **Conditional source authority** |
| **ALT-14 / P3 target** | IMPORTANT; eventual post-force-end cash pending condition; canonical retirement identity **absent** | Would retire only on externally approved cash completion, currently not representable | **EXTERNAL DEPENDENCY / DEFERRED / DISABLED.** No current navigation, polling, Seen action or implementation |
| **ALT-15 / P3** | IMPORTANT; sensitive committed `STAFF_ROLE_CHANGED` / `STAFF_LOCATION_ACCESS_REVOKED` audit identity | Occurrence on a qualifying sensitive role change or Location access revocation (not limited to reductions), seven-day/Seen for currently authorized CA; exact event allowlist remains unapproved | Proposed CA-only sanitized staff/audit. Benign edit/downgrade/grant revoke/recipient revocation tests. **Blocked T-02** |
| **ALT-16 / P3** | IMPORTANT; current `locations.accepting_intake=false`, active Location | Active current stopped-intake condition; source stop time only after proof; retire on resume/deactivate | Exact authorized Location. New inactive default/stop/resume/re-stop tests. **Conditional T-02** |
| **ALT-17 / P3** | IMPORTANT; effective denied Dashboard entitlement; Organization+proven restriction episode | Active only while effective restriction; retire when restored, prove episode if clock exposed | CA-only subscription utility accessible without Dashboard entitlement, never bell in restricted shell. Deny LM and suspended-label-only tests. **Blocked fallback/source contract** |

**Overlap groups:**

1. ALT-02/03 = **one** currently uncovered Task episode; initial queue versus decline-requeue selects one reason and one timer.
2. ALT-01 suppresses same-attempt ALT-04; ALT-04 independently retires when Session reaches READY; ALT-06 governs subsequent ready/handoff stage.
3. ALT-11 unresolved outcome takes precedence over ALT-10 for the same payment while the outcome remains unknown.
4. ALT-13 is a discrete force-end occurrence. ALT-14 would be an independently retiring cash condition but is disabled.
5. ALT-07 terminalized proof failures can be grouped within the real proof episode; a supervisor override remains separate evidence.
6. ALT-09 repeat violations need bounded Task/tracking/area grouping approved before rollout.

No active case gets a Seen receipt. An audit row alone never grants attention: approved event family, current source authority, safe projection and seven-day occurrence window are mandatory.

Every future implementation slice must document the row-level `Requirement → Accepted authority → source query → episode key → eligibility → retirement → source permission → tests` proof. The matrix flags remaining source gaps honestly.

## 8. Phased Implementation Roadmap and Dependency Graph

The Issue's Owner-approved release composition remains unchanged. Source implementation can proceed in parallel only after its necessary contracts and migration ownership are settled.

| Phase | Exact intended delivery | Readiness |
|---|---|---|
| **Phase 0 — Decisions and contracts** | Approve T-01, T-02, source clocks/episodes, persistence/DTOs, occurrence identity, source links, MFA-neutral reads, SQL performance strategy and UI allowlist | **DEC-109 policy accepted; source proof open** |
| **Phase 1 — First usable release** | ALT-01, 02, 03, 08, 12; personal preferences, bell/panel, authorized previews/count, exact navigation, foreground polling, MFA-neutral closure, API/PG/browser tests | **Policy accepted; source chronology and implementation pending** |
| **Phase 2 — Operational progression and durable occurrences** | ALT-04, 05, 06, 07, 09; occurrence identity, authorized idempotent Seen receipts, correlation, navigation and regression tests | **Blocked Phase 1, stage/episode contracts and DEC-107 reconciliation** |
| **Phase 3 — Financial and administrative** | ALT-10, 11, 13, 15, 16, 17; financial/source security and restricted subscription utility | **Blocked source-specific T-02 and earlier foundation** |
| **ALT-14 external** | No work authorized under #414; cash completion/retirement requires separately approved workflow | **EXTERNAL / DEFERRED / DISABLED** |

~~~mermaid
flowchart TD
    A["P0: T-01 values, persistence and fold"] --> B["P1: Personal preferences API and Settings"]
    C["P0: Source authorization T-02"] --> D["P1: ALT-01, ALT-08, ALT-12 readers"]
    E["P0: Authoritative Task event ordering"] --> F["P1: Folded ALT-02/03 reader"]
    C --> F
    B --> G["P1: Authorized aggregate, badge and panel"]
    D --> G
    F --> G
    H["P1: MFA-neutral subscription/context reads"] --> I["P1: Foreground polling and session fencing"]
    G --> I
    I --> J["Phase 1 PG, browser, performance gate"]
    J --> K["P2: Stage/READY ALT-04/06"]
    J --> L["P2: Seen receipts + ALT-05/07/09"]
    K --> M["Phase 2 gate"]
    L --> M
    M --> N["P3: Financial ALT-10/11"]
    M --> O["P3: Administrative ALT-13/15/16/17"]
    N --> P["Phase 3 gate: 16 enabled categories"]
    O --> P
    X["External cash completion contract"] --> Y["Later separate ALT-14 activation decision"]
~~~

Phase 0 contracts and read-only performance investigations can run in parallel. After Owner approval, a focused MFA-neutral read correction, personal preference schema and independent source-reader queries can use separate owned files/worktrees under repository collaboration rules. **One migration owner at a time.** The aggregate preview waits for all P1 required source readers and their authorization proofs. Polling waits for both the aggregate and MFA-neutral closure.

Phase 2 Seen receipts can be developed alongside independently source-proven stage and occurrence readers after the common identity contract is accepted. P3 financial authorization discovery may begin earlier, but activation depends on a safe approved per-payment reader and existing aggregate. ALT-14 has no implementation edge into the current delivery graph.

## 9. Implementation Task Breakdown

The WBS assigns stable proposed task IDs. Relative complexity estimates: `S` small, `M` medium, `L` large, `XL` substantial. These are **estimates**, not timelines or capacity commitments.

Every future code task must: read its GitHub task, `AGENTS.md`, Accepted decisions and `docs/17_AGENT_CODE_STRUCTURE_RULES.md`; inspect intended callers and existing code; name affected aggregates and State/Task transitions; check tenant/Location authorization, FKs/indexes and config impacts; update design documentation before approved behavior changes; use transactions/CAS/idempotency and appropriate tests; keep authored files within 300 lines. Database tasks update `docs/03_DATABASE_SCHEMA.md`, add a **forward-only** `packages/database/prisma/migrations` migration, update fixtures/seeds and run real PostgreSQL invariant tests. All prospective filenames, API routes and DTO identifiers are **conditional** until their contract is accepted.

Independent review roles below are **expected future reviewers**, not actual implementation approvals.

### Phase 0 — Contracts

| ID / dependency | Scope, input → output and repository area | Security, data and acceptance verification | Reviewer; estimate; status |
|---|---|---|---|
| **414-00-01** Timing contract | Issue §§3,10A + DEC-083/095 → six-value timing, ALT-02/03 fold, preference revision; `docs/decisions`, `packages/contracts/src` | Explicit range/default, NULL SLA, bounded seconds, retry/CAS; record Owner choice before schema | Product + DB; **M; OWNER GATE** |
| **414-00-02** Category permission contract | Issue §§2,5,10A + DEC-059/078/080/082/088/099/100 → 17-row recipient/source matrix; docs, Dashboard/Management authorization | Current Staff session, exact Location, MFA/entitlement, negative preview/count/detail/Seen tests | Security + Product; **L; OWNER GATE** |
| **414-00-03** Episode identity and chronology | Task/Dispatch, retrieval, audit → accepted total-order and episode rules; `apps/api/src/modules/dispatch`, `retrieval`, schema/docs | Same-ms ties, stage/reset, latest queue, READY overlap; migration only if accepted source marker required | Dispatch + DB; **L; SOURCE GATE** |
| **414-00-04** UI and performance contract | Live Policies Studio/topbar and candidate SQL → additive UI allowlist, safe navigation plan, performance method; Dashboard/API areas | Frozen DOM/screenshots, no #415, branch budgets and disabled default | UI/a11y + Security + DB; **M; CONTRACT GATE** |

### Phase 1 — First usable release

| ID / dependency | Scope, input → output and repository area | Security, DB/retry and acceptance verification | Reviewer; estimate; status |
|---|---|---|---|
| **414-01-01** MFA-neutral reads; Issue §5 | `management-context.service.ts`, `management-commercial-read.service.ts`, Dashboard auth/scope caller → automatic/manual subscription/context neutrality | No migration; preserve session/MFA/locks; real PG MFA bypass OFF proves 30m/8h, token renewal and ordinary interactive activity | Security + Auth; **M; CONTRACT DERIVABLE** |
| **414-01-02** Personal preferences; 00-01/02 | `packages/database`, `packages/contracts`, focused `apps/api` Management API → typed own User+Org GET/PUT | **Proposed design requires a forward migration, pending contract approval**; composite FK/CHECK, CAS, first-insert race, idempotent exact retry; cross-user/tenant/role/MFA | DB + Security; **L; BLOCKED T-01/T-02** |
| **414-01-03** ALT-01; 01-02/00-02 | Saved retrieval SLA/Session source → eligible overdue cases in focused Dashboard reader | Bounded read-only query; NULL/equality/cancel/new attempt; current source auth/grace | Retrieval + DB; **M; BLOCKED CONTRACT** |
| **414-01-04** ALT-02/03 fold; 00-03/01-02 | Dispatch and Task reader → single current uncovered episode | No Task `updated_at` clock; same-ms, decline, assignment, requeue race; source index migration conditional | Dispatch + Security; **L; BLOCKED CHRONOLOGY** |
| **414-01-05** ALT-08; 00-02 | `dashboard/incidents-query.ts`, Incident contracts → severity-filtered cases and exact safe target | Filter before LIMIT, sanitized fields, older-than-first-page and cross-Location negative tests | Incident + Security; **M; BLOCKED T-02** |
| **414-01-06** ALT-12; 00-02 | `management/presence-management-exception.ts` → currently `canReview` cases and exact target | Reuse source predicate *inside* eligible SQL; self, expired, challenged, revoked and count tests | Presence + Security; **M; BLOCKED T-02** |
| **414-01-07** Preview + correlation; 01-03–06 | Focused `apps/api/src/modules/dashboard` facade + `packages/contracts` DTO → safe cases, priority, stable identity, bounded 20+ count | Authorize before source/count, correlate before limit, no activity on GET, no secrets, index/PG plan | Backend + DB/Security; **L; DEPENDENT** |
| **414-01-08** Timing Settings UI; 01-02 | Active `/policies` Policies Studio → separate self/Org subsection visible to CA and LM | No Company/Location config changes; revision conflict, independent error, EN/AR and existing draft/navigation guards | Frontend + a11y; **M; DEPENDENT** |
| **414-01-09** Bell, panel and poll; 01-01/07 | `components/shell/topbar.tsx`, shell props, feature-local coordinator/styles → compact authorized attention | Foreground single-flight, timeout/jitter/backoff, scope epoch clear, false-zero/error, extract near-300-line files | Frontend + Security; **L; DEPENDENT** |
| **414-01-10** Exact source navigation; 01-05/06/07 | Task, Incident, Presence source pages/readers → direct authorized item selection | Real exact-ID server read; no guessed URL or first-page assumption; stale and revoked grant denied | Frontend + Security; **M; DEPENDENT** |
| **414-01-11** P1 acceptance gate; 01-01–10 | API integration, contracts, Dashboard Playwright, real PG/CI and benchmark → evidence for five categories | MFA bypass OFF, isolation/races, mounted visual Freeze, measured p95, rollback and no #415 | Independent Security/QA/DB; **L; NOT RUN** |

### Phase 2 — Operational progression and occurrences

| ID / dependency | Scope, input → output and repository area | Security, DB/retry and acceptance verification | Reviewer; estimate; status |
|---|---|---|---|
| **414-02-01** ALT-04 stage clock; 00-03/P1 | Dispatch events, Task/Session Dashboard reader → stage-specific stuck case | Marker migration only if approved; same-ms/reset/READY retirement and ALT-01 priority | Dispatch + DB; **L; BLOCKED SOURCE** |
| **414-02-02** ALT-06 ready clock; 01-02/P1 | Retrieval Session timestamps → READY/HANDOFF_PENDING episode | Do not reset at handoff; abort/reinitiate/release and source authorization tests | Retrieval + QA; **M; CONTRACT GATED** |
| **414-02-03** Seen receipts; P1/00-02 | `packages/database`, `packages/contracts` and focused API → source-linked own-user idempotent Seen | **Proposed design requires a forward migration, pending contract approval**; unique identity, seven-day validity, same-transaction source reauth, unknown-response and concurrent retry | DB + Security; **L; BLOCKED CONTRACT** |
| **414-02-04** ALT-05 takeover; 02-03 + DEC-107 reconciliation | `emergency_task_takeover_operations`, safe Task/audit view → committed takeover occurrences | Durable operation ID, no raw metadata; source/replay/role tests | Dispatch + Security; **M; BLOCKED DEC-107** |
| **414-02-05** ALT-07 handoff; 02-03 | Handoff verification/audit → terminalized failures and independent overrides | Prove terminal episode and exclude earlier attempts; sanitize handoff proof data; test expiry, concurrency and duplicate submissions | Custody + Security; **L; BLOCKED SOURCE** |
| **414-02-06** ALT-09 geofence; 02-03 | `tracking/geofence-evaluation.ts` and authorized Task/map reader → grouped violations | Seven-day occurrence, privacy/no raw GPS, delayed samples/areas/repeats; index conditional | Tracking + Privacy; **L; BLOCKED GROUPING** |
| **414-02-07** P2 gate; 02-01–06 | Shared facade, receipts, PG/browser suite → five new accepted categories | Multi-user Seen, retention, correlation, retirement, performance and UI Freeze | Independent Security/QA; **L; NOT RUN** |

### Phase 3 — Financial and administrative

| ID / dependency | Scope, input → output and repository area | Security, DB/retry and acceptance verification | Reviewer; estimate; status |
|---|---|---|---|
| **414-03-01** Financial source contract; 00-02 | `payments/payment-projection-authorization.ts`, payment operation/Management finance readers → CA/LM exact safe projections | Do not reuse employee operational reader or aggregate as CA detail grant; exact tenant/Location/entitlement tests | Finance + Security; **L; BLOCKED T-02** |
| **414-03-02** ALT-10/11; 03-01 + 01-02 | Payment/operation source query → definitive FAILED vs unresolved UNKNOWN | Never trigger payment command/retry; provider timeout/late callback/idempotent fold/timestamp tests | Finance + DB; **L; BLOCKED CONTRACT** |
| **414-03-03** ALT-13; 02-03 | `shift_force_end_closures` and authorized Shift/audit view → force-end occurrences | Exact Location, no ordinary Shift close, duplicate and Seen/retry | Shifts + Security; **M; CONTRACT GATED** |
| **414-03-04** ALT-15; 02-03/00-02 | Staff audit events and safe staff detail → approved sensitive role-change / Location-access-revocation occurrences | Proposed CA-only, sensitive allowlist, no LM/Supervisor count, revoke-after-read | Staff Security; **L; BLOCKED T-02** |
| **414-03-05** ALT-16; P1/00-02 | `locations.accepting_intake` current reader → active stop-intake cases | Active Location, not stale event; new inactive default/stop/resume/re-stop/cross-Location | Location Lifecycle + Security; **M; CONTRACT GATED** |
| **414-03-06** ALT-17; 01-01/00-02 | Effective subscription entitlement + restricted CA shell → safe restriction case | CA-only utility without Dashboard entitlement; no LM/Management Dashboard bypass, MFA/restoration | Entitlement + Security; **L; BLOCKED T-02** |
| **414-03-07** P3 gate; 03-01–06 | Full enabled-category PG/browser/perf/security suite → verified release candidate | All source/Seen/MFA/entitlement/isolation/CI, ALT-14 explicitly disabled | Independent Security/QA/DB; **L; NOT RUN** |

**ALT-14** is recorded separately as **414-EXT-14**, external dependency tracking only. It has **no authorized current implementation task**, migration, test activation or release-completion claim. A separate accepted cash-reconciliation source contract must define pending condition, authoritative completion, source identity, timestamps and retirement before future activation.

For implementation ownership, maintain one owner per file set and serialize edits to `docs/08_DECISIONS_LOG.md`, `docs/03_DATABASE_SCHEMA.md`, `schema.prisma`, migration folders and root build files. PR/CI/cross-review rules apply only after Owner separately authorizes implementation.

## 10. Security, MFA, Concurrency and Privacy Risks

This section records **observed source limitations** separately from **future implementation risks**. Every new protected preview, preference mutation and Seen receipt must retain the modular monolith's existing authority, transaction and audit rules. A source-derived alert is never a substitute for its underlying domain authorization.

### Risk register and controls

| Risk ID / severity | Evidence and failure mode | Required remedy and acceptance proof |
|---|---|---|
| **SEC-01 / Critical — cross-tenant or cross-Location leak** | Management source readers have different role/location predicates; a client-selected scope or shared cache cannot replace persisted grant checks; `dashboard-read-authorization.ts`, `dashboard-location-authorization.ts` and DEC-108 | Exact Organization and current active Location membership, source-specific permission within every request/transaction; no unauthorized list/count/overflow/detail/Seen. Real PG A/B tenant and Location revoke races |
| **SEC-02 / Critical — false source authority** | Exact CA per-payment projection is *excluded* at `payment-projection-authorization.ts:14–49`; Presence `PENDING` list is not the same as per-principal `canReview`; audit Supervisor reads are distinct | Approved per-category recipient matrix; explicit new safe source reader only if allowed; source reauthorization for deep links. Test CA financial detail and LM denied categories |
| **SEC-03 / Critical — MFA idle bypass via polling** | `management-commercial-read.service.ts:44`, `management-context.service.ts:203` update `last_admin_activity_at`; token refresh revalidates scopes and can invoke them | Narrow neutrality for identified context/subscription reads for **all callers**, plus neutral alert GET; preserve locks and existing MFA. Execute real PG17 MFA-bypass OFF HTTP tests across idle/absolute/sensitive boundaries |
| **SEC-04 / Significant — incorrect queue/stage chronology** | `dispatch-transaction.ts:28–38` millisecond timestamp, random event UUID, no canonical sequence; `schema.prisma:1279–1334` | Prove total episode ordering or fail closed; accept source marker/migration only via separate contract. Same-ms sequential commit and requeue tests |
| **SEC-05 / Significant — false duplicate operational attention** | Task IN_PROGRESS persists after Session READY; ALT-01/04/06 and ALT-02/03 overlap | Eligibility evaluated from current Session and Task together; stable correlation before count/LIMIT. Tests for READY/HANDOFF_PENDING, requeue, saved SLA equality and suppression |
| **SEC-06 / Critical — unsafe Seen mutation** | Proposed Seen operation is user-specific but source authorization can be revoked; no receipt schema yet | One database transaction for exact current Staff/session and source authorization, window, uniqueness, upsert and audit policy. Cross-user/tenant, replay, concurrent tabs, revoke and expired occurrence tests |
| **SEC-07 / Significant — ambiguous payment outcomes** | `digital-collection-transitions.ts` sets `OUTCOME_UNKNOWN` before definitive provider result; exact operation details are not current CA/LM alert permissions | Differentiate FAILED from UNKNOWN and REFERENCE_ATTACHED; never retry collections on GET or notification action; late callback/timeout/idempotency tests |
| **SEC-08 / Critical — custody proof disclosure / misclassification** | `verify-handoff-command.ts` audits every failed attempt, including nonterminalized events; supervisor override is separate | Only terminal/max proof episodes, redact pickup codes/QR secrets/credential metadata, preserve append-only source events and override identity; test attacks and repeated attempts |
| **SEC-09 / Significant — tracking privacy** | Geofence violation and route history share tracking-related data; fine-grained route authorization differs by role | Publish minimal event time/authorized Task summary; no raw GPS or continuous employee surveillance, no new tracking policy. Per-Location route rights/repeat grouping tests |
| **SEC-10 / Significant — partial-page filtering and badge leakage** | Incident/Presence queries paginate before some category predicates; indexes do not establish source-authorized exact counts | Push eligibility, visibility and category predicates before per-source bound; correlate before final count; truthful `0`/`20+`; test 21+ authorized and unauthorized interleaving |
| **SEC-11 / Significant — stale A→B→A response** | Dashboard API fences identity/session; active scope generation exists but is not yet owned by an alert-specific coordinator | Monotonic epoch keyed by identity, Staff session, Organization, Location, role/grant, selection revision and preference revision; clear protected counts before fetch; discard stale success *and* error even if scope IDs match again |
| **SEC-12 / Significant — expensive periodic SQL** | Existing indexes favor source list pagination, not necessarily latest episode by authorized Location; 60s frontend poll proposed but unbenchmarked | Independent per-family indexed bounded probes, measured count/overflow, hard request bounds and PG17 planner/p95/load gate; feature off until proven |
| **SEC-13 / Significant — entitlement/restricted-shell bypass** | DEC-088 protects custody from commercial restrictions; CA subscription-only shell has special utility access | ALT-17 only in authorized CA subscription utility; never mount Dashboard bell or other denied Management surfaces in restricted shell; tests for CA/LM/entitlement transitions |
| **SEC-14 / Significant — incorrect irreversible business effect** | Alert layer consumes operational sources and optional personal receipt state | No operational source mutation on GET/poll; no Shift/payment/custody action from alert read; preserve append-only history, no audit from reads, no changes to payment releases or retrieval SLA |
| **SEC-15 / Significant — invalid preference write/race** | User+Organization preference row and CAS contract do not yet exist | Typed SQL CHECK + matching DTO bounds; session/tenant revalidation under lock, unique first insert, CAS and exact desired-state retry; no silent last-writer-wins |

### Transaction-level preference proof

The proposed preference mutation is conditional until the Owner approves T-01/T-02. Acceptance requires a real SQL transaction that (1) resolves the authenticated Staff session and User from the credential; (2) locks/revalidates session, active OrganizationMembership and permitted role; (3) establishes Organization ownership and exact LM Location grant when relevant; (4) verifies current entitlement and CA MFA assurance using accepted lock order; (5) obtains a serialized per-(Organization, User) preference writer boundary; (6) validates expected revision and all six bounded integer-second values; (7) applies an actual change and required typed audit **atomically**; and (8) returns only safe own-user DTO data. Exact desired-state retry is a no-op; stale differing retry is a conflict. No mutation or audit occurs on unauthorized/error/no-op outcomes. Real PG tests must race two first inserts, concurrent revisions, revocation and a provider/network unknown response.

### Transaction-level Seen proof

The proposed occurrence-only Seen operation must (1) resolve current Staff credential/User; (2) revalidate Organization/Location and category-specific source authorization under the accepted transaction boundary; (3) check a committed allowlisted source event/operation, exact canonical occurrence identity and server-side seven-day eligibility; (4) reject an active-state case and stale/revoked/out-of-window occurrence without confirming its existence; (5) insert one unique User+Organization+category+source occurrence receipt; and (6) converge exact retries to the existing receipt without duplicating records or mutating source history. The action must never create a new Event, Task, Notification, payment retry or custody transition. If audit is required for receipt mutation, it must commit with receipt state and obey the approved event catalog.

### Error and retry policy

A new read may be retried safely only after fresh source authorization and within the current scope epoch. Transient transport/timeout/429/5xx failures must not be displayed as authoritative zero. Unauthorized/MFA/entitlement/protocol failures suspend polling until authenticated, user-driven recovery. Preference and Seen writes must return stable idempotent outcomes across an unknown network result; the client must **not** blindly replay non-idempotent source-domain commands. Use `Cache-Control: no-store` for protected responses and avoid logging secrets, pickup codes, customer access tokens, raw GPS or payment provider details. Gate all features under an initially disabled rollout control; disabling alerts must leave operational source behavior unchanged.

## 11. UI Freeze and Performance Strategy

### Strict additive UI allowlist

Issue §6 is binding: only four kinds of additive change are permitted.

1. **Minimal bell and compact panel** in the authorized Management Dashboard topbar: IMPORTANT/CRITICAL only, CRITICAL first, current active cases versus eligible unseen occurrences, count `0`/`20+`/unavailable without deceptive zero, keyboard/focus/ESC behavior.
2. **Own-user Timing Settings subsection** in the already mounted Dashboard Settings experience; bounded localized inputs, save/conflict/error state, CA and LM visibility.
3. **Narrow source-authorized exact-item navigation** into relevant existing Task, Incident, retrieval, Presence, payment, audit, Location or subscription source surfaces, with nondisclosing unavailable behavior.
4. **Feature-local wiring, localization, accessibility and tests** necessary for those additions.

Preserve the order/appearance/behavior of existing topbar actions, navigation, tables, filters, KPIs, charts, global themes, source views and responsive layout. Issue #352's separately approved Supervisor Tasks navigation exception remains narrow. The employee, customer, native apps and Issue #415 Live Operations table-refresh behavior are outside #414.

The actual mounted Settings path is:

`apps/dashboard/src/app/policies/page.tsx` → `features/administration/policies-studio/policies-studio-page.tsx` → `ui/policies-studio-view.tsx` → `ui/Workspace.tsx`.

Older panels under `features/administration/settings/` exist but were not found mounted. `ui/catalog.ts:217–241` exposes the existing “notifications” area to CA but **not** LM, so placing new personal Timing only there makes Phase 1 incomplete. Add an isolated LM-visible personal subsection to the live Policies Studio within the approved additive allowance; preserve existing Company/Location `SettingsScope`, field catalog, frozen sections, draft/dirty navigation guard and read/error behavior. If the exact placement requires a layout change outside the allowlist, seek Owner approval before that UI slice. A shared Company/Location setting is not an acceptable substitute for per-user preference state.

Bell wiring is narrow: `components/shell/topbar.tsx:74–78` → `dashboard-shell.tsx`/`shell-types.ts` → `foundation/selected-management-shell.tsx:213–235`. Bell eligibility requires current authorized CA or exact active-grant LM with Dashboard entitlement. No Supervisor, Employee, Guest or CA subscription-only restricted-shell bell. `selected-management-shell.tsx` is 290 physical lines, `policies-studio-page.tsx` is 295, and `dashboard-api-client.ts` is 299 at baseline: extract task-specific responsibilities before adding substantial code, per `docs/17_AGENT_CODE_STRUCTURE_RULES.md:15–48`.

Current Task and Incident screens use cursor-paginated 50-row lists and locally selected drawers: `features/operations/tasks/tasks-page.tsx:49–85,171–211`, `incidents/incidents-page.tsx:47–63,150–242`, and `features/operations/operations-api.ts:113–160`. Guessing `?id=` URLs or searching only the first page cannot satisfy exact alert navigation. Use an approved exact-ID source reader and narrow mounted drawer/selection contract; fall back to a sanitized unavailable state when absent/inaccessible. An internal exact Incident helper is not an exposed GET detail route (`apps/api/src/modules/dashboard/incidents.controller.ts:48–79`).

### Proposed foreground polling contract — requires performance proof

The issue's approximately **60-second** candidate is not a production capacity claim. Proposed controller behavior:

- Start one read only when mounted, visible, online, authenticated, source-authorized and Dashboard-entitled. Never run background/hidden polling.
- Settle a request before scheduling the next: **60 seconds + randomized 0–3 seconds** proposed after success; no overlapping `setInterval` requests.
- One in-flight request per authorized alert scope; coalesce focus/resume/manual/timer triggers and abort or fence prior work.
- Proposed **10-second** request deadline; transient network, timeout, 429 or 5xx use escalating **60/120/240-second** backoff with jitter, or trusted validated `Retry-After` if the transport exposes it. Existing Dashboard client does **not** expose Retry-After; a narrow optional extension would need its own contract/test.
- Resume from hidden/offline with one bounded source revalidation. Stop on logout, scope change, role/grant revocation, MFA failure, entitlement restriction, malformed protocol or unmount.
- Fence both successes and failures by monotonic local epoch: authenticated User, Staff session/identity+session generations, Organization, exact Location, membership/role, selection revision, preference revision and request generation. Clear old protected panel/count before new authority. A→B→A must not accept an old A response.
- Preserve unknown/unavailable status on errors; never turn transport failure into an authoritative zero or show stale privileged cases.
- Do not refresh Live Operations tables: that is Issue #415.

Reusable patterns exist in `lib/scope/scope-generation.ts:6–40`, `features/operations/maps/live-map-refresh-owner.ts:29–176`, `lib/auth/staff-auth-client.ts:137–160,233–244` and `lib/api/dashboard-api-client.ts:52–114`. Their scopes/cadences are distinct; do not assume they prove alert polling.

### Query/data budget and benchmark acceptance

Proposed backend query policy: **zero SQL for source families ineligible for the caller**, explicit Organization/Location/source authorization before queries, small indexed branch-local candidate limits with bounded recency windows, safe per-category projection, and deterministic correlation/priority before final display limit. Never use a global `UNION ... LIMIT 20` as the only bound on expensive source scans. Never filter unauthorized or wrong-severity records from a first page in application memory and claim the count is complete. Source indexing is conditional: existing Task `(locationId,status,createdAt,id)`, Dispatch `(taskId,occurredAt,id)`, Incident `(locationId,status)` and Presence `(organizationId,locationId,status,requestedAt,id)` indexes do not prove this new access pattern is cheap.

Proposed **measurement protocol**, not evidence of performance:

| Measurement | Proposed procedure / gate |
|---|---|
| Environment | Isolated PostgreSQL 17, real migrations and test fixtures, MFA bypass OFF |
| Data distributions | Sparse and dense tenants, multiple Locations, deep old history and realistic active/source overlap |
| Plans | `EXPLAIN (ANALYZE, BUFFERS)` for each eligible branch and full preview; show joins, scanned rows, index usage and sort/aggregation cost |
| Load | 20 warmup + 100 measured requests for each scenario, concurrency 4/8/16, CA Organization and LM exact Location, with token renewals |
| Measurements | Per-branch and endpoint median/p95/max, database execution and pool/lock/advisory wait, rows scanned, errors/deadlocks, authorization and count overhead |
| Suggested provisional target | Aim for per-branch p95 ≤1 second **only if measured and accepted**; set final full HTTP p95/error budget based on measured density/concurrency |
| Capacity | 25/100/200 foreground tabs at 60 seconds produce approximately 0.42/1.67/3.33 GET/s; these arithmetic rates are **not** capacity validation |
| Acceptance | No unbounded audit/GPS/payment scans, no undetected overflow, no performance regression or pool starvation, and documented signed-off production cadence |

The backend must enforce source-specific hard bounds even if frontend polling is disabled or misconfigured. A feature flag should default **OFF**, with independent ability to stop polling and hide the bell. Rollback disables the alert UI/queries; it must not rewrite canonical source events, destroy existing preference or Seen data, or change operational functionality.

## 12. Test and Acceptance Plan

**Actual planning-run verification:** full GitHub Issue inspection, Accepted DEC reconciliation, pinned `git show`/`git grep` source inspection, existing test inventory and COS independent read-only challenge. **No new tests were executed**: real PostgreSQL, HTTP/browser, screenshot diffs, p95 benchmarks, feature rollout, CI and deployment have **NOT RUN** status. A planned acceptance case is not a passed test.

### Full verification matrix

| Verification ID / layer | Required cases and acceptance | Status at planning handoff |
|---|---|---|
| **V01 — Contract/unit** | Strict integer-second defaults/min/max, invalid decimals/negative/overflow, revision DTO, category IDs/severity, active-versus-occurrence discriminant, deterministic correlation, nonterminalized exclusion | **PLANNED / NOT RUN** |
| **V02 — Source temporal** | Saved SLA NULL/equality/request reattempt, decline requeue vs initial queue, tied same-ms committed Dispatch events, stage entry/reset, READY with Task IN_PROGRESS, handoff without ready reset | **BLOCKED** chronology/Owner contract; tests **NOT RUN** |
| **V03 — Schema/constraints** | Unique User+Org preference, composite tenant FK, SQL CHECK, first insert CAS, unique Seen key, source FK/key constraints, retention and forward-only migration/fixtures | **BLOCKED** contract; tests **NOT RUN** |
| **V04 — Real PG races** | Concurrent preference write/no-op/409, duplicate Seen from two tabs, revoke during authorization/use, exact-source operation idempotency and transaction rollback | **PLANNED / NOT RUN** |
| **V05 — Negative auth** | Wrong Organization/Location/grant, Supervisor/Employee/Guest Management denial, expired Staff session, CA/LM source differences, exact payment detail, no count/detail/Seen oracle | **SOURCE AUTH PROOF PENDING**; tests **NOT RUN** |
| **V06 — Presence and Incident** | `canReview=true` before count/pagination, requester self/expiry/challenge, severity filtered inside SQL before LIMIT, inaccessible/off-page exact item | **PLANNED / NOT RUN** |
| **V07 — MFA-neutral full request** | **MFA bypass OFF**; idle 30m, absolute 8h, sensitive 5m, preview+refresh+subscription/context does not update `last_admin_activity_at`, mutations still protected | **CRITICAL BLOCKER / NOT RUN** |
| **V08 — Credential and revocation** | Refresh/token rotation/revoked session, DEC-108 bounded old in-flight versus fresh new deny, entitlement restricted shell, A→B→A delayed success/error fenced | **PLANNED / NOT RUN** |
| **V09 — Unknown outcomes** | Timeout/HTTP 429/5xx, malformed/error/partial failure, unknown preference save/retry, exact Seen retry, payment OUTCOME_UNKNOWN late callback, no blind source mutation | **PLANNED / NOT RUN** |
| **V10 — Poll/controller** | Foreground-only, hidden/offline/mount/unmount, resume coalescing, deadline, jitter/backoff, Retry-After if supported, no overlap/stale privileged zero, source scope cancellation | **PLANNED / NOT RUN** |
| **V11 — Query/performance** | Isolated PG17 sparse/dense tenants, branch-level indexed bounds, real p95, pool/lock pressure, exact count/20+ after overlap, no first-page filtering | **PLANNED / NOT RUN** |
| **V12 — Mounted browser E2E** | Real Dashboard CA/LM topbar, authorized detail links, Settings save conflict, EN/AR RTL/LTR, keyboard/focus restore/ESC, responsive 320/390/1440 | **PLANNED / NOT RUN** |
| **V13 — Visual Freeze** | Before/after DOM and screenshots across light/dark, EN/AR, desktop/mobile, existing topbar, source pages, tables, KPIs, filters, navigation; no #415 auto-refresh | **PLANNED / NOT RUN** |
| **V14 — Accessibility** | WCAG 2.2-relevant labels/semantics, keyboard only, dialog focus trap/return, polite status, contrast, reduced motion, rtl logical placement and overflow | **PLANNED / NOT RUN** |
| **V15 — Architecture/CI** | Scope diff, no >300 authored code file, `pnpm architecture:check`, relevant lint/typecheck/unit/build, PG integration, Playwright fixture and runtime suites, GitHub CI green on authorized PR | **PLANNED / NOT RUN** |
| **V16 — Rollback/disable** | Feature OFF stops alert preview and polling, hides Management attention, preserves preference/Seen history, no effect on custody/dispatch/payment or #415 | **PLANNED / NOT RUN** |
| **V17 — Category completeness** | Assert all 17 IDs in contract/matrix; P1 five, P2 five, P3 six enabled after gates; ALT-14 reported disabled/external and no 17/17 completion claim | **PLANNED / NOT RUN** |

**Existing test infrastructure inspected but not executed:** `apps/api/test/mfa-admin-activity.integration.test.ts`, `staff-mfa-session-races.integration.test.ts`, `dashboard-authorization-fence-concurrency.integration.test.ts`; `apps/dashboard/e2e/issue321-policies-studio.spec.ts` (including LM section gating), `issue352-takeover-visual-freeze.spec.ts`, `e2e-runtime/scope-races.spec.ts`, `e2e-runtime/session-generation.spec.ts`, `features/operations/maps/live-map-refresh-owner.test.ts`, Dashboard API client tests and Playwright configs. Existing tests indicate available patterns only, **not** Issue #414 compliance.

### Phase acceptance gates and outcomes

- **Phase 0:** all Phase 1 T-01 and T-02 values/permissions approved, exact queue episode contract settled, source query/DTO/storage/policy/API/UI allowlist documented, no unresolved binding conflict. **Current: Owner policy accepted; technical source/contract proof remains open.**
- **Phase 1:** five categories exact, no false alert/count disclosure, no MFA idle extension, authorized Settings and source navigation, PG17 and mounted E2E/visual/bounded performance passing. **Current: NOT RUN and BLOCKED.**
- **Phase 2:** five additional categories, terminalized/committed event identity, real Seen source authorization/retry uniqueness, overlap retirement and no privacy leak, full regression. **Current: BLOCKED / NOT RUN.**
- **Phase 3:** six additional enabled categories with approved financial/staff/subscription rights, unknown payment separated from failure, restricted subscription utility, full PG/browser/CI evidence; ALT-14 explicitly disabled. **Current: BLOCKED / NOT RUN.**
- **External ALT-14:** a separately Accepted source-domain Cash Reconciliation retirement contract, its own implementation and full verification. **Current: EXTERNAL DEPENDENCY / DISABLED.**

A future failing test must be recorded **FAILED** with reproduction, evidence, remedy and retest; no test may be marked PASS until actually executed on the relevant code revision. Passing static checks cannot substitute for real PostgreSQL, browser or production deployment proof. Actual PR CI and release approval are separate future gates.

## 13. Independent Review Findings

The review applied the VAYLET Code Review adversarial checklist to **existing source and proposed contracts**. There is **no implementation diff** to review, so no formal patch-security verdict, passed-test claim or `CLEAN TO MERGE` assertion is warranted. Independent W1 cross-review was undertaken after its own requirements work, and W5 independently inspected active UI/refresh code. W3/W4 startup failures were recorded; Prime owns direct checks in those areas.

| Cross-review finding / severity | Independent evidence | Prime reconciliation and implementation gate |
|---|---|---|
| **CR-01 — chronology cannot be proven by timestamp+UUID / Significant** | `dispatch-transaction.ts:28–38` uses timestamp(3), `dispatch-event-writer.ts:23–42` random event IDs, `schema.prisma:1310–1334` lacks per-Task sequence; Audit version metadata has no proven direct per-Dispatch-event total order | **Accepted.** Treat ALT-02/03/04 episode derivation as blocked until source-backed sequencing proof or a separately approved atomic marker. Omit ambiguous cases rather than guessing |
| **CR-02 — READY still has IN_PROGRESS Task / Significant** | `retrieval/mark-ready-mutations.ts:10–18` and `mark-ready-command.ts:88–114` | **Accepted.** ALT-04 requires current Session phase before READY; ALT-06 begins from original READY clock. Add same-session overlap regression |
| **CR-03 — Company Admin exact Payment access absent / Critical permission defect if assumed** | `payments/payment-projection-authorization.ts:14–49` excludes ORG_ADMIN; `payment-projection-query.ts:50–132` does not expose payment collection operation detail; `overview-financial-query.ts:60–84` is aggregate | **Accepted.** Mark ALT-10/11 financial CA/LM details as gated source-specific T-02 contracts, never infer from financial aggregates |
| **CR-04 — Presence PENDING list overstates reviewability / Significant** | `management/presence-management-exception.ts:11–28,74–101` calculates `canReview` separately from paginated PENDING selection | **Accepted.** Apply current viewer eligibility before page/count; no raw PENDING badge; negative expired/self tests |
| **CR-05 — every bad handoff attempt is audited / Significant** | `retrieval/verify-handoff-command.ts:81–112,186–203` records failed attempts with terminalization metadata; override separate | **Accepted.** Terminalized proof episode only; distinct override occurrence; never leak verification details |
| **CR-06 — exact Incident target is not exposed through existing GET / Significant** | `dashboard/incidents-query.ts:42–101` has internal helper/unsafe raw text; `incidents.controller.ts:48–79` exposes paginated GET and resolution POST, not GET/:id | **Accepted.** Conditional safe source-specific exact-item projection/route; no guessed client URL or first-page filtering |
| **CR-07 — neutral alert GET insufficient for CA idle / Critical** | `dashboard-read-authorization.ts:27–35,97–108` neutral option; `management-commercial-read.service.ts:29–44` and `management-context.service.ts:203` still record activity; automatic refresh revalidates scope | **Accepted.** Focused neutrality across automatic/manual subscription/context reads; MFA bypass OFF PG test and no regression to interactive auth |
| **CR-08 — indexes and partial counts do not prove 60s safety / Significant** | `schema.prisma:1304–1306,1332–1333,1938,2715` indexes have different access patterns; Incident severity and Presence reviewability are not source-filtered in first-page readers | **Accepted.** Prove bounded per-family source SQL, correct folded 20+ count and real PG17 p95/pool waits before enabling poll |
| **CR-09 — LM Settings section visibility / Significant** | Mounted `/policies`; `ui/catalog.ts:217–241` excludes existing Notifications section for LM | **Accepted.** Add isolated approved LM-visible personal Timing subsection, preserve frozen Company/Location settings; compare DOM/screenshots |
| **CR-10 — stale response/permission revocation / Significant** | Existing `ScopeGenerationGuard` is reusable; Dashboard API fences identity/session but not alert preference and Location epoch; DEC-108 permits bounded in-flight completion | **Accepted.** New monotonic alert scope epoch, data purge on changes and source-authoritative fresh request checks, without inventing last-byte fencing |
| **CR-11 — unapproved contract promotion / Critical governance defect** | Issue §10A T-01/T-02 are recommendations, DEC-107 Proposed, ALT-14 external, ALT-11 CRITICAL escalation unapproved | **Accepted.** All such contracts classified UNRESOLVED/disabled; none silently treated as an Accepted DEC or READY |
| **CR-12 — UI Freeze/Issue #415 scope creep / Significant** | Issue §6 permits four additive surfaces; Live Operations auto-refresh is separate #415 | **Accepted.** Restrict future task diffs to bell/panel, personal Timing, safe links and feature-local wiring/tests; no #415 or redesign |

**Worker-specific conclusions:** W1 confirmed Issue/DEC authority, 17 IDs and proposed/Accepted distinction; W2 exposed event ordering, personal timing/CAS and ALT-02/03 fold; W5 located the live Settings route, near-limit files, A→B→A fencing and transitive MFA bug; Prime validated direct current-source permissions and canonical event identities. W1's independent review challenged the most material claims with pinned source-line references. There were no claims of independent runtime execution.

**Prime resolution:** The eight principal security/contract objections were accepted and integrated into Sections 5–12 and the WBS. The broader audit added UI placement, stale response and governance gates. None requires rewriting an Accepted Decision; **material gaps remain unresolved**. The correct verdict is `DECISION REQUIRED` rather than a false `READY TO IMPLEMENT` or an unproven `REPOSITORY CONTRADICTION`. When later implementation commits exist, repeat this adversarial checklist against the **actual diff**, its source contracts, live migrations and executed PG/browser tests.

## 14. Owner Decisions — Phase 1 Accepted, Later Phases Open

OD-01..OD-06 are now **Owner-accepted in DEC-109**. This register retains later-phase OD-07/08 and the external ALT-14 dependency; all prior binding product, UI Freeze, MFA and #415 exclusions remain in force.


### OD-01..OD-06 — Accepted Phase-1 policy (DEC-109; 2026-11-04)

**Owner approval recorded:** Prime's recommended choices for the six Phase-1 decisions are now binding in [DEC-109](../decisions/DEC-109_ISSUE_414_MANAGEMENT_ALERT_PHASE1_POLICY.md). Their old proposals/options are historical and no longer outstanding. Approval is **policy**, not evidence that code, source chronology, migration, API contracts, tests or release exist.

| Decision | Approved Owner choice | Still-open technical gate |
|---|---|---|
| **OD-01 ACCEPTED** | Option B: exact six defaults/inclusive integer-second caps in §5; no ALT-11 CRITICAL escalation | Typed validation, SQL constraints and pilot threshold/performance proof |
| **OD-02 ACCEPTED** | Option A: **one** uncovered Task case, ALT-02 initial QUEUED clock, ALT-03 actual decline/requeue clock | Prove current episode source identity/retirement under concurrency |
| **OD-03 SAFETY POLICY ACCEPTED / SOURCE PROOF OPEN** | Investigate existing total order first. For ambiguous episodes **fail closed**. New atomic per-Task marker is **not** authorized without a separate focused Owner contract | Real-PG same-ms, rollback, ordering and legacy proof; ALT-02/03 not READY without it |
| **OD-04 ACCEPTED** | Typed per-(Organization,User) six-field preferences, own GET/full PUT, revision/CAS, 409 conflicts, CA sensitive 5-min MFA, atomic safe tenant audit only on changes | Migration and API source/writer compatibility; no code/migration execution yet |
| **OD-05 ACCEPTED FOR PHASE 1** | CA and exact-granted LM for ALT-01/02/03/08/12 **only**; source authorization before preview/count/navigation; no Supervisor/Employee/Guest bell | Exact source-reader queries/negative tests, current grant/MFA/entitlement validation |
| **OD-06 ACCEPTED** | Isolated personal Timing subsection on mounted `/policies`; minimal management bell/panel and narrow safe exact source navigation within UI Freeze | UI/browsers, no frozen layout changes, AR/EN and a11y proof |

OD-07/08 remain later-phase decisions. **No implementation has been authorized by this plan/Decision**, and policy acceptance does not close the Dispatch chronology technical blocker.

### OD-07 — Phase 2 occurrence rights and DEC-107 compatibility (Later Phase 0/P2 gate)

- **Issue and evidence:** ALT-05/07/09 expose takeover, handoff and tracking event evidence. DEC-107 standalone remains Proposed despite approved Issue #352 directions and committed takeover source; existing raw audit/route visibility is not alert source authority.
- **Viable options:** A: approve focused event-type allowlist, CA/LM exact eligible source projections, minimal fields and stable seven-day Seen identity, while reconciling DEC-107's applicable contract first. B: restrict sensitive categories until each source contract becomes Accepted. C: reuse broad audit/route permissions as a blanket alert grant.
- **Trade-offs:** A enables target alerts with explicit privacy work; B delays sensitive categories but preserves least privilege; C risks exposing custody/tracking metadata.
- **Prime recommendation:** **A** only after source-by-source proof and DEC-107 reconciliation; otherwise **B** for the unsupported category. Do not invent a global alert-permission engine.
- **Minimum approval:** Phase 2 per-source recipient/detail/Seen event allowlist; exact terminal handoff proof and geofence repeat grouping; DEC-107 compatibility action as needed.
- **Can proceed without it:** Phase 1 after its gates, source-read performance analysis, generic occurrence receipt contract planning (no P2 activation).

### OD-08 — Phase 3 financial, security and restricted-shell policy (Later Phase 0/P3 gate)

- **Issue and evidence:** CA financial Dashboard read is aggregate; exact CA payment operation access is absent; ALT-15 staff privilege event recipient and ALT-17 restricted subscription utility are recommendations, not Accepted T-02 policy.
- **Viable options:** A: approve narrowly scoped safe CA/LM payment status/operation projections for ALT-10/11, CA-only ALT-15/17, active Location eligibility for ALT-16 and force-end source authority for ALT-13. B: omit individual categories until proven. C: expand a generic financial/audit capability to all details.
- **Trade-offs:** A needs focused authenticated source readers and more tests but meets scoped target; B delays coverage safely; C is least privilege regression. ALT-11 CRITICAL after 900s would be an **additional separate unapproved decision** and is excluded here.
- **Prime recommendation:** **A** one category at a time with definitive FAILED versus UNKNOWN semantics, no automatic payment retries and restricted-shell isolation; otherwise **B**.
- **Minimum approval:** Exact Phase 3 recipient/entitlement/detail matrix, event/operation identity and financial unknown/failed folding. Leave 900s CRITICAL escalation disabled.
- **Can proceed without it:** P1/P2 work after their decisions; read-only financial/source investigation. Do not activate P3 alerts.

### External ALT-14 dependency — tracked, not an approval request for Issue #414

ALT-14's eventual source retirement remains **EXTERNAL / DEFERRED / DISABLED**, as already decided. There is **no** Owner approval requested to implement Cash Reconciliation in this issue. Future work outside #414 must first establish and accept a real post-force-end cash completion transition, authoritative timing, stable episode identity and retirement proof, then separately authorize ALT-14 activation. Until then, even a successful Phase 3 is a **16 enabled category** target, not 17/17.

### Decision sequencing and smallest Phase 1 approval set

**Owner's Phase-1 OD-01..OD-06 policy decisions are accepted.** What remains is **technical source proof and separately authorized implementation**, not a second approval of the same policies. OD-03's accepted fail-closed rule does not prove chronology; any new atomic marker/migration requires a separate focused Owner contract. OD-07/08 remain later-phase decision gates.

## 15. Final Planning Verdict — Updated after Owner Approval (2026-11-04)

**Final planning verdict: `DECISION REQUIRED` for technical evidence and later phases; DEC-109 now resolves OD-01 through OD-06 policy.**

The Owner approved the actual Phase-1 policy for T-01 and the five-category T-02 recipients, their exact personal timing, ALT-02/03 one-case handling, preference/CAS/MFA/audit contract and feature-additive placement. **This is not evidence of implementation or authority to start coding.** Dispatch same-ms event ordering, source authorization/DTO/writer compatibility, correct source episode attribution, neutral MFA renewal, counted/paginated SQL performance, exact-detail navigation and actual PG/browser tests still need proof. Do not describe ALT-02/03 as READY until the source chronology is proven; a new source marker is not authorized without separate focused approval.

| Scope | Policy status | Remaining to implement / verify |
|---|---|---|
| **Phase 0** | **OD-01..OD-06 ACCEPTED in DEC-109** | Prove Dispatch ordering; align current source readers and safe audit writer; record any necessary separate marker decision |
| **Phase 1 / ALT-01/02/03/08/12** | **Owner audience and timing LOCKED; NOT READY for activation** | Actual typed preferences and source queries, MFA-neutral reads, bell/panel, exact navigation, race/security/PG/browser and performance gates |
| **Phase 2 / ALT-04/05/06/07/09** | **OD-07 OPEN; BLOCKED** | Phase 1 foundation, stage order, Seen contract, DEC-107 reconciliation, tracking/custody privacy |
| **Phase 3 / ALT-10/11/13/15/16/17** | **OD-08 OPEN; BLOCKED** | Finance/staff/subscription source-specific rights and tests; no ALT-11 CRITICAL escalation |
| **ALT-14** | **EXTERNAL / DEFERRED / DISABLED** | No Cash Reconciliation work under #414, no false 17/17 claim |
| **CI and release** | **NOT RUN for feature implementation** | Real code diff, actual migrations/tests/performance/CI and separate activation approval |

**Historical evidence:** Sections 1–13 document the pinned source review and future tasks, not completed implementation. The present docs-only owner decision update must not be represented as executed testing. Existing code source refs must be rechecked at implementation HEAD.

**Recommended first independently authorized implementation slice:** 414-01-01 (CA subscription/context MFA-neutral read closure) with real PostgreSQL 17 HTTP/integration proof, MFA bypass OFF and independent security review. It is **not** authorized by this docs merge.

**Outstanding choices before each future phase:** Phase-1 source chronology technical evidence or, if impossible, a **separate approved** atomic marker contract; exact repository-compatible SQL/DTO/audit writer design and tests. Later Phase 2 **OD-07**, Phase 3 **OD-08**, and external ALT-14 remain distinct gates. **No source code, migration, release, CI bypass for code or deployment is authorized here.**
