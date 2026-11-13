# Issue #416 — Option A cryptographic proof-key custody

Status: **PROPOSED DESIGN / U1 BLOCKED — OWNER DECISION AND DEPLOYMENT EVIDENCE REQUIRED**.
Scope: documentation only. No key was generated, injected or inspected; no SQL, API,
authentication, schema, runtime, production configuration or deployment was changed.
Source baseline: `62d0a3d3f97a4186d2dd85642212efc7b4f35d42` (the assigned
`cos/issue-416-key-custody` worktree). The Option A proposal and its
mechanics are **not** an Accepted DEC and are **not** implementation permission.

This document concerns **cryptographic command-proof keys**, not vehicle/physical
key custody. It supplies the missing U1 operator and security contract for the
authenticated narrow SQL writer direction selected by the Owner. It deliberately
does not assert the existence of a KMS, Vault, cloud identity, encrypted database
volume, backup service, or production secret injector.

## Authority and threat boundary

| Classification | Contract |
| --- | --- |
| **LOCKED — Owner** | Option A authenticated narrow SQL writers; design-only recovery; no changes to opaque `vsa1.`/`vsr1.` auth transport or the approved #416 reset product/API semantics. See [Issue #416](https://github.com/yamanradwan1-rgb/valet-platform/issues/416). |
| **LOCKED — Accepted** | DEC-023 authenticates actual password/bearer and enforces session rotation/revocation; DEC-024 uses its own durable anti-abuse HMAC key; DEC-025 requires one ordinary least-privilege API DB credential separated from the migration/admin job; DEC-072/075/076/078/079/080/081 preserve genuine MFA, push/session linkage, audit, current tenant/role/entitlement and five-minute sensitive MFA rules. |
| **DERIVED** | A caller possessing only ordinary runtime SQL rights, DB-readable session IDs/hashes or MFA timestamps must not create or restore authenticated authority. Revocation and receipt/secret retirement must be monotone. |
| **PROPOSED, NOT ACCEPTED** | Separate application proof signer, narrow private PostgreSQL HMAC verifier, 256-bit purpose-specific `vap1` key, transaction-bound one-use challenge/receipt and bounded key lifecycle as sketched in `issue-416-option-a-authentication-provenance.md`. |
| **UNRESOLVED / U1** | The actual production signer injection and SQL verifier provisioning, storage encryption/backup custody, accountable operators, rotation, disaster recovery and external secrecy attestations. |
| **OUTSIDE GUARANTEE** | Full application-host/signing-process compromise and privileged DBA/migration-owner compromise. Neither a private table nor HMAC makes the DB owner unable to recover the symmetric key. SQL-only denial of service remains possible. |

There are no ValetSession, Task or Dispatch transitions, no physical key
movement, and no Company-default/Location-override changes. Protecting the
command-key material is a prerequisite to future auth/security writer migration,
not an authorization grant for staff password resets.

## Source-backed deployment/custody inventory

This is a **repository inspection**, not an attestation of the production host,
running principals, external secrets, PostgreSQL configuration, backups or logs.
Paths below are relative to the repository root.

| Source / status | Observed fact and its limit |
| --- | --- |
| `.env.example:8-28,56-60,79-89,115-144` — **PROVEN IN TEMPLATE** | Separate runtime/admin DB URLs, MFA TOTP encryption/recovery HMAC and anti-abuse/handoff keys have examples. Some sender-only private/public material is explicitly compartmentalized. There is **no** Option A proof-key delivery/rotation entry or configuration in this template. A template cannot prove where live secrets reside. |
| `docker-compose.yml:1-19`; `infra/docker/README.md:1-5` — **PROVEN LOCAL ONLY** | PostgreSQL `17-alpine` uses loopback port mapping and named data volume. It contains no API/SQL signer/verifier provisioning, at-rest encryption, backup policy or production secrets manager. Local Docker volume persistence is not a verified encrypted production backup. |
| `infra/systemd/vaylet-customer.service:1-21`; `infra/systemd/README.md:1-32` — **PROVEN NARROW** | Customer service is configured with public/nonsecret local `API_ORIGIN` and Node startup. No production API process/service unit, signer injection, private DB-key provisioner or replica configuration is established by these files. |
| `infra/nginx/README.md`, `infra/scripts/README.md`, `infra/monitoring/README.md:1-20,33-39` — **NO DEPLOYMENT PROOF** | Infrastructure placeholders and an undeployed monitoring policy; operational logging/ingress secret redaction cannot be inferred from them. |
| `apps/api/src/common/database/runtime-database.module.ts:20-24,34-84`; `apps/api/src/common/database/postgres.ts:55-118,120-227` — **IMPLEMENTED GUARDS** | API uses a single `DATABASE_URL` pool, refuses `MIGRATION_DATABASE_URL` in production, enables certificate-verified TLS and checks live backend TLS and restricted role before serving. No proof-key read, key-ID match or verifier-lifecycle preflight exists here. |
| `packages/database/scripts/database-connection-policy.mjs:54-88,119-179,194-212`; `packages/database/scripts/provision-runtime-role.mjs:42-125,128-207,243-315` — **IMPLEMENTED GUARDS** | Separate production migration URL/TLS checks and runtime role/password separation; provisioner strips role inheritance, creates/restricts runtime role and reconciles existing table/function rights. No separate key-verifier credential or key-provisioning flow is defined. |
| `packages/database/scripts/mfa-runtime-privileges.mjs:1-46,105-207` — **CURRENT ACCESS TO REPLACE** | Runtime still receives direct session/refresh/factor/code write grants used by current auth. These cannot themselves prove a completed authenticated-writer cutover. Future grant closure must survive rerunning this provisioner and legacy SQL function signatures. |
| `docs/08_DECISIONS_LOG.md:1168-1358` (DEC-025); `docs/06_SECURITY_AND_DATA_RULES.md:45-71,854-871` — **ACCEPTED POLICY** | Runtime/admin DB identity isolation, production TLS and externally managed secrets are mandatory. These documents expressly do **not** establish a provider, encrypted backups, tested restore, secret rotation operator or live secret store. |
| `docs/16_PRODUCTION_DATABASE_DEPLOYMENT_CHECKLIST.md:52-104` — **UNFILLED EVIDENCE GATE** | Secret-storage ownership, credential rotations, encrypted backups and restore drill are unchecked and have no named operator/recorded result. A checklist is not deployment evidence. |
| `docs/decisions/DEC-075_STAFF_PUSH_OPERATIONAL_POLICY.md:315-338` — **ANALOGOUS POLICY ONLY** | Provider credential custody favors external injected/managed credentials and leaves exact secret-store/operator under another release gate; it does not choose a #416 key store. |
| `apps/api/src/modules/auth/mfa/mfa-crypto-config.ts`; `apps/api/src/modules/anti-abuse/anti-abuse-key.ts` — **EXISTING ISOLATED KEYS** | Existing cryptographic environment inputs protect other purposes. Sharing, reinterpreting, deriving from or reusing them as the `vap1` root is prohibited. |
| `.github/workflows/ci.yml` and `manual-security-audit.yml` — **CI ONLY** | Disposable PostgreSQL jobs and deterministic test MFA inputs exist. They do not attest live secret injection, logs, at-rest protection or backup/restore. |
| `packages/database/prisma/migrations/**/migration.sql` — **NEGATIVE SOURCE INVENTORY** | A scoped search found no `pgcrypto` declaration in committed migrations. This is not proof that a live cluster lacks the extension. Do not assume PostgreSQL has an available asymmetric signing/verification primitive or that its extension policy is approved. |

The existing `issue-416-option-a-authentication-provenance.md:91-177` marks
U1 blocked; `issue-416-option-a-review-auth.md:20-38` independently agrees
that ACLs alone cannot establish confidential at-rest storage/backup protection.
Current `docs/plans/issue-416-option-a-locks.md` in Prime's integration worktree
provides a **proposed** rank-15 key-lock/barrier design, not source runtime proof.

## Proposed cryptographic separation and data flow

1. A **signer** runs only within the trusted API authentication command path.
   After actual password/refresh/TOTP/recovery/invitation verification, it
   generates a purpose-bound HMAC for one immutable, typed command payload.
   It must not accept caller-supplied `isAuthenticated`, session hash, role,
   step-up timestamp or arbitrary command fields as sufficient proof, nor expose
   a signing endpoint/helper to the network, browser, tests in production, SQL
   runtime caller or support diagnostics.
2. The **ordinary API database principal** carries only the transient signed
   proof and typed command payload into the already selected single pool.
   It cannot read any reusable verifier/signing key, set a session GUC to make a
   definer trust it, perform direct sensitive DML, invoke a generic
   `sign/verify` oracle, or invoke private provisioning/retirement helpers.
   The HMAC proof itself is sensitive until expiry/consumption and must be
   excluded from SQL parameter/error/statement traces.
3. A **narrow PostgreSQL SECURITY DEFINER verifier** retrieves the matching
   protected verifier material under its separately owned private ACL, checks
   version, purpose, audience, payload digest, current state and proof MAC,
   and atomically consumes the transaction challenge with a durable receipt,
   domain mutation and audit. Function `search_path` must be fixed and no
   direct runtime EXECUTE on private lookups, table access, key-management or
   verification helpers is allowed. Runtime receives only narrowly specified
   authenticated writer `EXECUTE` after upstream writer closure.
4. **HMAC is symmetric**: the material that verifies a MAC can also produce
   one. Therefore `signer vs verifier` means *separate principals, access and
   execution paths*, not distinct cryptographic public/private keys. A single
   HMAC key necessarily exists in usable form inside the trusted API signer
   and behind the privileged SQL verifier boundary. DB backup/DBA compromise
   can expose it unless independently protected; those attacks are outside
   the E/F SQL-only guarantee, but at-rest and backup custody still require
   explicit operational review. A verifier that gets only a public hash of
   this HMAC key **cannot** verify HMACs.

Candidate proof input is the fixed ordered, canonical UTF-8 array already
proposed in `issue-416-option-a-authentication-provenance.md:98-114`:
version, key ID, deployment audience, purpose, operation ID, current-transaction
random challenge, backend PID **and full transaction ID**, verified current
User/session/Organization/membership, security version, exact payload digest
and bounded issued/expiry timestamps. The proposal is 256-bit independent
HMAC-SHA-256 and 30-second no-grace proof lifetime; **neither value is a
newly accepted Owner decision**. A transaction cannot successfully reuse a
challenge, change command target or swap audience and retain a valid proof.

The separate `vspr1.` reset link is a 32-byte random **bearer**, hash-only in
storage, scoped by Issue #416's locked 15-minute/one-use contract. Its
verifier/credential-key purpose is distinct from the internal `vap1` key and
from `vsr1.` refresh. Neither a raw reset bearer nor an opaque access/refresh
credential may serve as a `vap1` signing key or as a substitute for actual
issuer authentication. Command metadata/receipts must not retain these raw
bearers; any purpose-specific digest binding requires U2 review.

## Provisioning and operator ownership: decision required

**Candidate, conditional on an actual provider runbook:** a distinct 32-byte
proof root is produced by a named authorized VAYLET security/deployment
operator using approved cryptographic randomness, under one environment-specific
key ID and audience. One protected copy is injected into *each authorized API
signer replica* by an attested deployment secret boundary. The SQL verifier
must resolve the *same* selected material through a migration/operator-owned
private verifier storage boundary. SQL can use the material only inside the
approved definer. The private table/role is an **access-control component**;
its contents must also be protected by verified encrypted database storage,
snapshots, logs and backups. These external controls are currently **unknown**.

Provisioning is a dedicated, authenticated, audited, non-runtime deployment
operation after the approved schema/role setup; it must not be a normal API
endpoint, mutable client parameter, migration literal, SQL function source,
PostgreSQL GUC (`SET`/`set_config`), script argv, committed `.env`, CI fixture,
unprotected SQL statement, trace or application log. Inserting a plaintext
key through a PostgreSQL client parameter is **not automatically safe**:
verify actual server/driver/proxy logging behavior first. An encrypted secret
row is not sufficient if its decrypting key is also runtime-readable, logged,
or included in the same unprotected backup. Do not invent a key transfer
protocol or claim an encrypted table exists before its actual implementation
and deployment controls have been reviewed.

The current repository contains **no complete private SQL verifier
delivery/encryption mechanism**. Until an operator demonstrates a supported,
tested way to load material without introducing a runtime-accessible reusable
secret or raw SQL/provisioning log exposure, **U1 remains BLOCKED**. The narrow
fallback is to **keep protected writers/Issue #416 disabled** and submit
an explicit replacement proof mechanism for Owner/security review. An asymmetric
signer/private-key plus DB public verifier could avoid a symmetric DB root,
but requires confirmed PostgreSQL verification support/extension and a new
accepted design; `pgcrypto` HMAC does not itself confer asymmetric signatures.
A second privileged runtime pool, remote signing service, KMS or Vault cannot
be silently substituted for DEC-025's single-pool architecture.

| External decision/evidence required | Accountable role (must be named before release) |
| --- | --- |
| Select actual production/staging/dev secret storage, host/API replica identities, access policy, signer injection, rollback and audit of retrieval | VAYLET deployment owner + security approver; **names not recorded** |
| Approve distinct key-generation source, root custodian, dual-environment separation, key ID/audience registry and nonexportable-safe handling where supported | VAYLET security/key custodian; **not assigned** |
| Specify SQL verifier private owner/NOLOGIN role, encryption-at-rest boundary, installer, restricted `EXECUTE` and privilege preflight, including exact PG extension choice | Database/migration owner + independent DB security reviewer; **not assigned** |
| Verify application/SQL/proxy/WAF/driver/`pg_stat_activity`/log sinks and pg audit/extension/error/trace/metrics exclusion before passing secrets; use synthetic canaries only | Deployment observability owner + independent security reviewer; **not attested** |
| Select encrypted snapshot/backup authority, recovery-key escrow and restore drill with RPO/RTO and immutable retirement checkpoint | Backup/DR operator + security approver; **not recorded** |
| Explicitly accept or amend the 30-second HMAC/rotation lifecycle, key-lock rank and SQL-only threat limit after U1 and U2 review | Project Owner + independent reviewers; **approval pending** |

## Rotation, retirement, outage and restore — proposed state machine

Key state is private, versioned and monotone. The state names below are
**proposals**; the actual registrar and its protected write privileges are
not implemented: `ACTIVE_SIGNING`, `VERIFY_ONLY`, `RETIRED`. Exactly one
signing key may be active for one deployment audience at a time; a bounded
retiring verification set may exist for in-flight proofs. Never extend the
proof TTL on rotation, and never reinterpret a retired ID as active.

1. **Prepare:** the named custodian creates a new independent key/version and
   securely stages it in both authorized signer replicas and the private SQL
   verifier. Verify complete replica/key-ID/audience parity and effective
   runtime/PUBLIC/inherited-role denial before changing acceptance.
2. **Activate:** under a coordinated, durable cutover, the new version becomes
   `ACTIVE_SIGNING`, and the former active version becomes `VERIFY_ONLY`.
   New signing must stop under the old ID. Mixed replicas and verification
   gaps fail closed; staging success alone is not proof every replica switched.
3. **Drain and retire:** stop old-key signing before starting the old-key
   verification-only window. Keep verification available for **at least the
   enforced proof lifetime plus the explicitly permitted clock skew and
   bounded in-flight command completion**; a nominal 30-second TTL by itself
   cannot establish an exact overlap cap. The clock/skew policy and deployment
   drain deadline require U1/U2 review. Proof expiry does not extend existing
   statement, lock or transaction budgets. After the bounded window, perform
   **committed** retirement of that version. Under Prime's proposed lock graph
   the verifier takes key-record
   **rank 15 FOR SHARE** through command COMMIT; retirement takes that key's
   **FOR UPDATE** lock. If a proof execution got SHARE first, retirement waits
   until it commits or rolls back. If retirement commits first, subsequent
   proof execution rejects. Thus **retirement COMMIT**, not the operator's
   request instant, is the linearization barrier; no successful old-key
   command can commit after *confirmed* retirement. A timeout or ambiguous
   COMMIT outcome means retirement is **unconfirmed** and requires a private
   read/reconciliation before any success claim. The ranks/locking design are
   not accepted or runtime-proven yet.
4. **Emergency compromise:** stop further signing/distribution, deny protected
   traffic where safe coordination is absent, then commit immediate key
   retirement through the privileged operator path. Wait for prior protected
   transactions or terminate them using a separately reviewed operator runbook;
   do not claim already committed writes can be undone. Revoke affected
   legacy/protected sessions and reassess trust as required by the approved
   incident/cutover policy. Keep receipts and security audit immutable.
5. **Unavailable/mismatch:** missing signer key, stale audience/key ID,
   SQL-verifier lookup failure, at-rest decryption failure, unknown state,
   replica divergence, expired/replayed proof or private storage outage
   means **no command execution**. Return bounded infrastructure-unavailable
   behavior for key/storage/provisioning faults, not fabricated wrong-password
   errors; never fall back to naked SQL updates, old grants or a cached
   unverified MFA timestamp. Do not use old key material from a backup
   to bypass the current private retirement ledger.
6. **Restore/rollback:** database backups can restore a historical key row,
   challenge, receipt or session. A restored database is **not** automatically
   trusted: isolate it from protected traffic, reconcile with an externally
   held monotone key-retirement/version checkpoint, validate restored receipts
   and immutable audits, prohibit any key resurrection, provision fresh
   environment-specific roots, re-evaluate session/factor trust and complete
   the approved cutover/reenrollment policy. If checkpoint/current trust
   cannot be established, keep the service closed and recover forward.
   Rollback may use only proof-aware code with restrictive privileges;
   never reintroduce legacy DML grants to make it start.

## Evidence required before an implementation/production decision

| Proof gate | Pass condition; **all NOT RUN / NOT VERIFIED here** |
| --- | --- |
| Custodian and storage | Exact product/system, operator identities, documented retrieval/rotation/incident duties, IAM/OS policies, encrypted DB storage and key backup/recovery evidence; independent environment keys. |
| SQL negative grants | Effective `PUBLIC`, ordinary runtime, role inheritance, SECURITY DEFINER ownership, helper `EXECUTE`, schema/table `USAGE`/`SELECT`, definer source/SQL catalog and grant-reprovision negatives on isolated PG17. No SQL-only way to read/sign with the HMAC key or mutate its state. |
| Authentic signer origin | Real password/refresh/TOTP/recovery verified before signing; no MAC from DB hashes, synthetic principal, local MFA bypass, arbitrary payload/sign oracle or cross-audience replay. |
| Key delivery and secrecy | Controlled provider-specific synthetic canary through provisioning, success/failure/rollback/cancel and restart; verify no secret/proof in driver/server parameters, logs, `pg_stat_activity`, proxy traces, HTTP metrics, error bodies, migration files, crash dumps or backups lacking encryption. A local unit test alone is insufficient. |
| Version/rotation | Replica parity, old/new key interleavings, missing key startup, proposed 30-second TTL rejection with approved skew/clock policy and completion budget, no key-ID downgrade, stale signer rejects, correct rank-15 SHARE/X serialization and confirmed retirement COMMIT barrier. Test ambiguous commit and rollback without reviving key. |
| Restore/DR | Encrypted snapshot and isolated restore on target DB version; demonstrate outside-backup monotone retirement authority, no revived proof/session, usable recovery with fail-closed path when escrow/key/checkpoint missing; record owner, date, RPO/RTO and observed result. |
| Cutover | Complete authenticated-writer inventory/U2 locks, removal of old direct DML and unproved definers, changed provisioner not regranting them, coordinated session/factor admission, negative SQL-only takeover attempts, source+live same-SHA independent review. |

**Owner decision request U1:** approve a *specific, evidenced* shared-HMAC
signer/verifier custody mechanism and its deployment operator, confidentiality,
backup, retirement and restore procedure **or** commission a separately reviewed
alternative. Without that choice and the independent U2 authenticated-writer/
lock closure, Option A remains design blocked. This document does not change
Issue #416's product/issuer/MFA or recovery-link authority and is not an
Accepted security decision.
