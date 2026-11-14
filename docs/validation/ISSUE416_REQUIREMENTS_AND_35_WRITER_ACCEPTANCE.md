# VAYLET Issue #416 — requirement acceptance and U2 writer-family dispositions

**Assessment date:** 2026-11-14. **Verdict: PARTIALLY IMPLEMENTED — MATERIAL SECURITY GATES OPEN.** The inventory and privilege findings below are established from the checked-in repository source, **not from a migrated PostgreSQL deployment**. The locally integrated diagnostic `packages/database/issue416-writer-closure/check.mjs` always returns `BLOCKED` (exit 2) by construction. Source-only or mock/browser positives must not be recast as protected SQL, runtime ACL, production activation or complete feature evidence. See `ISSUE_416_IMPLEMENTATION_EXECUTION.md` for the exact latest SHA and test ledger.

## End-to-end requirement acceptance

| Requirement | Current outcome | Missing acceptance evidence |
| --- | --- | --- |
| Issuer ACTIVE global User, same-company ACTIVE ORG_ADMIN, current Staff session + sensitive 5-minute MFA + Org ACTIVE + entitlement | **PARTIAL source guard** | Verified challenge/SQL recheck under concurrent issuer/target/org/member mutations, real bearer/assurance source and PG17 denial |
| Target ACTIVE User, sole OrganizationMembership across **all statuses**, eligible Staff role and ACTIVE membership; multi-Location inside sole company allowed | **PARTIAL source preflight** | Real signed writer locks + 2-connection negative cardinality races, no Platform/admin/self/reset target |
| Canonical 32-byte CSPRNG `vspr1.` 43-char unpadded base64url, private verifier digest, DB-clock exactly 15 minutes | **PASS token source/DTO; SQL SOURCE-ONLY** | Actual private issued row, expiry and one-use DB transaction |
| Latest historical generation, expectedGeneration=0 only if none, operation UUID, same-payload replay-before-CAS, no secret redisclosure, reissue revokes predecessors | **PARTIAL source** | Real signed issue COMMIT, conflicts and UNKNOWN-COMMIT recovery against latest row |
| R02 four issuance scopes (3 target, 20 issuer, 100 org, 30 IP / 15m), atomic reservation + authoritative receipt finalizer | **PRIVATE SQL SOURCE-ONLY** | Trusted committed pre-domain R02 binder, signed domain writer, source-proven COUNTED/IGNORED and real PG17 concurrency |
| R03 30 trusted-IP attempts including malformed pre-parser JSON; 5 canonical credential attempts, both durable, separately committed, DB-clock 15m | **P0: OPERATIONAL BLOCKED** | Verified trusted private key custody, exact pre-parser production mount, private binder, SQL-only ACL negativity and 2-connection independent commits; source migrations 133–134 deliberately deny inserts |
| No SQL-only attempt discount or forgery, no public credential/IP/password material | **LEGACY P0 OPEN; 135 SOURCE-ONLY CONTAINMENT** | Private R03 no longer relies on old public counter at source; forward-only 135 adds a two-scope deny CHECK but is unapplied. Prove live DB ACL and full trusted 30/5 binder; old mutable public grants remain required by Staff Auth/Guest |
| Authentic VAP1 password/refresh/TOTP/recovery provenance, 18-field proof, 20-field locked SQL state, 256-bit HMAC, key epoch, backend/full-XID one-use challenge | **NOT IMPLEMENTED operationally** | Approved app-secret custody, actual ceremony in request-owned lease, protected SQL verifier, Node↔PG vectors and privilege-race tests; no generic signing oracle |
| A01 trusted pre-parser limiter operation bind / independently committed receipt finalization, real Staff Auth migration without changing MFA/refresh replay behavior | **BLOCKED** | Real key-bound A01 path, old writer grants safely retired and re-provisioned, successful and conflicting retries under real SQL |
| R03 atomic global Argon2id password update + consume reset + all existing Staff session/refresh/Push revocation + anonymous account security audit | **NOT IMPLEMENTED operationally** | Purpose-bound SQL writer and single real COMMIT under lock across User/SS/RC/P/audit; preservation of F/C/memberships/operational histories proven |
| Exact status, issue, redeem HTTP endpoints; error codes, anonymous concealment and non-cache/privacy | **PARTIAL TEST-ONLY HTTP** | Production controllers unregistered, unconditional SQL-readiness 503. Real enabled mounted HTTP with tenant/MFA/replay and 6 durable quotas not run |
| Management Employees & Shifts action, MFA, copy-once, unknown COMMIT, stale-scope fencing | **PASS local browser with mocked backend / default OFF** | Real protected backend/PG and security acceptance, not just simulated HTTP |
| Public standalone `/staff/reset-password`, first-executable fragment scrubbing, EN/AR RTL/themes responsive/a11y, no cookie/referrer/auto-login | **PASS local browser mock / default OFF** | End-to-end real redemption, key/access security, operational monitoring; secure fragment lifecycle regressions on final SHA |
| All 35 U2 inventory categories, old role/DML/SECURITY DEFINER retirement, all-status parent and provisioner twice | **SOURCE DIAGNOSTIC BLOCKED; C3 source preflight added** | W26 DRAINED NOLOGIN/fencing and PROTECTED pre-repair drift checks are reviewed dormant source, NOT actual ACL closure. Effective runtime/PUBLIC/inherited/other role, 27 legacy definer overloads, provisioner twice, actor provenance and compatible signed writer implementation require real PG17; P02 external actors not inventoried |
| L1/L2 T0 ADMIT/HOLD/RETIRE, original pre-T0 session/refresh/push permanently non-admittable, independent Ed25519 operator checkpoint, N→R→N | **SOURCE/SYNTHETIC ONLY** | Real exhaustive T0, controlled attested operator case, old backup monotonic proof and PG17 rollback rehearsal |
| Migration113 W9 history repair + actual PostgreSQL17 private ACL/HMAC + 21 race cases two orders | **BLOCKED** | Separate narrow W9 Owner approval and reattested fixture; original W9 113 remains FAILED and official guarded recovery expressly DENIED. Docker engine available but original W9 container EXITED, no live catalog/history/ACL read |
| Root tests/typecheck/lint/build/architecture; targeted formatting, Gitleaks; GitHub CI | **PARTIAL LOCAL** | Rerun every local gate on final cumulative SHA; exact-head Gitleaks/CI not yet executed, no remote push authorized |

## All 35 U2 rows — independent current disposition

The categories and names below are extracted from `docs/plans/issue-416-option-a-writer-inventory.md` through `packages/database/issue416-writer-closure/catalog.mjs`. **No row is marked operationally closed.** The classification prevents inventing 35 identical SQL functions where the accepted design instead requires non-writing guards, controlled operator or maintenance boundaries.

| ID | Source purpose | Family class | Disposition / concrete closure obligation |
| --- | --- | --- | --- |
| A01 | STAFF_LOGIN_COMMIT | AUTHENTICATED_WRITER | **BLOCKED** — actual password/Argon2 proof, session/refresh creation, limiter and audit under one signed writer |
| A02 | STAFF_REFRESH_ROTATE_OR_REPLAY_REVOKE | AUTHENTICATED_WRITER | **BLOCKED** — raw refresh lineage, consumed-replay family revoke, preserve unknown-COMMIT |
| A03 | STAFF_SESSION_LOGOUT | AUTHENTICATED_WRITER | **BLOCKED** — actual refresh possession, exact session and Push terminalization, no arbitrarily selected SS |
| A04 | MFA_ENROLL_BEGIN_OR_RESUME | AUTHENTICATED_WRITER | **BLOCKED** — genuine current session, pending factor owner and seed confidentiality |
| A05 | MFA_ENROLL_CONFIRM | AUTHENTICATED_WRITER | **BLOCKED** — verified TOTP step, single-use recovery disclosure and atomic assurance |
| A06 | MFA_TOTP_STEP_UP | AUTHENTICATED_WRITER | **BLOCKED** — monotone real step, factor+SS proof and MFA bypass exclusion |
| A07 | MFA_SELF_RECOVERY_START | AUTHENTICATED_WRITER | **BLOCKED** — genuine recovery code selector/verifier, factor retirement and pending seed |
| A08 | MFA_RECOVERY_CODES_REISSUE | AUTHENTICATED_WRITER | **BLOCKED** — fresh TOTP, factor generation and secret single-disclosure |
| A09 | MFA_ADMIN_ACTIVITY | AUTHENTICATED_WRITER | **BLOCKED** — session/factor/company current authority, no forgery of activity assurance |
| A10 | SESSION_CONTEXT_READ | READ_GUARD | **BLOCKED read-guard attestation** — no invented executable writer; actual read/authorization and revocation fence evidence |
| A11 | MFA_STATE_OR_ASSURANCE_READ | READ_GUARD | **BLOCKED read-guard attestation** — factor/assurance current-state queries, no proof from stale context |
| M01 | STAFF_ROLE_CHANGE | AUTHENTICATED_WRITER | **BLOCKED** — retire weak `staff_management_set_role` EXECUTE, actor/MFA/tenant proof |
| M02 | STAFF_MEMBERSHIP_STATUS_CHANGE | AUTHENTICATED_WRITER | **BLOCKED** — membership version/CAS and surviving usable admins, legacy EXECUTE retirement |
| M03 | STAFF_LOCATION_GRANTS_CHANGE | AUTHENTICATED_WRITER | **BLOCKED** — tenant/location grants current authority and scoped audit |
| M04 | STAFF_INVITATION_CREATE | AUTHENTICATED_WRITER | **BLOCKED** — proof-bound 4-scope limiter, issue, copy-once and user/email lock rank |
| M05 | STAFF_INVITATION_RESEND | AUTHENTICATED_WRITER | **BLOCKED** — replay/bind/credential generation and linkless repeat, no old weak definer |
| M06 | STAFF_INVITATION_ACTIVATE | AUTHENTICATED_WRITER | **BLOCKED** — actual invite/password provenance, reject stored-hash signing |
| M07 | MANAGEMENT_ASSURANCE_GUARD | READ_GUARD | **BLOCKED read-guard attestation** — must verify current same-session MFA, no signer function |
| M08 | LOCATION_LIFECYCLE | AUTHENTICATED_WRITER | **BLOCKED** — seven current variants, actor/Location ownership and lock-order compliance |
| M09 | ORGANIZATION_SETTINGS_BRANDING | AUTHENTICATED_WRITER | **BLOCKED** — twelve settings/branding variants, management actor assurance and tenant default/override |
| M10 | SHIFT_PRESENCE_POLICY | AUTHENTICATED_WRITER | **BLOCKED** — exact settings/Location/Staff lock ordering and legacy definer denial |
| M11 | STAFF_PUSH_REGISTER_CONFIRM_SUPERSEDE | AUTHENTICATED_WRITER | **BLOCKED** — live bearer/session binding, provider-token custody, concurrency |
| M12 | STAFF_PUSH_EXPLICIT_DISABLE | AUTHENTICATED_WRITER | **BLOCKED** — exactly owned registration, monotone disabled token clearing |
| M13 | STAFF_PUSH_DELIVERY_AND_STALE_MAINTENANCE | BOUNDED_MAINTENANCE | **BLOCKED maintenance attestation** — worker-specific monotone lease/terminalization, no staff signing |
| M14 | CONTROLLED_SECURITY_DISABLE | CONTROLLED_OPERATOR | **BLOCKED operator evidence** — signed operator authority, all sessions/Push, audited monotone disable |
| M15 | CONTROLLED_MFA_RECOVERY | CONTROLLED_OPERATOR | **BLOCKED operator evidence** — factor retirement/recovery, real controlled operator not arbitrary ref |
| P01 | CONTROLLED_STAFF_PROVISION | CONTROLLED_OPERATOR | **BLOCKED operator evidence** — controlled User/M/G writes, global sole-company and lock order |
| P02 | ORGANIZATION_AND_ENTITLEMENT_EXTERNAL_WRITER | CONTROLLED_OPERATOR | **BLOCKED / EXTERNAL_UNVERIFIED** — discover actual commercial and privileged lifecycle writers |
| P03 | LOCAL_DEVELOPMENT_ONLY_PASSWORD_AND_SESSION_WRITES | NONPRODUCTION_ONLY | **BLOCKED production-isolation attestation** — dev tools must not execute with production principals |
| P04 | E2E_AND_CAPACITY_FIXTURE_WRITE | NONPRODUCTION_ONLY | **BLOCKED production-isolation attestation** — synthetic seeding never signer provenance |
| P05 | STAFF_PUSH_CLEANUP_AND_RETENTION | BOUNDED_MAINTENANCE | **BLOCKED maintenance attestation** — bounded retention, no active P/session/audit loss |
| R01 | RESET_STATUS | READ_GUARD | **BLOCKED** — independent authenticated current CA/tenant/target status, concealed projection; no state write |
| R02 | RESET_ISSUE | AUTHENTICATED_WRITER | **BLOCKED** — current CA+5m MFA, four private quotas, latest generation, reset+audit+receipt COMMIT |
| R03 | RESET_REDEEM | AUTHENTICATED_WRITER | **P0 BLOCKED** — 30/5 private counts, genuine `vspr1.` proof, atomic global revoke/audit, deny old public counter |
| X01 | STAFF_SHIFT_FORCE_END | AUTHENTICATED_WRITER | **BLOCKED** — genuine role/session/MFA, Shift/Task lock constraints, retire transitive legacy definer grant |

## Admission and release constraints

The 23 authenticated writer rows, 4 read guards, 2 bounded maintenance, 4 controlled operator and 2 nonproduction families sum to **35**. The code scanner is an aid: 42 provisioner source files, 27 legacy function EXECUTE declarations and 35 potentially sensitive grant findings remain source observations, not the total set of installed database privileges. An Ed25519-signed self-declaration cannot prove the content of a PG17 test or revoke a grant. The original W9 migration113 repair is specifically **DENIED** and not overridden by this engineering assignment.

Before any route or grant activation, independently attest full private-key custody, Node↔PG proof parity, SQL-only ACL/provisioner reapplication twice, 21 two-connection races in both directions, L1/L2 controlled rollback, authenticated A01 and all affected writer-family compatibility. After that, repeat exact-commit local tests and approved remote CI/Security CI. No current git commit, successful mock, enabled browser feature flag, synthetic signature or new source migration authorizes production use.
