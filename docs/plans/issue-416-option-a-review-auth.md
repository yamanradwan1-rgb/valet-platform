# Issue #416 Option A independent authentication review

Status: design review only. BLOCKED; no implementation approval.

## Review target and evidence

Reviewed `issue-416-option-a-authentication-provenance.md` as saved on 2026-11-13,
feature HEAD `350d88b090c9dbe1f8d7fa29d6390e28afa9ae19`. Reviewed the Accepted
DEC-023 canonical contract, DEC-072, DEC-078 and DEC-080, plus real login/refresh,
session resolution, logout/revocation, MFA enrollment/step-up/recovery, factor,
assurance and runtime-grant source. Applied the VAYLET review skill's
contract/provenance, check-use race, retry and evidence rules.

This was source/document inspection only. No PostgreSQL execution, exploit
reproduction, credential issuance, test execution or runtime validation occurred.
No application, schema, migration or existing design file was edited.

## Findings

### AUTH-01 — BLOCKER: U1 is an unresolved authentication trust root

Evidence: design lines 94-95 and 156-171 require HMAC material available to both
application and private SQL verifier, while leaving delivery, at-rest/backup
protection and operator ownership unresolved. Restrictive SQL ACLs alone do not
establish these properties. This is correctly declared blocking in the design.

Correction required before implementation: select one concrete custody mechanism
covering application injection, database-verifier storage/loading, provisioning,
backup/export/restore access, environment separation, startup validation, bounded
rotation and emergency retirement. Define whether retirement rejects already
issued in-flight proofs and how all replicas observe the same active key set.
Keep these keys separate from accepted MFA encryption and recovery keys. Do not
approve a plaintext recoverable key table merely by calling it private.

Future acceptance: effective runtime/PUBLIC/inherited-role denial, function-source
and error-path secrecy, failed startup for absent/retired/mismatched audience
keys, overlap/retirement races, and sanitized deployment-level canary evidence.
No such evidence exists in this review.

### AUTH-02 — BLOCKER: U2 lacks the concrete authenticated ceremony contract

Evidence: design lines 98-105, 120-130 and 140-154 identify the right dependencies
but defer exact payloads and writer closure. A MAC over a readable session ID,
access hash or MFA timestamp cannot prove possession of the original credential.
The current `staff-session-context.ts` obtains that provenance by hashing an
actual raw bearer; current login verifies Argon2 then rechecks the same password
hash under lock. New code must preserve those facts rather than accept a
caller-created `StaffSessionContext` or verification boolean at its issuer edge.

Correction required: for every issuer entry point, specify the actual raw proof
accepted by the application, the verification it performs itself, the exact
post-verification state handed to the signer and the strict SQL payload. Bind
login to the exact verified password version and fresh candidate credentials;
refresh to the presented protected generation and consumed-state outcome; MFA to
current factor, exact enrollment/session owner, accepted step or recovery-set/code
identity; management to the genuinely authenticated current session. Bind both
MAC and operation receipt to the same command fingerprint and target. Specify
canonical payload hashing, unknown-field rejection and purpose-specific nullable
fields. Enumerate actual function signatures/overloads and all direct/upstream
writers before claiming closure. The signer must have no externally reachable
arbitrary-sign interface, including through SQL helpers, diagnostics or fixtures.

Future acceptance: real password/bearer/TOTP flows, no proof from synthetic
session-context objects or SQL-readable hashes alone, changed-purpose/target/
generation/payload negatives, monotonic TOTP and recovery races, and old definer
signature/column-grant denial after both migration and reprovisioning.

### AUTH-03 — BLOCKER: U2 legacy factor provenance needs an operational recovery path

Evidence: design lines 150-154 and 205-212 correctly reject grandfathering legacy
MFA facts and explicitly defer their policy. Current factors can be inserted and
activated by the ordinary runtime's existing column grants. Revoking legacy
sessions and requiring a new password login therefore does not independently
establish that the retained active factor belongs to its claimed User.

Correction required: choose the authoritative enrollment/recovery bootstrap for
all existing accounts, including a legitimate admin whose only factor is now
untrusted and a user without a recovery code. Specify treatment of pending
factors, active factors, recovery generations and controlled operator recovery.
Do not silently accept an old seed/code as proof that its original enrollment was
authenticated. Coordinate the policy with upstream User/password/role and
Organization/entitlement authority closure. The design already blocks here;
this review confirms that it is a material requirement rather than optional
migration hardening.

Future acceptance: pre-cutover factor/assurance state cannot mint trusted command
proof; the approved genuine bootstrap succeeds; revoked/retired material cannot
revive; controlled recovery has independently verified operator authority and
account-security audit evidence.

### AUTH-04 — MAJOR: blanket retry and denial wording needs ceremony exceptions

Evidence: design lines 192-199 say retries reconcile without redisclosing secrets,
and line 260 says every denial leaves protected state unchanged. Existing
`mfa-enrollment.service.ts` deliberately returns the same pending provisioning
seed to the same enrollment session on another begin request. Accepted refresh
replay deliberately commits family revocation while returning authentication
failure. The design acknowledges the latter exception at lines 197-198 but its
acceptance statement is still unconditional.

Correction required: give each command a concrete result/retry/disclosure table.
Distinguish pending enrollment seed recovery from one-time recovery-code output,
login/refresh candidate credentials, replay-family revocation and ordinary denied
writes. Preserve existing public contracts unless an explicit amendment is
approved. State unchanged-state denial assertions with the accepted refresh
revocation exception; do not turn a generic private receipt into raw secret
storage or a replacement-credential recovery mechanism.

Future acceptance: same-session pending begin retains accepted behavior;
foreign-session pending begin denies without seed disclosure; lost activation/
reissue responses do not reveal recovery codes again; consumed refresh retry
retains accepted family revocation and never returns replacement credentials.

## Verdicts

Authentication origin and signer-oracle prevention: defensible direction,
conditional on AUTH-01 through AUTH-03 closure. The explicit ban on minting MFA
proof through `VAYLET_LOCAL_DISABLE_MFA` is necessary and correctly included.

Cryptographic/replay design: transaction-bound challenges, command/payload binding,
independent HMAC keys and atomic receipts are useful proposed constraints, not
implemented guarantees. Exact serialization, lifecycle, concurrency and key
custody remain incomplete. No cryptographic or PostgreSQL proof is claimed.

Tenant/security and downstream reset consumer: current persisted role, tenant,
Organization, entitlement and exact-session five-minute MFA rechecks remain
mandatory under locks; signed facts never replace them. SQL E/F isolation is not
app-host or DBA isolation. Upstream authority-writer closure remains essential.

Compatibility, audit/privacy and scope: opaque access/refresh formats and Web/
native transports remain preserved by proposal. No Task/Dispatch/custody or UI
change appears. Secret output/retry semantics need AUTH-04 clarification. Code
structure/test gates are not applicable to this docs-only review; future tests
are specified but NOT RUN. No runtime, CI, independent deployment or readiness
proof is supplied.

Gate verdict: OPTION A DESIGN BLOCKED — ADDITIONAL SECURITY DECISION REQUIRED.
The document is honest about its current status. Its direction may be retained,
but further Owner decisions and independent review of U1/U2 closure are required
before implementation. Implementation/merge verdict: BLOCK MERGE for any runtime
implementation derived from this incomplete contract.
