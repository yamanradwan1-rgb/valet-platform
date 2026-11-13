# Issue #416 Option A legacy trust, cutover and recovery

Status: PROPOSED DESIGN; Owner decisions L1/L2 below are not Accepted.
Source inspection began at `62d0a3d3f97a4186d2dd85642212efc7b4f35d42`;
this final documentation refinement is based on the separate `eb2d0ba4` review
baseline. Neither SHA is a live deployment attestation.
Design-only inspection on 2026-11-13. No live environment was contacted, no
secret read, and no runtime, privilege, migration or operational data changed.
The main provenance document and U1/U2 supporting specifications define the
cryptographic/writer protocol; this document defines its existing-data and
deployment admission conditions. Historical migration 112 remains intact.

## Evidence and binding limits

The following are VERIFIED SOURCE FACTS, not deployment attestations:

| Source | Verified fact and consequence |
| --- | --- |
| `docker-compose.yml`; `infra/docker/README.md` | Root compose runs loopback PostgreSQL 17 with a data volume; no API deployment or production secret manager is defined there. |
| `infra/systemd/README.md`; `vaylet-customer.service` | Instructions cover Customer service on loopback 3002 and managed Cloudflare Tunnel; they do not identify deployed API replicas or prove host secret custody. |
| `infra/nginx/README.md`; `infra/scripts/README.md` | Placeholders/conventions, not an implemented ingress drain or API release controller. |
| `docs/16_PRODUCTION_DATABASE_DEPLOYMENT_CHECKLIST.md` | Network boundary, encrypted backups, restore tests and credential owners are deployment evidence fields. Empty checkboxes do not attest them. |
| `packages/database/scripts/provision-runtime-role.mjs` | Controlled migration credential provisions an ordinary non-owning runtime role, removes inherited roles, calls current MFA/table provisioners and verifies privileges in a transaction. Old MFA provisioning regrants sensitive session/factor/code DML. |
| `apps/api/src/modules/auth/mfa/mfa-crypto-config.ts`; `mfa-secret-protection.ts`; `mfa-recovery-code.ts` | Existing MFA uses separately configured encryption/recovery keys, encrypted bound factor envelopes and keyed recovery verifiers. Possession of those keys is not proof-key custody. |
| `apps/api/tools/mfa-recovery/{input,execution,persistence}.ts` | CLI accepts an operator reference and operation UUID; migration connection/TLS is its trusted execution boundary. It retires a current PENDING/ACTIVE factor and appends account-security audit; it does not verify a human's identity from the operator-reference string. |
| `apps/api/tools/staff-provisioning/provisioning-persistence.ts` | Controlled create-only provisioning inserts User/member/grants and safe operator audit. It is not an existing-user password-repair or arbitrary authority-attestation command. |
| `apps/api/tools/security-disable/persistence.ts` | Controlled global disable serializes User security, revokes sessions and disables active push bindings; it does not complete physical custody. |
| `apps/api/src/common/database/postgres-transaction.ts` | A COMMIT/connection error records UNAVAILABLE in the outcome tracker, destroys the unusable lease and rethrows the original exception; the helper does not directly return an UNAVAILABLE result. Subsequent ROLLBACK is not proof that COMMIT failed. |
| `docs/plans/issue-416-option-a-review-{auth,sql,ops}.md` | Earlier reviews flag legacy-factor/authority provenance, proof-key custody and compatible rollback as unresolved; those are not reviews of this completed proposal. |

LOCKED DECISIONS: DEC-023/024/025, focused Accepted DEC-072/075/076/078/079/080/081
and DEC-088 apply. Password plus genuine TOTP, exact-session assurance,
single-use recovery, five-minute sensitive MFA, ordinary one-pool runtime,
tenant/location scope, independent account-security audit and no peer-admin MFA
bypass remain. A refresh cannot renew MFA time. Commercial lapse cannot disable
field/Guest custody completion. No ValetSession, Shift, Task or Dispatch
transition is introduced. No Company-default/Location-override policy changes.

DERIVED REQUIREMENTS: closing writers protects future establishment; it cannot
prove how existing rows originated. A successful password/TOTP check proves
possession against admitted state, not the prior legitimacy of that state.
Current SQL facts and their audit copies alone cannot authenticate their own
origin. There is no finding here that legacy data is compromised.

EXTERNAL FACTS NOT VERIFIED: production host/provider, process/replica count,
actual role grants, running binaries, log configuration, secret manager, trusted
identity records, backup encryption, restore capability, operators, downtime
capacity and key distribution. Record evidence before cutover; do not fabricate
KMS/Vault, managed replicas or a deployment platform.

**Authority boundary:** L1/L2 below are proposed Owner choices. U1 proof-key
custody, S1's replacement of Issue #416 v9's internal SQL bearer/grant mechanism
and U2's typed authenticated writers remain separate unapproved security gates.
The Owner-approved public reset semantics (Company Admin trust, current issuer
authority, 15-minute single-use link, anti-abuse and full target-session/push
revocation) are unchanged. This document cannot authorize a SQL-only operator
override, a Company Admin MFA reset bypass, or a deployment.

## L1 proposed trust policy: explicit baseline, selective recovery

Recommendation: a controlled, per-object administrative admission baseline at
the drained boundary T0, followed exclusively by protected writers. This is a
new explicit trust-root event; it is not retrospective authentication proof.
No row becomes trusted merely because it predates T0, has an audit event, or a
user can log in. No universal forced active-factor reenrollment is proposed.

Before scheduling T0, a named authorized VAYLET deployment/security operator
prepares a protected admission manifest for **every** existing authority-bearing
object, including inactive/pending memberships and old consumed credential/code
generations. VAYLET verifies the Company's legal contact and authorized roster
through a previously established **independent** Company contact channel, not
contact details read from the database under admission. The verified Company
authority confirms named User/email and the full set of memberships, role/status
and Location grants. VAYLET independently confirms the Organization/Location
ownership boundary and its commercial operator confirms typed entitlements;
tenant administrators cannot attest their own subscriptions. The operator
matches exact IDs, status, generation and version/digest against both the
independent evidence and a complete drained database snapshot. A missing
external attestation is an explicit HOLD, never implicit acceptance. No
password, seed, code, verifier, token or proof enters the public manifest.

The manifest records release/audience, Company/Organization boundary, object
class/id, expected state/version or digest, disposition ADMIT/HOLD/RETIRE,
source-of-trust reference, verified approver and operator identity, timestamp,
and recovery case where needed. It includes object-class total counts, missing
and unresolved counts, and a safe manifest digest. Each ADMIT is an explicit
new administrative baseline decision, **never** a claim that past credential
ceremonies were genuine. Its full sensitive content belongs in the controlled
deployment evidence boundary; the repository stores only a safe digest/reference
and aggregate counts. An operator-controlled additive import records the digest
and per-object admission state behind protected ACLs; ordinary runtime SQL
cannot change admissions or approve itself. Exact implementation schema and
concurrency rules remain U2 implementation work, not a runtime-role write or a
generic JSON policy store. Existing business/security history stays unchanged.

Admission is a dependency graph: session -> User -> membership/role/grants ->
Organization -> relevant entitlement; MFA assurance additionally -> admitted
factor and applicable recovery generation. Each protected command requires the
nodes relevant to its capability. HOLD denies that capability with existing
non-disclosing errors. A commercial HOLD only gates Management. An identity
HOLD cannot be bypassed by enrollment or a possession check. Preserve membership
and grant counts across all statuses; do not manufacture sole-company reset
eligibility by hiding HOLD or inactive rows.

**Scope and noninterference:** A #416 target must still have exactly one global
OrganizationMembership across **all statuses**, which is in the issuing Admin's
Company; many Location grants within that same Company are valid. Legacy
multi-Organization anomalies remain visible and deny reset eligibility; no
admission decision silently deletes or hides another Company's membership.
An `ORG_ADMIN` baseline never supplies field Task/Shift/vehicle authority.
Identity/role/Organization uncertainty blocks dependent privileged commands;
commercial entitlement uncertainty blocks only the affected Management scope
under DEC-088, not field actions or minimal Guest custody completion. HOLD is
a protected authorization state, not an automatic `User.DISABLED`, membership
deactivation, key handoff, or operational session transition.

At T0 the operator reconciles every manifest entry against locked/drained
current state. Changed/missing objects become HOLD until reviewed; never apply
a stale approval to a new hash/role/factor. Admission import, session/push
retirement and boundary activation must be one reviewed drained migration
contract with a durable checkpoint. If too large for one transaction, stage
private admissions while traffic remains paused, then atomically activate the
new boundary only after complete reconciliation; partial batches are never
publicly usable. Reconcile any newly discovered row, changed generation or
unlisted external writer as HOLD and abort activation until the manifest is
complete. Snapshot counts and digest prove completeness, not identity. Record
pre/post counts by class, terminalization receipts and the precise boundary
version; an uncertain COMMIT requires a fresh privileged read of durable
checkpoint and state before any retry or traffic reopening.

| Object | Proposed treatment and retained trust source | Missing/uncertain evidence |
| --- | --- | --- |
| StaffAuthSession and its MFA/activity times | Revoke **all** pre-boundary Staff sessions at T0 (Web/native, fresh/expired) by protected global session lineage; preserve rows/audit and invalidate old access authorization and assurance. New Staff sessions require genuine password authentication against admitted User/hash. No copied MFA activity/time. | No legacy session is grandfathered; verify zero active older sessions before boundary activation. A stale raw access bearer or DB-visible hash never grants a new session. |
| StaffRefreshCredential, including consumed lineage | Preserve generations, consumed flags and parent association; every credential under a retired legacy session permanently fails. Do not reset `consumed_at`, remap lineage or issue a replacement from a SQL-visible verifier. | New login is required. Preserve consumed-refresh **replay-family revocation** and unknown-COMMIT recovery; a lost response does not make a consumed token reusable. |
| Active push bindings | Terminalize ACTIVE registrations for retired sessions, clear provider token and preserve precise reason/history without falsely claiming provider invalidation. Stop or reconcile pending sends/confirmations and stale queued worker attempts under DEC-075/076. | Fresh authenticated Staff session must register/confirm again. No old session may rebind/confirm an ACTIVE endpoint after C3; do not infer immediate recall of a notification already sent. |
| ACTIVE TOTP factor | ADMIT the exact factor/User association, protected seed envelope, accepted-step counter and recovery generation only following independent confirmation by the verified account owner and a recorded operator baseline. Retain the authenticator; require a **fresh** TOTP step on a new admitted session. | HOLD factor and its dependent assurance until verified; merely entering a currently valid TOTP or matching a database audit row cannot establish initial enrollment provenance. If rejected, retire only through approved controlled recovery. |
| PENDING TOTP factor | Explicitly RETIRE every legacy PENDING enrollment tied to a revoked T0 session; preserve audit and prohibit reuse of its protected seed across sessions. | Re-enter the existing begin/confirm flow on a new admitted session. Ordinary same-session pending seed retry remains unchanged for **post-T0** enrollments; no codes were issued for an unconfirmed pending factor. |
| Recovery-code set | ADMIT only the current selector/verifier set **for an independently admitted ACTIVE factor and exact generation**. Retain `consumed_at`, historical generations and single-use fences; never inspect or request raw codes for baseline verification. | HOLD the set independently when issuance lineage is uncertain even if factor was admitted. Genuine fresh TOTP may authorize normal explicit code reissue; without trusted TOTP/code, use mediated recovery. No post-COMMIT redisclosure of codes. |
| User/email/password/status | Verify global identity/email against independently sourced roster/provisioning facts; freeze exact hash version and status. ADMIT an unchanged legacy hash only with explicit Owner-approved bounded risk acceptance; password matching proves possession, not creator provenance. Preserve PENDING/DISABLED. | HOLD new authentication and sensitive authority until independent repair/admission; do not turn pending/disabled ACTIVE through import. Current provisioning is create-only; no ad hoc SQL password edit and no use of future #416 employee reset as an operator bootstrap. |
| OrganizationMembership role/status and Location grants | Verified Company contact attests complete **all-status** membership/role and full Location grant set; retain membership version, Organization ownership and exact Location statuses, rechecking last-usable-admin and LM coverage for later writes. | HOLD affected privileged capabilities on uncertain role/grant; do not demote/delete memberships, alter last-admin counts or conceal additional Organization memberships to manufacture sole-company reset eligibility. |
| Organization identity/status and Location ownership/status | VAYLET contractual/customer evidence plus independent Company verification establishes exact Organization and Location ownership and status. | HOLD protected authority for uncertain Company/Location scope. Keep truthful Shift/Task/ValetSession and physical-custody history; do not use commercial suspension or invented field completion as repair. |
| OrganizationSubscription/typed entitlements | VAYLET commercial system records plus individually authorized platform operator attest status and **typed** entitlement booleans independently of opaque plan labels. | Management-only HOLD for affected commercial capabilities, subject to DEC-088; never block existing field/Guest custody completion. Tenant Admin cannot self-attest or update E. |
| Controlled operator identity | Existing DEC-025 protected migration/deployment boundary plus individually attributable access and separately retained verification record. CLI operatorRef labels audit; it grants nothing. | No bootstrap/recovery runs until real operator is assigned and access verified. No public signing endpoint or tenant-admin substitute. |

Admission records are current trust decisions, not assertions that historical
events were genuine. A compromise finding changes the incident response scope;
absence of evidence alone is not such a finding. If Owner cannot accept baseline
trust for an object, selective re-establishment is mandatory for that object.

## Usable bootstrap and exception ceremonies

All following are PROPOSED DESIGN; no existing endpoint is claimed to implement
admission. Use the final U2 lock graph, exact target versions and protected
operator boundary. Every successful operator operation has immutable operation
identity, exact subject/scope/version, purpose, request digest, safe result and
atomic account-security audit with CONTROLLED_OPERATOR attribution. The
supporting independent verification case must predate the protected mutation
and identify the actual human operator plus approver. A text `operatorRef`,
password verifier, database row or receipt is not identity evidence. Replays
reprove **current** controlled-operator authorization, match the exact immutable
request fingerprint and return only safe completion facts; changed scope,
subject or identity conflicts. Unknown COMMIT is reconciled on a new approved
lease before recovery or secret issuance.

| Starting situation | Exact permitted next steps | Stop/recovery behavior |
| --- | --- | --- |
| Verified User/authority, admitted ACTIVE factor and codes | T0 retires sessions only; genuine password login creates proof-origin session; fresh TOTP establishes exact-session assurance with current monotonic step. Existing codes remain usable once per accepted generation. | Wrong code, stale step or retired factor cannot establish assurance. No reenrollment requirement. |
| Verified identity, factor baseline uncertain, authenticator retained | Independently verify account owner through recorded contact; owner confirms the exact enrolled account/factor association in the controlled case; operator admits exact unchanged factor under L1; then genuine password + TOTP. | Without independent verification, HOLD. TOTP or database audit alone cannot close case. If unwilling to attest factor, operator retires and owner enrolls anew. |
| Admitted factor, lost authenticator, admitted recovery code | Genuine password login and accepted self-recovery code consume code atomically, retire old factor and create new exact-session pending factor; confirm fresh TOTP; show ten new codes once. | Preserve accepted seed-retrieval retry only on that new same session; consumed code cannot start another enrollment. Unknown commit reconciles safe state, never rediscloses code list. |
| No phone and no trusted recovery code, or untrusted factor/set | VAYLET-mediated identity verification using established independent Company contact plus VAYLET case approval; explicit reason and subject ID/version; controlled operation retires current factor, invalidates dependent assurance/sessions and associated endpoints; genuine password login then fresh enrollment/confirmation. | No peer-admin reset bypass. Existing CLI retirement is only part of this transaction contract and must migrate; merely calling it does not establish identity proof or full session retirement. |
| PENDING legacy enrollment | L1 authorizes retirement and fresh start after new admitted password session. Do not copy pending seed/session association. | Loss of original-session seed retrieval is a specific approved cutover exception, not a general change to ordinary retry semantics. |
| Never enrolled, independently admitted manager identity/authority | Genuine password login followed by existing eligibility-bound begin/confirm; exact-session TOTP; one-time codes. | Enrollment does not approve role/entitlement. Identity/authority HOLD prevents enrollment from laundering authority. |
| Password unavailable or User identity/hash provenance rejected | Mediated verified recovery case must authorize explicit credential replacement, session revocation and audit through a new protected operator command specified in U2; owner chooses new password through a controlled non-logging channel. | Neither current MFA recovery CLI nor create-only staff provisioning implements password repair. No reset feature/API is enabled by this document; remain HOLD until repair capability is implemented and reviewed. |
| Membership/Organization/entitlement uncertain | Resolve exact discrepancy against independent authority; operator admits unchanged row or approved purpose-specific correction with immutable case evidence; recheck dependent objects. | No factor reset, password change or successful MFA grants missing company/commercial authority. Escalate business dispute; retain history. |

**No-phone/no-code case must be usable without promoting uncertain MFA:** the
case worker first verifies the named person's identity and Company connection
through an independently established contact/channel and a separately verified
Company authority, then records the exact User, Organization, affected factor/
recovery generation, reason, protected reference and expected versions. A
separately authorized VAYLET operator and (recommended) second approver check
this evidence. Only a newly implemented purpose-specific controlled command
may retire the old factor/codes, revoke affected assurance and sessions/push,
append its atomic account-security audit and permit fresh genuinely verified
password login and enrollment. If User/password provenance is also HOLD, the
same case must authorize a separately specified credential-repair ceremony;
retiring MFA alone is insufficient. An uncertain role/Organization/entitlement
remains HOLD even after factor recovery. Expiry, replay, operator revocation,
failed audit and ambiguous COMMIT must fail closed. There is no existing
general-purpose bypass or support reset endpoint under this proposal.

The external verification case records verified identity, source, verifier,
time, target, scope, reason and approval; it never records recovery secrets.
Minimum recommendation is Owner-authorized VAYLET operator verification with a
second named approver for no-code recovery/authority correction. This adds no
new authentication provider. If staffing cannot support two people, Owner may
approve one individually attributable operator with post-review; that weaker
operational control and residual impersonation exposure must be explicit in L1.
No actual operator, independent contact source, case system or deployment
capability is attested here.

## L2 proposed drained cutover contract

Authentication downtime affects active field staff too; select a no-active-shift
window or Owner-approved operational continuity plan before scheduling. Do not
claim that Guest or field operations will stay available across API drain.
Guest can remain available only if its actual independent safe routing/consumers
are verified; otherwise disclose the broader outage. Offline actions may queue
but cannot commit protected commands using revoked Staff credentials; rehearse
new-session reconciliation without changing accepted command identities.

**Approval boundary:** the Owner may select L2's **conditional** outage and
rollback policy now; that selection is not a deployment authorization. Each
actual release must separately document a concrete approved window and pass
the independent evidence below **before C0**. Neither this document nor
the repository proves that any API host, ingress, worker, replica, database
credential, backup, KMS, WAL archive or secret store exists in production.
All entries below start **EXTERNAL — NOT VERIFIED** until the named operator
provides evidence from the actual environment. A blank field, untestable
assumption or unapproved RPO/RTO keeps C0 closed.

### External operator inventory and decision record (required, not filled)

For each row retain a private evidence reference, observed timestamp, named
collector, independent verifier, target environment/release and disposition
`VERIFIED` or `HOLD`. Store no live secret or customer PII in this repository.

| Inventory / owner to identify | Required evidence from actual environment | Failure disposition |
| --- | --- | --- |
| Deployment topology / release commander | Every live/staged API replica and worker, scheduler, native/Web ingress, direct DB client, autoscaler/standby, process owner, restart source, startup command, artifact digest/SHA and traffic switch mechanism; cross-check running processes **and** PostgreSQL client identities against the list. | Unknown ingress, process or restart mechanism blocks C0/C1 and any claim of full drain. |
| PostgreSQL / migration owner | Server/version/extensions, DB topology, live owner/runtime/admin role attributes and inherited memberships, `pg_proc` overloads, `PUBLIC`/runtime/role grants, default privileges, provisioner provenance, migration range including 112, prepared transactions, open sessions/locks and actual admin login identities. | Unexpected elevated caller or SQL writer blocks C3; do not rely on repository privilege definitions as effective grants. |
| Former privileged runner / security owner | Identify **every** historical `MIGRATION_DATABASE_URL`, deployment/CI/manual job, role/secret owner, rotation method, credential consumers, rollback path and revoke/disable confirmation; retain identity-safe proof that old credentials can no longer authenticate. | Unfenced old privileged runner or secret blocks boundary activation and reopening. |
| New N/R build and operation owner | Signed/reviewed source SHA and immutable build digest for both versions, ABI/schema/U1 key-epoch/admission/receipt compatibility, startup deny rules, scoped new privileged provisioner identity and sealed allowlisted jobs. | A pre-proof binary, mismatched N/R or unready replica is never permitted to serve. |
| Crypto / observability owner (U1) | Actual signer and SQL verifier custody/injection path, API replica parity, key rotation/retirement authorization, encrypted-at-rest and backup protection, restored secrets, effective private ACLs and synthetic driver/PG/proxy/log/error/cancel canary results. | Missing key provenance, log evidence or retired-key consistency closes protected service; no weak SQL fallback. |
| Backup/DR owner | Real encrypted backup identity, checksum, snapshot timestamp/LSN if available, schema/roles/grants, WAL/replication availability if **observed**, independent monotone authority ledger or selected HOLD fallback, isolated restore result and observed RPO/RTO. | No verified restore or stale-credential reconciliation means no C0 and no post-restore C6. |
| Operational Company contact / incident owner | Verified contact route, outage notice, active Shift/Task/vehicle-custody inventory, manual/offline **authorized** continuity procedure, acceptable downtime/data-loss limits, rollback/fix-forward approvals and reachable escalation owners. | If safe custody continuity is infeasible, postpone; never assume Guest routes or paper-ticket recovery. |

Measure the rehearsal's **RTO** from loss of the required service until the
same fully authorized, independently verified N/R service resumes; report
observed elapsed time, scope and checks, separately from planned downtime.
Measure **RPO** as the latest restorable consistent commit/LSN or other proven
reconciliation boundary relative to the incident/cutover event; report the
actual lost interval and affected business/security objects, not a guessed
zero-loss guarantee. Record backup age, restore start/end, validation duration,
nonrecoverable operations, Owner-accepted limits and the reconciliation case
owner. If source cannot establish a consistent replay boundary, mark RPO
**UNKNOWN**, fail closed and obtain an explicit constrained recovery decision.

### Before the window: evidence packet and staged rollback

1. Assign individually identifiable release commander, deployment/DB operator,
   independent verifier, recovery contact, incident owner, commercial baseline
   approver, security key custodian and verified Company operational contact.
   Capture their access authority, backups and escalation substitutes in the
   private release record. Record explicit L1/L2/U1/S1 decisions, U2 closure,
   separately authorized outage window, acceptable RPO/RTO **targets** and
   independently measured rehearsal outcomes against those targets,
   freeze/abort/reopen signatories and safe offline/manual custody continuity
   plan. No invented paper-ticket fallback or implicit custody state repair.
2. Inventory every actual API replica/process, host/container/service, startup
   command, artifact digest/Git SHA, dependency lock, schema/ACL/proof version,
   audience/keyId (no keys), worker/scheduler, pool identity and operator tool.
   Include standby/autoscaling images, release jobs, migrations/provisioners,
   cron/manual scripts, direct SQL integrations, deployment hooks and direct
   ingress paths. Record native/Web supported contract versions separately.
   Locate these from actual deployment manager/process and DB connection
   evidence; reconcile the full set against the inventory table above and
   require independently checked signatures/digests. Repository filenames do
   not populate the inventory. An unknown writer or consumer is a HOLD.
3. Stage two immutable proof-capable artifacts: N (release) and R (rollback).
   Build R from the reviewed proof-capable N foundation with reset disabled or
   prior compatible business changes selected; retain identical protected
   writer/proof/ACL/admission/receipt contract. Record source SHA, build digest,
   migration range, secret/key requirements, Staff Web/native transport and
   signed/reviewed compatibility matrix. Both must reject an old authority
   boundary and refuse to start against missing/older schema, weakened grants,
   wrong audience, key epoch or partial admission. A historical pre-proof
   binary is never R, even when the reset flag is OFF. Stage both before C0;
   record rollback traffic switch and exact admissible data contract.
4. Restore a real encrypted backup into independently attested **isolated**
   infrastructure with synthetic or authorized sanitized data; apply real
   ordered migrations and
   updated provisioner; exercise both N and R against final ACL/schema. Re-run
   provisioner twice, verify no weak DML/old EXECUTE/PUBLIC/inherited path
   returns; stale provisioner and stale binary must fail closed before traffic.
   Revoke/rotate the historical migration/admin credential and fence its
   runner identity/configuration **before** C3 in the rehearsed sequence; an
   old runner that still owns a privileged live credential can restore weak
   grants after the ACL snapshot. Rotate/revoke old identities in the actual
   authorized release as a C3 precondition, including remaining active sessions
   or configuration copies; do not silently reuse the old grant-capable role.
   In an isolated C3/C4 rehearsal **before C6 reopens any traffic**, test the
   **old** provisioner using its previous revoked credential: it must fail
   authentication/authorization. Never execute a historically privileged
   provisioner against reopened production. After C6, monitor effective ACL
   drift with safe reads and revoke protected readiness on any regression.
   Test approved N/R plus the **new** separated privileged identity twice,
   proving restrictive grants persist and legitimate narrow commands work.
   Seal executable artifacts, startup versions and operator job allowlist;
   continuous role/grant drift detection must remove unsafe replicas from
   readiness and halt protected traffic. This is a proposed operator gate,
   not proof that an old external job exists or a credential was rotated.
   Rehearse N -> R -> N, key overlap/retirement, admitted/HOLD account cases,
   actual password/TOTP/refresh, push invalidation, tenant/entitlement negatives,
   conflict tests, unknown COMMIT and log canaries. All tests here are NOT RUN.
5. Inventory database version/extensions/topology, effective ownership/grants,
   full migrations including 112 and actual backups/WAL/replication facilities.
   Take an encrypted full recoverable database backup plus roles/grants,
   function definitions, deployment/configuration manifests and admission
   evidence. Record snapshot/LSN if available, consistency boundary, integrity
   digest, restore target/test, measured RPO/RTO and operator/access controls.
   Restore an **older** snapshot in isolated infrastructure and demonstrate
   post-snapshot MFA code consumption, accepted TOTP steps, session revocation,
   role/entitlement change, retired key and superseded invitation/reset links
   are reconciled from a trustworthy outside-backup monotone source **or**
   conservatively held/revoked before admitting traffic. Do not assume PITR,
   replicas or vendor snapshots exist. If they do not, arrange an
   offline consistent backup and approve its longer downtime.
6. Separately back up U1 verifier encrypted material/key registry and recovery
   wrapping secrets under approved independent custody; include current MFA
   keys needed to preserve admitted factors. Never place plaintext keys in DB
   dumps, artifact manifests, terminal arguments or repository. Verify recovery
   can restore key material without giving runtime migration authority.
7. Provision U1 keys into actual protected app/SQL verifier delivery boundaries
   without printing values; validate identity/audience/key agreement using
   synthetic proof canary. Seal final N/R/migration/provisioner artifacts and
   remove automatic fallbacks that can launch stale versions. If R cannot be
   built/tested, abort unless L2 explicitly approves outage/fix-forward only.

### During the window: checkpoints

| Checkpoint | Required action and proof before advancing |
| --- | --- |
| C0 pause | **Entry:** authorized window, L1/L2/U1/S1 sign-off, U2 and observed N/R/restore evidence complete. Close auth-sensitive admission at every API/direct ingress; pause protected management/onboarding/activation/push registration and auth-writing jobs/tools, not only login. Stop old processes and all automatic restart paths; restrict non-release privileged work. **Exit evidence:** independent inventory reconciliation, ingress-deny probe, named hold/abort operator and timestamp. |
| C1 drain | Wait for every old request/transaction/pool to finish within existing deadlines; inspect authoritative PostgreSQL sessions, prepared transactions, long-running requests and unexpected writers. Only an authorized operator may terminate overdue approved clients, then reconcile unknown outcomes on a new lease. A timeout or failed ROLLBACK never proves COMMIT failed. **Exit evidence:** zero old writers/transactions and independently verified final consistent checkpoint; unexpected client = HOLD. |
| C2 additive | Apply reviewed **forward-only** U1 key/challenge/receipt/admission/typed-command schema, respecting ordered dependencies and retaining migration 112. Stage N and R without readiness or protected traffic; never mix old and new serving versions. **Exit evidence:** exact applied migration/schema hash, private grants, pending boundary state and no public admission; unknown migration COMMIT = HOLD and reconcile. |
| C3 boundary | Under complete drain, reconcile/import L1 manifest against exact state, permanently revoke every legacy Staff session/refresh ancestry, disable bound push and clear provider tokens, retire legacy PENDING MFA, install typed authenticated writers, remove old sensitive DML/`EXECUTE` including PUBLIC/inherited/overloaded paths and update final provisioner. **Before activation** rotate/revoke all historic migration/admin secrets, terminate/fence old runner sessions and disable old runner identities/configuration/restarts; permit a newly scoped privileged identity only for approved N/R jobs. Atomically activate one durable admission/grant/key/proof boundary after full counts and receipts match. **Exit evidence:** durable boundary version, manifest digest, terminalization counts, role/function ACL snapshot and credential-fence record; partial/unknown state = HOLD. |
| C4 readiness | Verify **every** N/R replica's DEC-025 TLS, single-runtime-pool least privilege, installed schema/provisioner/ACL/command signatures, complete admission, active signer/verifier key ID/epoch, retirement ledger and deny-old-binary startup. On isolated C3/C4 rehearsal **before any C6**, prove old credential+old provisioner denial; after release rotation, verify revoked old credential authentication failure without executing old code on reopened production. Run approved N/R provisioner twice with the new privileged identity and prove old DML/`EXECUTE`/PUBLIC/inherited privileges remain denied. Independently check deployed effective `pg_proc` overloads and caller role graph, plus ACL drift fail-closed readiness. **Exit evidence:** signed per-replica parity and privilege matrix; any mismatch = HOLD. |
| C5 validate | Under paused or strictly controlled synthetic test admission, exercise genuine password/TOTP/recovery, Web/native login/refresh/logout, active admitted manager sensitive MFA, legacy access/refresh denial, HOLD denial, legacy PENDING restart, consumed refresh replay-family revocation, new push registration and delayed old registration denial, controlled operator case and old SQL-writer denial. Compare private receipts, audit, quotas and state under commit/rollback/unknown-COMMIT paths; inspect synthetic markers through app/driver/PG/proxy/trace/error/cancel sinks. **Exit evidence:** per-test result and independent sign-off with zero unexplained secret exposure or security-state mismatch; never impersonate a production User. |
| C6 reopen | Release commander and independent verifier compare C0–C5 evidence against approved L1/L2 scope, RPO/RTO objectives, operational continuity and abort criteria. Allow **small admitted traffic only to N**, observe authentication/MFA, field-safe reconciliation and ACL/key drift; expand only after defined actual health thresholds. Resume each authorized worker/job after version/role check, keep historical privileged runners and old processes permanently fenced. Record actual outage duration, unresolved HOLD cases and sign-in/pending-enrollment notices. **Exit evidence:** signed reopen checklist and monitored current boundary; failed gate = maintain secure outage or compatible R/fix-forward. |

Abort at any missing inventory, backup/restore proof, custody mismatch, unreconciled
authority, unexpected writer, ACL drift, secret canary disclosure or failed
N/R compatibility test. Before C3, return to old service only if no trust/grant
boundary changed and operator verifies full rollback of additive staging and
no partial admission. After C3, use **only** proof-capable compatible R or an
explicitly approved secure outage/fix-forward; old pre-proof binaries and
historic migration credentials remain denied. Partial unknown migration
COMMIT requires private durable checkpoint reconciliation on a fresh authorized
connection before any retry/reopen. A release-commander decision alone cannot
override a failed independent verifier, missing U1 key or uncertain legacy
authority. The trusted verifier records a nonsecret abort reason and next
permitted checkpoint; do not claim any live C0–C6 checkpoint was executed.

### Post-cutover observation

Use safe aggregate counts for admission failures by capability, invalid/retired
key IDs, replay/conflict/receipt outcomes, startup ACL drift, auth/MFA success
rates, unexpected direct-writer failures, queue age, lock timeouts/deadlocks and
pool saturation. No credential, proof, nonce, hash, recovery verifier or PII
labels. Reconcile audit/admission counts and prove legacy sessions/push stay
terminal. Alert thresholds are recorded from actual baseline and Owner-approved
service objectives before reopening; this source inspection provides none.
Document ordinary support paths for new sign-in, pending restart and HOLD cases.

## Rotation, retirement, key loss and outage

This section constrains U1; exact key storage/loading belongs to the U1 contract.
PROPOSED DESIGN: maintain separate signing-enabled, verification-only and retired
states per audience/keyId. A replacement ID never reuses old bytes. First install
and verify replacement verifier custody; then distribute to all inventoried
replicas; switch signing only after readiness confirms agreement. Old key accepts
only previously issued unexpired bound proofs. Its overlap is at least enforced
proof lifetime plus allowed clock skew and bounded in-flight completion;
30 seconds alone is insufficient without the U1 expiry/skew contract. Proof TTL
does not extend transaction/statement/lock budgets. No raw secret probe is needed.

**Activation is a committed barrier, not a replica-local flag:** after
independent replica/key-ID attestation, the approved operator locks old/new
key records in deterministic order and atomically records one `ACTIVE_SIGNING`
key and its promotion epoch. Typed prepare may select only this committed key
under its transaction-held rank-15 SHARE lock; `VERIFY_ONLY` may verify only
an already-issued, still-valid same-transaction challenge, never mint a new
one. A stale replica fails readiness. Exercise promotion/prepare/execute and
unknown promotion COMMIT on real PostgreSQL before accepting this proposal.

Retirement must serialize against final command admission using the U2 key lock:
commands that acquired acceptance first may commit; retirement waits for those
bounded transactions, then its COMMIT is the barrier after which old-key commands
cannot mutate. Emergency response first closes ingress/cancels or drains approved
in-flight work, retires the key under the same barrier, then verifies completion.
Do not promise instantaneous last-byte/previously committed revocation. Replicas
with stale signing state fail authoritative DB validation/readiness and never
fall back to retired key or weak writer. Retired IDs remain retired through
rollback and restore; the deployment incident retirement ledger is reapplied
before restored service is admitted. If retirement COMMIT acknowledgement is
lost, record **UNCONFIRMED**, stop old-key signing and independently reconcile
the protected key state; neither expiration nor a log line proves retirement.

| Failure | Safe response and recovery |
| --- | --- |
| One replica cannot load current proof key | Remove from traffic; infrastructure-unavailable, not bad-password or account-disable. Verify custody and reload approved artifact; no MFA reset. |
| All proof keys unavailable but not compromised | Pause protected writes; restore exact encrypted material via approved custodians, validate audience/registry then canary. If irrecoverable, generate approved new keyId and load verifier/app together under drain. Existing admitted MFA factors use separate keys and need not reenroll. |
| Proof key suspected disclosed | Stop signing/ingress, inventory exposure, emergency retire and rotate under barrier; reconcile commands/receipts in exposure interval. Do not infer that every factor/password is compromised; investigate actual boundary. |
| MFA encryption/recovery key lost | Proof-key replacement cannot decrypt old seeds or verify old codes. Restore securely backed-up original MFA keys or selective mediated factor/code recovery. No silent mass reenrollment; wider disruption requires explicit incident approval. |
| DB unavailable or key registry inconsistent | Fail protected commands closed with retryable infrastructure outcome; preserve client credentials/transient state according to existing contracts. Unknown commit follows operation-specific receipt reconciliation on a fresh authorized connection. No blind secret-issuing replay. |
| Deployment fails after restrictive boundary | Serve verified R or stay in secure outage and fix forward. Reset feature flag cannot rehabilitate an old login/MFA binary. |

## Five distinct rollback meanings

| Type | Permitted action | Forbidden shortcut / required proof |
| --- | --- | --- |
| Application | Route to staged R compatible with final command/schema/ACL/admissions/current keys. Drain before switch. | No historical binary requiring removed privileges; verify R artifact digest and post-switch ceremonies. |
| Schema/database | Prefer forward repair of additive schema. Full restore is incident recovery into an isolated target, reconciled to approved RPO before controlled switch. | No destructive down migration or old snapshot that silently revives sessions, codes, key IDs or grants; reconcile append-only history and later custody/payment facts. Record any unavoidable data loss approval. |
| Key retirement | One-way denial of old keyId, replacement provisioning with current admission registry. | Never unretire/reuse a key to make R pass; reapply retirement ledger after restore. |
| Privilege | Maintain final restrictive ACL; correct accidental over-denial only with reviewed narrow replacement and final provisioner parity. | Never restore unsafe DML/old definers, even temporarily; capture effective-privilege proof after repair. |
| Operational security recovery | Hold affected traffic/capabilities, reconcile receipts/state and verified identity cases, then resume through N/R. | Neither blanket password/factor reset nor emergency User disable is a surrogate for authority/secret repair; do not fabricate field completion. |

Purpose-specific uncertainty remains: consumed refresh replay may commit family
revocation while reporting failure; normal pending enrollment may retrieve seed
only on its exact original session; reset issuance retry must not redisclose a
link; recovery-code reissue must not redisclose a prior list. Reconciliation
returns only allowed nonsecret result. An infrastructure outage is not evidence
that a secret-issuing command did not commit.

**Older-backup authority checkpoint (PROPOSED, required for C4 after restore):**
the external monotone checkpoint cannot track only key retirement. It must
either durably reconcile post-snapshot consumed MFA recovery codes, accepted
TOTP steps/generations, revoked User/Staff sessions and refresh lineage,
terminal push registrations, invitation/reset generations, receipt identities,
membership/entitlement authority and retired signing-key IDs **or** fail closed
for each unprovable object. Prove ledger provenance, completeness, independent
backup/restore availability, monotone version order and a cutoff covering
every irreversible action after the restored snapshot. A local restored audit
row is **not** an independent post-snapshot checkpoint. If that evidence is
incomplete, revoke affected restored sessions/refresh, terminalize and clear
provider tokens for affected push registrations, HOLD uncertain MFA factors,
code generations, invitations/reset links and protected privileged memberships
until independently verified recovery/re-enrollment. Reconfirm Organization
identity/ownership and typed commercial entitlements from separate authority;
an entitlement-only HOLD cannot disable necessary field/Guest custody completion
under DEC-088. Never restore an earlier last-accepted TOTP step or old recovery
generation as currently usable, resurrect consumed refresh family, reissue
an old link or reactivate a retired proof key. A restored password login,
database audit or User ACTIVE value alone cannot establish post-snapshot
authorization. Preserve immutable operational/audit history and reconcile
unavoidable physical-custody/payment changes with separately authorized domain
commands, recording actual RPO loss; do not manufacture events to fill a gap.
Rehearse an **older backup** with post-snapshot consumed code, accepted TOTP,
revoked session, changed role and superseded reset generation, then verify both
ledger-complete and ledger-missing/fail-closed outcomes. RPO/RTO targets,
measured results and mediated recovery capacity require Owner/operator
acceptance; no such ledger or restore test is established by the repository.

## Minimal Owner decision package

U1 custody/trust-root selection is a separate material approval; this document
does not create a competing infrastructure choice. Engineering writer names,
private schema mechanics and lock analysis do not need another Owner vote.

| Decision | Evidence, feasible alternatives and recommended answer | Guarantee, cost, decline consequence and gate |
| --- | --- | --- |
| L1 legacy admission and mediated recovery | **Recommended Owner choice:** authorize an independently evidenced **per-object** ADMIT/HOLD/RETIRE baseline at drained T0 for exact User/email/hash/status, Organization/Location, all-status memberships/full grants, typed entitlements, admitted ACTIVE MFA/recovery generation and controlled operator identity; revoke every legacy SS/RC and bound push, retire legacy pending enrollment, keep current authenticator only after independent owner confirmation, and require mediated independently verified no-phone/no-code/credential repair. Prefer two named VAYLET approvers for sensitive recovery; a single accountable operator with mandatory independent post-review is a distinct weaker choice needing explicit acceptance. Alternative: rebuild all authority/factors (high disruption); unqualified snapshot trust is **not recommended** because it cannot establish prior credential origin. | Establishes bounded new prospective trust without falsely certifying historical state; consumes independent Company/commercial verification and recovery staffing. HOLD cannot grant reset or MFA issuer authority. Reject/defer L1: keep affected capabilities HOLD and cutover bootstrap blocked; do not auto-disable operations or reinterpret historic data. |
| L2 outage and irreversible boundary | **Recommended Owner choice:** approve a specific drained auth-sensitive downtime window only after naming actual operators, evidence-complete topology, authenticated-writer/ACL closure, tested immutable proof-capable **N and R**, historical privileged-credential/runner revocation before boundary activation, older-backup security-monotone reconciliation or conservative HOLD, key promotion/retirement and encrypted restore rehearsal. Authorize post-C3 rollback **only** to proof-aware R; if R cannot be built, require a separately and explicitly approved secure-outage/fix-forward alternative, or postpone. Approve no-active-shift timing or an independently validated field-custody continuity protocol. | Existing sessions stop; employees reauthenticate and legacy pending MFA restarts; migration/grant rollback is intentionally unavailable. Actual rehearsal must measure outage/RPO/RTO, key and MFA-secret recovery and restart/worker behavior against approved targets. Decline/defer L2 or fail any gate: **no C0–C6 execution or reopening**, stay design-only/secure outage as applicable. |

**Exact Owner response needed (proposed, not signed):** decide L1's selective
baseline and independent recovery operator policy, and L2's drained downtime,
mandatory compatible R or separately approved fix-forward-only contingency,
plus acceptable RPO/RTO/operational-continuity limits. Approval of a plan is
not release or credential-recovery authority; the Owner must separately accept
U1 key custody and S1 internal SQL contract supersession, while U2 and live
environment attestations must be verified before implementation/reopen. If the
Owner declines either L1 or L2, record the declined option and affected
capabilities as HOLD instead of inferring consent from silence.

No acceptance is asserted for L1/L2. External operational evidence is a release
gate, not an additional architecture-selection exercise. Once these material
choices and U1/U2 are approved, implementing the exact protected admission and
recovery commands still requires code/tests; this design document does not
activate an operator bypass or the deferred reset API/UI.

## Acceptance evidence to collect later

All runtime/deployment tests below are NOT RUN in this design task.

1. Existing-data fixture covers admitted/uncertain User/hash, each role and full
   grant set, active/pending/retired factors, each recovery generation and
   consumed code, legacy session/refresh/push, Organization and entitlements.
   Assert no HOLD dependency acquires sensitive/reset authority and no unrelated
   tenant/history/status is changed. Exercise real password/TOTP/code paths.
2. Prove cutover concurrency and atomic boundary with new login, refresh,
   enrollment, management, push and operator attempts; commit/rollback, process
   loss and unknown acknowledgement at every C2/C3 checkpoint. Partial staging
   cannot serve. Source inspection is not deadlock proof.
3. Prove retained active-factor path needs no reenrollment; pending restart is
   explicit; admitted recovery stays single-use; lost-phone/no-code recovery
   needs mediated case; identity or authority uncertainty cannot self-enroll
   around HOLD. Re-run last-admin/all-status/entitlement noninterference checks.
4. Fresh and upgraded databases converge after repeated final reprovisioning;
   stale provisioner/binary/operator tool cannot reopen weak writers. Test N/R
   startup and real ceremonies; include failed rollback/fix-forward rehearsal.
5. Restore backup, lose proof key, lose separate MFA key, retire key during
   in-flight proof, bring back a stale replica, rotate runtime credentials and
   reconcile unknown COMMIT. Record actual RPO/RTO and irreversible changes.
6. Success/validation failure/rollback/cancel/instrumentation-error canaries
   traverse app, PG parameters/query/error, driver, tracing, proxy, extensions,
   audit, crash and backup/export sinks with synthetic markers only. No secret
   observability attestation is inferred from application redaction source.
7. Compare the real deployment process/role/runner inventory with DB sessions;
   prove old migration credential and provisioner denial **only during isolated
   pre-C6 rehearsal**, prove revoked credential authentication denial at live
   C4 without executing old code, and prove two approved N/R provisioner runs
   preserve restrictive roles. A late privileged regrant must fence readiness.
8. Restore an older backup with known post-snapshot TOTP/code/refresh/push,
   role, reset-link and proof-key terminal events; prove a complete outside-backup
   monotone reconciliation or conservative HOLD/revocation for each missing
   event. Record independently measured recovery duration, latest recovered
   consistent boundary, actual RPO/RTO, accepted loss and operational custody
   reconciliation. Never infer recovery success from a successful DB startup.

Final independent auth, SQL and operations reviewers must review the combined
final package and identify finding severity/evidence/correction/acceptance proof.
This supporting document is not independent acceptance and cannot override a
BLOCKER/MAJOR finding. Documentation inspection and `git diff --check` are the
only validations claimed by this author; production readiness is not claimed.

## Planning gate index

### Repository facts discovered

The source evidence table identifies the actual deployment definitions,
provisioner and controlled operator boundaries inspected at the pinned SHA.

### Binding requirements

The evidence section retains Accepted authentication, MFA, tenant, push,
commercial safety and append-only history contracts.

### Existing implementation patterns

Controlled migration-credential CLIs perform purpose-specific transactions;
the API owns genuine credential verification. Neither a CLI operator label nor
a database hash is a new issuer credential.

### Locked decisions

Option A direction is selected; no new operational trust baseline is Accepted.
The listed Accepted DEC contracts remain binding.

### Derived conclusions

Prospective writer closure alone cannot authenticate legacy origin. Old
privileges/binaries cannot return after the boundary; exact-session pending
enrollment cannot survive its parent session's retirement unchanged.

### Unresolved decisions

L1/L2 require the two concrete material approvals above; U1 custody requires
separate approval through the companion specification. Actual deployment facts
remain unattested.

### Risks / boundary violations

Unchecked baseline trust, stale binaries/provisioners, revived retired keys,
unreconciled commits and unenforced HOLD dependencies defeat admission safety.

### Proposed implementation plan

After approvals, implement protected admissions/operator commands with the U2
writers, stage N/R and rehearse, then execute only separately authorized C0-C6.

### Test matrix

The eight acceptance rows above specify future real-boundary evidence. None ran.

### Files expected to change

DEFINITELY RELEVANT in future implementation: auth/MFA/session/push readers and
writers, controlled operator tools, final provisioner/verifiers and additive
migrations. CONDITIONAL ON DECISION L1: protected admission import/registry and
mediated existing-User repair command. Exact filenames are owned by the final
implementation plan. NOT JUSTIFIED YET: provider-specific deployment/KMS code.
This task changes only this documentation file.

### Explicitly out of scope

Source, DB/schema/privilege execution, exploit reproduction, live secrets,
production actions, reset API/UI, PR, merge, deploy and Issue closure.

### Ready-to-implement verdict

DECISION REQUIRED for material L1/L2/U1 approvals and final combined review.
No additional general architecture phase is proposed. Deployment remains gated
on external attestations and the actual implementation/rehearsal evidence.
