# DEC-074 — Native Assistive Plate OCR / ANPR

Status: Accepted
Date: 2026-09-05
Amended: 2026-09-05 — no-migration OCR cost-guard policy locked for MOB-010A
Amended: 2026-11-05 — Issue #429 production-safe shared admission and manual Capture execution decision
Task: MOB-010A — Assistive Plate OCR / ANPR Native Integration; Issue #429 focused evolution

## 1. Context and decision scope

DEC-012 includes assistive plate OCR/ANPR in the sellable MVP only when every
machine result remains confirmable/editable by an employee and manual fallback
remains permanent. DEC-020 likewise requires check-in to continue when a plate
is absent, unreadable, or not confidently established.

DEC-067 intentionally authorized native camera/QR architecture without License
Plate OCR and required a later focused decision before OCR could be added. The
current Employee Native MOB-010 flow therefore has a real rear-camera preview,
manual plate entry, no-plate fallback, explicit Confirm Plate, exact returning
recognition, customer choice, intake idempotency, and authoritative recovery,
but the Scan Plate camera is intentionally visual assistance only.

The Owner's latest Issue #429 decision replaces automatic capture with an
explicit employee Capture action. Opening the scanner only presents the rear
camera preview; one deliberate press may acquire one transient sample and
invoke at most one OCR HTTP request. A candidate enters the existing editable
identity flow, and explicit employee confirmation remains required before
returning recognition or intake behavior may proceed.

This decision authorizes that narrow capability. It does not authorize
autonomous vehicle recognition, fuzzy customer lookup, automatic check-in,
damage AI, media persistence, or a generic computer-vision platform.

## 2. Acceptance and authority

This decision is `Accepted`.

The following existing authority remains binding:

- DEC-007 keeps OCR/ANPR providers behind replaceable application adapters;
- DEC-012 requires assistive OCR/ANPR, confirm/edit, and permanent manual
  fallback;
- DEC-020 keeps plate-less check-in valid through a temporary descriptor;
- DEC-023/024 and current Staff authorization/anti-abuse rules continue to
  govern authenticated Staff requests;
- DEC-032 keeps current exact-Location operational eligibility authoritative;
- DEC-063 prohibits blind durable mutation replay and client-fabricated
  success;
- DEC-067 remains fully authoritative for resource/Dynamic-QR scanner behavior;
- DEC-069 keeps returning recognition exact, Organization-scoped, and dependent
  on a human-confirmed plate;
- DEC-071 keeps Employee Native Android-first with portable iOS-compatible
  boundaries; and
- DEC-072 keeps native Staff authentication, logout, identity generation, and
  authorization recovery authoritative.

Where DEC-067 previously excluded License Plate OCR from its slice, this focused
decision supplies the later authorization that DEC-067 required. DEC-067 is not
otherwise superseded.

## 3. Product and trust invariant

Plate OCR/ANPR is an **assistive acquisition mechanism only**.

Machine output is never authoritative Vehicle identity. A successful OCR result
may populate the existing editable plate draft, but it cannot:

- set `confirmedByHuman = true`;
- perform returning-vehicle recognition;
- choose or attach a Customer;
- create an intake;
- mutate a Vehicle or ValetSession;
- claim an exact returning match; or
- bypass the existing Confirm Plate screen.

Only the employee's explicit Confirm Plate action may enter the already
Accepted exact returning-recognition path whose request carries
`confirmedByHuman = true`.

## 4. Required native user flow

The accepted normal flow is:

```text
New Vehicle
-> Scan Plate
-> rear camera becomes ready
-> employee positions the plate within the existing ROI
-> employee presses Capture Plate
-> one bounded camera/ROI operation and at most one OCR HTTP call
-> candidate found
-> existing Confirm Plate screen
-> employee may Edit or Confirm
-> explicit Confirm only
-> existing exact returning recognition
-> existing customer/intake flow
```

One existing-style `CheckInButton` Capture control is required after preview
guidance and before Manual Entry. The sole additive control uses the current
Employee design system, with only minimal truthful EN/AR copy changes. Preserve
the camera viewport, ROI, Torch, spacing, header, other controls and Light/Dark
appearance. Device visual evidence is required before merge; Phase 7 physical
testing is omitted from the Issue #429 execution and cannot be claimed passed.

The following paths remain available throughout the scanner experience:

- Enter manually;
- No plate / unreadable plate; and
- another explicit Capture after a clean `NO_MATCH` and required cleanup, on
  the same mounted preview with the current ROI and Torch intact; and
- existing deliberate recovery after an unavailable/camera failure.

OCR failure, timeout, unsupported region, offline state, or provider outage must
never block an otherwise allowed manual/no-plate check-in path.

## 5. Native camera acquisition

Employee Native may use the existing Expo camera to create transient still-image
samples only while the Scan Plate step is active and the camera is ready.

The camera contract remains:

- rear camera;
- no audio recording;
- no gallery/media-library save;
- no persistent media history;
- no generic frame processor;
- no uncontrolled per-frame OCR;
- camera closes under the existing workflow/auth/lifecycle cleanup rules.

A still image is an implementation transport artifact, not product evidence and
not a VehicleCondition/VehiclePhoto record.

## 6. Explicit manual attempt policy

Only a current, explicit employee Capture press may start acquisition. Camera
open/readiness, timer advancement, remount, foreground return, permission return,
theme change and a `NO_MATCH` result start zero captures and zero new OCR calls.
The former 1.2-second timer and five-attempt automatic OCR loop are superseded.

- One valid press claims one bounded local operation and at most one external
  OCR HTTP request; invalid readiness/crop/capture may produce zero requests.
- At most one capture/upload/cleanup operation is active at a time. Double taps
  are rejected synchronously; no queued frames or deferred automatic press.
- Existing bounded local picture-size/compression fallback stays inside the
  same employee-authorized operation and cannot add another OCR HTTP request.
- A current, safely cleaned `NO_MATCH` retains the mounted preview, current
  validated ROI, Torch and generation; another press starts a distinct owned
  operation after cleanup. No recognition-driven close/reopen/remount.
- `MATCH` enters existing editable confirmation; `UNAVAILABLE` or unsafe camera,
  geometry, cleanup or lifecycle failure retains existing safe terminal and
  manual/no-plate recovery. No automatic retry after either result.

## 7. Generation and cancellation safety

Every scanner-open/retry cycle has a generation identity. Every deliberate
Capture also has a distinct operation identity within that generation. The
operation owner must still match camera generation, mount, ROI binding and
current Staff authentication/Location scope before publication, POST or cleanup
completion. A late callback from an earlier operation in the same generation
cannot clear the next operation's busy state or overwrite its result.

The generation is invalidated by at least:

- candidate acceptance;
- Close camera;
- Back;
- Enter manually;
- No plate;
- component/workflow unmount or leaving capture state;
- relevant app lifecycle cleanup;
- Staff authentication identity-generation change; and
- logout/account switch.

Abort/cancellation should be attempted where supported, but a generation guard
is mandatory even when transport abort exists. A late image/provider response
from an invalid generation must not change the plate draft, open Confirm Plate,
restart the scanner, run recognition, or mutate any business state.
Clean `NO_MATCH` retires its operation only after required file cleanup; it
does not invalidate the otherwise current camera generation. Logout, background,
Location change, phase exit and unmount always take precedence over retention.

## 8. Transient image privacy

OCR input is sensitive operational image data and is ephemeral in this flow.

Employee Native must:

- keep the still image only in temporary/cache storage;
- upload only to the authenticated VAYLET API;
- delete the temporary file promptly in success/failure/finally paths and on
  cancellation where a file has already been created;
- never copy it to Documents, gallery, Media Library, SecureStore, AsyncStorage,
  navigation state, workflow/session state, or a scan history;
- never log image bytes/base64; and
- avoid logging a local URI when it could disclose retained operational data.

The VAYLET API must process the image transiently and must not write the image
to the VAYLET database, object storage, VehiclePhoto, AuditEvent, or another
persistent media store for this task.

An external provider may have its own deployment-specific processing or
retention posture. VAYLET must not claim that a configured external Cloud
provider stores nothing. External-cloud use requires explicit deployment/privacy
approval. The architecture must permit an approved on-premise compatible
provider endpoint without changing Native or Check-In domain semantics.

## 9. Provider boundary

Employee Native never calls a commercial ANPR provider directly and never
contains a provider credential.

The VAYLET API owns a provider-neutral `PlateOcrProvider`-style boundary. The
first authorized adapter is a **Plate Recognizer Snapshot-compatible HTTP
adapter**. The provider endpoint, credential, timeout, score threshold, and
provider enablement are server deployment configuration.

No provider is enabled by default. Missing or invalid provider configuration is
a valid safe state and resolves to provider-neutral `UNAVAILABLE`, leaving
manual/no-plate paths operational.

The adapter must reduce provider output before it crosses the API boundary.
Provider-specific raw response fields, account/usage data, make/model/color,
vehicle class, bounding boxes, provider region prediction, and provider secrets
must not become Native or public Check-In contract fields.

## 10. Provider-neutral request/response semantics

The public Employee Check-In OCR request carries only the minimum information
needed to authorize and assist recognition:

- authenticated Staff context derived from the current Staff session;
- `targetLocationId` as a reference that the server re-authorizes;
- the employee-selected plate country; and
- one bounded JPEG image payload.

The response is provider-neutral and conceptually one of:

```text
MATCH {
  candidate: {
    plateNumberRaw,
    confidence
  }
}

NO_MATCH
UNAVAILABLE
```

The final exact schema and names follow current repository contract conventions.
Confidence is suggestion-quality metadata only; it never means verified,
confirmed, or authoritative.

## 11. Country hint policy

The employee-selected country remains authoritative presentation/input context.
It may be used only as a provider region hint:

```text
JO    -> jo
AE    -> ae
SA    -> sa
KW    -> kw
BH    -> bh
OTHER -> no region hint
```

Provider region prediction must not silently change the employee-selected
country. If the configured provider/deployment does not support a selected
country, OCR returns a truthful unavailable/no-read result and manual/no-plate
fallback remains available.

## 12. Candidate selection and confidence

Provider raw results are sanitized at the server adapter boundary.

Any score threshold is server-owned/configurable. Native does not decide the
trust threshold. A threshold filters poor suggestions; it does not authorize a
Vehicle identity.

Candidate selection must be deterministic. Malformed provider output fails
closed to a safe provider-neutral result. Provider make/model/color or other
vehicle intelligence is ignored in MOB-010A.

## 13. API authority and cost boundary

The OCR endpoint is an authenticated Staff Check-In endpoint. Before external
provider I/O and cost, the API must:

- authenticate the current Staff principal;
- validate request/media shape and bounded payload size;
- validate the supported plate-country value;
- re-prove the required current Organization/Location operational eligibility
  using existing server authority; and
- apply the cost-guard policy in §22 before provider I/O.

OCR itself causes zero Vehicle, Customer, ValetSession, Task, custody, financial,
or audit-domain mutation.

No new durable generic queue, generic outbox, OCR history table, or rate-limit
platform is authorized by this decision.

## 14. Provider failure and observability

Provider timeout, transport failure, invalid payload, quota failure, unsupported
region, no match, or low-confidence-only output must never fabricate a plate.

Safe observability may record bounded non-sensitive operational facts such as:

- provider-neutral outcome class;
- duration bucket/metric;
- timeout/unavailable counts; and
- attempt count.

Logs/telemetry must not contain image bytes, provider credential, raw provider
payload, full sensitive request bodies, or unnecessary plate/customer data.

## 15. Existing Check-In integration

When a current scanner generation receives a usable `MATCH`, Native may perform
only the existing draft/review transition equivalent to:

```text
session.setVehicle({
  mode: "CONFIRMED_PLATE",
  plateNumberRaw: candidate.plateNumberRaw
})

session.reviewIdentity()
```

`reviewIdentity()` is allowed because it only enters the existing Confirm Plate
presentation after existing draft validation.

The OCR path must never call `confirmIdentity()`.

The employee may edit the candidate before confirmation. Returning recognition
continues to run only from the existing explicit Confirm action and remains the
exact DEC-069 lookup. OCR does not add fuzzy recognition, auto-merge, automatic
Customer attachment, or client-side normalization authority.

## 16. Offline and recovery semantics

DEC-063 remains unchanged. No persistent OCR retry queue or blind replay is
added.

When explicit capture or reading is unavailable because the device/API/provider is
offline or uncertain, Native presents a truthful unavailable/no-read state and
keeps Manual Entry and No Plate available. Existing Check-In mutation ambiguity,
idempotency, and authoritative recovery are unchanged.

## 17. Cross-platform architecture

Android is the first implementation target, but shared contracts/result
semantics remain platform-neutral. Camera/temp-file mechanics stay behind Native
adapters so a future iOS implementation can satisfy the same contract without
changing Check-In business semantics.

No Android-only provider concept may leak into the portable Employee Check-In
session model.

## 18. Explicit non-goals

MOB-010A does not authorize:

- OCR as Vehicle identity authority;
- autonomous returning/customer recognition;
- fuzzy/partial plate lookup;
- automatic saved-customer attachment;
- Vehicle merge/deduplication;
- make/model/color recognition;
- AI damage detection;
- persistent condition/photo byte storage;
- schema or migration work **within the historical MOB-010A slice**; the
  later, separately authorized Issue #429 shared production OCR admission
  exception in §23 may add only focused forward-only OCR schema and grants;
- new Vehicle/ValetSession state;
- parking or Vehicle Condition implementation;
- QR behavior changes;
- Employee Web behavior changes; or
- a generic AI/computer-vision/provider framework.

## 19. Required implementation proof

The current Issue #429 follow-up requires automated evidence proving at minimum:

- Staff authentication/Location eligibility precede provider I/O;
- invalid/oversize/wrong-media input never reaches the provider;
- provider-unconfigured and provider-failure paths fail safely;
- provider-specific fields/secrets do not cross the public boundary;
- country-hint mapping is exact;
- camera open/ready and all timer advancement cause zero capture/HTTP;
- exactly one explicit Capture starts at most one bounded OCR POST;
- double taps, remounts, late cleanup and stale same-generation operations
  cannot overlap, queue, re-enable early or publish stale results;
- a safely cleaned `NO_MATCH` retains the same live preview, ROI and Torch,
  then permits a second employee press without an automatic retry;
- candidate fills the existing draft without changing country;
- OCR never calls `confirmIdentity()`;
- returning recognition waits for explicit employee confirmation;
- Manual Entry and No Plate remain permanent;
- transient image cleanup occurs on success, no-match, failure, and
  cancellation;
- late responses from invalid generations cannot mutate presentation/session;
- QR scanner behavior and camera cleanup regressions remain green;
- EN/AR and identifier RTL/LTR plus Light/Dark frozen appearances remain
  correct; and
- §23 shared cost admission, restrictive DB access, conservative unknown
  recovery and neutral API compatibility are verified in real QA.

Before actual Native acceptance/merge, physical evidence must demonstrate a
deliberate Capture happy path, consecutive press after clean `NO_MATCH` without
recognition-driven camera remount, edit before confirmation, unreadable and
provider-unavailable fallback, close/back cleanup, EN/AR × Light/Dark presentation,
small-screen/manual fallback reachability and no unauthorized visual changes.
Issue #429 execution explicitly omits its separate Phase 7 device stage; missing
physical results must be reported `NOT RUN`, never treated as passed.

## 20. Execution-plan impact

Insert `MOB-010A — Assistive Plate OCR / ANPR Native Integration` between
MOB-010 and MOB-011 without renumbering any existing task.

The critical sequence becomes:

```text
MOB-009 -> MOB-010 -> MOB-010A -> MOB-011 -> MOB-012 -> ...
```

MOB-010A depends on MOB-010. MOB-011 depends on MOB-010A.

MOB-010A established assistive OCR; Issue #429 changes acquisition to deliberate
manual Capture while retaining its scoped trust and confirmation boundaries.
MOB-011 continues to own Vehicle identity/details/condition parity.

## 21. Reason

This closes the deliberate gap between DEC-012's sellable-MVP requirement and
DEC-067's earlier scoped OCR deferral while preserving the established VAYLET
trust boundary: machine vision accelerates plate entry, but the employee remains
the only authority that confirms the plate before returning recognition or
intake.

## 22. Historical no-migration OCR cost guard (MOB-010A)

Repository inspection found that the existing durable anti-abuse table is
constrained to its already-Accepted login, guest, and handoff scopes. MOB-010A
must not reuse one of those scopes for OCR because doing so would change the
scope's accepted meaning and couple unrelated security quotas. MOB-010A also
retains the explicit no-schema/no-migration boundary.

Therefore the cost policy is split by deployment mode.

### 22.1 Cost identity

Every OCR cost decision is keyed from **server-derived** authority, not request
claims. The logical cost identity is:

```text
organizationId + membershipId + targetLocationId
```

The API derives Organization and Membership from current persisted Staff
authorization and re-proves Location eligibility before consulting the cost
guard. A client may not choose or override this key with user/member/tenant
fields.

### 22.2 Controlled development / physical-smoke mode

A process-local ephemeral limiter is authorized only for development, test, and
a controlled single-API-process physical OCR smoke. It is not production
anti-abuse authority.

For each server-derived cost identity, before provider I/O:

- maximum one provider call in flight;
- maximum five provider calls in any 10-second window; and
- maximum 20 provider calls in any 60-second window.

Exhaustion returns provider-neutral `UNAVAILABLE` without calling the provider.
The former Native five-attempt generation policy is superseded by §6. A manual
Capture press never replaces the server cost guard.

The ephemeral limiter may use in-process memory and a monotonic clock. Its state
must be bounded/expired and must not contain images, raw credentials, plate
numbers, provider tokens, or other unnecessary PII. Tests must use an injected
clock or equivalent deterministic boundary rather than sleeps.

Process restart resets this ephemeral state, and separate API replicas do not
share it. Those limitations are Accepted only for non-production controlled
smoke and must be stated honestly in evidence.

### 22.3 Production / multi-replica behavior

The historical MOB-010A implementation did **not** have a durable/shared OCR
limiter; the later focused Issue #429 exception is specified in §23.

Production remains **fail-closed unavailable** under the old MOB-010A guard.
Only a correctly implemented, reviewed and separately activated §23 shared
durable admission mechanism may replace that unconditional production denial.

A configured provider endpoint/token alone is not permission to bypass this
rule. Process-local counters, Native attempt limits, provider-side quotas, and
single-replica assumptions must not be represented as production shared
anti-abuse protection.

A later production-enablement slice may extend the existing durable anti-abuse
persistence with an OCR-specific scope or select another shared mechanism. That
slice must preserve at least the following public policy unless a later Owner
Decision changes it:

- key: server-derived Organization + Membership + target Location;
- one provider call in flight per key;
- no more than five provider calls per 10 seconds per key;
- no more than 20 provider calls per 60 seconds per key;
- fail closed before provider I/O when authoritative limiter state is
  unavailable.

The later mechanism must work across API replicas and process restarts. It may
not reuse the accepted meaning of login, guest, or handoff limiter scopes.

### 22.4 Observability and response behavior

Cost-guard denial is an assistive-feature availability outcome, not a Check-In
business failure. It returns the same provider-neutral `UNAVAILABLE` response
used for provider/network unavailability so Manual Entry and No Plate remain
usable.

Safe telemetry may distinguish an internal bounded `cost_guard_denied` outcome
without logging the limiter key, plate, image, provider token, or raw request.

### 22.5 Database and existing limiter freeze

MOB-010A historically made no Prisma change, migration, limiter-table constraint
change, or durable limiter table. Issue #429 is the narrowly approved later
exception for dedicated OCR records and grants. Existing DEC-024 and handoff limiter scopes,
thresholds, HMAC semantics, retention, transaction/advisory-lock behavior, and
public error contracts remain unchanged.

## 23. Issue #429 — Shared production admission and controlled uncertainty

The Owner authorized a focused PostgreSQL Lean A + S implementation with only
the minimum purpose-built OCR tables, constraints, privileges and operator
history required for safe global/Organization cost admission. This does not
authorize a generic limiter, billing ledger, queue, management budget UI, Redis
deployment, media history or unrelated changes. The implementation must ship
with production OCR **OFF by default**; actual activation remains a distinct
Owner action after verification of provider account, privacy, egress and
operational prerequisites.

**Authority and atomic debit:** retain current exact Staff session/User,
persisted Organization/Membership/Location and explicit LocationAccess,
operational role/Shift and effective Company default → Location override
`ocrAssistEnabled` proof in one combined bounded transaction A. All checks
precede mutation; client tenant identifiers are only references to re-authorize.
Serially verify platform/Organization kill controls, enabled vendor-aligned
period/allocation, global/Organization quota, full identity active concurrency
and exact five-per-10-second/twenty-per-60-second sliding limits. Atomically
reserve the one-use identity and increment the global and Organization integer
lookup-unit spent counters together; no partial debit after rollback. A known
`COMMIT` is required before any external fetch, and an ambiguous COMMIT permits
**zero** provider sends. No memory fallback or automatic retry.

**Bounded authorized continuation:** Owner-selected A + S includes a single
immediate, already-authorized one-use permit continuation after known A COMMIT,
without a precautionary second complete authorization transaction. Lock and
recheck current exact session and all time-sensitive authority in A; apply a
conservative proof-age bound (initial engineering recommendation 250ms from
the start of final proof) before the one permitted external fetch. No database
lease spans provider I/O. A paused process after its last local check remains
a real residual send capability; do not assert remote revocation from local
deadlines. New OCR control or Staff revocation committed before the required
proof denies new admission. If a more-specific Accepted authority contract
truly conflicts, stop that affected behavior and record the exact contradiction.

**No Rollover and conservative accounting:** one *successfully committed*
Admission permanently consumes one lookup unit from its original global period
and Organization allocation, including subsequent `NO_MATCH`, `UNAVAILABLE`,
timeout, cancellation, crash or proven no-send; denied/definitively rolled-back
admission consumes zero. Never auto-refund, refill, borrow, transfer or roll
unused quota into a new period. New UTC periods must match verified provider
account cycles and separately approved allocations. Old-period remote exposure
remains protected, and a new period cannot be activated while old
`SEND_POSSIBLE`/`UNKNOWN` exposure for that account remains. Lookup units are
conservative admitted requests, **not** verified provider bills.

**Settlement and remote uncertainty:** one private bounded completion
observation feeds guarded settlement S against the exact persisted attempt
scope, random owner nonce, revision and source state. `SEND_POSSIBLE` and
`UNKNOWN` occupy identity/global/tenant concurrency across restarts, windows
and periods until verified safe resolution. Local timeout, abort, TTL or lost
reply is never proof of remote completion; no automatic paid resend, capacity
recycle, provider call from maintenance or second debit at S. Without verified
provider completion/drain evidence, conservatively retain `UNKNOWN` even if
the public OCR response is already a neutral result. Detection is bounded,
indexed, restart-independent and off the ordinary Check-In critical path.

**VAYLET-only controls and history:** only separately authenticated,
least-privileged VAYLET platform operators may provision periods/allocations,
set kill/capacity policy or reconcile remote uncertainty. Organization Admin,
Location Manager and employees cannot grant themselves budget authority.
Control mutation/reconciliation uses verified source scope, typed optimistic
revision and operation-id replay semantics, with an atomic append-only,
nonsecret actor/action/before-and-after/reason/evidence record. Current operator
human-to-DB credential binding and remote completion evidence remain explicit
production activation prerequisites; caller-provided operator reference alone
does not authenticate a person. Runtime, maintenance and operator DB privileges
must be separately constrained, with PUBLIC execution revoked for privileged
functions and no direct arbitrary runtime OCR table writes.

**Compatibility and safety:** keep the authenticated existing
`POST /v1/staff/check-in/plate-ocr` request validation, transient JPEG cleanup,
one bounded HTTPS provider HTTP call with redirects denied, country/parser
behavior and public `MATCH | NO_MATCH | UNAVAILABLE` union. No permit, attempt
ID, tenant balance, provider secret or internal lock-busy reason crosses the
public contract. Manual Plate and No Plate Check-In never depend on OCR quotas,
recovery or remote completion. No Vehicle/ValetSession/Task/Dispatch state
transition or payment/customer-billing behavior changes.

**Pre-merge verification:** real isolated PostgreSQL SQL/privilege/security
and genuine multi-API-process tests must prove budget, concurrency, session
revocation and UNKNOWN safety. A separate registered performance experiment
must show **no statistically credible ordinary Check-In P50/P95/P99 latency
regression** under representative mixed load and active recovery. A separate
eligible-with-headroom `NOWAIT` availability experiment must observe **zero
avoidable lock-busy denials** within approved normal/expected-peak traffic,
reporting its sample and one-sided 95% confidence upper bound; noisy or
missing data are not a PASS. The engineering design's six typed OCR tables,
lock choices, initial deadlines and maintenance frequency must satisfy these
gates rather than being claimed experimentally validated by this decision.
