# DEC-074 — Native Assistive Plate OCR / ANPR

Status: Accepted
Date: 2026-09-05
Task: MOB-010A — Assistive Plate OCR / ANPR Native Integration

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

The Owner now requires Scan Plate to perform real assistive automatic plate
acquisition before MOB-011: opening the scanner should automatically attempt to
read the visible plate, place a candidate into the existing editable identity
flow, and still require explicit employee confirmation before returning
recognition or intake behavior may proceed.

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
-> automatic bounded OCR attempts begin
-> candidate found
-> automatic scanning stops
-> existing Confirm Plate screen
-> employee may Edit or Confirm
-> explicit Confirm only
-> existing exact returning recognition
-> existing customer/intake flow
```

A separate Capture Plate button is not required in the normal OCR path.

The following paths remain available throughout the scanner experience:

- Enter manually;
- No plate / unreadable plate; and
- Retry Scan after a bounded no-read or unavailable result.

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

## 6. Automatic attempt policy

Automatic scanning must be bounded and single-flight.

Initial implementation policy:

- approximately one capture/OCR attempt per 1.2 seconds;
- maximum five attempts per scanner-open generation;
- maximum one capture/OCR request in flight;
- no queued frame backlog;
- stop immediately after a usable candidate;
- after the bounded no-read outcome, require explicit `Retry Scan` to create a
  new bounded generation.

The exact timing constant may be tuned later from measured physical-device and
provider evidence without changing the trust model. Unbounded loops,
overlapping provider requests, or silent infinite retry are prohibited.

## 7. Generation and cancellation safety

Every scanner-open/retry cycle has a generation identity.

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
- apply the narrowest existing applicable anti-abuse/cost control.

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

When automatic reading is unavailable because the device/API/provider is
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
- schema or migration work;
- new Vehicle/ValetSession state;
- parking or Vehicle Condition implementation;
- QR behavior changes;
- Employee Web behavior changes; or
- a generic AI/computer-vision/provider framework.

## 19. Required implementation proof

MOB-010A is not complete until automated evidence proves at minimum:

- Staff authentication/Location eligibility precede provider I/O;
- invalid/oversize/wrong-media input never reaches the provider;
- provider-unconfigured and provider-failure paths fail safely;
- provider-specific fields/secrets do not cross the public boundary;
- country-hint mapping is exact;
- automatic capture starts only after camera readiness;
- only one attempt is in flight and the generation is bounded;
- candidate stops scanning;
- candidate fills the existing draft without changing country;
- OCR never calls `confirmIdentity()`;
- returning recognition waits for explicit employee confirmation;
- Manual Entry and No Plate remain permanent;
- transient image cleanup occurs on success, no-match, failure, and
  cancellation;
- late responses from invalid generations cannot mutate presentation/session;
- QR scanner behavior and camera cleanup regressions remain green; and
- EN/AR and identifier RTL/LTR behavior remain correct.

Physical proof requires at least a real-plate automatic-read happy path, edit
before confirmation, unreadable/no-read fallback, provider-unavailable fallback,
close/back cleanup, and EN/AR presentation on the existing Development Build
when no new native dependency/configuration is needed.

## 20. Execution-plan impact

Insert `MOB-010A — Assistive Plate OCR / ANPR Native Integration` between
MOB-010 and MOB-011 without renumbering any existing task.

The critical sequence becomes:

```text
MOB-009 -> MOB-010 -> MOB-010A -> MOB-011 -> MOB-012 -> ...
```

MOB-010A depends on MOB-010. MOB-011 depends on MOB-010A.

MOB-010A owns the real assistive automatic plate-acquisition capability only.
MOB-011 continues to own Vehicle identity/details/condition parity.

## 21. Reason

This closes the deliberate gap between DEC-012's sellable-MVP requirement and
DEC-067's earlier scoped OCR deferral while preserving the established VAYLET
trust boundary: machine vision accelerates plate entry, but the employee remains
the only authority that confirms the plate before returning recognition or
intake.
