# U-002 implementation handoff — conditional, no runtime GO

Scope: five previously confirmed LocationAccess protected-delivery paths.
Planning outcome: **DECISION REQUIRED**. Implementation must not start until
the Owner selects the response fence and the DEC-081 emergency rule is proved
compatible. The independent reviewer must review this specification.

## Exact conditional implementation sequence

1. **Protocol gate (no production change yet).** Agree an observable
   server-side protected-delivery point: `ServerResponse.finish` for fully
   written protected response or `close` after demonstrable abort, never
   handler promise completion or `response.end` enqueue. Approve finite
   delivery duration, maximum bytes, admission and pool budget *only from*
   test numbers; do not invent an operational SLO. Choose explicitly how
   emergency current access preempts live responses cluster-wide.
2. **Fail-closed lease experiment.** With task-owned PG17/Node HTTP and
   an isolated harness, prove that under the chosen connection-lease owner,
   a forced backend failure, watchdog timeout, response cancellation, process
   drain and abrupt socket `close` cannot allow an unsafe revoke COMMIT
   while the old protected body is still being emitted. Repeat with two
   LM readers, two CA readers, mixed CA+LM, a writer and pool max 4.
   If a counterexample exists, reject
   the session-lock design and return to architecture review; do not mask
   it with a longer timeout.
3. **Narrow backend fence after GO only.** For grant-dependent LM/Supervisor
   readers only, use a persisted role hint, then acquire one owned
   PostgreSQL session-level `SHARED` advisory lock on the existing
   `staff-management-org:<organizationId>` domain before the protected
   grant authorization snapshot. Recheck the role under lock; deny an
   unexpected transition before emitting data. Live Map must acquire
   before `BEGIN REPEATABLE READ`. Company Admin readers **bypass this
   SHARED session lock** and retain current
   `authorizeCompanyAdminManagement` EXCLUSIVE transaction advisory
   and MFA rules. Otherwise two CA readers can deadlock attempting to
   upgrade shared sessions to exclusive transactions. Use the **same**
   backend for current grant-dependent authorization/projection,
   then end the short SQL transaction while retaining the advisory session
   fence. Buffer and validate bounded JSON, own Express `finish`/`close`,
   abort on any unsafe lease state before release, then unlock/release once.
   No second checkout while holding an advisory session lock. Canonical
   writer remains existing EXCLUSIVE transaction lock through COMMIT.
4. **Five path adaptations after GO only.** Use the fenced context to
   re-read authoritative session, User, membership, Organization, Location
   and grants; preserve CA MFA and Supervisor active Shift rules.
   For Visit Contacts, compute aggregate/cursor from retained grant scope,
   or reject the whole pending response. Preserve all existing public
   response schemas and error concealment.
5. **Real GREEN verification.** Replay unchanged RED scenarios and new
   post-SQL/pre-HTTP/slow-client barriers. Require server `finish`/abort
   plus actual revoke COMMIT ordering and body sentinel checks. Test real
   rollback, ambiguous COMMIT, 55P03, 57014, reachable 40001, deadlock,
   retry exhaustion, pool pressure, emergency disable and cancellation;
   run #315/#319 regressions before and after. Any RED result remains a
   **security FAIL**, even if a characterization test process exits 0.
6. **Final separate review.** Compare the runtime diff against DEC-108,
   DEC-081 and this design; reject UI/schema/migration/public API changes;
   independently review pressure, cleanup and tenant negatives. A later PR,
   merge, deployment or Issue closure requires its own authorization.

## Exact likely runtime touch envelope (no changes authorized here)

| Classification | Files or subsystem | Why and constraints |
| --- | --- | --- |
| **DEFINITELY RELEVANT** | `apps/api/src/modules/tracking/live-map.controller.ts`, `live-map-query.ts`, `live-map-read-authorization.ts`, `live-map-authorization.ts` | Explicit protected transport ownership; consistent one-backend RR snapshot and exact grants/Shift/CA MFA. Do not change current role policy or map projection. |
| **DEFINITELY RELEVANT** | `apps/api/src/modules/dashboard/dashboard-scope-discovery.controller.ts`, `dashboard-scope-discovery.service.ts` | Exactly F333-B Location list, with intact cursor and multi-Organization membership semantics. Organization list is a separate boundary. |
| **DEFINITELY RELEVANT** | `apps/api/src/modules/management/management-visit-contact.controller.ts`, `management-visit-contact-authorization.ts`, `management-visit-contact.service.ts` | Three GETs use current grant array and private aggregate/history rows; correction write methods unaffected. |
| **DEFINITELY RELEVANT** | `apps/api/src/common/database/postgres-lease.ts`, `runtime-postgres-policy.ts`, `bounded-postgres-pool.ts`, `postgres-transaction.ts` | Source audit of lease watchdog, session ownership and one-backend transaction integration required; **actual modifications conditional** on passing fault-injection and release design. No silent change to global pool budgets or helpers. |
| **DEFINITELY RELEVANT** | `apps/api/src/common/http/api-operation-runner.ts`, Nest/Express controller response adapter, `apps/api/src/main.ts`, `session-photo-controller.ts` precedent | Verify exact serialization and terminal events. Prefer scoped controller/transport adapter; shared runner/main/photo changes only if truly necessary, otherwise review-only. |
| **CONDITIONAL ON OWNER DECISION** | Controlled emergency `apps/api/tools/security-disable/persistence.ts`; user-security lock, Staff auth/session/incident abort coordination | E-001 could require a new precommit cross-instance response-cancel acknowledgement. Its semantics, availability and authority are not approved; don't change the operator command incidentally. |
| **CONDITIONAL ON OWNER DECISION** | `management-visit-contact-search-query.ts`, `management-visit-contact-history-query.ts`, cursor/projection code | Only if whole-scope recomputation under the retained grant set cannot be achieved by existing query inputs. |
| **CONDITIONAL ON OWNER DECISION** | Narrow new `common/http` / database delivery-fence helper(s), max-size and admission implementation | A reusable helper is justified only for the five paths sharing exactly the same vetted protocol; each authored source file <=300 physical lines. |
| **NOT JUSTIFIED YET** | New migration, table, authorization epoch, privilege grant, standalone service, new public endpoint, role/MFA policy, location/company configuration contract | No Accepted decision approves these and epochs without emission serialization leave a race. |
| **NOT JUSTIFIED YET** | Any `apps/dashboard` or Policies Studio file, `apps/valet`, `apps/customer`, packages UI/contracts, new CSS/layout | Global Owner UI freeze, no new public protocol. |
| **NOT JUSTIFIED YET** | Existing #309 photo-runtime implementation | Its enqueue-scoped witness differs; inspect its cancellation pattern only. |

Because several files are already near architecture limits, inspect authored
line counts and extract narrowly rather than appending a large common
controller or 300+ line source. Preserve accepted repository modular monolith,
current permission commands, protected audit atomicity, no new database
constraints/indexes. There are **no business ValetSession/Task/Dispatch
transitions** and no Company-default/Location-override configuration changes.

## Specific Owner decisions required

| ID | Selection or proof required | Why it blocks production GO |
| --- | --- | --- |
| E-001 | A concrete cross-instance emergency-disable preemption ordering, bounded waiting and terminal transport behavior accepted under DEC-081 | Current controlled disable has independent `staff-user-security` lock; org fence alone cannot stop live response; user SHARED fence may delay disable. |
| L-001 | Lock/lease ownership and backend failure handling under actual Node+PG cancellation and shutdown | Runtime watchdog can drop session lock before `finish`, invalidating ordinary revoke ordering. |
| C-001 | Response bytes, maximum delivery lifetime, per-instance/global admission, pool budget and measured ordinary revoke wait | Slow/stalled client must not starve writer, leased DB connections or emergency. |
| P-001 | Fail-closed whole response vs exact recomputation from remaining grants for sensitive mixed-Location Visit Contacts | Counts, cursor, latest visit, associated vehicles and phone may encode revoked Location even if row ids removed. |
| R-001 | Whether to address **other** in-flight role/status/session/MFA policy in a separate task after this grant-specific remediation | DEC-108 expressly does not change these Accepted lifetime contracts. |

**Recommended direction:** conditional one-connection, bounded
`staff-management-org` session advisory response fence for *ordinary*
LocationAccess revoke; a separate, stronger emergency preemption contract
and lease-loss proof must be agreed before this can be considered implementable.
If E-001 or L-001 cannot be proved with existing architecture, choose a
different verified protocol; do not reinterpret DEC-081 or loosen DEC-108.

## Scope and verification acceptance

Authorized here: sanitized design, test-only deterministic experiments,
read-only review, checked documentation commit and push. Not authorized:
runtime authorizer/controller/pool/operator changes, production configuration,
new tests disguised as GREEN, migration/role/API/UI modifications, PR, merge,
deployment or closing #333. Reference
`TEST_AND_FAILURE_MATRIX.md` and
`../w6/U002_GREEN_ACCEPTANCE_ARCHITECTURE.md` for the reproducible
pre-/post-implementation acceptance gates.
