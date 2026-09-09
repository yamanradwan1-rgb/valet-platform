# DEC-075 — Verified Condition-Photo Byte Evidence

Status: Proposed
Acceptance: Awaiting Project Owner
Date: 2026-09-09
Task: MOB-011C — Verified condition-photo capability decision gate
Unresolved item: U-002
Audited baseline: `945d918004da60c9520c784735644b51eddcbf00`

This proposal does not authorize runtime implementation and does not resolve
U-002. MOB-011D and required-photo closure remain blocked until the acceptance
gate in §20 is completed.

## 1. Context

Check-in condition is required. Condition photos are optional by default and
may be required through the typed Company-default -> Location-override policy.
The existing API can register a `VehiclePhoto` metadata row, but current
authority deliberately refuses to count that row as qualifying evidence.

UI-PARITY-08 needs Native to satisfy a required-photo policy truthfully. This
decision gate audits whether a production-capable byte pipeline already exists
and proposes the minimum portable trust boundary if it does not. It does not
implement the proposal.

## 2. Current verified facts

The following findings were independently verified at the audited baseline.

| Item | Result | Repository evidence |
| --- | --- | --- |
| A. U-002 status | `UNRESOLVED` | `docs/20_EMPLOYEE_NATIVE_EXECUTION_PLAN.md:465`, §6 table row U-002 |
| B. Decision owner | MOB-011C is the audit/decision gate | `docs/20_EMPLOYEE_NATIVE_EXECUTION_PLAN.md:828-849`, heading and status |
| C. Implementation gate | MOB-011D is blocked on U-002 acceptance | `docs/20_EMPLOYEE_NATIVE_EXECUTION_PLAN.md:850-871`, heading and `BLOCKED ON U-002` status |
| D. Existing photo records | Metadata only | `packages/contracts/src/check-in.ts:56-61`, `conditionPhotoRequestSchema`; `packages/database/prisma/schema.prisma:946-963`, `VehiclePhoto` |
| E. Required-photo guard | Metadata never qualifies | `apps/api/src/modules/valet-sessions/check-in-condition-command.ts:450-496`, `evaluateLockedCheckInConditionGuard()` and `FALSE AS qualifying_photo_present` |
| F. Portable client | No photo operation | `packages/employee-client/src/employee-check-in-types.ts:128`, `EmployeeCheckInTransport`; `packages/employee-client/src/employee-check-in-transport.ts:40-125`, `createEmployeeCheckInTransport()` |
| G. Employee Web | No qualifying upload path | `apps/valet/src/components/screens/check-in/check-in-intake-steps.tsx:93-179`, `CheckInVehicleConditionStep`; `apps/valet/src/features/check-in/check-in-mutations.ts:118-156`, `runConditionCompletionMutation()` |
| H. API photo module | Placeholder only | `apps/api/src/modules/vehicle-photos/README.md:1-5`; repository-wide search found no other vehicle-photo storage implementation |

No accepted, production-capable verified byte pipeline exists elsewhere in the
repository. The existing OCR multipart path is intentionally transient and
DEC-074 forbids treating its still image as `VehiclePhoto` evidence.

## 3. Current blocker

The current JSON route is:

```text
POST /v1/staff/check-in/sessions/:sessionId/condition-photos
body: { contentType, storageObjectKey }
```

`StaffCheckInController.registerConditionPhoto()` resolves the authenticated
User and passes the two client-declared values to
`createRegisterCheckInConditionPhotoCommandExecutor()`. That command:

1. rejects blank/control-character/public-URL keys and non-`image/*` declared
   media types;
2. derives Organization, Location, session and actor Membership from persisted
   authority;
3. requires the session to remain `CHECKING_IN` for a new row;
4. inserts an append-only, exact-session metadata row and a safe
   `CHECK_IN_CONDITION_PHOTO_REGISTERED` AuditEvent in one transaction; and
5. provides exact retry behavior only for the same globally unique object key,
   actor, session and declared content type.

It never receives or retrieves bytes. A Staff client can submit an invented
opaque `storageObjectKey`; the server will persist it if its syntax and current
authorization pass. This is intentional and covered by integration tests.

`evaluateLockedCheckInConditionGuard()` therefore hard-codes every current row
as nonqualifying. When effective policy is required,
`createCompleteCheckInConditionCommandExecutor()` returns
`CHECK_IN_CONDITION_PHOTO_REQUIRED`, and `createCompleteCheckInCommandExecutor()`
returns `PHOTO_REQUIREMENT_NOT_SATISFIED`.

Changing only that `FALSE` predicate would convert client assertion into
evidence and is prohibited.

## 4. What a VehiclePhoto record proves today

A successfully created current row proves only that, at the registration
transaction:

- a Staff principal resolved to an active User;
- an active `VALET_EMPLOYEE` or `VALET_SUPERVISOR` Membership existed in the
  session's persisted Organization;
- the Organization and exact Location were active and the Membership had
  explicit Location access;
- the referenced ValetSession belonged to that Organization + Location and was
  still `CHECKING_IN` for a new registration;
- the server derived and persisted the exact Organization, Location,
  ValetSession and capturing Membership scope;
- the declared key and declared `image/*` content type passed metadata syntax
  validation; and
- the metadata row and its safe audit event committed atomically.

It does **not** prove:

- that an object exists, contains any bytes, or is private;
- that the authenticated employee uploaded or captured those bytes;
- that an object belongs to this tenant, Location, session or Vehicle;
- that declared MIME matches actual content;
- byte length, checksum, image decodability or malware/content-scan outcome;
- object immutability/version, upload completion or retention; or
- that retrying the client declaration refers to the same byte content.

Current scope binding applies to the database row, not to an external object.
Current uploader binding records the registering Membership, not the uploader
or owner of bytes. There is no current byte ownership, object existence, MIME,
size, checksum or storage-scope verification.

The public response omits the object key. No Employee photo read/download
projection exists. No object deletion, orphan cleanup or verified-evidence
retention implementation exists. The database row is append-only under the
accepted evidence policy.

## 5. Existing infrastructure found

Reusable foundations are limited to:

- `docs/09_TECH_STACK.md` selects provider-neutral, private S3-compatible
  object storage;
- `.env.example` reserves `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
  `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` configuration names;
- the existing `VehiclePhoto` table has server-derived tenant/session/actor
  relationships and a unique opaque `storage_object_key`;
- the condition command already has current policy evaluation, session locking,
  append-only evidence and audit patterns;
- the OCR endpoint demonstrates authentication before bounded multipart
  parsing, size enforcement, a JPEG magic check and buffer clearing;
- Native already has `expo-camera`, `expo-file-system`, private temporary file
  handling, `FormData` upload, abort support, AppState/focus cleanup and auth-
  generation fencing.

These are reusable patterns, not a reusable photo pipeline. No authored API
code reads the S3 configuration. No S3 client/provider adapter, bucket
provisioning, presigner, verified upload intent, object HEAD/GET verifier,
download authorization, checksum persistence, malware/content scanner, cleanup
worker or retention policy exists. Repository searches also found no GCS,
Azure Blob, R2-specific, Cloudinary, UploadThing, MinIO or equivalent media
service implementation.

The OCR upload must not be repurposed as evidence: it is an OCR-specific,
bounded, in-memory transient request whose bytes are cleared and prohibited
from object storage by DEC-074. Its boundary ordering and Native multipart
mechanics may inform a new implementation after acceptance.

## 6. Minimum security and authority requirements

A qualifying condition photo must satisfy all of the following.

### Identity and scope

- Authenticate the current Staff principal; device identity is not authority.
- Derive User and Membership from current persisted authentication authority.
- Derive Organization, Location and Vehicle through the exact ValetSession;
  reject client authority claims.
- Re-prove active User, Membership, Organization, Location, explicit Location
  access and the accepted condition-photo role allowlist.
- Preserve the current condition-command rule: no active Shift is required by
  this specific API boundary today. Adding a Shift requirement would be a
  separate product/authorization decision. A Native shell's active Shift is
  not server authority.
- Require the ValetSession to remain in the condition-eligible `CHECKING_IN`
  lifecycle before evidence qualification.
- Derive `capturedByMembershipId`; never accept it from the client.
- Re-prove all authority after potentially long byte transfer and before
  qualification, not only before upload begins.

### Object and byte trust

- Generate an unguessable, provider-neutral object key on the server; never
  accept the qualifying key from the client or expose it as a fetchable URL.
- Use a private bucket with public access disabled.
- Bind one upload operation and resulting object to one exact Organization +
  Location + ValetSession + purpose + captured-by Membership.
- Prevent an object or operation from being reused across principals, tenants,
  Locations, sessions or evidence purposes.
- Enforce a small explicit image media allowlist, a bounded maximum size and
  actual-byte validation independent of the multipart declaration.
- Compute byte length and a cryptographic digest server-side. Confirm the
  committed object exists and matches the verified length/digest before it may
  qualify. Provider ETag alone is not a portable checksum.
- Do not count a pending, failed, expired, orphaned or metadata-only object.
- Do not allow condition completion before a verified evidence row commits.

### Concurrency and lifecycle

- Give each user-intended upload a stable, non-authorizing operation identity
  bound server-side to scope and byte fingerprint.
- Make exact retries converge; reuse of an operation identity with different
  scope or bytes fails non-disclosingly.
- Serialize final qualification and condition completion on the exact session.
- If completion wins before evidence commits, it must remain blocked. If
  verified evidence commits first, completion may observe it.
- Late Native results are ignored after auth-generation, identity, Location,
  session, workflow, focus or AppState invalidation.
- Interrupted uploads and response loss remain unknown until server status is
  reconciled; local capture or transfer completion is never success.
- Expired/incomplete uploads cannot later qualify without current authority.

### Privacy and evidence

- Keep local files in temporary/private app storage and delete them promptly
  after confirmed success, cancellation or terminal failure.
- Never place raw bytes, base64, local URI, object key, signed URL, digest,
  plate/customer data or provider credentials in ordinary logs, analytics,
  AuditEvent metadata, navigation state or durable generic queues.
- Preserve append-only verified evidence metadata. Removing a local pre-upload
  capture is allowed; replacing verified evidence means adding evidence, not
  silently rewriting history.
- Authorized download is separate and is not required merely to qualify the
  photo. Any future read uses a short-lived signed URL or authorized proxy and
  re-proves scope.

Exact byte limits, upload timeouts, incomplete-upload cleanup age, verified
byte retention, image dimensions, and malware/content-scanning policy are not
defined by current authority and remain owner/deployment values.

## 7. Options considered

### Option A — Server-mediated bounded multipart upload (recommended)

Native or Web sends the private image to an authenticated Check-In endpoint.
The API validates bytes, generates the key, writes through a provider-neutral
private object-storage adapter, verifies the committed object, and atomically
records verified evidence.

Advantages:

- smallest client trust boundary and simplest Android/iOS/Web contract;
- no object credentials, keys or signed upload authority leave the API;
- existing auth-before-multipart and Native `FormData` patterns are reusable;
- actual MIME, length and digest are observed by the authoritative server;
- easiest pilot failure injection and end-to-end authorization testing.

Costs:

- photo bytes traverse API compute and require strict body/memory/concurrency
  bounds;
- the API needs a new provider-neutral storage adapter and deployment;
- object-store + PostgreSQL cannot form one atomic transaction, so a durable
  upload operation and cleanup/reconciliation behavior are required;
- horizontal deployments need shared durable operation state, not process
  memory.

For a bounded pilot photo count and size, central authority and lower protocol
complexity outweigh direct-upload efficiency.

### Option B — Server-issued private presigned upload then verification

The API authorizes an upload intent and creates an unguessable server key; the
client uploads directly to private S3-compatible storage and asks the API to
finalize. Finalization re-authorizes and verifies object existence, size,
actual media and digest before recording evidence.

Advantages:

- avoids relaying photo bytes through API compute;
- better fit for high volume or large media.

Costs:

- adds signed-authority expiry, intent/finalize/status contracts and direct
  object-store networking behavior to every client;
- storage-enforced declared MIME is still not actual-byte verification, so the
  API or a trusted scanner must read/inspect committed content;
- more expiry, CORS/provider-compatibility, orphan and interrupted-upload races;
- still needs durable upload-operation state, cleanup and server-side
  verification; and
- no presigning or verification primitive exists in this repository.

This remains a viable later scale path behind the same shared intent/result
semantics, but it is not recommended for the first pilot.

### Option C — Reuse an existing accepted media pipeline

Rejected as unavailable. No such pipeline was found. The S3 environment names
are configuration placeholders; OCR is transient provider input; current
`VehiclePhoto` is metadata-only.

## 8. Rejected unsafe variants

The following must never qualify:

- trusting client `storageObjectKey` or declared `contentType`;
- treating a local URI, upload-progress callback or HTTP request completion as
  server evidence;
- flipping the guard to count current metadata rows;
- a public bucket/object or persistent public URL;
- client-supplied Organization, Location, Membership, Vehicle or captured-by
  authority;
- guessable/cross-tenant keys or one object reused for multiple sessions;
- qualification before object existence and byte verification;
- relying on ETag as a portable content digest;
- process-memory-only retry state or a generic offline upload queue;
- putting bytes/base64/keys/signed URLs into telemetry or AuditEvents; or
- reclassifying the transient OCR sample as condition evidence.

## 9. Recommended target architecture

**PROPOSED:** adopt Option A for the pilot: one server-mediated, bounded
multipart condition-photo operation backed by a provider-neutral private
S3-compatible object-store adapter and durable upload-operation state.

The existing JSON metadata-registration route remains nonqualifying. It must
not be the path used by Native/Web and must not be broadened into trust. A later
implementation may deprecate it, but compatibility behavior must remain
explicit and old rows must never become verified by migration default.

The server-mediated endpoint should initially accept one JPEG image per
logical operation. JPEG-only is proposed because the existing Native physical
capture and audited multipart validation already produce/handle JPEG; it does
not select a new camera dependency. The exact maximum byte/dimension limits
remain an owner-approved implementation parameter, not an inferred value from
the OCR-specific 1 MiB limit.

## 10. Proposed server flow

The following semantics are proposed; exact identifiers are not Accepted API
names until §20 is approved.

1. Client starts one multipart request for an exact session with a stable
   photo-operation UUID and one image. It supplies no Organization, Location,
   Membership, Vehicle, object key or verification claim.
2. An API guard authenticates and performs a non-mutating current scope,
   role, Location-access and lifecycle check before multipart parsing.
3. The API accepts one bounded image, computes length + SHA-256, validates
   actual JPEG structure/decodability and rejects declaration/content mismatch.
4. In PostgreSQL, it re-authorizes and locks the exact session, then creates or
   resumes a durable pending operation bound to server-derived scope, actor,
   purpose, fingerprint and a server-generated object key.
5. The API writes bytes through the private storage adapter. No public ACL or
   client-readable provider key is created.
6. It verifies the committed object by provider-neutral existence/metadata
   read and confirms length plus server-computed digest. If actual-byte
   verification requires a read-back, the adapter performs it before success.
7. In a second transaction, it again re-authorizes and locks the session. It
   atomically marks the operation verified, creates a distinguishable verified
   `VehiclePhoto`, and appends one safe photo-verified AuditEvent.
8. The response returns only safe evidence/status fields needed by the client,
   never object key, signed URL or digest.
9. `evaluateLockedCheckInConditionGuard()` counts only committed, verified,
   exact-session `CHECK_IN_CONDITION` evidence. Legacy/current metadata-only
   rows remain permanently nonqualifying.
10. Condition completion locks the same session and observes either the
    verified row or no qualifying evidence; no check/use gap is allowed.

A proposed route shape for implementation review is a multipart create/retry
operation under the existing exact-session Check-In namespace plus a narrow
operation-status read for ambiguous outcomes. The contract must be strict and
must not expose provider concepts. Route names and persistence column names are
proposal details, not current repository facts.

### Proposed exact HTTP contract — not Accepted

If Option A is accepted, the proposed public contract is:

```text
POST /v1/staff/check-in/sessions/:sessionId/condition-photo-uploads
Content-Type: multipart/form-data
fields: operationId=<uuid>, image=<exactly one bounded JPEG>

GET /v1/staff/check-in/sessions/:sessionId/condition-photo-uploads/:operationId
```

The create request accepts no object key, Organization, Location, Membership,
Vehicle, captured-by, verification, timestamp or policy field. `operationId`
is client-generated retry correlation only and grants no authority.

Proposed create success and verified status return the same strict safe shape:

```text
operationId
status = VERIFIED
valetSessionId
vehiclePhotoId
contentType = image/jpeg
byteSize
verifiedAt
```

The status read may otherwise return only `PENDING`, `FAILED` or `EXPIRED`
plus a safe retryability classification. It must re-authorize the current
principal against the exact session and bind the operation to the original
actor; foreign, cross-session and cross-tenant IDs fail non-disclosingly.
Neither response returns an object key, digest, signed URL or provider detail.

The exact public error names remain part of the contract implementation review,
but the contract must distinguish invalid media, too large, operation conflict,
authorization/lifecycle denial, storage unavailable, verification failed and
unknown/reconciling outcomes. None may be represented as verified.

## 11. Proposed persistence semantics

The implementation needs a durable distinction between unverified legacy
metadata and verified bytes. Backfilling old rows as verified is prohibited.

The recommended model is:

- a dedicated upload-operation record with stable operation identity,
  server-derived Organization/Location/session/purpose/actor scope,
  server-generated key, byte fingerprint, bounded status, authoritative
  timestamps and terminal failure/expiry information; and
- verification metadata on or linked one-to-one with `VehiclePhoto`, including
  at least server verification time, byte length and cryptographic digest.

Proposed exact persistence names — also not Accepted — are a
`condition_photo_upload_operations` table with a bounded
`PENDING | VERIFIED | FAILED | EXPIRED` status and new nullable
`vehicle_photos.upload_operation_id`, `verified_at`, `byte_size` and
`content_sha256` fields. Existing rows receive null verification fields and
remain nonqualifying. The verified transition requires every verification
field and an exact operation link; a pending/failed/expired operation cannot
own a qualifying row.

Photo/upload state remains independent from ValetSession state, as required by
`AGENTS.md`. Exact table/column/status names, indexes and privileges require
review in the server/storage implementation child. Database constraints must
enforce one operation identity within its authoritative scope, unique object
identity and no verified record without required verification facts.

The ordinary runtime role must not gain generic UPDATE/DELETE/TRUNCATE over
append-only `vehicle_photos`. Narrow functions or a similarly reviewed command
boundary should own state transitions and atomic evidence/audit insertion.

## 12. Proposed Native and portable flow

Portable `@valet/employee-client` state should express product intent and
authoritative outcomes only:

```text
empty -> captured-local -> uploading -> checking-server
      -> verified | failed-retryable | rejected | cancelled
```

These labels are conceptual, not Accepted public enum names. Portable state
owns single-flight fencing, stable operation identity, safe response parsing,
manual retry/status reconciliation and auth/scope generation checks. It must
not contain Android URIs, Expo types, provider keys or local-success authority.

The Android adapter uses the existing `expo-camera` and private temporary file
mechanics to capture one still image only after explicit employee action. It
passes a private file to the portable transport, supports abort, and removes
the file after confirmed success/cancel/terminal failure. Background, focus
loss, route exit, auth-generation change, Location/session change or logout
invalidates the result and closes capture.

Future iOS uses the same shared state/transport contract with iOS camera and
temporary-file behavior. No Android file URI, permission result or provider
concept enters the server contract.

## 13. Failure, retry and unknown outcomes

- Before any durable operation exists: retry is a new explicit employee
  action; no success is shown.
- Pending operation, no object: exact retry may resume or safely replace only
  under the same current principal/scope and accepted operation contract.
- Object written, database finalize unknown: status reconciliation checks the
  durable operation and verifies the object; it never uploads a blind second
  object or reports local success.
- Verified commit, response lost: status read or exact retry returns the same
  evidence with no second row/audit.
- Same operation ID with different actor/scope/fingerprint: fail closed and
  non-disclosingly.
- Authorization, lifecycle or policy changes during transfer: finalization
  re-proves authority. Unauthorized/stale work cannot qualify; cleanup handles
  any private orphan.
- Upload/verification failure: condition completion stays blocked when policy
  requires evidence. Retry remains explicit and single-flight.
- App background/kill: no generic durable client queue or automatic replay.
  On return, the client rehydrates authoritative status before retry.
- Condition-completion race: exact-session locking establishes order. There is
  never a local optimistic completion.

Incomplete/orphan operation cleanup requires a durable server process or
operator-safe scheduled mechanism. Immediate best-effort deletion alone is
insufficient because a process can die after object write.

## 14. Verification semantics

`qualifyingPhotoPresent` may become true only for an exact-session record whose
server verification facts are complete and whose private object is known to
have committed with matching byte length and digest. A declaration, pending
operation, failed HEAD/read, missing object, unsupported real type, oversized
object or mismatched fingerprint remains false.

Current policy requires presence of at least one qualifying exact-session
`CHECK_IN_CONDITION` photo when effective policy is true. It does not currently
define four directions, minimum dimensions or multiple required types; this
proposal must not invent them.

Object verification establishes technical evidence integrity, not truth of
what the image depicts. Employee capture remains a human operational action.

## 15. Privacy, access and telemetry

- Bucket/object access is private by default and provider credentials remain
  API-side.
- The qualifying-upload response is `Cache-Control: no-store` and contains no
  object access material.
- Operational logs use bounded outcome classes and correlation/operation IDs
  only; they exclude media, local paths, keys, signed URLs, digests and PII.
- Audit metadata records safe purpose/outcome facts and never storage details.
- No ordinary analytics or error-reporting attachment may receive the image.
- A future evidence-view route must re-authorize each request and use a
  short-lived signed GET or authenticated proxy; it is not implicitly approved
  here.

Verified evidence metadata remains append-only. Legal/contractual retention,
customer export and deletion exceptions are unresolved and must not be guessed.

## 16. Storage and retention values still unresolved

Owner/deployment acceptance is required for:

- concrete S3-compatible provider and private bucket/environment ownership;
- maximum image bytes and dimensions;
- upload/request timeout and pending-operation expiry;
- incomplete multipart/private-object cleanup interval;
- verified photo byte retention and any legal hold/export obligations;
- whether pilot images require malware/content scanning beyond strict image
  decoding/type verification; and
- operational alerting/backup expectations for the evidence bucket.

These unknown values do not justify metadata trust. They block production
enablement of required photos until selected and tested.

## 17. Pilot photo-policy owner choice

The current policy is already configurable:

```text
effective = location.check_in_photos_required_override
            ?? organization.check_in_photos_required
```

Organization default is `false`. DEC-058 permits an authorized Location
Manager to set or clear the typed Location override; an explicit Location
`false` overrides Company `true`. Policy changes take prospective effect
immediately. Final Check-In re-evaluates current policy even when a historical
condition-completion marker already exists.

The owner must choose one pilot envelope:

### Choice P1 — Optional-photo Locations only

Enroll only Locations whose effective policy is explicitly verified `false`,
including an explicit Location `false` where Company default is true. Release
checks must re-verify this value and operating procedures must prevent an
uncoordinated switch to required during the restricted pilot.

Consequence: optional-photo Check-In may proceed, but this is a pilot scope
restriction, not U-002 capability closure. Required-photo parity, MOB-011D and
the required-photo G2 proof remain open.

### Choice P2 — Include required-photo Locations

Do not admit a Location with effective `true` until every accepted server,
storage, contract, portable, Native UI and physical-device child below lands
and passes real private-byte evidence tests.

Consequence: broader pilot coverage, but UI-PARITY-08 and G2 cannot close until
the verified pipeline is implemented and deployed.

No pilot choice is made by this proposal. P1 must not be represented as
required-photo capability, and neither choice permits disabling policy globally.

## 18. Required implementation children after acceptance

MOB-011D should be split in this order:

1. **Owner/deployment parameter record:** accept architecture, pilot envelope,
   provider/bucket ownership, limits, expiry, retention and scan stance.
2. **Storage adapter and persistence foundation:** provider-neutral private
   object boundary, upload-operation schema/migration, verification facts,
   constraints, least-privilege grants and orphan cleanup.
3. **Strict shared/API contracts:** multipart/status semantics, safe response
   projections and error taxonomy; no provider fields.
4. **Server command/controller:** auth-before-bytes, post-transfer
   reauthorization, validation, storage verification, atomic evidence/audit,
   guard qualification and race-safe reconciliation.
5. **Portable employee-client:** single-flight upload/status state,
   operation identity, auth/scope fencing and authoritative recovery.
6. **Native physical adapter:** explicit camera action, private temporary file,
   multipart transport, lifecycle cleanup and Android permission behavior with
   an iOS-compatible shared contract.
7. **Native Check-In UI:** Web-aligned capture/review/replace-before-upload,
   uploading/failure/retry/verified states and truthful completion blocking.
8. **Employee Web adapter/UI:** required if Web must operate at required-photo
   Locations; current Web cannot do so. Reuse the same server semantics without
   making Web implementation a prerequisite for Native adapter code review.
9. **Evidence:** contract/unit tests, real PostgreSQL + private object-store
   integration tests, two-principal/cross-tenant/race/failure injection, and
   physical Android proof; future iOS proof uses the same contract.

No child should combine provider/storage, API, portable state and UI into one
uncontrolled patch.

## 19. UI-PARITY-08 relationship

Technically independent UI-PARITY-08 work includes Web-aligned Check-In state
order, manual capture interaction, no-plate ordering, plate confirmation,
customer/vehicle presentation, immediate condition entry, optional-policy
condition completion, post-condition continuation, copy, RTL and recovery.

UI-PARITY-08 cannot truthfully close for the accepted configurable product
while a required-photo Location cannot capture, upload, verify and complete in
Native. Removing the existing Web-fallback error or enabling Continue without
verified evidence would fabricate support. This audit implements neither the
independent UI work nor the blocked photo work.

## 20. Explicit acceptance gate

U-002 remains `UNRESOLVED` and MOB-011D remains blocked until the Project Owner
records all of the following:

1. accept or reject the recommended server-mediated Option A architecture,
   including durable upload operation and explicit verified-evidence facts;
2. approve JPEG-only initial media scope or select another bounded allowlist;
3. select pilot envelope P1 or P2;
4. approve the concrete provider/private-bucket deployment owner;
5. approve maximum bytes/dimensions, timeout/expiry and orphan-cleanup values;
6. approve verified-byte retention/legal-hold behavior; and
7. decide the pilot malware/content-scanning requirement beyond strict actual-
   image validation.

Acceptance must update this focused DEC to `Accepted` (or create a superseding
Accepted DEC) and update the canonical decisions log. Only then may the
corresponding implementation children be authorized. Until those children land
and pass their evidence gates, required-photo UI-PARITY-08 remains blocked.

## Affected docs/code

- `docs/decisions/DEC-075_VERIFIED_CONDITION_PHOTO_BYTE_EVIDENCE.md`
- `docs/20_EMPLOYEE_NATIVE_EXECUTION_PLAN.md` status/link bookkeeping only
- future implementation, only after owner acceptance: API/storage, contracts,
  database migration, portable employee-client, Employee Native, Employee Web
  if required, tests and deployment configuration
