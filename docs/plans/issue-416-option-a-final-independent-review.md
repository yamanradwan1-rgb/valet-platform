# Issue #416 Option A — recovered aggregate independent review

Status: **INDEPENDENT DESIGN REVIEWED; IMPLEMENTATION BLOCKED**. All reviewers
examined pinned aggregate commit
`944ae18c0c232551a909306a39fcd852a8747ace`. They did not author the
reviewed design, change files, run PostgreSQL or approve deployment. Corrections
below were made afterward by Prime as **documentation only**; the follow-up
re-review must check that delta. Existing `issue-416-option-a-review-{auth,sql,ops}.md`
are historical assessments of an earlier draft.

## Independent Auth/Crypto review — Worker 3

| Severity / status at pinned SHA | Evidence and security impact | Corrective disposition |
| --- | --- | --- |
| **BLOCKER / OPEN U1** | `issue-416-option-a-key-custody.md:84-92,112-156,219-237`: HMAC verifier is a usable symmetric signing root; SQL private ACL alone cannot guarantee protected production provisioning, backup, restore, log secrecy or rotation. | Keep U1 blocked. Name/select verified secret/operator boundary and independently test verifier, signer, ACL, logging and DR. No provider was assumed. |
| **BLOCKER / OWNER S1** | Issue #416 v9 §A.E vs `issue-416-option-a-authentication-provenance.md:103-150`: former retains narrow DML and raw `vsa1` in SQL under secrecy gate; selected Option A proposes typed MAC writers with no raw credential in SQL. | Obtain explicit Owner security-contract supersession; preserve all external v9 Staff Auth/reset semantics. |
| **BLOCKER / U2** | `auth/staff-auth.service.ts:64-103,179-287`, `mfa-step-up.service.ts:48-85`, `mfa-recovery.service.ts:68-131`: genuine password/refresh/TOTP/code ceremonies occur in current app, but future signer/challenge/verifier has not been implemented or proven. | Future typed purpose-specific signer guards and negative SQL-only oracle tests, including replay-family revocation, exact-session seed and single-disclosure semantics. |
| **MAJOR / DOCUMENT CORRECTED; TEST OPEN** | Former generic `auth_command_challenge(text,uuid)` lacked protected actor/target/payload/generation binding required by `locks.md:199-206`; could admit spoofed prepare context. | Replaced with proposed strict purpose-specific `auth_*_prepare(typed arguments)` under ordered locks, protected current-state binding and explicit cross-purpose/target/backend tests. See central design function table. |
| **MAJOR / DOCUMENT CORRECTED; TEST OPEN** | `key-custody.md:171-180` key promotion stopped old signer without an explicit activation fence in `locks.md:191-197`; stale replicas could create ambiguous proof timing. | Added exclusive sorted key promotion/epoch and active-key-only transaction prepare; stale replica fails closed; full activation/retirement race tests NOT RUN. |
| **MINOR / CORRECTED** | Central text claimed Argon2 and TOTP both preceded transaction recheck, whereas TOTP in `mfa-step-up.service.ts:48-70` is verified inside locked MFA transaction. | Corrected source description. |

## Independent SQL/Concurrency review — Worker 4

| Severity / status at pinned SHA | Evidence and impact | Corrective disposition |
| --- | --- | --- |
| **BLOCKER / OPEN grants** | `provision-runtime-role.mjs:196-207`, `mfa-runtime-privileges.mjs:142-207`, `staff-management-runtime-privileges.mjs`, `staff-onboarding-runtime-privileges.mjs` can restore current direct authority-changing DML or actor-ID-only definer EXECUTE; `cleanup_staff_push_v1()` remains callable. | Propose simultaneous caller/definer/overload/old-provisioner migration and effective PUBLIC/runtime/inherited-role denial after twice-run provisioning; old credentials/runner must be fenced. No live ACL proof. |
| **MAJOR / DOCUMENT CORRECTED; TEST OPEN** | `staff-onboarding.service.ts:59-76,115-133,163-187` reserves anti-abuse via another pool lease **after** outer email/User/management locks; proposed single-lease ranked protocol previously lacked migration/unknown-COMMIT reservation semantics. | Specify durable, purpose-bound quota reservation on completed separate lease **before** domain locks, revalidation inside command, finalize only after confirmed/reconciled result, and add 15th two-lease/rollback/unknown race. Real PG test NOT RUN. |
| **MAJOR / SOURCE DESCRIPTION CORRECTED** | `postgres-transaction.ts:39-55,65` marks `UNAVAILABLE` in outcome tracker and rethrows original COMMIT/connection error, rather than returning a structured `UNAVAILABLE` response. | Corrected `writer-inventory.md` and `cutover.md`; future caller must safely reconcile unknown COMMIT and not infer rollback. |
| **MINOR / CORRECTED** | `management-settings-runtime-privileges.mjs:1-14` declares 12 settings/branding functions (9+3), rather than 13. | Corrected count in U2 inventory. |

SQL source signatures for management/onboarding/location/presence and push cleanup
were inspected. Unknown deployed overloads, external Organization/entitlement
writers, join-row lock acquisition order, PostgreSQL race outcomes and old
runner credential ownership remain open acceptance evidence; no deadlock
freedom or production SQL-only defense was verified.

## Independent Operations/Cutover review — Worker 5

| Severity / status at pinned SHA | Evidence and consequence | Corrective disposition |
| --- | --- | --- |
| **BLOCKER / Owner U1, L1, L2, S1** | `recovery-handoff.md:65-89`; `cutover.md:49-139,278-294`: selective legacy trust/HOLD and no-code recovery, proof-key custody, drained N/R rollback and internal v9 security supersession require Owner approval. | Record 4 material decisions, not accepted by documentation. Fresh login or legacy MFA alone never establishes historical issuer/role provenance. |
| **MAJOR / DOCUMENT CORRECTED; DEPLOYMENT OPEN** | `provision-runtime-role.mjs:42-98,165-207`: even after C3 grant snapshot, a stale privileged runner holding old migration credentials may restore weak rights. | Added explicit historic credential/runner revocation/rotation at C3, old-binary denial and twice-run N/R proof at C4, continuous ACL drift gate. None executed. |
| **MAJOR / DOCUMENT CORRECTED; DR TEST OPEN** | `cutover.md:261-276`/U1 restore logic fenced retired keys but old DB snapshot may revive consumed MFA codes/steps, revoked sessions/push, invite/reset generations and membership/entitlement authority. | Added multi-object externally monotone reconciliation **or** conservative revoke/HOLD/reenrollment after older-backup restore. Requires actual operator RPO/RTO and drill. |
| **BLOCKER / U2/Deployment OPEN** | `writer-inventory.md:38-53,97-110,181-194`, `cutover.md:151-227`: full transitive deployed SQL writer/runner inventory, effective roles, backup, N/R artifacts, drain and restart prevention are not attested. | Keep rollout forbidden until exact owner/operator inventory, deployment evidence, real PostgreSQL race/grant checks and independent cutover approval. |
| **MINOR / CORRECTED** | `docs/validation/ISSUE_416_SECURITY_FOUNDATION.md:18-20` referred to integrated U2/reviewer SHA as future. | Replaced with pinned review SHA and Git-history provenance note. |

## Final review gates and residual risk

All three reviewers **finished their source-only reviews of 944ae18c** and
converged on **design partially closed, no implementation/deployment approval**.
Their reports substantiate known open security decisions, not a claim of an
exploited production vulnerability. Documentation corrections address the
specified ambiguity; the underlying mechanisms, privilege closure, controlled
legacy recovery and concurrency/restore/secrecy gates remain **BLOCKED or
NOT RUN**. The corrected semantic design has now received independent delta
verification at the commit below.

## Independent delta re-review of the corrected design

All three independent reviewers re-examined the semantic correction diff from
`944ae18c0c232551a909306a39fcd852a8747ace` to
`698aec06ee7e3b24b1667094e6bbc05ecae58610` without modifying files:

| Reviewer | Re-review disposition and limitations |
| --- | --- |
| Worker 3 — Auth/Crypto | **PASS for documentation corrections**: purpose-specific typed prepare, protected actor/target/generation/payload binding, key promotion epoch and stale replica fence, correct Argon2/TOTP ordering. No new material contradiction; SQL/crypto/PG implementation NOT RUN. |
| Worker 4 — SQL/Concurrency | **PASS for documentation corrections**: onboarding M04/M05 reservation on completed pre-domain lease, post-domain/unknown result finalization, 15th two-lease test, accurate COMMIT outcome tracker exception and 12 settings/branding signature count. Follow-up also reviewed two MINOR wording fixes in `cutover.md` and `locks.md`: historical provisioner denial tested in isolated C3/C4 before reopening, changed issuance COUNTED and unchanged replay IGNORED. Deployed ACL and race tests NOT RUN. |
| Worker 5 — Ops/Cutover | **PASS for documentation corrections**: old privileged runner/credential fencing before C6, older-snapshot per-object monotone recovery or conservative HOLD, corrected historical SHA labeling. Release, restore and operator proof NOT RUN. |

An additional final Git commit records these review reports and mirrors the
unchanged/replay distinction in the U2 inventory; it does not claim that its
metadata alone was independently tested. The reviews are **source-design-only**.
U1/S1/L1/L2 Owner choices, strict U2 proof/ACL closure, real PostgreSQL 17
concurrency and runtime secret/deployment evidence remain **BLOCKED/NOT RUN**.

## 2026-11-13 — final U1/S1/U2 source-level contract closure (new review cycle)

This is a **new** documentation architecture cycle after `eb2d0ba4`; the
prior review above remains historically accurate **only for its pinned SHA**.
Auth/Crypto (W6), SQL/Concurrency (W7) and Operations (W8) have conducted
independent read-only source preflights. Their **final revised-aggregate
verdicts are PENDING until explicitly pinned Git SHA and complete final-doc
re-read**; no preflight finding alone constitutes a final review PASS.

| Preflight finding | Source evidence and impact | Proposed design disposition; runtime evidence |
| --- | --- | --- |
| **MAJOR U1/S1 contradictory signed format** | U1 prior JSON `canonicalUtf8Bytes` vs S1 strict binary `VAP1` TLV; mismatch makes independent signer/verifier incompatible. | U1 follow-up replaces signed JSON with the same TLV proof/payload/state frame and DB `bytea` HMAC. Source-only corrected; Node/PG17 conformance **NOT RUN**. |
| **MAJOR U2 payload/locked-state ABI gaps** | S1 requires explicit field IDs/types and deterministic Node↔PG17; earlier U2 left compound arrays, NULL times, microsecond CAS and state field IDs undefined. Current `management-settings-mutation-repository.ts` uses nullable hours for CLOSED, SQL requires exactly seven days. | U2 specifies field IDs, fixed 20-field typed state groups, canonical bounded arrays/recovery/limiter composites, exact 7-day nullable time format, 1µs CAS, legacy invalid timestamp HOLD, full proof-frame vector requirements. Exact SQL/Node byte equivalence **NOT RUN**, final reader may identify further precision corrections. |
| **MAJOR L1 ADMIT→HOLD race** | Earlier L1 was only a signer precondition; signed proof could outlive a concurrent protected HOLD if SQL did not check locked admission. | New protected per-object admission registry and `FOR SHARE` prepare+execute locks at matching rank 09–14, controlled operator same-rank `FOR UPDATE`/version CAS and COMMIT barrier, deterministic parent-first/gate-second order, added HOLD-vs-login/MFA/management/reset/Shift PG17 races. DDL and concurrency tests **NOT RUN**. |
| **MAJOR X01 transitive old Staff Shift Force End SQL authority** | `20261002005400_mgt_240f_force_end_shift/migration.sql:88–197` accepts SQL-readable session `p_access_hash` under callable `SECURITY DEFINER`; `shift-force-end-runtime-privileges.mjs` grants EXECUTE and `staff-shift-force-end-repository.ts` forwards stored hash. | Add required X01 purpose-specific genuine raw bearer + sensitive MFA guarded writer; revoke old overload and nested provisioner restoration; preserve Shift/Task no-Task-lock invariant. SQL-only forging/Shift race tests **NOT RUN**. |
| **MAJOR anti-abuse SQL-state discount** | `provision-runtime-role.mjs:209–239` currently allows `anti_abuse_events.UPDATE(state,group_key_hash)` while limiter counts only PENDING/COUNTED; compromised SQL can mark rows IGNORED. | U2 requires revoking raw limiter state writes, replacing with purpose-/receipt-bound narrow reserve/finalize transitions and fail-closed pending on unknown COMMIT; test COUNTED→IGNORED denial, mandatory six reset scopes and R02 four reservations. **NOT IMPLEMENTED/NOT RUN**. |
| **MAJOR U1 backup logical-dump ambiguity** | Raw symmetric verifier `key_bytes` can appear in privileged logical dump data even if resulting artifact is encrypted; former L2 wording incorrectly suggested otherwise. | L2 now requires continuous encryption/no plaintext spool or an explicit excluded-key logical backup plus independent escrow/reimport, with restore/retired-key monotone checkpoint and telemetry canary. Actual production backup mode **EXTERNAL — NOT VERIFIED**. |

The final **security verdict cannot exceed conditional design readiness** if
all source-resolvable issues are corrected: selected HMAC is symmetric, so
deployed SQL verifier confidentiality, actual `pgcrypto`, operator roles,
controlled backup/restore, deployed effective grants and external commercial
writers are separate **EXTERNAL — NOT VERIFIED** gates. Owner decisions
S1/U1/L1/L2 remain **PROPOSED/PENDING**. No additional DEC is Accepted.

### Independent full-package review of pinned `fa8626b8` and corrective actions

All three **independent read-only** reviewers completed a source and
documentation inspection at exactly
`fa8626b8ab0b187b08225d967a41cef4747f6353` (a historical review SHA,
**not** the later corrections). They did not edit any source/docs, run SQL,
change grants, obtain secrets, create a PR or deploy. The pinned design was
**not ready** because of real source/contract precision defects:

| Reviewer | Actual findings at pinned SHA | Correction subsequently proposed; final delta proof |
| --- | --- | --- |
| W6 Auth/Crypto — MAJOR | Admission current-material update required `FOR UPDATE` by L1 cutover but `FOR SHARE` by S1/U2/locks (potential late upgrade), and X01 named nonexistent `Shift.updated_at`; otherwise checked S1 binary TLV, 18-field 323-byte fixture/HMAC, key custody and U2 nullable arrays. | Pre-elected gate X for every changed admitted material, S unchanged; explicit class-specific mode table and two-writer/HOLD PG17 tests. X01 binds actual `Shift.started_at/status/org/location/member`. New corrected SHA must be re-read; tests NOT RUN. |
| W7 SQL/Concurrency — MAJOR/SIGNIFICANT | Same S/X conflict; Location grant has composite `(membership_id,location_id)` PK and no UUID yet L1 gate required one; X01 nonexistent timestamp; M11 installation ID typed TEXT although source is UUID; existing generic runtime account-security append can forge four MFA USER events; R02 four quota reserves could leave partial PENDING due one-key API; R02 client-settable TTL. | U1/S1/U2/locks/cutover use collision-free grant key `0x02||orgUUID16||memberUUID16||locationUUID16`; M11 installation is binary UUID; protect four MFA audit names under future narrow writer (migration 112 unchanged); reserve all four R02 keys in one short atomic pre-domain transaction and remove client-selectable TTL (DB 900s); X01 and lock modes corrected. Source-only correction; PG/ACL tests NOT RUN. |
| W8 Operations/Cutover — MAJOR | Same S/X admission-mode ambiguity could deadlock or violate material version fencing; actual operator/environment key/storage/rollback not attested. | Proposed S/X selection aligned with L1, 21 planned races and uninterrupted release/restore HOLD barriers. Owner S1/U1/L1/L2 and production backup/injection/operator attestation remain pending; no code or release proof. |

**Correction disposition at authoring:** documentation changes are pending an
independent **new-SHA delta read** and cannot retroactively change the pinned
reviewers' historical MAJOR findings into PASS. A successful read-only delta
review can close design *wording/source precision* only; runtime forgery,
cryptography, old-role denial, backup/DR and PostgreSQL 17 races remain
**NOT RUN / EXTERNAL — NOT VERIFIED**.
