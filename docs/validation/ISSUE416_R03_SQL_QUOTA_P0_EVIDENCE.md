# Issue #416 R03 — SQL-only quota discount P0 evidence and closure gate

Status (2026-11-14): **SOURCE DEFECT CONFIRMED; EFFECTIVE POST-MIGRATION ACL / R03 ENFORCEMENT NOT VERIFIED.** This file is security evidence, not a cutover instruction or migration authorization.

## Verified source-level attack path

1. `packages/database/scripts/provision-runtime-role.mjs:211–241` explicitly grants the ordinary runtime role `SELECT`, column-level `INSERT(scope,key_hash,state,request_class,group_key_hash)`, `UPDATE(state,group_key_hash)`, and `EXECUTE cleanup_expired_anti_abuse_events()` on `public.anti_abuse_events`.
2. `apps/api/src/modules/anti-abuse/anti-abuse.service.ts:121–134,140–165` counts and derives retry timing from **only** `PENDING` and `COUNTED` entries. The source `20260810001800_shared_durable_anti_abuse/migration.sql:17–19` explicitly permits `IGNORED` as a valid state. No inspected R03-specific SQL role restriction prevents the ordinary runtime role from applying its column-level state grant to R03 scope rows.
3. `apps/api/src/modules/auth/issue416-password-reset-redeem.service.ts` and the pre-JSON ingress initially use the public `AntiAbuseService.count()` for the redeem-IP 30 and canonical-credential 5 attempt budgets. Migration `20261113012500_issue416_redeem_scope_contract` adds those two scopes to the public scope CHECK but does not remove the update capability.
4. A party that already has **SQL access under the ordinary runtime database role**, including through a compromised runtime principal, can identify public R03 rows using the existing `SELECT` grant and change counted rows to `IGNORED` using the granted `UPDATE(state)` column privilege. That decreases the count seen by the public limiter. This is **not** evidence that a remote unauthenticated HTTP caller has a SQL injection path.
5. The same provisioner grants ability to insert state-valued rows. A runtime SQL actor may also distort or exhaust public scope counts. Application-only guards do not revoke the underlying role privileges.

**Secondary migration hazard:** `apps/api/src/common/database/runtime-database-readiness.ts:15–30,60–66` requires both legacy update-column grants as a **startup readiness** invariant. Removing those grants without coordinated changes to legacy Staff/Auth/Guest anti-abuse would make the current API fail readiness. Re-running `provision-runtime-role.mjs` can restore the grants. A superficial `REVOKE` therefore does not securely close R03 and may break unrelated operations.

## Required closed replacement boundary

- R03 quotas **must not** use the writable public `anti_abuse_events` rows as authoritative attempt history. Use independent private R03 tables owned by a checked `NOLOGIN NOINHERIT` principal with no ordinary runtime/PUBLIC/indirect-role DML or generic signer access.
- Enforce a cap of 30 attempts per trusted client IP per 15 minutes **including malformed bodies before JSON parsing**, and independently a cap of 5 attempts per canonical, valid `vspr1.` credential verifier key per 15 minutes. Compute privacy-scoped HMAC keys in trusted application custody; store no raw IP, token, password, signing material, or identifying free-form SQL text.
- Do a **separately committed**, serialized attempt admission under the PostgreSQL clock and fixed lock order **before** the business mutation. Reject on exhausted quota or absent trusted address, key custody, private DB role, clock assurance, or uncertain commit. No service-memory-only counter or fabricated receipt may authorize requests.
- Approved `PENDING` / `COUNTED` / `IGNORED` semantics must never allow a caller-chosen discount: attempts required to count despite malformed input, invalid password or business rollback must remain COUNTED. Distinguish an unresolved commit from a verified failure, with specific replay/receipt provenance. A counted-only terminal R03 attempt ledger needs explicit acceptance evidence that no R03 transition to `IGNORED` is legitimate; R02 four-scope `PENDING` reconciliation remains separate.
- Preserve the 4 independently atomic R02 issuance scopes (target 3, issuer 20, Organization 100, IP 30), generation/CAS and no raw-link replay. Do not reuse public `limiter_bindings` for R02 private reservation UUIDs.
- Verify `pg_catalog.has_*_privilege` **and actual negative SQL operations** for PUBLIC, ordinary runtime, inherited roles, provisioner reapplication *twice*, owner identity, `SECURITY DEFINER` overloads, and excluded legacy writers. Verify quota caps on **two genuine PG17 connections** in both lock orders, timeouts, rollback and unknown-COMMIT cases.

## Evidence gates at this checkpoint

| Gate | State | What was actually established |
| --- | --- | --- |
| Existing source privilege and count mismatch | **FAIL / P0** | Read actual provisioner, AntiAbuseService, readiness and scope migration sources. No live database query. |
| Private 133–135 R03 source development | **SOURCE-ONLY / NOT APPLIED** | Private 133–134 deny unbound INSERT. New forward-only 135 denies only public R03 reset-redeem scopes using a table CHECK; it does not revoke legacy grants or enable the private binder, and is untested on PG17. |
| SQL-only role deny after cutover | **NOT VERIFIED** | Neither effective PG17 ACL nor two-time provisioner test executed. |
| Trusted early HTTP ingress + canonical verifier admission | **BLOCKED** | Test-only mounted HTTP is not an authenticated private-ledger binder and production pre-parser remains unmounted. |
| Actual 30/5 concurrency, independent commit and business rollback | **NOT RUN** | No post-migration isolated PG17 proof. |
| Migration113 original W9 recovery | **DENIED** | Initial Docker Engine failure was followed by recovery of the engine. Exact original W9 container ID, image, retained volume and labels matched on read-only inspect, but container remained **EXITED** with no published port; current PostgreSQL migration-history/ACL cannot be re-attested. No restart or SQL. |

This P0 closure is prerequisite to replacing the unconditional SQL-unavailable gate or registering either of the two Staff password-reset controller classes (three planned routes). **No current local PASS permits production activation.**

## Additive source-only containment — Migration 135 (2026-11-14)

The new `20261113013500_issue416_r03_public_legacy_scope_deny` forward-only source refuses an existing public row with either reset-redeem scope and adds a validated `CHECK` forbidding those two scopes in `public.anti_abuse_events`. It leaves the old Staff Auth/Guest scopes and shared runtime grants untouched. Ordinary runtime SQL updates cannot evade the new CHECK *once actually applied*, but this is not proof that any target was migrated. W25 independently approved the SQL source **dormant only**; the paired 19-source migration pins and LF/CRLF Prisma ledger portability are separately subject to full exact-HEAD review. Installation requires an ACCESS EXCLUSIVE lock with a 5-second lock wait limit and 15-second per-statement timeout, so operational lock/blocking effects remain unverified. Original W9 Migration113 recovery remains DENIED.

This does **not** close the wider existing SQL-only mutable public anti-abuse risk for other legacy scopes, and it does not supply trusted R03 IP, canonical `vspr1.` HMAC custody, protected private 30/5 COMMITs or an enabled redemption endpoint. No PostgreSQL/production privileges were changed.