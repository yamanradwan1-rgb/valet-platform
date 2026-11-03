# VAYLET Security / Database Contracts — source audit, 2026-11-03

**Scope and verdict.** Independent, read-only **source coverage audit** of
`packages/database`, applicable PostgreSQL migrations/schema constraints,
and security-critical `apps/api/test` assertions. Baseline:
`f9ecebd9af85b44580771b4027515d06c0a31de4` (merged `origin/main`
after PR #413). Exclusive worktree:
`cos/test-audit-contracts-20261103`. **KEEP** every identified DB-enforced
invariant, negative authorization check, concurrency/rollback proof and
historical-data guard. **No deletion, skip, timeout, SQL, runtime, CI, or test
change is authorized or included.**

The source contains broad and specific **declared** security tests; this
review did **not** execute PostgreSQL integration tests. Source assertions,
database constraints present in migration SQL, Vitest discovery and passing
CI are different evidence levels. Accordingly, the report finds a **release
verification gap** rather than declaring security complete or inventing a
production defect. In particular, **DEC-107 is still Proposed** despite
committed code, migrations and tests; its decision and final compatibility
review must be reconciled before claiming accepted/launch-ready scope.

## Authority, boundaries and inventory

The relevant binding principles are
[`AGENTS.md:119–195`](../../AGENTS.md#L119-L195)
and [source-of-truth:20–29](../00_SOURCE_OF_TRUTH.md#L20-L29):
tenant/location authority derives from persistence; physical custody, Task
ownership, payments and audit are distinct; privileged mutations and audit
commit atomically; history is immutable; negative access fails closed.
Focused **Accepted** decisions govern their contract. DEC-107 is explicitly
[`Proposed`](../decisions/DEC-107_EMERGENCY_TASK_TAKEOVER.md#L1-L6)
in both the standalone decision and
[`docs/08_DECISIONS_LOG.md:5–29`](../08_DECISIONS_LOG.md#L5-L29).

The authoritative
[`packages/database/vitest.config.mjs:13–57`](../../packages/database/vitest.config.mjs#L13-L57)
uses the repository's recursive import classifier. Current test ownership
was **executed for discovery**, yielding:

| Project | Source files | Intended treatment |
| --- | ---: | --- |
| `database-postgres-direct` | 43 | PostgreSQL-backed direct fixture |
| `database-postgres-provision` | 43 | PostgreSQL provision/migration fixture |
| `database-postgres-issue215` | 8 | Protected #215 target-attested PostgreSQL |
| `database-non-postgres` | 8 | Vitest with executable PostgreSQL guard |
| **Total** | **102** | Exactly one assigned project per discovered file |

There are **106 numbered migration directories** on this baseline. The
[explicit manifest test](../../packages/database/src/issue304-migration-source-appendix.test.ts#L13-L43)
compares their exact names/order, including
[`#352 migrations 104/105`](../../packages/database/src/issue304-migration-source-appendix.ts#L12-L22);
it is a **source-order safeguard**, not a database upgrade, migration checksum,
effective-privilege or historical-data preservation proof by itself. Key
live-SQL checks below explicitly issue invalid inserts/updates and expect
PostgreSQL SQLSTATE `23503` (foreign key), `23505` (unique), or `23514`
(check/immutable trigger), in addition to verifying allowed operations.

**Reading the matrix:** `DB` means a `packages/database/src` test,
`API` a `apps/api/test` test. Every reference is an **observed test source
line** in this SHA, **not** a claim of an executed/passing assertion. `KEEP`
means semantically mandatory. `R` denotes a possible **test/fixture
rewrite for maintainability only**, contingent on equivalent positive and
negative outcomes in real PostgreSQL.

## Decision-to-test coverage and retention matrix

| Accepted decision / enforced invariant | DB proof declared | API negative / transaction proof declared | Disposition, limitation |
| --- | --- | --- | --- |
| [DEC-025](../decisions/DEC-025_PRODUCTION_DATABASE_CONNECTION_HARDENING.md) — migration identity distinct from least-privilege runtime, no unsafe DDL, migration table/secret access | [`runtime-role.integration.test.ts:279,379,421,545,780–871`](../../packages/database/src/runtime-role.integration.test.ts#L279-L871); [`runtime-authority-privileges.integration.test.ts:153–251`](../../packages/database/src/runtime-authority-privileges.integration.test.ts#L153-L251) | [`staff-auth.integration.test.ts:326–376`](../../apps/api/test/staff-auth.integration.test.ts#L326-L376) boots runtime credentials | **KEEP** runtime-authenticated privilege negatives and default-deny future grants. R: refactor fixture startup only with same connected role and state checks. |
| [DEC-031](../decisions/DEC-031_PHASE3_KEY_PARKING_PERSISTENCE.md) — Zone/Spot/KeySlot exact Organization+Location, current occupancy, immutable custody | [`phase3-persistence.integration.test.ts:160–222`](../../packages/database/src/phase3-persistence.integration.test.ts#L160-L222); [`schema.integration.test.ts:2209–2259,2375–2445`](../../packages/database/src/schema.integration.test.ts#L2209-L2445) | [`key-assignment.integration.test.ts:34–144`](../../apps/api/test/key-assignment.integration.test.ts#L34-L144); [`key-eligibility-concurrency.integration.test.ts:57,245`](../../apps/api/test/key-eligibility-concurrency.integration.test.ts#L57-L245) | **KEEP** cross-Location and conflicting occupancy failures, including occupancy persisting until assignment is cleared. |
| [DEC-032](../decisions/DEC-032_SHIFT_OPERATIONAL_ELIGIBILITY.md) — exact Shift membership/Location, one ACTIVE per membership, no platform-user-global fake constraint | [`schema.integration.test.ts:1277,1325–1347`](../../packages/database/src/schema.integration.test.ts#L1277-L1347) | [`shift-start.integration.test.ts:76–143`](../../apps/api/test/shift-start.integration.test.ts#L76-L143); [`shift-eligibility.integration.test.ts:151–187`](../../apps/api/test/shift-eligibility.integration.test.ts#L151-L187); [`shift-end.integration.test.ts:79–100,195`](../../apps/api/test/shift-end.integration.test.ts#L79-L195) | **KEEP** cross-tenant/Location, same-User two-membership, revocation-vs-lock and audit rollback proofs. |
| [DEC-033](../decisions/DEC-033_KEY_ASSIGNMENT_CUSTODY_COMMANDS.md) — correction is append-only, exact actor scope, audit/custody atomic | [`phase3-persistence.integration.test.ts:222`](../../packages/database/src/phase3-persistence.integration.test.ts#L222-L222); [`task-dispatch-runtime-role.integration.test.ts:124`](../../packages/database/src/task-dispatch-runtime-role.integration.test.ts#L124-L124) | [`key-correction.integration.test.ts:20–62,130–237`](../../apps/api/test/key-correction.integration.test.ts#L20-L237) | **KEEP** injected audit/custody failure rollback, mismatched actor and immutable movement history. |
| [DEC-034](../decisions/DEC-034_TASK_DISPATCH_PERSISTENCE_FOUNDATION.md) / [DEC-035](../decisions/DEC-035_HYBRID_DISPATCH_ASSIGNMENT_ACCEPTANCE_REASSIGNMENT.md) — canonical Task owner, scoped DispatchEvent, one active intended operation, CAS | [`task-dispatch-persistence.integration.test.ts:131–232`](../../packages/database/src/task-dispatch-persistence.integration.test.ts#L131-L232); [`task-active-concurrency.integration.test.ts:54`](../../packages/database/src/task-active-concurrency.integration.test.ts#L54-L54) | [`dispatch-assignment.integration.test.ts:83,122,154,173`](../../apps/api/test/dispatch-assignment.integration.test.ts#L83-L173); [`dispatch-lifecycle.integration.test.ts:115–156`](../../apps/api/test/dispatch-lifecycle.integration.test.ts#L115-L156); [`dispatch-ranking-shift.integration.test.ts:138–218`](../../apps/api/test/dispatch-ranking-shift.integration.test.ts#L138-L218) | **KEEP** stale CAS, concurrent Shift end, forbidden IN_PROGRESS ordinary reassign, and rollback before audit. |
| [DEC-037](../decisions/DEC-037_CONFIRM_PARKED.md) — state/version, actual KeySlot deposit, one true Dispatch+Audit event | [`phase3-persistence.integration.test.ts:194–222`](../../packages/database/src/phase3-persistence.integration.test.ts#L194-L222) | [`confirm-parked-command.integration.test.ts:17–60,111–172`](../../apps/api/test/confirm-parked-command.integration.test.ts#L17-L172) | **KEEP** wrong assignee/role/tenant, version-before-detail, custody and event triple; indispensable before takeover extension. |
| [DEC-040](../decisions/DEC-040_GUEST_RETRIEVAL_REQUEST.md) — one active RetrievalRequest and Task per session, stable guest retry | [`schema.integration.test.ts:2719–2863`](../../packages/database/src/schema.integration.test.ts#L2719-L2863); [`task-dispatch-persistence.integration.test.ts:183`](../../packages/database/src/task-dispatch-persistence.integration.test.ts#L183-L183) | [`guest-retrieval-request.integration.test.ts:136–255`](../../apps/api/test/guest-retrieval-request.integration.test.ts#L136-L255) | **KEEP** caller classification, duplicate presses/concurrency and malformed parked persistence failures. |
| [DEC-042](../decisions/DEC-042_SECURE_HANDOFF_VERIFICATION.md) / [DEC-043](../decisions/DEC-043_VEHICLE_RELEASE_SESSION_COMPLETION.md) — single-use expiry-bound proof, correct Task/custody owner, atomic final release | [`secure-handoff-policy.integration.test.ts:46,89`](../../packages/database/src/secure-handoff-policy.integration.test.ts#L46-L89); [`phase4-runtime-role.integration.test.ts:100–147`](../../packages/database/src/phase4-runtime-role.integration.test.ts#L100-L147) | [`handoff-command.integration.test.ts:47–166`](../../apps/api/test/handoff-command.integration.test.ts#L47-L166); [`complete-handoff-guards.integration.test.ts:13–109`](../../apps/api/test/complete-handoff-guards.integration.test.ts#L13-L109); [`complete-handoff-authorization.integration.test.ts:31–57`](../../apps/api/test/complete-handoff-authorization.integration.test.ts#L31-L57); [`phase4-handoff-policy-gate.integration.test.ts:98–130`](../../apps/api/test/phase4-handoff-policy-gate.integration.test.ts#L98-L130) | **KEEP** consumed/expired proof denial, policy recheck, mismatched custody and exactly-one final-release winner; do not treat override as physical custody. |
| [DEC-046](../decisions/DEC-046_PHASE5_MAPS_TRACKING_PERSISTENCE.md) / [DEC-048](../decisions/DEC-048_PHASE5_TRACKING_LIFECYCLE_COMPOSITION.md) — tracking exact Task/Session scope; one active tracker, one-way `ended_at` | [`maps-tracking-persistence.integration.test.ts:226–250`](../../packages/database/src/maps-tracking-persistence.integration.test.ts#L226-L250); [`maps-tracking-runtime-role.integration.test.ts:114–203`](../../packages/database/src/maps-tracking-runtime-role.integration.test.ts#L114-L203) | [`issue352-takeover-tracking.integration.test.ts:57–138`](../../apps/api/test/issue352-takeover-tracking.integration.test.ts#L57-L138); [`gps-ingestion-authorization.integration.test.ts`](../../apps/api/test/gps-ingestion-authorization.integration.test.ts) | **KEEP** no history rewrite or cross-task GPS; takeover adds prospective immutable owner without backfilling historical NULL. |
| [DEC-050](../decisions/DEC-050_PHASE6_FINANCIAL_POLICY_PAYMENT_CORE.md) — effective inherited policy, Payment separate from custody, immutable initialization/audit | [`financial-policy-migration.integration.test.ts:124–184`](../../packages/database/src/financial-policy-migration.integration.test.ts#L124-L184) | [`payment-initialization.integration.test.ts:138–225`](../../apps/api/test/payment-initialization.integration.test.ts#L138-L225); [`payment-concurrency-atomicity.integration.test.ts:13–88`](../../apps/api/test/payment-concurrency-atomicity.integration.test.ts#L13-L88); [`payment-mutation-authorization.integration.test.ts:75–110`](../../apps/api/test/payment-mutation-authorization.integration.test.ts#L75-L110) | **KEEP** no provider DIGITAL_ONLY fail-closed, tenant idempotency, audit insertion rollback, no ValetSession mutation. |
| [DEC-051](../decisions/DEC-051_PHASE6_VALIDATION_TIPS_PRECOLLECTION_AUTHORITY.md) — Validation/Tip scoped and immutable history, precollection only | [`schema.integration.test.ts`](../../packages/database/src/schema.integration.test.ts) (core relational constraints; not a stand-alone Validation privilege proof) | [`validation-mutation.integration.test.ts:23–158`](../../apps/api/test/validation-mutation.integration.test.ts#L23-L158); [`tip-mutation.integration.test.ts:24–137`](../../apps/api/test/tip-mutation.integration.test.ts#L24-L137) | **KEEP** policy OFF, foreign guest session, immutable superseding rows, cash/provider evidence blocks and audit rollback. |
| [DEC-052](../decisions/DEC-052_PHASE6_CASH_COLLECTION_RECONCILIATION_AUTHORITY.md) — CashEntry append-only, shift reconciliation immutable | [`cash-reconciliation-migration.integration.test.ts:113–163`](../../packages/database/src/cash-reconciliation-migration.integration.test.ts#L113-L163) | [`cash-collection.integration.test.ts:76–225`](../../apps/api/test/cash-collection.integration.test.ts#L76-L225); [`shift-cash-reconciliation.integration.test.ts:25–132`](../../apps/api/test/shift-cash-reconciliation.integration.test.ts#L25-L132) | **KEEP** overcollection, double receipt, competing decrease/close, exact reporter and failed-audit rollback. |
| [DEC-053](../decisions/DEC-053_PHASE6_CURRENCY_MINOR_UNIT_AUTHORITY.md) — exact minor-unit representation, no lossy money conversion | [`payment-collection-constraints.integration.test.ts:37–63`](../../packages/database/src/payment-collection-constraints.integration.test.ts#L37-L63) (column-level/amount rejection only) | [`payment-guest-api.integration.test.ts:243`](../../apps/api/test/payment-guest-api.integration.test.ts#L243-L243); [`digital-collection-initiation.integration.test.ts:219`](../../apps/api/test/digital-collection-initiation.integration.test.ts#L219-L219) | **KEEP** nonrepresentable and malformed currency/amount negatives; DB-only checks do not establish provider-level arithmetic parity. |
| [DEC-054](../decisions/DEC-054_PHASE6_OUTBOUND_COLLECTION_OPERATION_IDENTITY.md) — durable prepared/unknown provider operation, tenant-key uniqueness and no blind redispatch | [`payment-collection-constraints.integration.test.ts:13–142`](../../packages/database/src/payment-collection-constraints.integration.test.ts#L13-L142); [`payment-collection-runtime-role.integration.test.ts:88–112`](../../packages/database/src/payment-collection-runtime-role.integration.test.ts#L88-L112) | [`digital-collection-outcomes.integration.test.ts:24–53`](../../apps/api/test/digital-collection-outcomes.integration.test.ts#L24-L53); [`digital-collection-concurrency.integration.test.ts:18–83`](../../apps/api/test/digital-collection-concurrency.integration.test.ts#L18-L83) | **KEEP** UNKNOWN/throw without duplicate dispatch, one CAS winner, scoped reference and rollback. |
| [DEC-055](../decisions/DEC-055_PHASE6_PROVIDER_EVENT_AUTHORITY_AND_RECONCILIATION.md) — authenticated provider facts, dedupe and safe out-of-order processing | [`provider-event-runtime-role.integration.test.ts:189`](../../packages/database/src/provider-event-runtime-role.integration.test.ts#L189-L189) | [`provider-event-authentication.integration.test.ts:16–59`](../../apps/api/test/provider-event-authentication.integration.test.ts#L16-L59); [`provider-event-concurrency.integration.test.ts:22–154`](../../apps/api/test/provider-event-concurrency.integration.test.ts#L22-L154); [`provider-event-collection.integration.test.ts:120–245`](../../apps/api/test/provider-event-collection.integration.test.ts#L120-L245) | **KEEP** invalid signatures/no writes, cross-tenant reference, replay, reordered failure, rollback and retry. |
| [DEC-056](../decisions/DEC-056_PHASE6_REFUND_AUTHORITY_AND_CORE.md) — independently auditable bounded Refund, never refund more than net collected | [`provider-event-runtime-role.integration.test.ts:236`](../../packages/database/src/provider-event-runtime-role.integration.test.ts#L236-L236) | [`refund-concurrency.integration.test.ts:13–95`](../../apps/api/test/refund-concurrency.integration.test.ts#L13-L95); [`provider-event-refund.integration.test.ts:116–184`](../../apps/api/test/provider-event-refund.integration.test.ts#L116-L184) | **KEEP** concurrent over-refund prevention, audit rollback, no foreign correlation. |
| [DEC-057](../decisions/DEC-057_PHASE6_FINANCIAL_RELEASE_AND_PROJECTIONS.md) — *current* effective policy at handoff, no silent financial rewrite | [`financial-policy-migration.integration.test.ts:124–184`](../../packages/database/src/financial-policy-migration.integration.test.ts#L124-L184) | [`complete-handoff-financial-release.integration.test.ts:58–190`](../../apps/api/test/complete-handoff-financial-release.integration.test.ts#L58-L190); [`complete-handoff-financial-command-races.integration.test.ts:56–234`](../../apps/api/test/complete-handoff-financial-command-races.integration.test.ts#L56-L234) | **KEEP** refund independence, current-policy recheck under concurrent cash/provider changes, complete absence of terminal effects on failure. |
| [DEC-064](../decisions/DEC-064_GUEST_BROWSER_ENTRY_TRANSPORT.md) — consumed/revoked/expired scoped bearer, exact visitor BrowserSession, idempotent switch | [`guest-browser-session-lock-expiry.integration.test.ts:63–103`](../../packages/database/src/guest-browser-session-lock-expiry.integration.test.ts#L63-L103); [`guest-browser-session-context-switch-failures.integration.test.ts:94–261`](../../packages/database/src/guest-browser-session-context-switch-failures.integration.test.ts#L94-L261) | [`payment-guest-api.integration.test.ts:134–208`](../../apps/api/test/payment-guest-api.integration.test.ts#L134-L208) and guest BrowserSession HTTP suites | **KEEP** expiry race under lock, partial switch rollback, identical retry, no cross-visit data. |
| [DEC-078](../decisions/DEC-078_COMPANY_ADMIN_MFA.md) — correct User-factor-session binding, replay monotonicity, sensitive freshness, no secret leakage | [`mfa-constraints.integration.test.ts:121–221`](../../packages/database/src/mfa-constraints.integration.test.ts#L121-L221); [`mfa-recovery-constraints.integration.test.ts:108–163`](../../packages/database/src/mfa-recovery-constraints.integration.test.ts#L108-L163); [`mfa-runtime-role.integration.test.ts:87–256`](../../packages/database/src/mfa-runtime-role.integration.test.ts#L87-L256) | [`staff-mfa-assurance.integration.test.ts:63–110`](../../apps/api/test/staff-mfa-assurance.integration.test.ts#L63-L110); [`staff-mfa-session-races.integration.test.ts:91–252`](../../apps/api/test/staff-mfa-session-races.integration.test.ts#L91-L252); [`staff-mfa-security.integration.test.ts:101–229`](../../apps/api/test/staff-mfa-security.integration.test.ts#L101-L229) | **KEEP** factor retirement, refresh-replay, logout, 8h/30m/5m, bad proof and no secret audit; no source-text substitute. |
| [DEC-079](../decisions/DEC-079_MANAGEMENT_AUDIT_SCOPES.md) / [DEC-082](../decisions/DEC-082_MANAGEMENT_AUDIT_VISIBILITY.md) — historical tenant audit vs platform security audit, safe projection and exact reader authorization | [`audit-foundation-constraints.integration.test.ts:170–277`](../../packages/database/src/audit-foundation-constraints.integration.test.ts#L170-L277); [`management-audit-index.integration.test.ts:87–96`](../../packages/database/src/management-audit-index.integration.test.ts#L87-L96) | [`management-audit-authorization.integration.test.ts:51–239`](../../apps/api/test/management-audit-authorization.integration.test.ts#L51-L239) | **KEEP** scoped historical reads, account-audit separation, no non-member scope leaks. |
| [DEC-080](../decisions/DEC-080_COMPANY_ADMIN_AUTHORITY.md) / [DEC-081](../decisions/DEC-081_STAFF_ROLE_AND_ACCESS_LIFECYCLE.md) / [DEC-083](../decisions/DEC-083_MANAGEMENT_SETTINGS_SCOPE.md) — exact current MFA/role/grant and narrow mutation functions; no generic table DML | [`runtime-authority-privileges.integration.test.ts:203–251`](../../packages/database/src/runtime-authority-privileges.integration.test.ts#L203-L251); [`management-settings-runtime-role.integration.test.ts:172–289`](../../packages/database/src/management-settings-runtime-role.integration.test.ts#L172-L289) | [`dashboard-location-authorization.integration.test.ts:13–163`](../../apps/api/test/dashboard-location-authorization.integration.test.ts#L13-L163); [`dashboard-authorization-fence-concurrency.integration.test.ts:24–63`](../../apps/api/test/dashboard-authorization-fence-concurrency.integration.test.ts#L24-L63) | **KEEP** same-Org other-Location denial, grant revocation race, sensitive MFA, closed function EXECUTE. |
| [DEC-094](../decisions/DEC-094_LOCATION_LIFECYCLE.md) — only authorized state/currency/timezone commands; history preserved | [`location-lifecycle-runtime-role.integration.test.ts:80–265`](../../packages/database/src/location-lifecycle-runtime-role.integration.test.ts#L80-L265) | [`live-history-native-http.integration.test.ts:228`](../../apps/api/test/live-history-native-http.integration.test.ts#L228-L228) is **lab-gated** | **KEEP** forbidden generic DML and forged audit; lab-only Live revocation does not establish main CI coverage. |
| [DEC-099](../decisions/DEC-099_SHIFT_PRESENCE_FOUNDATION.md) / [DEC-100](../decisions/DEC-100_SHIFT_PRESENCE_EXCEPTION_AUTHORITY.md) — strict scope/epoch, privacy and immutable decision, exception single consumption | [`shift-presence-persistence.integration.test.ts:11–183`](../../packages/database/src/shift-presence-persistence.integration.test.ts#L11-L183); [`shift-presence-runtime-role.integration.test.ts:25–113`](../../packages/database/src/shift-presence-runtime-role.integration.test.ts#L25-L113); [`shift-presence-convergence.integration.test.ts:58–198`](../../packages/database/src/shift-presence-convergence.integration.test.ts#L58-L198) | Same-member Shift eligibility/race tests above | **KEEP** cross-Location substitution, privacy-column absence, self-approval denial and retention boundaries. |
| [DEC-102](../decisions/DEC-102_LIVE_OPERATIONS_HISTORICAL_STAFF_ATTRIBUTION.md) — canonical Parker = coherent Task+Dispatch+Audit, original checker distinct, null on unverified, exact viewer grant/MFA | Indexed historical read schema source; [migration #79 in manifest](../../packages/database/src/migration-manifest.ts#L79-L80) | [`live-history-read-authorization.test.ts:113–272`](../../apps/api/test/live-history-read-authorization.test.ts#L113-L272); [`live-history-read-authorization-concurrency.integration.test.ts:110–156`](../../apps/api/test/live-history-read-authorization-concurrency.integration.test.ts#L110-L156); [`live-history-dense100-http.integration.test.ts:122–124`](../../apps/api/test/live-history-dense100-http.integration.test.ts#L122-L124) | **KEEP**, but current real PostgreSQL authorization race/HTTP/Dense100 tests are **Windows disposable-lab only**. R: build separate safe CI-compatible evidence; never reinterpret [`dashboard-task-assignee-history.test.ts:10–41`](../../apps/api/test/dashboard-task-assignee-history.test.ts#L10-L41) (historical persisted assignee) as proof of physical Parking completion actor. |
| [DEC-104](../decisions/DEC-104_VERIFIED_CONDITION_PHOTO_BYTE_EVIDENCE.md) — verified private bytes, cross-tenant photo object identity, no metadata-as-evidence | [`condition-photo-p1-integrity.integration.test.ts:58–177`](../../packages/database/src/condition-photo-p1-integrity.integration.test.ts#L58-L177); [`condition-photo-p1-negative.integration.test.ts:57–223`](../../packages/database/src/condition-photo-p1-negative.integration.test.ts#L57-L223); [`condition-photo-runtime-privileges.integration.test.ts:104–186`](../../packages/database/src/condition-photo-runtime-privileges.integration.test.ts#L104-L186) | API protected photo suites selected by exact manifest | **KEEP**, owner-attested #215 runtime/maintenance/public grants and byte-evidence negative cases. Decision accepts architecture, expressly does not certify provider/physical Android release. |
| **[DEC-107 — Proposed](../decisions/DEC-107_EMERGENCY_TASK_TAKEOVER.md)** — exceptional current-owner transfer with CAS, receipt, immutable A/B history, exact MFA/Location, custody epoch and tracking | **No dedicated `packages/database/src` #352 test**. Source SQL exists in [migration 104](../../packages/database/prisma/migrations/20261029010400_issue352_emergency_dispatch_type/migration.sql#L1-L2) and [105:5–151](../../packages/database/prisma/migrations/20261029010500_issue352_emergency_takeover_persistence/migration.sql#L5-L151): scoped FKs, version checks, immutable receipt/segment-owner triggers. [Manifest:31–33](../../packages/database/src/issue304-migration-source-appendix.test.ts#L31-L33) | Eight API `issue352-*.integration.test.ts` suites / **63 static registration sites**: [persisted enum/FK/role/trigger negative](../../apps/api/test/issue352-takeover-persistence.integration.test.ts#L13-L132), [cross-tenant/MFA/revocation/invalid reason](../../apps/api/test/issue352-takeover-authority.integration.test.ts#L30-L148), [CAS/replay/proof state](../../apps/api/test/issue352-takeover-command.integration.test.ts#L71-L173), [commit/rollback/lost response/SQL lock](../../apps/api/test/issue352-takeover-races.integration.test.ts#L24-L185), [A→B→A xid8 proof](../../apps/api/test/issue352-takeover-custody-xid.integration.test.ts#L76-L146), [GPS owner](../../apps/api/test/issue352-takeover-tracking.integration.test.ts#L57-L138), [Supervisor Tasks restricted scope and races](../../apps/api/test/issue352-supervisor-tasks.integration.test.ts#L61-L238) / [race tests](../../apps/api/test/issue352-supervisor-tasks-races.integration.test.ts#L35-L152) | **KEEP ALL; policy/compatibility decision is a gate.** Source-level implementation and 63 test registrations do not equal executed 30-scenario acceptance, PG success or an Accepted DEC. Keep exact negative/grant/custody/latest epoch and supervisor narrowness; verify current migration and code against Proposed DEC in integrated review. |

## Negative-case ledger: evidence that must survive any rewrite

All items below are **source-declared assertions**, not verified passing
database outcomes from this review.

| Risk | Exact preserved counterexample / check |
| --- | --- |
| Cross-tenant and cross-Location FK bypass | A cross-Organization `membership_location_access` is rejected at [`schema.integration.test.ts:1277`](../../packages/database/src/schema.integration.test.ts#L1277-L1277); foreign Session Location/Vehicle/Customer/three membership actors at [2131–2205](../../packages/database/src/schema.integration.test.ts#L2131-L2205), same-Org wrong Location ParkingSpot/KeySlot at [2221–2259](../../packages/database/src/schema.integration.test.ts#L2221-L2259), and foreign financial Payment at [`payment-collection-constraints.integration.test.ts:142–147`](../../packages/database/src/payment-collection-constraints.integration.test.ts#L142-L147). |
| No active-object duplication | One ACTIVE Shift per membership expects unique index `23505` [schema:1337–1347](../../packages/database/src/schema.integration.test.ts#L1337-L1347). Same-Location active Vehicle Session and current spot/slot collisions expect `23505` at [2340–2445](../../packages/database/src/schema.integration.test.ts#L2340-L2445); Task intended active concurrency [`task-active-concurrency.integration.test.ts:54`](../../packages/database/src/task-active-concurrency.integration.test.ts#L54-L54). |
| History / audit immutability | Runtime UPDATE/DELETE/TRUNCATE denied on Audit/Intake [`runtime-role.integration.test.ts:545–691`](../../packages/database/src/runtime-role.integration.test.ts#L545-L691), scoped wrong audit bindings [`audit-foundation-constraints.integration.test.ts:179–229`](../../packages/database/src/audit-foundation-constraints.integration.test.ts#L179-L229), fake EMERGENCY_TAKEOVER blank reason rejected `23514` [`issue352-takeover-persistence.integration.test.ts:118–132`](../../apps/api/test/issue352-takeover-persistence.integration.test.ts#L118-L132). |
| Real rollback, not only error message | Injected Audit failure rolls back Task/Dispatch [`dispatch-assignment.integration.test.ts:173`](../../apps/api/test/dispatch-assignment.integration.test.ts#L173-L173), Shift [`shift-start.integration.test.ts:183`](../../apps/api/test/shift-start.integration.test.ts#L183-L183), Payment [`payment-concurrency-atomicity.integration.test.ts:66`](../../apps/api/test/payment-concurrency-atomicity.integration.test.ts#L66-L66), Refund [`refund-concurrency.integration.test.ts:55`](../../apps/api/test/refund-concurrency.integration.test.ts#L55-L55), and full takeover Task/Session/receipt/audit/tracking/proof [`issue352-takeover-races.integration.test.ts:71`](../../apps/api/test/issue352-takeover-races.integration.test.ts#L71-L71). |
| Unknown payment outcome / duplicate reconciliation | Adapter failure and unknown never redispatch [`digital-collection-outcomes.integration.test.ts:24–53`](../../apps/api/test/digital-collection-outcomes.integration.test.ts#L24-L53); invalid provider authentication has no writes [`provider-event-authentication.integration.test.ts:16–59`](../../apps/api/test/provider-event-authentication.integration.test.ts#L16-L59); concurrently duplicated provider event has one winner [`provider-event-concurrency.integration.test.ts:44`](../../apps/api/test/provider-event-concurrency.integration.test.ts#L44-L44). |
| MFA bypass / stale authority | `mfa-constraints` protects User/session-factor ownership and replay [`mfa-constraints.integration.test.ts:121–221`](../../packages/database/src/mfa-constraints.integration.test.ts#L121-L221); refresh/logout and factor replacement races are [`staff-mfa-authority-races.integration.test.ts:92–212`](../../apps/api/test/staff-mfa-authority-races.integration.test.ts#L92-L212); Proposed takeover Admin fails stale sensitive MFA with **no Task mutation** [`issue352-takeover-authority.integration.test.ts:40–57`](../../apps/api/test/issue352-takeover-authority.integration.test.ts#L40-L57). |
| Live history identity vs active assignment | [DEC-102:38–53](../decisions/DEC-102_LIVE_OPERATIONS_HISTORICAL_STAFF_ATTRIBUTION.md#L38-L53) requires coherent completion-pair evidence and null-unproven Parker. The [#299 Task assignee projection](../../apps/api/test/dashboard-task-assignee-history.test.ts#L10-L53) checks different semantics. Lab-gated [live concurrency](../../apps/api/test/live-history-read-authorization-concurrency.integration.test.ts#L108-L158) does not execute on ordinary Linux CI. |
| Takeover must not fabricate key possession | [`issue352-takeover-command.integration.test.ts:18–46`](../../apps/api/test/issue352-takeover-command.integration.test.ts#L18-L46), [`issue352-takeover-custody-xid.integration.test.ts:76–146`](../../apps/api/test/issue352-takeover-custody-xid.integration.test.ts#L76-L146) expressly cover later transaction proof, same-time ties and A→B→A custody revocation. Preserve `xid8` ordering, not naive UUID/event-time inference. |

## Gaps, risks and candidate test rewrites

1. **Critical verification/policy gate — DEC-107 Proposed with landed
   persistence.** The focused decision and log are still Proposed
   [DEC-107:1–6](../decisions/DEC-107_EMERGENCY_TASK_TAKEOVER.md#L1-L6).
   Migrations 104/105 and source tests provide substantial reviewable
   implementation evidence, but do not grant acceptance.
   [DEC-107:168–172](../decisions/DEC-107_EMERGENCY_TASK_TAKEOVER.md#L168-L172)
   requires real PostgreSQL 30-scenario proof, commit/rollback races,
   mounted EN/AR Dashboard E2E and independent integrated review.
   **Action:** reconcile final compatibility/decision status through the
   approved decision process; preserve eight API suites and collect exact
   CI/PG run proof. The matrix did not execute them, and there is no
   dedicated DB-package #352 suite despite API's DB-level contract tests.
2. **Significant test coverage gap — historical authority race proof is
   opt-in Windows-only.** [`live-history-owned-lab.ts:1–19`](../../apps/api/test/live-history-owned-lab.ts#L1-L19)
   requires `win32`, exactly `127.0.0.1:55449`,
   `valet276test/postgres`, and matching migration URL. Consequently,
   [live-history concurrency:108](../../apps/api/test/live-history-read-authorization-concurrency.integration.test.ts#L108-L108),
   [native HTTP:72](../../apps/api/test/live-history-native-http.integration.test.ts#L72-L72)
   and [Dense100 HTTP:122](../../apps/api/test/live-history-dense100-http.integration.test.ts#L122-L122)
   **do not run in Linux GitHub CI by default**. The isolated guard is
   deliberate and protects against destructive targeting; do not remove it
   or route the fixture to CI's shared PG instance. **R:** build a newly
   attested CI-compatible fixture preserving the real lock/revocation tests,
   dense history, injected conflicts and EXPLAIN provenance before relying
   on release automation.
3. **Significant conditional DB test gap — isolated #313/#316 suites.**
   [`rating-analytics-runtime-role.integration.test.ts:9,215`](../../packages/database/src/rating-analytics-runtime-role.integration.test.ts#L9-L9)
   and [`guest-information-test-context.ts:7`](../../packages/database/src/guest-information-test-context.ts#L7-L7)
   opt into specific disposable DB runs using
   `ISSUE313_ISOLATED_DB_TEST=1` / `ISSUE316_ISOLATED_DB_TEST=1`;
   [guest information suite uses skipIf](../../packages/database/src/guest-information-migration.integration.test.ts#L18-L20).
   A classifier-owned file can therefore be reported as collected while
   executing **zero substantive cases** with defaults. Do not remove
   isolation. **R:** add explicitly scheduled attested runs and assert
   expected nonzero executed-case counts where applicable.
4. **Significant migration proof gap — schema/manifest different layers.**
   [106-directory source manifest](../../packages/database/src/issue304-migration-source-appendix.test.ts#L13-L43)
   tests enumeration but cannot prove that a **populated old schema** upgrades
   through 104/105/106 with every FK, trigger, grant and historical row intact.
   Several dedicated migration tests test upgrades (e.g.
   [`staff-onboarding-migration.integration.test.ts:161–203`](../../packages/database/src/staff-onboarding-migration.integration.test.ts#L161-L203)).
   For #352, the [API persistence test](../../apps/api/test/issue352-takeover-persistence.integration.test.ts#L13-L69)
   checks live catalog and connected role after fixture setup; it does not
   explicitly assert old, unattributed pre-#352 tracking segments survive a
   **database upgraded from pre-104 content**. **R:** add such migration
   preservation proof in a separately reviewed code task.
5. **R opportunity — avoid treating source-string checks as semantic
   substitutes.** [`dashboard-task-assignee-history.test.ts:10–53`](../../apps/api/test/dashboard-task-assignee-history.test.ts#L10-L53)
   tests SQL-fragment inclusion, not DB-row behavior. Keep it as a fast
   regression tripwire and preserve the distinct DEC-102 *historically proven
   Parker* semantics under PostgreSQL, HTTP and mounted visual tests.
6. **R opportunity — fixture duplication and file size, conditional on
   evidence.** [`schema.integration.test.ts`](../../packages/database/src/schema.integration.test.ts)
   has ~7,484 lines and mixes foundational FK/uniqueness with historical
   migration checks. Domain-wise extraction to separately named suites may
   ease review, but retain the same database identity, exact SQLSTATE names,
   fixtures, cleanup and all negatives. Broad reuse of a mutable DB across
   files/parallel workers risks tenant bleed and false green; measure
   migration/provisioning stage costs first. Privilege and real-postgres
   checks must never be replaced by in-memory mocks.
7. **R opportunity — declare effective executed cases.** Current ownership
   classification counts files, while `it.each` creates multiple runtime
   cases and `runIf/skipIf` gates whole suites. Coverage reports should
   publish exact SHA, project, discovered files, collected cases, executed,
   skipped, passed, failed, and negative-case IDs. Explicitly account for
   environment-gated tests and do not interpret static test-name counts as
   CI execution.

## Validation of this audit

- **PASS:** `classifyPackageTests({packageKind:"database",rootDir:"packages/database/src"})`
  on the pinned worktree returned **102 exactly-owned files** with the
  **43/43/8/8** project distribution above.
- **PASS:** physically enumerated **106 migration directories**, cross-checked
  the source manifest's explicit 104/105/106 suffix. Manifest test **read but
  not run** (Vitest dependency absent locally).
- **PASS:** `node --test scripts/test-harness/classification-ownership.test.mjs scripts/test-harness/issue215-api-classification.test.mjs`:
  **6/6 passed**, including API/DB exactly-one owners, protected basename
  negative cases and Issue #215 target ownership identity.
- **NOT RUN:** any PostgreSQL-backed `packages/database` or `apps/api`
  integration test, migration replay, actual privileges against an ephemeral
  role, private lab, E2E or full CI; the isolated worktree has no installed
  `packages/database/node_modules/pg` or Vitest. All DB SQLSTATE/negative
  cases above are verified **in the authored test source** only.
- **UNCHANGED:** schema, migrations, application code, harness, CI, tests and
  neighboring worktrees. No security-readiness or merge certification is
  inferred from this documentation-only review.
