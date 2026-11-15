# VAYLET Issue #416 — security risk assessment

**Source pin:** db85db57fc5c3913a22d34ab5d9ef77269756301 (2026-11-15). **Nature:** independent source review and provisioner inspection, not a production pentest. The Owner reports no current production deployment, customers or operational workloads; that premise is not an independent infrastructure inventory. No real exploit performed against a shared DB, W9 or production. All findings below need actual effective role verification on an isolated PG17 fixture before being called reproduced.

## Threat capabilities

| Capability | Security guarantee / status |
|---|---|
| T1 Anonymous HTTP | Staff login requires raw password Argon2; reset routes unregistered and fail closed. No demonstrated anonymous reset bypass; HTTP pentest not completed. |
| T2 Authenticated employee | Current User/role/Org/location checks at API. No verified employee-to-admin HTTP exploit; require tenant negative tests. |
| T3 Authenticated management user | API checks current role, MFA, entitlement and Org. SQL-only legacy callers can supply a privileged actor ID if T5 is attained. |
| T4 Compromised Staff access/refresh bearer | A valid bearer may act until revoked; sensitive operations depend on current session-bound MFA. Stolen already-assured access token may inherit remaining assurance. |
| T5 SQL injection or ordinary runtime DB principal | Legacy granted session/MFA writes and callable definer actor IDs create conditional authority-forgery exposure; actual accepted API chain not yet reproduced. |
| T6 Compromised app host or signing key | Stronger than T5; a signed SQL protocol cannot prevent abuse by its own signer. Require key custody, containment and response procedures. |
| T7 DBA/migration owner | May modify schema and privileges; DB-internal proofs alone do not withstand this adversary. Require separation of duties/external evidence. |

## Findings — classifications and proof boundaries

### S01 — SQL runtime Staff session and refresh authority
- **Classification:** CONFIRMED SECURITY WEAKNESS — EXPLOITABILITY NOT FULLY PROVEN; **P0 to investigate and fix before public launch if effective T5 grants match source**.
- **Evidence:** packages/database/scripts/mfa-runtime-privileges.mjs:1-19,105-171 grants INSERT/UPDATE on staff_auth_sessions and staff_refresh_credentials; apps/api/src/modules/auth/staff-session-context.ts:42-74 authenticates a matching stored access token verifier; apps/api/src/modules/auth/staff-auth.service.ts:56-160 legitimately checks submitted Argon2 password and locks User on normal HTTP login.
- **Required attacker:** T5. **Potential impact:** mint/restore an accepted session without raw password. **Compensating checks:** ACTIVE User, token format, revocation/expiry, Argon2 on normal login; none prove the source of a SQL-only inserted session. **Exploit reproduced:** NO.
- **Minimum fix and test:** disallow ordinary SQL INSERT/revival/rotation authority except purpose-bound genuine credential writers. Test actual runtime role INSERT/UPDATE and subsequent real API session acceptance, including inheritance and provisioner replay twice. Do not revoke grants before Staff Auth has verified replacement.

### S02 — MFA factor/assurance origin can be mutable
- **Classification:** CONFIRMED SECURITY WEAKNESS — EXPLOITABILITY NOT FULLY PROVEN; **P0 conditional T5**.
- **Evidence:** mfa-runtime-privileges.mjs:11-34,180-207 grants session MFA timestamp/factor and factor/recovery write columns; apps/api/src/modules/auth/mfa/mfa-assurance-policy.ts:68-137 trusts DB-bound factor and assurance fields; mfa/mfa-step-up.service.ts:31-61 verifies real bearer/TOTP in normal API.
- **Required attacker:** T5. **Potential impact:** fabricated fresh assurance and sensitive management operation. **Compensating controls:** normal TOTP ceremony and session/factor recheck. **Exploit reproduced:** NO; factor triggers/constraints require live test.
- **Fix/test:** deny SQL-only assurance/factor creation and replay; trusted TOTP/recovery verifier must bind exact session/current factor/monotone step; verify synthetic SQL-only forgery followed by real management API denial.

### S03 — Legacy SECURITY DEFINER management functions trust actor UUID
- **Classification:** CONFIRMED SECURITY WEAKNESS — EXPLOITABILITY NOT FULLY PROVEN; **P0 conditional T5**.
- **Evidence:** packages/database/prisma/migrations/20261001005000_mgt_240b_lm_staff_authority/migration.sql:4-45 checks member/role/Org but no bearer/MFA; packages/database/prisma/migrations/20261001005100_mgt_240c_staff_onboarding_invites/migration.sql:249-323,325-391,393-418 defines role/status/location mutations with p_actor_membership_id; packages/database/scripts/staff-management-runtime-privileges.mjs:1-32 re-GRANTs EXECUTE to runtime; apps/api/src/modules/management/staff-management-mutation-repository.ts:51-123 submits actor ID.
- **Required attacker:** T5. **Impact:** possible unauthorized role/member/location mutation and tenant power escalation. **Compensation:** management-authorization.ts:80-175 correctly preflights HTTP User/company/MFA/entitlement. **Exploit reproduced:** NO; effective EXECUTE and complete SQL→API chain untested.
- **Fix/test:** revoke old callable overloads and replace only necessary operations with current bearer/MFA-bound authority, preserve last-admin and LM coverage; run synthetic cross-tenant SQL-function calls with real effective role and check resulting current API powers; prove provisioner cannot re-GRANT insecure functions.

### S04 — Mutable legacy anti-abuse counting
- **Classification:** CONFIRMED SECURITY WEAKNESS — EXPLOITABILITY NOT FULLY PROVEN; **P0 for currently exposed credential limiters under T5; P1 for future reset**.
- **Evidence:** apps/api/src/modules/anti-abuse/anti-abuse.service.ts:206-249,269-297 uses mutable PENDING/COUNTED/IGNORED; staff-auth.service.ts:131-154 marks IGNORED; classified-guest-counter.ts:41-83 includes classified guest group-key/state operations (verify separately which columns are INSERTed versus UPDATEd); issue416-password-reset-sql-readiness.ts:3-18 explicitly treats legacy UPDATE privileges as untrusted.
- **Required attacker:** T5 with UPDATE. **Impact:** discount/fabricate counting. **Exploit reproduced:** NO. **Fix/test:** independently committed append-only operation-bound limiter with private ACL and trusted IP; prove failed business transaction still counts and two-backend last-slot contention cannot exceed cap.

### S05 — Reset remains unimplemented and unexposed
- **Classification:** CONFIRMED UNAVAILABLE, **NOT APPLICABLE TO CURRENT DISABLED RESET EXPOSURE**; **P1 before enable**.
- **Evidence:** apps/api/src/modules/auth/issue416-password-reset-sql-readiness.ts:14-18 unconditionally throws; management/issue416-password-reset.service.ts:47,68; auth/issue416-password-reset-redeem.service.ts:63; auth/issue416-r03-private-attempt-admission.ts:18-36 also throws. Reset controllers not registered in app module search at this SHA.
- **Effect:** no real Reset issuance/redemption positive proof; UI mock tests are not production integration. **Fix:** leave OFF or complete independently approved design with PG17, mounted HTTP and browser tests.

### S06 — App tenant and MFA preflight is real but cannot certify SQL authority
- **Classification:** DEFENSE-IN-DEPTH, risk of concurrent state change **PLAUSIBLE BUT UNVERIFIED**; P0 only on demonstrated critical bypass.
- **Evidence:** management/management-authorization.ts:95-175 rechecks same Org, active role, MFA and commercial access; issue416-password-reset-authority.ts:21-49 limits target to ACTIVE sole membership; caller.ts:15-39 checks submitted bearer. Repeated locked SQL checks are needed before future mutation.
- **Required attacker:** T2/T3 for HTTP or T5 for DB corruption. **Exploit reproduced:** NO. **Test:** employee/LM/foreign-org/guessed ID, target across two companies and concurrent issuer role/F/Org revocation; audit any real bypass.
- **Additional T5 test:** attempt ordinary SQL poisoning of target User/membership role, Organization status and commercial entitlement, then verify whether a future Option B independent reset issuer can reject resulting unauthorized issuance. Protecting only Staff session/MFA rows does not automatically secure all mutable authorization facts.

### S07 — Development-only MFA bypass risk
- **Classification:** PLAUSIBLE BUT UNVERIFIED production exposure; P0 if deployable publicly. **Source:** mfa/mfa-assurance-policy.ts:108-115,193-216 short-circuits on localMfaBypassEnabled; reset preflight explicitly rejects bypass at issue416-password-reset-authority.ts:21-23. **Test:** production boot/config negative and privileged call; do not claim deployed exploit from existence of dev switch alone.

### S08 — Lock order / security CI and acceptance gaps
- **Classification:** CONFIRMED VERIFICATION GAP, not reproduced exploit; P0 for real Auth/MFA integrity on launch, P1 for Reset. **Source:** staff-auth.service.ts:169-185 joined FOR UPDATE of three tables; MFA uses different session/row order. **Test:** two-backend refresh/logout/MFA/user disable, rollback, timeout, UNKNOWN outcome; measure actual DB poststate and failed dependencies. On exact db85db57 workflow **CI #43732841463 completed SUCCESS**, but **Security CI #43732841365 completed FAILURE**. Its CodeQL gate reports total 60/existing 48/new 12/blocked 12; separate optional sanitized telemetry reports `SARIF_RULE_ID` failure, which must not conceal the actual CodeQL block. Other Security CI Gitleaks/Semgrep/Trivy/OSV jobs succeeded. 0/210 accepted Option A domain tests observed.

## Required security evidence

Inspect actual runtime role credentials on a uniquely attested disposable PG17: has_table_privilege, has_column_privilege, has_function_privilege, pg_auth_members, default ACL, SECURITY DEFINER effective owner/search_path, all overloads, and two provisioner replays. Perform only synthetic User/Org/Session mutations and a real API acceptance path, then clean only the exact isolated fixture. This review did NOT run those attacks. Preserve W9 and all historical migrations.

**Launch decision:** NOT READY until validated T1–T5 critical paths, required fixes and same-SHA CI/Security PASS. No confirmed T1 direct exploit or reproduced T5 account takeover has been established here; conditional SQL-role weaknesses must not be dismissed.
