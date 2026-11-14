# Issue #416 — Option A cryptographic proof-key custody

Status: **U1 CONCRETE CANDIDATE / NOT ACCEPTED; DEPLOYMENT GATE BLOCKED**.
Scope: documentation only. No key was generated, injected or inspected; no SQL, API,
authentication, schema, runtime, production configuration or deployment was changed.
Review baseline: `eb2d0ba4aac496a238fff55bdfa9dbfdd66e1ed3` (the isolated
`cos/issue416-final-u1` worktree). The Option A proposal and its
mechanics are **not** an Accepted DEC and are **not** implementation permission.

This document concerns **cryptographic command-proof keys**, not vehicle/physical
key custody. **Recommended U1-C1 (one candidate):** independent 32-byte
HMAC-SHA-256 root per deployment audience/key ID, injected into the trusted API
process as a deployment-managed server-only environment secret; the same raw
key stored in a PostgreSQL private `bytea` key row owned by a dedicated NOLOGIN
security role and read only inside narrow SECURITY DEFINER commands; verification
uses PostgreSQL 17 `pgcrypto.hmac(bytea,bytea,'sha256')`. A controlled operator
provisions and retires both copies. This is technically viable **conditional**
on supported `pgcrypto` installation, effective SQL ACL tests, verified private
injection and encrypted DB disk/WAL/snapshots/backups. None is currently a
production attestation; no KMS/Vault/host/secret-store provider is claimed.

## Authority and threat boundary

| Classification | Contract |
| --- | --- |
| **LOCKED — Owner** | Option A authenticated narrow SQL writers; design-only recovery; no changes to opaque `vsa1.`/`vsr1.` auth transport or the approved #416 reset product/API semantics. See [Issue #416](https://github.com/yamanradwan1-rgb/valet-platform/issues/416). |
| **LOCKED — Accepted** | DEC-023 authenticates actual password/bearer and enforces session rotation/revocation; DEC-024 uses its own durable anti-abuse HMAC key; DEC-025 requires one ordinary least-privilege API DB credential separated from the migration/admin job; DEC-072/075/076/078/079/080/081 preserve genuine MFA, push/session linkage, audit, current tenant/role/entitlement and five-minute sensitive MFA rules. |
| **DERIVED** | A caller possessing only ordinary runtime SQL rights, DB-readable session IDs/hashes or MFA timestamps must not create or restore authenticated authority. Revocation and receipt/secret retirement must be monotone. |
| **RECOMMENDED U1-C1, NOT ACCEPTED** | Application environment-injected proof keyring plus private SQL `bytea` key registry, 256-bit purpose-separated `vap1` HMAC-SHA-256, `pgcrypto` SQL verification, one-transaction challenge/receipt and monotone key epochs; see this document and `issue-416-option-a-authentication-provenance.md`. |
| **DEPLOYMENT/APPROVAL GATES** | Actual production API environment injector, SQL extension availability, effective ACLs, disk/WAL/backup encryption, operators, sealed root backups, rotation/restore drills and Owner approval are all unverified. |
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
| `packages/database/prisma/migrations/**/migration.sql` — **NEGATIVE SOURCE INVENTORY** | A source search found **no `CREATE EXTENSION pgcrypto`**, `pg_extension` inspection, or deployed `pgcrypto` verifier in committed migrations. That does not establish the live server's extension state. |

**PostgreSQL 17 feasibility, not installation proof:** The official
[`pgcrypto` documentation](https://www.postgresql.org/docs/17/pgcrypto.html)
specifies `hmac(data bytea, key bytea, type text) returns bytea` and supports
`sha256`, conditional on OpenSSL support. `pgcrypto` is a trusted extension
installable with database `CREATE` privileges; this does **not** authorize
installation by the ordinary API runtime or establish that this database
permits it. Its cryptography runs inside the DB process, which necessarily
trusts PostgreSQL/DB administrators. The PGP functions do not supply a general
asymmetric signature verifier. No PostgreSQL function for guaranteed constant-time
MAC comparison is established by repository evidence or that documentation.
These are distinct feasibility, ACL and timing-review gates.

The existing `issue-416-option-a-authentication-provenance.md:91-177` marks
U1 blocked; `issue-416-option-a-review-auth.md:20-38` independently agrees
that ACLs alone cannot establish confidential at-rest storage/backup protection.
The integrated `docs/plans/issue-416-option-a-locks.md:181-218`
provides the **proposed** rank-15 key-lock/barrier design, not runtime proof.

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

**Canonical proof bytes are defined solely by S1** in
`issue-416-option-a-authentication-provenance.md`, section
**"Exact `vap1` canonical bytes (S1 protocol version 1)"**. There is no
normative JSON, ordered UTF-8 array, JCS, `jsonb::text` or delimited-string
encoding. All signed/digested frames are **strict binary TLV `bytea`**:

```text
frame(kind, fields) =
  ASCII("VAYLET/VAP1") || 0x00 || kind:u8 || 0x0001:u16be || count:u16be
  || ascending (field_id:u16be || wire_type:u8 || length:u32be || value)
kind 0x01 = closed purpose-specific payload
kind 0x02 = 18-field signed proof
kind 0x03 = protected current-state/version snapshot
```

S1 fixes the wire types and constraints: `NULL` (only schema-permitted),
`BOOL`, `U32`, `U64`, `UTF8` (strict bytes), `UUID` (16 network-order bytes),
`BYTES` and `SHA256` (32 raw bytes); no unknown/duplicate/out-of-order fields,
loose null equivalence, lossy numeric conversion or trailing bytes. The
**full 64-bit PostgreSQL transaction ID** is encoded as U64 (`xid8` from
`pg_current_xact_id()`), not 32-bit XID, decimal text or driver string.
`payloadBytes = frame(0x01, exact typed purpose payload)` and
`payloadDigest = SHA256(payloadBytes)`.
`stateDigest = SHA256(frame(0x03, locked SQL-derived typed current-state facts))`;
the key
**promotion epoch** is a mandatory typed field of that protected state frame
and the private challenge row, **not** an extra ad hoc proof-frame field.
S1's fixed `proofBytes = frame(0x02, fields 1..18)` binds `vap1` version,
registered `keyId`, deployment audience, purpose, operation UUID, DB-issued
32-byte challenge nonce, backend PID, full XID, typed actor kind and nullable
actor/session/Organization/membership/subject IDs, `stateDigest`,
`payloadDigest`, and DB-authoritative issued/expiry UTC milliseconds. These
are **exactly** S1's 18 schema fields, not a fresh U1-defined layout.
The proposed TTL is **30,000 ms with no grace**, using the S1 database-clock
comparison; it is not an already Accepted Owner decision.

`mac = HMAC_SHA256(raw32ByteKey, proofBytes)` yields **32 raw bytes**.
The trusted API computes
`createHmac('sha256', raw32ByteKey).update(proofBytes).digest()`; the private
SQL SECURITY DEFINER verifier computes
`auth_proof_crypto.hmac(proofBytes::bytea, key_bytes::bytea, 'sha256')`
under the fixed qualified schema/ACL boundary below. Both consume the **same
canonical binary proofBytes**, never a JSON or text recoding. The signer
must independently re-encode genuine ceremony/typed locked commitments; it
must **not** blindly MAC untrusted `proofBytes` or SQL-returned bytes. SQL
independently reconstructs S1's payload, current-state and proof frames from
protected locked facts and the private challenge, rejecting byte mismatch
*before* MAC verification. In-flight key selection/epoch must match the
committed rank-15 key lock. Wrong backend/XID, epoch, purpose, target, nonce,
scope, key or payload cannot authorize an altered command. Transport
`proofBytes` and `mac` only as bounded sensitive `bytea` arguments to the
exact typed SQL command; never log or store them in durable receipts.
Pin two independent Node/PG17 codec implementations to S1's **published
primitive vectors and full 323-byte, 18-field proof vector** plus negative
byte/field/epoch tests before approval; no such conformance test ran here.

The separate `vspr1.` reset link is a 32-byte random **bearer**, hash-only in
storage, scoped by Issue #416's locked 15-minute/one-use contract. Its
verifier/credential-key purpose is distinct from the internal `vap1` key and
from `vsr1.` refresh. Neither a raw reset bearer nor an opaque access/refresh
credential may serve as a `vap1` signing key or as a substitute for actual
issuer authentication. Command metadata/receipts must not retain these raw
bearers; any purpose-specific digest binding requires U2 review.

## U1-C1: exact deployment and key-custody contract (recommended, proposed)

**API signer / environment injection.** The deployment operator creates one
independent cryptographically random 32-byte root for each
`(environment, deploymentAudience, keyId)`. The key ID is public metadata
and never reused, even after retirement. The suggested server-only input
`VAYLET_AUTH_PROOF_KEYRING_JSON` is a strict bounded JSON array of
`{ keyId, audience, keyB64url }`, where `keyB64url` is exactly 43
canonical unpadded base64url characters encoding 32 bytes. This is a
**future secret-injection config contract**, not a signed VAP1 proof frame,
present environment variable or implemented parser. A bounded keyring holds
at most **two** roots during a single rotation:
old/current and candidate/new. A pre-promotion command holding the old key's
rank-15 SHARE lock may finish signing and executing with that root; eviction
must wait for that bounded in-flight command to finish. After promotion, new
prepare commands use only the new key; no new old-key signing or challenge
is admitted. Nonsecret active ID and promotion epoch come authoritatively from
the protected SQL key registry and are checked on prepare, never chosen by a
client-supplied environment setting. Each actual API replica receives the
same current version from its **deployment-managed process environment**
before startup, using the existing server-only env pattern visible in
`.env.example` and `apps/api/src/modules/auth/mfa/mfa-crypto-config.ts`.
The repo does **not** define how its production API process is launched,
which service/OS supplies that environment, or who can inspect process
environments; these must be attested. A raw `.env` on an unencrypted volume
or a systemd EnvironmentFile is **not inherently an encrypted secret store**.
Restrict who can inspect the service environment and diagnostics, avoid
shell history/argv/build args, disable secret-bearing core dumps, prohibit
`NEXT_PUBLIC_*`/`EXPO_PUBLIC_*` and logs, and attest the final delivery path
per host. Key memory belongs only to the trusted process, not SQL runtime.

**SQL verifier / extension / ownership.** A **future forward-only,
migration-owner-installed** `pgcrypto` extension supplies
`hmac(bytea,bytea,'sha256')` in an explicitly locked extension schema
(candidate `auth_proof_crypto`). In the same controlled migration boundary,
create `auth_proof_private` owned by a dedicated NOLOGIN, NOINHERIT,
non-superuser security-definer role (candidate `vaylet_auth_proof_owner`).
The private schema contains a keyed registry with
`(audience, keyId, key_bytes bytea, state, promotion_epoch, timestamps)`:
`octet_length(key_bytes)=32`, unique immutable audience/key ID,
one ACTIVE_SIGNING row per audience, monotone retirement, no runtime
INSERT/UPDATE/DELETE/SELECT. The bytea is the **same HMAC signing material**,
not a public verification hash and not a copy of the process env. It is
plaintext to privileged database owners in logical SQL, WAL, dumps and
physical backup contents; storage encryption must be established separately.
This schema/table/role do **not exist** in the source today.

The SECURITY DEFINER entrypoint uses a fixed trusted `search_path`
(`pg_catalog` plus explicitly qualified trusted objects), never any
runtime-writable schema or unqualified `hmac` name. An internally scoped
`auth_proof_crypto.hmac(proofBytes::bytea,key_bytes::bytea,'sha256')`
computes the expected 32 bytes. The migration owner must grant only the
NOLOGIN definer owner the necessary `auth_proof_crypto` schema USAGE,
specific `hmac` EXECUTE and private registry access. Ordinary runtime and
PUBLIC must not inherit these privileges, including via extension defaults.
Reject malformed/non-32-byte supplied MACs, NULLs and cross-audience/key-ID
inputs before comparison. **Selected
comparison candidate:** after enforcing two 32-byte `bytea` inputs, execute
a fixed 32-iteration `get_byte` loop accumulating
`mismatch := mismatch | (get_byte(expected,i) # get_byte(supplied,i))`
and accept only when `mismatch = 0`, without a per-byte early return.
PostgreSQL 17 documents [`get_byte`](https://www.postgresql.org/docs/17/functions-binarystring.html)
and [integer bitwise operators](https://www.postgresql.org/docs/17/functions-math.html).
This is a concrete fixed-work candidate, **not** a demonstrated
constant-time guarantee against side channels; implementation/timing/error
review with independent cryptographic sign-off remains required. No reusable key,
expected HMAC, private helper, signing function, function-local GUC, or
direct key-table read is returned to ordinary SQL. `SECURITY DEFINER`
function source must contain **zero secret literals**.

At provisioning, verify `pg_available_extensions` contains `pgcrypto`
and the provider permits its use; then verify `pg_extension` installed schema,
version, function identity and extension ownership. The committed migrations
contain **no `CREATE EXTENSION pgcrypto`**, so installation is
**PROPOSED / NOT VERIFIED**, even though PostgreSQL 17 documentation proves
the function exists in that optional extension. Preexisting/wrong-schema
extensions require an explicit reviewed correction, not `IF NOT EXISTS`
silently accepting an unsafe extension. Runtime must have no database
`CREATE`, no private schema `USAGE`, no inherited owner rights, no ability
to alter `search_path` into a replacement object, no private key helper
`EXECUTE`, no unproved auth/MFA direct DML or legacy SQL-authority entrypoint.
Only exact authenticated command signatures receive `EXECUTE` after the
separately approved U2 migration and twice-run provisioner closure.

**Controlled key provisioning.** The named VAYLET security custodian generates
the key outside PostgreSQL, records a nonsecret key ID/audience/fingerprint
in an operator-controlled approval ledger, and hands the same root to two
separate destinations via an attested protected distribution procedure:
(1) the authorized API deployment environment and (2) an offline,
human-authorized **migration-credential** key installer that imports the root
into `auth_proof_private`. The latter must use existing DEC-025 migration TLS
preflight and a dedicated future controlled command reading from protected
stdin/file descriptor or approved secret mount, without writing key bytes to
source, migrations, function definitions, command arguments, logs, SQL string
literals or transaction/session GUCs. A parameterized import query prevents
SQL text interpolation but **does not guarantee bind parameters are absent**
from server/driver/proxy/`pg_stat_activity`/audit/tracing/crash logging. Treat
that as a blocking deployment canary test on the real provider. The installer
has no API runtime entrypoint and returns only safe key ID/state/operation
receipt. The security owner stays NOLOGIN and receives no API password.
No separately credentialed runtime pool or new network secret service is
assumed.

**At-rest and backup dependency.** U1-C1 explicitly uses an ACL-protected
**raw symmetric key row**. It does **not** claim per-row encryption. For
production eligibility the actual PostgreSQL data volume, WAL/archives,
replicas, logical/physical backups, snapshots, exported dumps, restore
staging, secret distribution files, API environment delivery and operator
checkpoint/escrow copies require evidenced encryption-at-rest, access scope,
retention/deletion and separate recovery access. `docker-compose.yml` only
defines a local named volume; `docs/16_PRODUCTION_DATABASE_DEPLOYMENT_CHECKLIST.md`
leaves backup encryption/restore ownership unchecked. All of these are
**EXTERNAL — NOT VERIFIED**. A backup or DBA with raw private-row access can
forge a MAC; protecting backups is therefore a confidentiality requirement,
not a cosmetic compliance checkbox. If encrypted media/backup access and
secret-import logging confidentiality cannot be demonstrated, **reject U1-C1
for that deployment and keep protected writes closed**.

**Threat boundary:** An attacker holding only the ordinary `DATABASE_URL`,
SQL execution on its least-privilege role, readable session/hash/audit rows,
or synthetic challenges can prepare or cause bounded denial of service, but
must lack every path to obtain `key_bytes` or invoke a generic signing
oracle. A DBA, migration operator, compromised API host or app memory reader
can access the symmetric material and is **outside** this SQL-only
guarantee; `pgcrypto` does not turn an HMAC key into a public verifier or
protect against a malicious DB owner. Actual E/F isolation only begins
**after** the U2 direct-DML/old definer/provisioner cutover, not at this
documentation commit.

## Attestation and Owner approval register (nothing here is a production PASS)

| Boundary | Available repository / PostgreSQL fact | Selected U1-C1 proposal | Responsible operator / external evidence | Required acceptance test | Failure gate | Owner approval |
| --- | --- | --- | --- | --- | --- | --- |
| Application injection | Existing MFA/anti-abuse server `process.env` readers; no committed production API service secret injector | One env-injected JSON keyring per replica, 32-byte distinct root per audience and key ID | Deployment owner + security custodian; **identity, process environment and injection ACL EXTERNAL — NOT VERIFIED** | Synthetic canary through actual staging API replicas; inspect process/child/core/log visibility and test missing/mismatched key | Refuse startup/protected traffic; no fallback keys | U1 **PENDING** |
| SQL HMAC support | [PG17 `pgcrypto`](https://www.postgresql.org/docs/17/pgcrypto.html) documents `hmac(bytea,bytea,'sha256')`, requires OpenSSL; repository migrations have no `CREATE EXTENSION pgcrypto` | Migration-owner installs vetted extension in locked schema, validates function/schema/owner/version and HMAC parity with Node using nonsecret bytes | Database owner / provider; **installed PG17 extension and privileges NOT VERIFIED** | Disposable PG17 `pg_available_extensions`, `pg_extension`/`pg_proc`/`pg_namespace` inventory, synthetic Node/SQL cross-vector parity; negative public/runtime calls | Extension unavailable, wrong schema/owner or parity mismatch: abort | U1/S1 **PENDING** |
| Private SQL key | Existing single pool, DEC-025 runtime/migration separation and provisioner NOINHERIT; no proof-key table today | `auth_proof_private` registry with 32-byte `bytea`, dedicated NOLOGIN owner and purpose-specific SECURITY DEFINER verifier; qualified `auth_proof_crypto.hmac` | Migration/DB security owner; **named operator and live effective ACL NOT VERIFIED** | `has_schema_privilege`, `has_table_privilege`, `has_function_privilege`, inherited/PUBLIC/role-owner/overload/CREATE negatives, twice-run provisioner, direct oracle denial | Any runtime key read, key change, generic MAC oracle or old writer: abort | U1/S1/U2 **PENDING** |
| Import path and telemetry | Existing migration TLS preflight; deployment logger/proxy configuration unknown | Controlled offline non-argv key installer, parameterized DB import only after redaction canary, private immutable receipt | Migration operator + observability owner; **real log sink/audit extension settings NOT VERIFIED** | Synthetic secret canary across import, error, cancel, rollback, SQL metrics and exception logging; inspect provider-configured bind logging | Any parameter/key leak or inability to inspect selected sinks: abort | U1 **PENDING** |
| Encrypted storage / DR | Local PostgreSQL volume; `docs/16_PRODUCTION_DATABASE_DEPLOYMENT_CHECKLIST.md:77-96` unchecked | Encrypt actual data/WAL/replicas/snapshots/backups and root escrow, keep external monotone retirement record | Infrastructure + backup/DR + security owners; **all encryption, operator, RPO/RTO and restore facts EXTERNAL — NOT VERIFIED** | Attach platform disk/WAL/backup encryption evidence; isolated old-snapshot restore proving retired IDs and sessions never resurrect | Unencrypted or unknown scope / no safe restore: block release | U1/L2 **PENDING** |
| Promotion / retirement | Proposed rank-15 `FOR SHARE`/`FOR UPDATE` lock in `locks.md`, no execution | Exclusive key-ID-ordered promotion with epoch, VERIFY_ONLY drain and confirmed retirement COMMIT barrier | Release owner + security approver; **real replicas, skew and downtime limits NOT VERIFIED** | Two-transaction promotion/retirement vs prepare/execute races, replica drift, lost COMMIT and missing key | Key disagreement, unconfirmed retire, expired proof admitted: stop traffic | U1/L2 **PENDING** |
| Cryptographic comparison | PG17 documents 32-byte HMAC-SHA256, `get_byte` and integer XOR/OR; no constant-time SQL guarantee | Exact 32-iteration XOR/OR accumulator inside scoped definer; fixed 32-byte input, no per-byte early exit; uniform safe error | Independent crypto/SQL reviewer; **timing behavior NOT VERIFIED** | Correct/incorrect 32-byte vectors, malformed/NULL, purpose/audience/nonce replay, execution/timing/error review | Unreviewed or observably exploitable comparator: block proof acceptance | U1/S1 **PENDING** |

Approval of this **documentary recommendation** is different from
evidence that the chosen host can meet it. The Owner must accept the
**symmetric SQL verifier root in encrypted and operator-accessible PostgreSQL
storage**, the defined SQL-only threat boundary, the exact environment
injection/installer arrangement and the residual DBA/host compromise risk.
Independently verify the deployed configuration; without that attestation,
the current verdict is **DEPLOYMENT GATE BLOCKED**, even if the proposed
contract is approved on paper.

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
   **PROPOSED activation interlock:** after attesting all authorized signer
   replicas, the privileged operator locks old/new key records exclusively in
   deterministic key-ID order and atomically commits the active key ID and
   immutable promotion epoch. New prepare calls select only the committed
   `ACTIVE_SIGNING` ID under their rank-15 SHARE lock and bind that epoch to the
   transaction challenge. Existing old-key prepares hold SHARE through their
   command COMMIT, so promotion waits; no stale replica may mint a new old-key
   challenge after promotion. A replica unaware of the new key ID/epoch fails
   closed. `VERIFY_ONLY` cannot admit new prepares and any old-key execution
   requires the exact pre-promotion transaction challenge and valid expiry.
   Test promotion vs prepare/sign/execute, delayed/stale replica, rollback and
   lost promotion COMMIT; this is a proposed invariant, not executed proof.
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
   SQL-verifier lookup failure, failed protected secret import, unknown state,
   replica divergence, expired/replayed proof or private storage outage
   means **no command execution**. Return bounded infrastructure-unavailable
   behavior for key/storage/provisioning faults, not fabricated wrong-password
   errors; never fall back to naked SQL updates, old grants or a cached
   unverified MFA timestamp. Do not use old key material from a backup
   to bypass the current private retirement ledger.
6. **Lost or irrecoverable key:** if no compromise is suspected, stop protected
   admission and restore the **exact original key bytes** only through the
   independently attested custodian escrow and private importer, checking
   audience, key ID and the current monotone retirement ledger. If escrow is
   missing or integrity cannot be proven, keep the old key permanently
   unavailable; under a fully drained, separately approved operator ceremony,
   create a fresh key ID and root, provision both destinations, fence pending
   challenges and reconcile unknown receipts before reopening. This proof-key
   loss alone does **not** imply that previously admitted TOTP factors or
   recovery codes must be recreated; their independent key custody and the
   L1 admissions still govern. Never regenerate bytes under a retired ID.
7. **Restore/rollback:** database backups can restore a historical key row,
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

**Owner decision request U1:** approve **U1-C1** specifically: separately
injected API HMAC keyring, private `bytea` SQL verifier root and PostgreSQL
`pgcrypto.hmac`, with named custodians and independently evidenced production
injection, logging, encrypted disk/WAL/backup and restore controls. If the
actual deployment cannot demonstrate those controls, reject this candidate
and keep the current design/release gate closed; any materially different
cryptographic architecture needs a new review/approval. Independent U2/S1,
L1/L2 writer/legacy/cutover contracts remain open. This document does not
change Issue #416's product/issuer/MFA or recovery-link authority and is not
an Accepted security decision.
