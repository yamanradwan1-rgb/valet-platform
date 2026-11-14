# Issue #416 P0-C — VAP1 issuer activation blocker

Status: **DORMANT; no trusted signer or runtime authorization capability**.

## Worker-18 follow-up: genuine Argon2 preflight, deny-only

`vap1-staff-login-preflight.ts` now provides an **unregistered, deny-only**
`STAFF_LOGIN_COMMIT` preparation boundary. It obtains the User from a
parameterized email lookup, calls the concrete production Argon2id verifier
with the **raw submitted password** (not an injected verifier, ID, PHC digest
or boolean), then uses the existing rank-01 User-security advisory lock and
`SELECT ... FOR UPDATE` to reject a changed PHC or User status. It performs
no session insert, no refresh mutation, no signing, no MAC, no proof issuance,
no lookup of a signing key and no API or Nest registration. It deliberately
throws the same nonsecret unavailable error even if a real password passes.

The operation UUID and audience are validated as request metadata, **not**
trusted deployment-audience or transaction attestation. A controlled input or
fake transaction object is not an authenticated signing capability. The
preflight must remain unreachable from the production login path until the
verified A01 pre-domain binding, independent ADMIT, trusted U1 app-key
injection/private PG verifier, backend/full-XID challenge and atomic typed
writer all exist and are independently tested. Never replace this failure
with a successful witness return or a generic `sign(payload)` callback.

Normal `api-non-postgres` unit tests use a real generated Argon2id PHC
while mocking only the SQL result/lock. They test genuine/wrong credentials,
PHC/status changes during the lock gap, forged User ID/PHC/context flags,
untrusted operation/audience syntax, and indistinguishable unavailable
failures. These tests do **not** prove a real PG lock, attested U1 key custody,
SQL verification or future protected Staff Login execution.

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
