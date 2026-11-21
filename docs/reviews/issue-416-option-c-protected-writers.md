# VAYLET Option C — targeted security writer boundaries

**Decision:** Owner approved 2026-11-15. **Scope:** protect existing Staff Auth, MFA, Management launch-critical paths; not universal VAP1 and not Company Admin Password Reset. This contract is an implementation constraint, not release sign-off.

## Independent PostgreSQL authorities

| Purpose | Proposed distinct login / environment | Allowed security writes | Not allowed |
| --- | --- | --- | --- |
| S01 Staff Auth | `vaylet_staff_auth_writer` / `STAFF_AUTH_WRITER_DATABASE_URL` | Verified-password login session/initial refresh, refresh rotation/replay-revocation, exact login metadata and legitimate reservation settlement within the original transaction | MFA factor/assurance fabrication, role/grant changes, arbitrary limiter discount, unauthenticated reset |
| S02 MFA | `vaylet_mfa_ceremony_writer` / `MFA_CEREMONY_DATABASE_URL` | Session-checked TOTP enrollment/activation, recovery lifecycle, replay-step progress, recent assurance, exactly scoped audit and admission settlement in the original ceremony transaction | Staff bearer minting/refresh, employee role/status/location changes, generic authority timestamp setter |
| S03 Management | `vaylet_management_writer` / `MANAGEMENT_WRITER_DATABASE_URL` | After current bearer and true MFA/tenant/actor authorization: exact role/status/location mutation, same-transaction audit, and `last_admin_activity_at` touch | MFA `mfa_authenticated_at`/`mfa_factor_id`, session/refresh verifier mint, arbitrary actor UUID impersonation |
| T5 ordinary runtime | existing `DATABASE_URL` | Only legacy read, safe logout/revocation and unrelated non-protected operations as explicitly accepted by tests | All security writes above, role inheritance/`SET ROLE`/privileged EXECUTE, revocation clearing, replay lineage tampering |

Every protected principal is `LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`, owns no objects or schema, has an independently rotated credential, and cannot `SET ROLE` to the other protected principals or `vap1_proof_owner`. Role/process credentials, connection pool, possession of the Staff bearer, proof of accepted MFA and tenant scope are **different security boundaries**. No generic privileged repository, SQL-execution endpoint or universal pool is allowed.

The bootstrap administrator owns cluster provisioning. The migration
administrator owns database provisioning and may hold PostgreSQL 17 creator
`ADMIN` memberships for the roles it creates. That authority can delegate
membership even when the direct `SET` and `INHERIT` options are false, so the
migrator is a trusted administrative principal. Protected NOLOGIN owners own
their designated objects. Runtime and operational Writers have no membership
path to administrative or ownership roles.

Before protected promotion the operator verifies that the supplied Runtime and
all three Writer credentials can connect to the intended primary and that
each connection resolves to the expected login. A credential failure leaves
the boundary in its current phase. Production probes use the same verified TLS
settings as the migration connection.

## Transaction and authorization properties

1. Preserve all existing RowLock/credential recheck/tenant/audit/limiter contracts as **one backend transaction per operation**. Never send one atomic command through multiple pools/connections or commit a privileged write before its audit/required settlement is durable.
2. A protected connection is acquired only for the exact operation that has already passed public HTTP authentication and actual raw password/TOTP/recovery verification (as applicable). Recheck User, current live session/refresh and MFA/tenant/actor authority inside that same write transaction; application checks outside it are insufficient.
3. For S03, `last_admin_activity_at` may be updated with the role/status/location/audit transaction **by the Management writer**, with `mfa_authenticated_at` and factor identity **unwritable**. Other Management activity-touch users must be inventoried; no ordinary-runtime extension of sensitive authority.
4. S01 login must not mint a token on a stale/mismatched verified Argon2id PHC; S01 refresh must keep one-winner/replay-revokes semantics. Revoked sessions remain irrevocable under every ordinary SQL/runtime/definer path. Unknown COMMIT must never silently repeat a credential write, mint a replacement, discount a counted attempt, or reveal a secret without exact readback.
5. S02 requires a genuine human-entered TOTP/recovery ceremony: a client-supplied timestamp, factor UUID or 'assured' flag is never sufficient. A completed ceremony may not retroactively attach to a different user/session. A previously stored MFA timestamp cannot be accepted as a fresh trusted proof after cutover without renewed ceremony.
6. S03 legacy `public.staff_management_set_role/status/location_access` actor-UUID definers must lose ordinary-runtime/PUBLIC EXECUTE, including after two reprovisioning runs. Same-company, Location Manager coverage, last-admin CAS and commercial authority still apply. No role/status/access change is committed without the matching audit event.
7. S04 is a separate scoped remedy, not a license to grant the protected writers generic access to `anti_abuse_events`. Preserve legitimate Staff, MFA, Guest class/group nonchargeable outcomes, independent COMMIT and bounded quotas. If quota settlement moves into a private SQL writer, ensure all involved operations remain atomic and the ordinary runtime cannot forge settlement.

## Safe activation and rollback

- Start all protected roles with exact positive/negative privilege-verifier checks in independent provisioning. `MIGRATION_DATABASE_URL` and all protected URLs must refer to the same attested PG server/database but have distinct usernames and secrets; application ordinary runtime never receives migration authority.
- Before retiring old rights, run genuine login/refresh/logout, factor enrollment/step-up/recovery and Management operations through their intended new backends on isolated PostgreSQL 17. Prove real cross-tenant/low-role denials and replay/lock/UNKNOWN paths; never declare a source-only permission check an exploit fix.
- **Forward-only change and guarded cutover:** revoke all ordinary table-level **and per-column** INSERT/UPDATE/EXECUTE including PUBLIC/default ACL/inherited roles, after last legacy-capable API worker is drained. A durable DB security boundary must cause later normal provisioning to preserve these revocations (or fail closed), not reintroduce old grants after restarts. Verify two idempotent provisioning calls in real PG17.
- If protected writer credential/pool is unavailable, fail authentication or mutation closed; no `DATABASE_URL` fallback. Rolling back to code that needs old direct writes is prohibited unless a separately approved maintenance rollback restores a **tested equivalent security boundary**. Preserving a broken but secure denial is preferable to silently reopening T5.
- No production cutover, main merge, deployment, or Draft PR #464 mutation is authorized. First-customer support recovery policy is independently blocked until an approved tested operational recovery capability exists.

## Required final evidence

W37's exact pre-fix successful T5 SQL→mounted API outcomes (six attack chains) are regression baselines. After each fix, run identical SQL with actual `DATABASE_URL` role; assert privilege denial and mounted HTTP 401/403/404 as appropriate, unchanged database role/session/assurance state. Confirm independent privileged genuine ceremonies succeed. Include effective role catalog, all relevant `has_column_privilege` (not merely table-level INSERT), `pg_auth_members` SET/INHERIT, PUBLIC/default ACLs, SECURITY DEFINER owner/search_path/EXECUTE, roles and PostgreSQL system ID, two provisioning runs, concurrency/rollback/UNKNOWN, Staff/Guest/Push, CodeQL and CI/Security CI **on one final SHA**. Preserve failing/red evidence as red until remediation is truly complete.
