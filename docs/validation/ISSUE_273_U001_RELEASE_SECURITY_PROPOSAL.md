# Issue #273 — Issues272–278/U-001: exact Push release authority

**Status: DRAFT — NOT ACCEPTED. No implementation authorization.**

Date: 2026-10-09. Proposal only for Owner and independent security review.
Affected Accepted authority: DEC-072 (Native auth), DEC-073 (Staff Push),
supplemented by DEC-075 policy v1 and DEC-076 stale endpoint lifecycle.
The package-local U-001 here is **not** DEC-100's U-001.

## 1. Decision requested

Recommend **Option A: a narrow one-purpose, one-binding, expiring release
capability prepared while the original User A is currently authenticated**.
It may terminalize *only* the exact Staff Push registration authorized by A
when the proof was issued. It cannot log in, refresh, read Staff or guest data,
revoke arbitrary sessions, mutate custody, claim installation ownership, or
transfer the old binding to B. B must sign in independently and call the normal
authenticated registration PUT. The existing different-User 409 rule stays.

**No route, DTO, verifier, hash, dependency, migration, SecureStore marker,
runtime grant or proof is being added in Task 3.** Every parameter and new
authority below requires the Owner's explicit security approval and an
Accepted DEC-072/073 amendment. These values are **proposed, not accepted**.

## 2. Existing authority and failure boundary

- Native `NativeAuthSession.switchAccount` requires local cleanup to complete,
  **not** remote logout success. DEC-072 explicitly permits B login after a
  failed/offline A logout and requires A's old refresh to be discarded.
- API normal logout uses the old refresh credential to find the original
  StaffAuthSession and, in one transaction, revoke that session and DISABLE/
  scrub all its ACTIVE registrations. Successful logout already permits B PUT.
- A failed or rolled-back server logout leaves A's row ACTIVE. A later B
  registration is correctly rejected `409 STAFF_PUSH_REGISTRATION_CONFLICT`.
  Local installation ID and FCM token are selectors, **not authorization**.
- A revoked/expired StaffAuthSession is not delivery-eligible, yet its stale
  ACTIVE registration may still block B. DEC-076 cleanup uses age since last
  confirmation (30 days) and may be delayed; expiry alone does not rebind.
- An old A PUT already dispatched before logout may still reach the API; local
  auth-generation fencing can only suppress stale UI outcomes, not server writes.

## 3. Concrete proposal for review, NOT executable contract

### Proof creation and issuance

1. Only while A has a currently valid, unrevoked StaffAuthSession and owns a
   specific ACTIVE StaffPushRegistration for its exact provider/app/install
   and token version can a Native client prepare a release proof.
2. Native generates a fresh **proposed 256-bit CSPRNG** bearer secret. Prove
   the device has a genuine secure native RNG, with no `Math.random` or
   `installationId` fallback. A cryptographic RNG dependency, if required,
   needs separate approval and Android/iOS evidence.
3. Before network issuance, persist exactly one purpose-specific envelope in
   device-only encrypted SecureStore, verify a readback and installation
   generation/installation consistency. It carries proof version, raw secret,
   opaque exact registration selector, issuance identifier, local install epoch
   and provisional deadline; **no** A auth token, refresh, User, email, vehicle,
   guest payload or arbitrary command journal. Do not include raw FCM token.
4. While still authenticated as A, call a **proposed** narrow issuance route
   such as `POST /v1/staff/push/registrations/:id/prepare-release` with strict
   JSON `{proof: <opaque random bearer>, issueId: <UUID>}` and the normal A
   Staff Bearer. The server obtains the currently authenticated exact session,
   current User and exact ACTIVE owned row from persistence before insert.
   Any conflicting active issuance/row rotation is denied or supersedes
   **only** the older unconsumed proof under the same transaction.
   **Proposed issuance lock order must match release:** authenticated original
   User security lock -> original StaffAuthSession FOR UPDATE -> sorted
   existing installation/token advisory keys -> implicated registration
   FOR UPDATE in ID order -> existing proof/fence row FOR UPDATE (or the new
   issuance INSERT). Do not lock the proof before the registration. This
   remains subject to full SQL/all-writer deadlock review before acceptance.
5. Server stores only a domain-separated cryptographic verifier/hash, issuance
   context and a bounded expiry; never the raw secret. Hash generation should
   use a reviewed domain separator and constant-time comparison where possible.
   High entropy is essential: a hash does not make a low-entropy ID secure.
6. The client prepared the secret *before* issuance, so a lost issuance response
   does not require the server to retransmit a raw secret. Reissuing the same
   authenticated `issueId + proof` is idempotent; changed binding/secret
   conflicts, and an unauthenticated B can never mint or rotate A's proof.
7. A safe app may stage the proof while A is logged in after each confirmed
   registration. If A is already offline before any accepted proof issuance,
   this path is **unavailable**; fall back to Option B.

### Expiry and SecureStore lifecycle

- **Proposed** proof validity: 24 hours from database issuance, absolute and
  non-sliding. Owner must approve the value and failure/operational tradeoff.
  Proof expiry stops NEW release, never re-enables old registration authority.
- Stored proof is app-private, device-only, excluded from cloud backup/Android
  device transfer; explicitly handle iOS Keychain persistence across reinstall
  using a separate installation epoch and cryptographic storage policy.
- Successful A online server logout can make the proof unnecessary; cleanup
  follows an explicit authoritative status/cleanup rule. If response is lost,
  retain the scoped proof until definitive terminal resolution or expiry.
- For approved offline account switching only, the bounded proof must survive
  the ordinary identity purge **without preserving A identity/credentials**.
  This exception directly requires an Accepted DEC-072 amendment. The existing
  auth SecureStore envelope remains independently purged as today.
- Invalid/corrupt/readback-failed/missing proof blocks only this release path;
  it never unlocks cross-user PUT or resurrects A. Delete and confirm absence
  after consumed/expired terminal handling. Failed deletion remains fail-closed
  for this release workflow, not a generic credential-recovery bypass.
- A reinstall, backup restore, device transfer, unrecognized install epoch or
  proof copied to another device **must not be claimed to be hardware-bound**
  based on `installationId` alone. Device-only storage reduces theft, not a
  server-verifiable physical-device attestation. See residual risk below.

### Proposed release operation

Proposed route: `POST /v1/staff/push/release` with exact strict JSON
`{proof: <opaque bearer>}`; its **only** privilege is conditional release.
It never accepts client-supplied owner/session/location/tenant as authority,
never reads/list-discloses an existing registration and returns only a fixed
non-identifying terminal/unavailable result. A pre-authorized proof could
be used after A logs out without the old Staff bearer. Whether to ALSO require
a currently authenticated B Staff session (abuse defense versus lock-order/
cross-organization implications) is an **open Owner/security decision**.

Within one server transaction:

1. Hash provided proof, discover its server record without exposing whether
   the record or original staff session exists. The initial discovery SELECT
   must acquire **no conflicting registration/session row locks**.
2. Acquire canonical locks described in section 5, then re-read the proof,
   original session, specific original registration/version and server deadline
   under lock. Reject absent, expired, changed or foreign/unissued proof without
   mutating. A revoked original session does not itself invalidate a previously
   issued narrow release proof; its exact issuance provenance still must match.
3. If the original row is still exact ACTIVE, atomically transition only that
   row `ACTIVE -> DISABLED`, scrub `provider_token`, write terminal reason
   (a **new approved controlled reason** is needed), terminal timestamp and
   consume the proof. Never revoke A's other sessions, installations or Tasks.
4. Persist a **monotonic server-side fence** for old
   `(A StaffAuthSession, provider, app, installation, original token version)`
   as part of that same commit. The fence must make the old-session PUT reject
   for that installation even with a **new** FCM token, and also deny reuse of
   the original token hash on another installation. It does not affect A's
   unrelated installations or a genuinely new authorized session.
5. A matching consumed-proof retry is idempotent and non-disclosing; it never
   disables a new B row. If the old row was SUPERSEDED by token rotation or
   now belongs to a different session/version, do **not** terminalize its
   successor with an obsolete proof. Require current-A issuance or Option B.
6. Commit before responding. Afterward, B performs its ordinary authorized
   `PUT /v1/staff/push/registrations`; a successful release does not
   automatically perform B registration and does not imply eligibility or
   physical delivery.

## 4. Threat model and prescribed result

| Threat / failure | Proposed invariant or blocked behavior |
| --- | --- |
| Genuine A→B same phone | A-authenticated exact proof may release A row; B must separately log in/PUT |
| B knows install ID, registration ID or FCM token | B cannot mint A proof or pass active-row ownership guard |
| Forged registration selector | Server proves A active session, exact owned row and current token version |
| Proof stolen/copied | At most a bounded one-row push-disable DoS; no login/read/rebind; theft residual needs Owner acceptance |
| Proof replay, changed binding | Identical consumed retry safe; changed target never released |
| Proof on another installation | Never trust install-ID assertion as hardware binding; device-bound storage/attestation approval gap |
| Mint/logout race | Issuance before revoke may prepare proof; logout before issuance denies mint; no takeover |
| Lost mint response | Client already owns durable secret; authenticated same-issue retry; no server plaintext recovery |
| Offline logout/process death | Only previously issued durable proof may be used; otherwise fail closed |
| SecureStore write/readback/corrupt | No release without confirmed proof; A auth credentials never preserved |
| Lost release response/timeouts | Reconcile same proof; neither assume rollback nor issue another secret |
| B enrolment fails after release | A remains safely terminal, B must retry ordinary PUT/current Task queue |
| A old in-flight PUT | Operation fence participates in the same canonical transaction locks |
| Same-User newer session | Preserve accepted later-session takeover, but not a consumed old-session fence bypass |
| Token rotation/proof stale | Old proof cannot disable/transfer current successor; require new issuance while A authenticated |
| Provider-invalid/stale maintenance | May terminalize only their own currently fenced row under existing contracts |
| Revoked User, membership or expired A session | No new issuance; prior valid exact proof cannot create Staff authority |
| Wrong tenant/Location or foreign current B | No old-owner disclosure, no role/Location grant, no cross-user claim |
| Provider send already LEASED | Do not claim OS/provider recalls; current eligibility + generic payload mitigate TOCTOU |
| Shared-device multiple switches | One proof per exact binding/epoch; no transitive authority for C or old A |
| Reinstall/backup/restore | Local epoch mismatch denies; do not claim OS hardware attestation |
| Brute-force/oracle probing | 256-bit entropy, strict rate limit, fixed content-free errors, no proof/identity logs |

## 5. Transaction ordering and proof of fencing — proposed

Existing normal registration order is current User security lock, current
StaffAuthSession row lock, sorted installation/token advisory keys, implicated
ACTIVE registration rows ordered by ID, then desired-state write.
Existing logout locks the presented refresh credential plus original session,
then terminalizes rows of that session. Provider invalidation and stale
maintenance must be included in the final lock graph.

**Proposed release order, to verify against actual all-writer SQL:**

1. Nonlocking hash lookup for the original subject identifiers.
2. Original A User security lock if required for compatibility with the
   current registration authorizer (not authentication by old User status).
3. Original A StaffAuthSession row `FOR UPDATE` even if revoked; this serializes
   with A's old PUT and existing logout without granting A read authority.
4. Sorted existing `staffPushLockKeys` for provider/app/installation and
   original provider-token hash; acquire no new unordered advisory key.
5. Implicated registration rows ordered by primary key `FOR UPDATE`.
6. Exact release-proof/consumed-fence row `FOR UPDATE`, revalidate status,
   expiry, immutable binding and current row version.
7. Disable/scrub original row and consume proof/persist fence, then COMMIT.

**Existing PUT must check the persisted consumed fence after acquiring the
same session + logical locks and BEFORE any active-row insert/reconfirm.**
Do not rely on terminalization or partial uniqueness alone: after old ACTIVE
is DISABLED, A's unrevoked old session could otherwise register a new row.
An old A PUT that acquired the session lock first commits before release and
is observed by release under its locks; a release that commits first makes
the delayed A PUT fail its fence. B's PUT cannot claim while A is still
ACTIVE and may proceed only after release commit. The registration's partial
uniques independently guard overlapping ACTIVE tuples.

**Important unresolved SQL review:** Existing logout locks refresh then
session, while new issuance/release must not invert session/registration
or delivery row order. A sender/provider finalizer may hold a delivery row
when it inspects registration; release must not synchronously lock delivery
rows after locking registration if that creates a cycle. Rely on current
send-time eligible-state suppression or introduce a separately reviewed
compatible delivery lock order. No FCM I/O inside any DB transaction.
Prove READ COMMITTED post-lock visibility and lock-wait/rollback cases with
actual PostgreSQL and deterministic barriers; TypeScript mocks do not prove
deadlock freedom.

## 6. Proposed persistence and least privilege

- A new **forward-only, separately approved** release-proof entity/table:
  opaque UUID internal ID, HMAC/domain-separated proof verifier UNIQUE,
  original StaffAuthSession and exact StaffPushRegistration FKs, provider,
  app, installation-key digest, original token/version digest, issuance
  immutable server time, expiry, consumed_at and terminal outcome class.
  Add an explicit immutable payload hash only if essential; never raw secret.
- A durable consumed fence can live in this table with proper indexes, or
  a separate compact fence table if necessary for performance/retention.
  Fence records **must outlive proof expiry** until the original A session
  cannot authenticate anymore (bounded by its 30-day absolute limit). A
  consumed fence cannot be removed merely because the 24h bearer expired.
  Any explicit data-retention value needs Owner/privacy decision.
- Constrain exact FKs, single currently usable proof per binding/version,
  one-way consumed state, unique verifier, valid expiry, non-null binding
  and indexed session/installation/token fence lookup. No terminal
  registration reactivation and no re-parenting an old proof to B.
- Issuance DB role may only insert/read the verified own binding, release
  executor may only update the exact row under the proof authority, and
  ordinary registration runtime must be able to read the necessary consumed
  fences. Deny unrelated broad SELECT or ability to query raw secret.
- Schema, Prisma, runtime grants/verifier, migration, API contracts,
  sensitive error handling and old-client compatibility are **not approved**
  and **must not** be implemented in this phase.

## 7. Failure, retries, rollout and rollback

- Mint unavailable before A logout: no proof, no offline release; preserve
  Option B and allow B to operate with canonical queue but push unavailable.
- Issuance success with lost response: same durable secret and issue selector
  can be idempotently checked while A authenticated; do not retrieve plaintext
  proof from the server. Process death after storage but before issuance must
  not be interpreted as minted authorization.
- Release lost response: retry only the **same** narrow proof (if permitted by
  approved user-initiated/foreground policy); a canonical terminal outcome
  confirms safe clearance, never creates B's registration.
- Unknown/invalid/expired/missing proof and failed secure cleanup remain
  fail-closed. Never use a new installation UUID/token, generic journal,
  A refresh credential or forced DB cleanup to circumvent conflicts.
- Preserve DEC-073 same-user newer-session logic, DEC-075 300s/4x/10s/
  30s/retry/FCM HIGH policy, DEC-076 age-only stale semantics and Guest Task
  invariants. Existing B normal PUT remains the only enrollment mechanism.
- Deploy server proof verifier/fence lookup/compatibility before Native
  issuance; feature-gate new issuances only after migration and API negative
  tests. Legacy clients still use existing PUT/disable and cannot bypass a
  consumed fence. Rollback may disable issuance/release, **not** remove fence
  enforcement or reactivate terminal rows. Cleanup retains fence lifetime.
- No new UI text/buttons/dialogs are authorized. Whether automatic,
  user-initiated or foreground/reconnect release retry is permissible must
  be explicitly decided before Native orchestration. Never execute a
  generic offline mutation replay.

## 8. Required security and concurrency acceptance suite

Real PostgreSQL, only on an authorized disposable DB/role with cleanup:

1. Normal A logout transaction disables/scrubs A exact ACTIVE rows; B PUT wins.
2. No A logout commit/rollback → B PUT remains 409 with no owner disclosure.
3. Mint with A current exact binding; missing/foreign/stale/rotated target
   denied; different B cannot mint.
4. Lost mint response, idempotent same proof vs replaced secret, expired,
   corrupt, stolen/cross-install proof, proof replay and ABA token rotation.
5. Release vs A old PUT, A logout, same-user replacement, B PUT, B duplicate
   PUT, provider invalidation, 30-day stale maintenance and session revocation;
   deterministic barriers, no timing sleeps, no deadlocks.
6. Both linearization orders: A PUT commits before release; release wins
   before A PUT reaches session lock; rollback and lost response.
7. B cannot register before release; after release B still must authenticate
   and may receive a normal 409 for a different active owner.
8. Unrelated A devices/sessions stay usable, while only exact old session/
   tuple is fenced for its remaining lifetime.
9. FCM provider calls never occur in database transactions; release does
   not manufacture Guest retrieval requests, Tasks, AuditEvents or delivery.
10. Unknown proof never reveals A identities, registration ID, tenant, token
    hash, persisted metadata or bearer; brute force is rate limited.
11. Android/iOS process death, reinstall/backup/restore, permission change,
    token rotation, actual secure RNG and SecureStore proofs; match exact APK
    SHA/API SHA. Firebase acceptance is not proof of OS presentation.

## 9. Alternatives

**Option B — continue existing fail-closed model.** A can release its
registration only through an authenticated successful logout or already
accepted terminalization/maintenance. B may sign in and work normally but
Push can remain unavailable until legitimate cleanup. This is the only
currently authorized fallback, despite not meeting seamless offline handoff.

**Option C — device-wide enrollment authority.** A persistent device key
capable of transferring arbitrary staff Push registrations increases the
credential, persistence, takeover and tenant-blending surface dramatically.
It is not proportionate to releasing one previously authorized endpoint.

## 10. Explicit Owner and security decisions still required

1. Approve or reject the **single-purpose proof-only authority** and the
   exact original binding semantics (A session, registration ID, token version,
   install epoch, provider/app) without a future B ownership grant.
2. Confirm issuance when A is authenticated, permissible automatic issuance
   timing, and one pending proof/rotation policy. Confirm Native CSPRNG.
3. Approve or alter proposed 256-bit construction, verifier scheme and
   24-hour deadline, including proof replacement and response-loss protocol.
4. Decide whether proof-only release must ALSO authenticate current B;
   if yes, resolve multi-user lock ordering and cross-Organization ownership
   without making B's tenant an A-delegated authority.
5. Accept or mitigate stolen proof on another device: SecureStore device-only
   is not hardware attestation and a stolen bearer can disable one old
   endpoint. Specify backup/reinstall/security posture.
6. Specify permitted foreground/user-initiated release retry without new UI,
   and how old proof survives A logout despite DEC-072 identity purge.
7. Accept exact server fence retention through old Staff session maximum life,
   partial indexes and terminal reason/error taxonomy, plus any data retention.
8. Approve the proposed endpoint/DTOs/SQL/Prisma/runtime grants/migration
   and typed bounded telemetry. Require final all-writer deadlock review.
9. Accept delivery TOCTOU residual (old generic alert already in provider
   transport cannot be recalled); physical Android QA remains required.
10. Record Accepted focused DEC-072/073 amendment/supplement with the
    complete protocol and threat model **before** any new-protocol code.

**Decision gate: DRAFT_PENDING_OWNER_AND_SECURITY_ACCEPTANCE.**
No approval by implication from the recommended Option A direction.
