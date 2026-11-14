# Issue #416 P0-C — VAP1 issuer activation blocker

Status: **DORMANT; no trusted signer or runtime authorization capability**.

## Worker-18 W23 security correction: remove injected-query credential oracle

The earlier dormant A01 preflight accepted externally supplied `lookupPool`
and `transaction` query methods. It called the transaction's rank-01 lock
only **after** Argon2 matched a supplied password. Although it always threw
the same error, query-hook owners could count SQL requests and infer password
validity; untrusted hooks could also invent User/PHC and locked results.
**That version was not safe to treat as an issuer or a reusable preflight.**

`vap1-staff-login-preflight.ts` now exports only an input-free, I/O-free
**unconditional denial**. It cannot receive a pool, transaction, password,
PHC, User ID, signed payload, keyring, callback or claimed session. Even an
untyped JavaScript caller providing these extras observes **zero** callbacks
for valid and invalid credentials. It is not registered on login/MFA/refresh
routes and has no database access or signing functionality. Existing genuine
Argon2id, raw refresh, TOTP and recovery verifier functions remain inside
their normal trusted authentication paths; their return values or SQL-visible
state do **not** create VAP1 signing authority.

Standard `api-non-postgres` adversarial regressions compare real Argon2id
success and failure, true raw refresh and TOTP validation, and attempts to
pass forged identities, password-match flags, PHCs, fake keys, fake SQL
transactions and spy callbacks into the denied boundary. A direct source
assertion prohibits reintroducing query-hook arguments or generic signer
calls. No production secret environment input is used.

**Proof dependency closure needed before any replacement:** only the
authenticated request owner may acquire its own leased PostgreSQL connection;
verified raw ceremony must be rechecked against locked current protected
User/session/factor and selective L1 ADMIT, not caller-injected SQL callbacks.
The live U1 deployment keyring must be independently attested and match
the private SQL verifier's committed key epoch and audience. Only the
purpose-specific DB-issued challenge on the same backend/full XID, exact
typed A01 payload/state, bounded signed proof, receipt and atomic writer may
authorize a mutation. A01 pre-domain limiter must bind to the same operation
without a SQL-runtime discount oracle. None of these prerequisites is
attested complete in this isolated worker; activation is **DENIED**.

Scope: worker-18 source inspection on `01047555518df4504219d4f6aa76c99e44541907`,
not a PostgreSQL or deployment attestation. This record implements no new
authentication API, database role, signing secret, SQL function or production
proof issuer. The isolated tests use only a public deterministic synthetic
fixture key `00..1f` and never load deployment keys.

## Source-backed blocker

1. `staff-auth-vap1-login-ceremony.ts` returns the matched Argon2id PHC.
   `staff-auth.service.ts` correctly rechecks the same User/PHC under a User
   row lock, but that PHC is SQL-readable and cannot attest which trusted
   verifier checked the submitted raw password. The current login transaction
   directly inserts a session/refresh and updates the User; it does not prepare
   or execute the typed `STAFF_LOGIN_COMMIT` VAP1 command.
2. `staff-auth-vap1-refresh.ts` derives a lookup hash from raw canonical `vsr1`.
   A never-issued but syntactically valid token also hashes successfully.
   Current refresh SQL locks lineage and handles consumed replay, but provides
   no one-use challenge or protected receipt/failure path for proof issuance.
3. `staff-auth-vap1-bearer.ts` compares a submitted raw Bearer with a supplied
   context hash. That context alone is not independently attested current
   session, User, membership, entitlement, admission or MFA provenance.
4. The MFA ceremony helpers verify user-submitted TOTP/recovery code against
   factor material in their current locked service calls. Their returned step
   or boolean does not bind an S1 private challenge, exact User/factor version,
   current session or backend/fullXID to a future proof. Local MFA bypass must
   remain categorically unable to sign.
5. Migration `20261113011300_issue416_vap1_private_foundation` declares private
   keys, purposes, challenges and receipts. No reviewed purpose-specific
   `prepare/execute` SQL interface is available at this pinned source SHA,
   and the deployment-managed 32-byte app keyring/active key epoch and private
   PG17 verifier custody are not attested. Encoding proof bytes is not authority.

## Minimum integration contract needed before activation

The dedicated per-purpose issuer must live inside the genuine Staff Auth/MFA
request path and own a trusted, non-exported credential ceremony; it cannot
accept `User.id`, a PHC, hash, boolean or claimed session as authorization.
One leased PostgreSQL client and explicit transaction must perform the approved
lock-rank sequence, purpose-specific prepare, credential/current-locked-state
recheck, app-only key/epoch match, exact S1 18-field encoding/HMAC, and matching
purpose-specific execute. SQL must issue and consume its own CSPRNG nonce while
binding backend PID, full XID, operation identity, payload/state digest, scope,
key epoch and 30-second DB clock; the authenticated writer must atomically
commit mutation, security audit and immutable nonsecret receipt. For A01 the
limiter reservation must first be bound to the exact operation by a separately
committed trusted pre-domain step; its post-domain reconciliation needs an
authoritative, receipt-linked finalizer and safe unknown-COMMIT replay. L1
admission fences must be rechecked in the protected transaction. No generic
signer, arbitrary purpose parameter or helper that signs SQL-returned bytes
is acceptable.

Required proof before replacing the dormant state: actual isolated PG17
Node/SQL byte and HMAC parity with synthetic key only; private role/ACL and
old-writer denial; genuine password/refresh/TOTP/recovery positives and
ID/PHC/session-context/bypass forgery negatives; same-backend/fullXID and
replay/unknown-COMMIT races; verified U1 secret injection and safe rotation.
Existing non-PostgreSQL codec vectors alone satisfy none of these execution
or production gates.
