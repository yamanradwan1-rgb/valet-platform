# Issue #416 Option A legacy trust, cutover and recovery

Status: PROPOSED DESIGN; Owner decisions L1/L2 below are not Accepted.
Source baseline: `62d0a3d3f97a4186d2dd85642212efc7b4f35d42`.
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
| `apps/api/src/common/database/postgres-transaction.ts` | A COMMIT error yields UNAVAILABLE and destroys the connection. Subsequent ROLLBACK is not proof that COMMIT failed. |
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

## L1 proposed trust policy: explicit baseline, selective recovery

Recommendation: a controlled, per-object administrative admission baseline at
the drained boundary T0, followed exclusively by protected writers. This is a
new explicit trust-root event; it is not retrospective authentication proof.
No row becomes trusted merely because it predates T0, has an audit event, or a
user can log in. No universal forced active-factor reenrollment is proposed.

Before scheduling T0, a named authorized VAYLET deployment/security operator
prepares a protected admission manifest. The Owner verifies the Company's legal
contact/authorized roster through a previously established independent contact
channel, not a contact newly obtained from the database under review. Company
authority confirms named User/email, memberships/roles and full Location grants;
VAYLET commercial authority confirms Organization and typed entitlements. The
operator matches exact database IDs and object versions to that evidence.
No password, seed, code, verifier, token or proof enters the public manifest.

The manifest records release/audience, object class/id, expected version or
digest, disposition ADMIT/HOLD/RETIRE, evidence reference, approver identity,
operator identity and timestamp. Its full sensitive content belongs in the
controlled deployment evidence boundary; the repository stores only a safe
digest/reference and aggregate counts. An operator-controlled additive import
records the manifest digest and per-object admission state behind protected
ACLs; ordinary SQL cannot change admissions. Exact implementation schema is
mechanical under the approved policy, not a runtime-role write or a generic
JSON policy store. Existing history remains unchanged.

Admission is a dependency graph: session -> User -> membership/role/grants ->
Organization -> relevant entitlement; MFA assurance additionally -> admitted
factor and applicable recovery generation. Each protected command requires the
nodes relevant to its capability. HOLD denies that capability with existing
non-disclosing errors. A commercial HOLD only gates Management. An identity
HOLD cannot be bypassed by enrollment or a possession check. Preserve membership
and grant counts across all statuses; do not manufacture sole-company reset
eligibility by hiding HOLD or inactive rows.

At T0 the operator reconciles every manifest entry against locked/drained
current state. Changed/missing objects become HOLD until reviewed; never apply
a stale approval to a new hash/role/factor. Admission import, session/push
retirement and boundary activation must be one reviewed drained migration
contract with a durable checkpoint. If too large for one transaction, stage
private admissions while traffic remains paused, then atomically activate the
new boundary only after complete reconciliation; partial batches are never
publicly usable. Snapshot counts and digest prove completeness, not identity.

| Object | Proposed treatment and retained trust source | Missing/uncertain evidence |
| --- | --- | --- |
| StaffAuthSession and its MFA/activity times | Revoke every pre-boundary Staff session at T0; retain rows as history. New sessions require genuine password authentication against admitted User. No copied assurance/time. | No legacy session is grandfathered, regardless of apparent MFA freshness. |
| StaffRefreshCredential, including consumed lineage | Retain historical verifiers/consumption; parent legacy session permanently rejects all generations. Do not clear consumption, remap to new session or issue replacement refresh from a database hash. | User signs in anew; lost response follows purpose-specific login/refresh recovery, never hash-only issuance. |
| Active push bindings | Disable active registrations attached to retired sessions and clear provider token under accepted session invalidation rules. Keep truthful history/reason. | New authenticated session must register/confirm; do not relabel provider invalidity or silently transfer endpoints. |
| ACTIVE TOTP factor | ADMIT exact factor/User, protected envelope, replay counter and recovery generation only after explicit baseline factor acceptance by independently verified account owner plus operator record. Existing authenticator retained; first new-session assurance requires fresh genuine TOTP. | HOLD factor, not automatically RETIRE. TOTP possession alone is insufficient admission evidence. Use controlled verification/recovery below. |
| PENDING TOTP factor | Its accepted seed retry is tied to original exact session. Because T0 revokes that session, explicitly RETIRE pending enrollment as part of L1; no seed disclosure to a new session. Preserve history. | After admitted identity and authority, begin fresh enrollment and confirm new TOTP. No recovery codes existed for an unconfirmed pending factor. |
| Recovery-code set | ADMIT only the exact accepted active factor's current generation/selector/verifiers; retain consumed flags. Baseline account-owner confirmation covers issuance lineage; no raw-code collection. Old generations stay unusable. | HOLD set even if factor is admitted. Owner with genuine TOTP can explicitly reissue codes through current accepted flow; no-code owner uses mediated recovery if TOTP unavailable. |
| User/email/password/status | ADMIT identity from independent roster/provisioning evidence; retain hash only under explicit baseline risk acceptance, never call hash matching origin proof. Keep PENDING/DISABLED status. | HOLD authentication issuance until verified repair; current create-only provisioning cannot repair an existing identity. Purpose-specific mediated repair is required, no direct ad hoc SQL password edit. |
| OrganizationMembership role/status and Location grants | Company-authorized roster and exact full grant set establish baseline. Revalidate last-usable-admin and existing lifecycle rules on later writes. Admission does not grant field authority to ORG_ADMIN. | HOLD relevant capability; do not demote, delete membership, alter counts or revoke other organizations merely for missing evidence. |
| Organization identity/status and Location ownership/status | VAYLET contractual operator/customer records plus independently confirmed company boundary; retain authoritative ownership, not a client-supplied tenant UUID. | HOLD new protected admission for affected organization pending controlled reconciliation. Keep physical records; no fabricated completion or commercial suspension workaround. |
| OrganizationSubscription/typed entitlements | VAYLET commercial records and authorized platform operator attest exact booleans/status, independent of opaque plan label. | Management HOLD; field and minimal Guest completion remain independent per DEC-088. Tenant admin cannot attest/write entitlements. |
| Controlled operator identity | Existing DEC-025 protected migration/deployment boundary plus individually attributable access and separately retained verification record. CLI operatorRef labels audit; it grants nothing. | No bootstrap/recovery runs until real operator is assigned and access verified. No public signing endpoint or tenant-admin substitute. |

Admission records are current trust decisions, not assertions that historical
events were genuine. A compromise finding changes the incident response scope;
absence of evidence alone is not such a finding. If Owner cannot accept baseline
trust for an object, selective re-establishment is mandatory for that object.

## Usable bootstrap and exception ceremonies

All following are PROPOSED DESIGN; no existing endpoint is claimed to implement
admission. Use the final U2 lock graph, exact target versions and protected
operator boundary. Every successful operator operation has immutable operation
identity, request digest, safe result and atomic account-security audit with
CONTROLLED_OPERATOR attribution. A receipt is not identity evidence. Replays
reprove current operator authority and return only safe completion facts.

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

The external verification case records verified identity, source, verifier,
time, target, scope, reason and approval; it never records recovery secrets.
Minimum recommendation is Owner-authorized VAYLET operator verification with a
second named approver for no-code recovery/authority correction. This adds no
new authentication provider. If staffing cannot support two people, Owner may
approve one individually attributable operator with post-review; that weaker
operational control must be explicit in L1. No specific operator is attested here.

## L2 proposed drained cutover contract

Authentication downtime affects active field staff too; select a no-active-shift
window or Owner-approved operational continuity plan before scheduling. Do not
claim that Guest or field operations will stay available across API drain.
Guest can remain available only if its actual independent safe routing/consumers
are verified; otherwise disclose the broader outage. Offline actions may queue
but cannot commit protected commands using revoked Staff credentials; rehearse
new-session reconciliation without changing accepted command identities.

### Before the window: evidence packet and staged rollback

1. Assign release commander, deployment/DB operator, independent verifier,
   recovery contact, incident owner and Company operational contact. Record
   approval L1/L2 and U1 custody approval, authorized outage window, explicit
   abort criteria and safe offline/manual custody continuity plan. No invented
   paper-ticket fallback or implicit custody state repair.
2. Inventory every actual API replica/process, host/container/service, startup
   command, artifact digest/Git SHA, dependency lock, schema/ACL/proof version,
   audience/keyId (no keys), worker/scheduler, pool identity and operator tool.
   Include standby/autoscaling images, release jobs, migrations/provisioners,
   cron/manual scripts, direct SQL integrations, deployment hooks and direct
   ingress paths. Record native/Web supported contract versions separately.
   Locate these from actual deployment manager/process and DB connection
   evidence; repository filenames do not populate the inventory.
3. Stage two immutable proof-capable artifacts: N (release) and R (rollback).
   Build R from the reviewed proof-capable N foundation with reset disabled or
   prior compatible business changes selected; retain identical protected
   writer/proof/ACL/admission/receipt contract. Record source SHA, build digest,
   migration range, secret/key requirements and signed/reviewed compatibility
   matrix. A historical pre-proof binary is never R.
4. Restore a real encrypted backup into attested isolated infrastructure with
   synthetic or authorized sanitized data; apply real ordered migrations and
   updated provisioner; exercise both N and R against final ACL/schema. Re-run
   provisioner twice, verify no weak DML/old EXECUTE/PUBLIC/inherited path
   returns; stale provisioner and stale binary must fail closed before traffic.
   Rehearse N -> R -> N, key overlap/retirement, admitted/HOLD account cases,
   actual password/TOTP/refresh, push invalidation, tenant/entitlement negatives,
   conflict tests, unknown COMMIT and log canaries. All tests here are NOT RUN.
5. Inventory database version/extensions/topology, effective ownership/grants,
   full migrations including 112 and actual backups/WAL/replication facilities.
   Take an encrypted full recoverable database backup plus roles/grants,
   function definitions, deployment/configuration manifests and admission
   evidence. Record snapshot/LSN if available, consistency boundary, integrity
   digest, restore target/test, RPO/RTO and operator/access controls. Do not
   assume PITR, replicas or vendor snapshots exist. If they do not, arrange an
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
| C0 pause | Close authentication-sensitive admission at every API/direct ingress; pause protected management/onboarding/activation/push registration and auth-writing jobs/tools, not only login. Stop old processes and automatic restarts. Restrict non-release migration/operator activity. Record actual inventory reconciliation and ingress denial. |
| C1 drain | Wait for every old request/transaction/pool to finish within current deadlines; inspect authoritative DB sessions/transactions, including prepared transactions and unexpected writers. Unexpected clients block progress. Explicitly cancel/terminate only approved app clients if necessary and reconcile uncertain operations; never assume a timeout rolled back COMMIT. Verify no old writer remains and take final consistent recovery checkpoint. |
| C2 additive | Apply reviewed forward-only additive key/challenge/receipt/admission/command schema with controlled migration identity, ordered dependencies and 112 retained. No public traffic yet. Stage N processes without protected readiness/traffic; no mixed serving during this phase. |
| C3 boundary | Reconcile/import L1 manifest, permanently invalidate legacy Staff sessions/refresh ancestry and push endpoints, retire pending factors, install authenticated writers, close every old signature/direct sensitive grant, update and run final provisioner. Activate one durable boundary version only after all complete. Capture aggregate counts/ACL snapshot. Failure means remain paused, not partial reopening. |
| C4 readiness | Every N replica verifies DEC-025 TLS/least privilege, schema/migration/ACL/provisioner version, audience, active signing and verifier key match, retirement state, required private helpers inaccessible, admission boundary and receipt command version. Missing/retired/mismatched key or stale binary is unready. Validate actual effective grants, not only role labels. |
| C5 validate | Run bounded synthetic real-ceremony canaries through approved API: login/MFA/refresh/logout, admitted manager sensitive command dry fixture, legacy access/refresh denial, HOLD denial, pending reenrollment, consumed replay revocation, push rebind, old writer denial and no secret sinks. Reconcile state/audit after each; no production user impersonation or exploit. |
| C6 reopen | Independent verifier signs checklist; route small admitted traffic only to ready N artifacts, observe then release full traffic. Stale replicas/jobs/tools stay stopped. Resume each writer only after version verification. Record actual outage duration and communicate sign-in/pending-enrollment consequences. |

Abort at any missing inventory, backup/restore proof, custody mismatch, unreconciled
authority, unexpected writer, ACL drift, secret canary disclosure or failed
N/R compatibility test. Before C3, return to old service only if no trust/grant
boundary changed and operator verifies full rollback of additive staging.
After C3, use R or approved secure outage/fix-forward. Partial unknown migration
commit is reconciled from durable checkpoints before any retry/reopen.

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

Retirement must serialize against final command admission using the U2 key lock:
commands that acquired acceptance first may commit; retirement waits for those
bounded transactions, then its COMMIT is the barrier after which old-key commands
cannot mutate. Emergency response first closes ingress/cancels or drains approved
in-flight work, retires the key under the same barrier, then verifies completion.
Do not promise instantaneous last-byte/previously committed revocation. Replicas
with stale signing state fail authoritative DB validation/readiness and never
fall back to retired key or weak writer. Retired IDs remain retired through
rollback and restore; the deployment incident retirement ledger is reapplied
before restored service is admitted.

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

## Minimal Owner decision package

U1 custody/trust-root selection is a separate material approval; this document
does not create a competing infrastructure choice. Engineering writer names,
private schema mechanics and lock analysis do not need another Owner vote.

| Decision | Evidence, feasible alternatives and recommended answer | Guarantee, cost, decline consequence and gate |
| --- | --- | --- |
| L1 legacy admission and mediated recovery | Existing SQL-writable sessions/factors and operator-authority facts lack prospective proof origin; accepted contracts do not decide a new trust baseline. Approve explicit independent per-object administrative baseline, all legacy Staff session retirement, pending-factor restart, retained admitted active factors/codes and selective HOLD/recovery. Alternative: independently rebuild every authority/factor (high disruption); or declare the entire snapshot trusted with explicit weaker historical assurance (simpler, not provenance proof). Recommend selective baseline plus two-person approval for no-code recovery/authority correction. | Future protected origin begins at T0 with explicit bounded baseline risk; no mass compromise assumption. Costs roster/commercial verification, controlled case staffing, new admissions/operator command implementation and user sign-in/pending restart. Decline: no grandfathering, affected state stays HOLD and cutover cannot grant reset authority. Implementation gate: legacy import/issuer admission and mediated bootstrap. |
| L2 outage and irreversible boundary | Existing branch has no proof-capable rollback artifact and repository does not establish production topology/restore operations. Approve drained auth-sensitive downtime, permanent legacy credential/key retirement, forward-only restrictive privilege boundary and tested R requirement. Alternative: approve secure outage/fix-forward if no R can be built; or postpone release. Recommend stage/test R before scheduling, choose no-active-shift window, retain fix-forward incident fallback. | Prevents old writers/mixed serving from laundering authority. Costs outage, forced sign-in/push registration, backups/restores, two immutable builds and rehearsals. Duration/RPO/RTO must be attested and accepted for actual environment, not guessed. Decline: no safe cutover/reopen; remain design-only. Implementation gate: release automation and irreversible cutover activation. |

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

The six acceptance rows above specify future real-boundary evidence. None ran.

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
