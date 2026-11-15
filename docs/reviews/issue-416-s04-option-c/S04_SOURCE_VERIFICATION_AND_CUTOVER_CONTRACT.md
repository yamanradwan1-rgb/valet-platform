# Option C / S04 — source verification and compatible SQL-writer boundary

**Worker:** W58. **Pinned starting SHA:** `1fbf95c58089b7689d77230b2a730f6e51a92580`.
**Finding:** Baseline source-confirmed SQL quota-discount permission. W58 now
has a concrete guarded S04 implementation and an independently attested
**actual PostgreSQL 17** isolated SQL role/command proof (details below).
The complete VAYLET mounted HTTP integration and protected S01/S02 role-pool
cutover remain outstanding; do not mark S04 launch-closed yet.

## Implemented in W58 isolated Option C branch

- Forward-only migration `20261115016200_issue416_s04_signed_quota_guard`
  creates private key and single-use nonce tables, signature-verifying
  `SECURITY DEFINER` counted/reserve/finalize commands and one atomic
  `s04_guest_classified` function. A proof is bound to fixed command,
  scope/key or Guest group/class/threshold/credential budgets, a fresh nonce,
  and a server-enforced 30-second maximum expiry. No SQL-visible signer.
- Separate 32-byte `ANTI_ABUSE_SQL_PROOF_SECRET_B64URL` is seeded exclusively
  through the migration-credential provisioner. Its script refuses a changed
  key, co-located identity HMAC key, missing TLS policy or a different runtime
  target. Runtime SQL has no USAGE/SELECT on its private schema.
- `provision-runtime-role.mjs` replaces previous table-write grants with
  `provisionS04RuntimePrivileges`. It removes table and column INSERT/UPDATE,
  checks effective ACLs and only grants EXECUTE on the operation-specific SQL
  functions. Re-provisioning never restores the old grants. Runtime readiness
  explicitly rejects direct limiter table mutation authority.
- `AntiAbuseService` uses protected counted/reserve/finalize commands;
  Guest classified binding/aggregation uses the signed same-transaction SQL
  command, preserving the original group, class/aggregate/credential and
  Postgres-clock rolling-window semantics. Existing Guest no-charge and
  unknown-source settlement callsites use this same bounded signed path.
- `s04_staff_login_success` and `s04_mfa_success` support settlement within
  each protected writer's existing SQL transaction. Neither function grants
  ordinary runtime EXECUTE. S01's newly integrated
  `staff-auth-login-command.ts` already calls the Staff finalizer;
  S02 requires its own MFA callsite integration. Their provisioners must
  invoke `grantS04ProtectedWriterFunction` for their **separate** roles.
- `s04_cleanup_nonces` removes at most 1000 proofs older than one hour per
  call (indexed on `occurred_at,nonce`), well beyond the 30-second signature
  validity. Application maintenance calls this alongside existing bounded
  limiter cleanup.

**Attested W58 PG17 SQL exercise:** disposable Docker
`vaylet-issue416-w58-s04-protected-pg17`, port `127.0.0.1:51558`,
database `s04_w58_disposable`. Tests `s04-pg17-protected.integration.mjs`
confirm, with an actual restricted `session_user=current_user=w58_s04_runtime`,
direct INSERT/state UPDATE/group UPDATE/private key reads denied, no EXECUTE
of Staff/MFA finalizers, incorrect signature denied, nonce replay denied,
valid counted and pending admission, scope-bound MFA/Staff writer-only success,
Guest legacy NULL group binding and class/aggregate block behavior, twice
idempotent runtime provisioning, and twice stable protected secret seeding.
Unlike the previous W58 source-only attempt, this new test ran against real
PG17. It exercises the isolated S04 migration and scoped provisioning
helpers; it is **not** equivalent to full migration/HTTP acceptance.

**Verification limits:** protected writer pools are being implemented by
independent S01/S02 workers, so this branch cannot verify their final
credentials against its pinned base. The full production runtime
provisioner, all cross-feature migrations, mounted browser/native Staff/MFA/
Guest APIs, real two-instance quota contention and production performance
still need coordinated safe integration acceptance. No source-only pass is
presented as HTTP proof.

**Credential rotation gate:** The proof key provisioner deliberately refuses
silent replacement of an existing key. A safe rotation needs a separately
approved additive dual-key verifier with key-version selection, acceptance
limited to both current and newly staged keys during an overlapping rollout,
proof expiry/nonce uniqueness preserved across key versions, and deployment
attestation that all API instances have the new signing key before the old
verification key is retired. No key may be logged or stored in the public
schema, and runtime SQL must not be able to select a more permissive key.
Automated rotation and mixed-version production rollout have **not** been
implemented or tested in this branch; do not rotate by changing the existing
environment variable alone.

## Exact current source path

- `packages/database/scripts/provision-runtime-role.mjs:211-240` grants ordinary
  runtime SELECT, INSERT on scope/key/state/class/group and UPDATE on state/group.
  It denies DELETE and TRUNCATE, but those denials do not prevent discounting.
- `apps/api/src/common/database/runtime-database-readiness.ts:14-29` requires
  INSERT and UPDATE on the same columns at runtime bootstrap. A simple REVOKE
  without service/provisioner/readiness changes breaks startup or execution.
- `apps/api/src/modules/anti-abuse/anti-abuse.service.ts:121-168` computes the
  rolling-window count and retry time from only `PENDING` and `COUNTED` rows.
  The ordinary role is granted standalone SQL `UPDATE state='IGNORED'`
  authority, even for an already `COUNTED` row, unless an independent database
  guard restricts that exact row. This bypasses the *application's* finalizer
  predicate at :289-298. SELECT discloses stored HMAC digests, so knowledge of
  the original raw IP/email/token is unnecessary for a direct UPDATE of an
  unprotected counted row. No raw-token recovery is shown, and an effective
  grant is not by itself proof that every row has no other DB guard.
- `apps/api/src/modules/anti-abuse/classified-guest-counter.ts:40-84` mutates
  `group_key_hash` and groups guest quota by that field; an ordinary SQL role
  may rebind an existing non-NULL group to a different syntactically valid HMAC
  value. `anti_abuse_events_group_key_check` verifies format and scope only;
  it does not establish the original authorized visit relationship.
- Ordinary runtime INSERT permits arbitrary syntactically valid `COUNTED` or
  `PENDING` rows, allowing counter inflation/availability attacks. This does
  **not** prove an unauthenticated HTTP SQL-injection entry point or possession
  of a production DB password.

## Legitimate flows that a privilege cutover must preserve

| Flow | Source | Required atomic behavior |
| --- | --- | --- |
| Staff login | `staff-login.service.ts:37-69`; `staff-auth.service.ts:100-159` | Reserve identifier before password check; success discounts pending reservation in the **same transaction** that creates session + refresh lineage; failure counts |
| MFA TOTP/recovery/enrollment | `auth/mfa/mfa-anti-abuse.ts:17-49`; `mfa-step-up.service.ts:37-67`; `mfa-recovery.service.ts`; `mfa-enrollment.service.ts` | Pre-ceremony pending admission; verified completion and IGNORED settlement in one transaction with MFA assurance/factor/recovery effects; failure counts |
| Guest unknown credential and access | `guest-request-admission.ts:41-185`; `guest-browser-limiter.ts:43-95` | Unknown sources remain PENDING/COUNTED; exhausted credential can discount a duplicate address reservation; authenticated admission commits before disclosure and binds current persisted visit |
| Guest classified classes A/B/C/D | `classified-guest-counter.ts:14-118` | Atomic group binding, group/class/credential budgets, 900-second PostgreSQL rolling window, original HMAC key, compatible N-1/NULL history and commit/rollback measurement |
| Guest browser transitions, retrieval, payment, rating and push | `guest-browser-{session,context}.controller.ts`; `retrieval/{retrieval,handoff}.service.ts`; `payments/{payment-mutation,payment-projection}.service.ts`; `guest-rating.service.ts`; `guest-push-registration.service.ts` | Terminal IGNORED/COUNTED handling remains in the already opened domain transaction; clean NONE and no-charge outcomes remain policy-specific |
| Staff activation/management onboarding | `staff-activation.service.ts:55-119`; `management/staff-onboarding.service.ts:112-234` | Distinguish unchanged invitation/retry from a new mutation; preserve service failure handling and no double charging |
| Handoff, shift-presence, photos and operational counters | `retrieval/{issue-handoff-command,verify-handoff-command}.ts`; `vehicle-photos/condition-photo-admission.ts`; `modules/shift-presence` | Keep count/blocker calls under existing domain/advisory locks, no unbounded/fail-open retries |
| Retention | `anti-abuse-maintenance.ts:52-80`; migration `20261008007500_*` | One fixed parameterless cleanup function, ordered SKIP LOCKED, at most 1000 rows older than one hour; do not delete current-window rows |

No ValetSession or Task transition, tenant/location authority, configuration
precedence or payment state change is authorized by S04. Scope is the ephemeral
shared security counter and its transactional consumers.

## Minimum safe design, subject to coordinated writer integration

1. Remove ordinary-runtime effective direct INSERT and UPDATE over protected
   counter rows/columns, including inherited roles, PUBLIC, owner and column
   grants; alter the provisioner, verifier and readiness together. Do not
   leave a legacy reprovisioner that silently regrants them.
2. Use a protected purpose-specific admission path for standalone, already
   committed pre-auth reservations. `COUNTED` emission can be monotonic;
   every `IGNORED` discount must be authorized by a trusted verified outcome,
   with operation/reservation binding, single-use transition and known
   purpose. Arbitrary runtime-callable `finalize(id,state)` and writable SQL
   session flags are not authorization. Unknown commit remains charged.
3. Staff Auth and MFA **must settle on their existing writer transaction**,
   not on a separate limiter pool. Allow those writer principals the exact
   scope-specific stored routines they need; verify their effective permissions
   do not extend to unrelated Guest or management scopes. A writer pool
   serving arbitrary SQL from ordinary runtime is insufficient separation.
4. Guest classified admission needs an exact visit relationship verified
   against persisted credential/session authority in the same domain
   transaction. Its group is write-once only after independently verified
   binding; a generic runtime-callable group setter still permits poisoning.
   Guest no-charge settlement needs its own purpose-specific, DB-verifiable
   business outcome or a bounded authorized writer transaction with identical
   domain atomicity. Preserve pre-T3 NULL rows and the COMPATIBILITY floor.
5. For handoff/photo/other counted-only consumers, restrict writers to
   monotonic counted admission and locks in the domain transaction. Validate
   guest/operational cases before replacing current per-column grants.

**Do not declare S04 fixed** until a real, uniquely attested PostgreSQL 17
runtime login rejects direct state/group mutation, fake finalization, unknown
purpose and inherited-role escalation; a real Staff/MFA/Guest writer permits
all legitimate transitions, with commit loss, rollback and concurrent quota
checks. Reprovision the same isolated DB twice and repeat the negatives.

## Evidence limits

W58 created an independent Docker `desktop-linux` PostgreSQL 17 fixture
`vaylet-issue416-w58-s04-20261115-pg17`, container ID starting `8579c587`,
loopback `127.0.0.1:51558`, database `s04_w58_disposable`, owner
`w58_owner`, `pg_control_system().system_identifier=7708456259384864802`;
container `pg_controldata` returned the same system identifier. The fixture
held no project migrations or runtime role at attestation. The intended
synthetic DDL/SQL repro was blocked by the tool safety gate **before it was
sent to the host**. There is therefore **no actual W58 role/DML exploit
result, no migration/role provisioning result and no mounted HTTP proof**.
W58 removed only its own label/id-attested disposable container and volume
after the blocked attempt; no shared fixture was changed.
Historical baseline proof was the cited source contract. Current post-fix
negative/positive contract suite:
`packages/database/issue416-s04/s04-protected-source-contract.test.mjs`.
