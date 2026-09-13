# Employee Native — MOB-024B Support, Outage, and Web Fallback Runbook

> Documentation, tabletop evidence, and one bounded local test-cohort API
> recovery drill. This runbook creates no product, API, database,
> authorization, custody, provider, release, or support-SLA authority. Accepted
> decisions and binding repository documents remain canonical.

## 1. Purpose, audience, and evidence status

This runbook gives a trained support/operator owner a safe first response for
common Employee Native failures. It describes the behavior present at reviewed
base `f774d68ec4dab37ff50a9372e3712410e13d4c9e`. It does not add or change
runtime behavior.

Audience:

- Operational / Location support owner coordinating the field response;
- technical owners named in the escalation matrix; and
- authorized Location Managers correcting the narrow typed Location settings
  already permitted by DEC-058.

Simple impact classes used here are:

- **Operational stop** — safe work cannot continue on the affected authority
  or client;
- **Degraded** — canonical work remains available through a safe path, but an
  assistive/attention capability is impaired; and
- **Local/device-only** — the defect is isolated to a device or Native build and
  the canonical backend remains healthy.

No response-time SLA is defined. The Founder Blueprint permits different
support tiers/contracts, and the repository does not establish one universal
P1/P2 clock.

This document is **DOCUMENTED + STATIC/TABLETOP VERIFIED** for all scenarios.
Section 8 additionally records **LOCAL COMMAND VERIFIED + RUNTIME VERIFIED**
evidence for one bounded API interruption/recovery path in the guarded local
development cohort. That narrow drill is not Native UI/device, provider,
physical, signed-build, or signed-rollback evidence. No production service,
customer, vehicle, or configuration was used or mutated.

## 2. Non-negotiable operating rules

1. PostgreSQL and the API/domain commands remain authoritative. A Native or Web
   screen is never authority by itself.
2. Employee Native and Employee Web coexist against the same canonical backend.
   Web is a client fallback only when that backend remains healthy. It cannot
   bypass an API/database outage or any auth, Location, Shift, Task, custody,
   payment, handoff, or policy guard.
3. If a protected mutation may have committed, stop. Do not infer success or
   failure from a timeout, lost connection, process death, notification, or
   stale screen. Re-read canonical state before deciding what is allowed next.
4. DEC-063 prohibits a generic durable mutation queue and blind automatic
   replay. Never promise “queued” or “will sync.”
5. Push is best-effort attention only. Authenticated Task queue/refetch is the
   recovery path.
6. OCR is assistive only. A human-confirmed manual plate or the accepted
   no-plate path remains authoritative. OCR never fabricates identity.
7. Support never edits domain tables, forces a state-machine transition,
   rewrites custody/history, deletes AuditEvents, extends a proof, or bypasses a
   payment/release guard to “unstick” a vehicle.
8. Corrections use only existing authorized application commands and append new
   facts. A configuration correction is prospective and never rewrites history.
9. A transient auth/infrastructure failure is not definitive credential loss.
   Definitive rejection follows DEC-072 purge/login behavior.
10. If physical custody is uncertain, the Operational / Location support owner
    contains the physical operation while technical owners restore and verify
    canonical state. This runbook does not replace the operating company’s
    physical safety or custody procedures.

## 3. Safe diagnostic and privacy boundary

### What MOB-024A actually provides

Employee Native has one local, memory-only sanitized telemetry ring capped at
200 events. On an authenticated Active Shift screen, the Support diagnostics
card shows build provenance and the newest **10 or fewer** events. The card is
read-only and non-authoritative.

Support may transcribe only the fields the existing sanitizer retained:

- `appVersion`
- `appBuild`
- `platform`
- `source`
- `classification`
- `operation`
- `outcome`
- `requestId`
- `errorCode`
- `durationMs`

Absent fields stay absent. The event rows have no timestamps. Record the
operator-observed UTC time separately as support context; do not imply it came
from telemetry.

The telemetry ring has no persistence across app restart/process death, no
remote sink, no export, no upload, no historical query, and no crash/ANR
collector. Events beyond 200 are dropped. Do not ask an operator to retrieve
history the product does not retain.

### Minimum safe evidence package

For every escalation, gather only what is available and necessary:

1. operator-observed UTC time and impact class;
2. affected client class (Native, Web, or both), without customer details;
3. `appVersion`, `appBuild`, and `platform` for Native failures;
4. the smallest relevant recent sanitized event rows, especially bounded
   `operation`, `outcome`, `requestId`, `errorCode`, and `durationMs`;
5. whether a read or mutation was attempted and whether its outcome is known or
   ambiguous, without request/response content;
6. whether another approved network/device and Employee Web can perform an
   authorized canonical **read** against the same environment; and
7. for configuration checks, only expected key/status/class, presence/absence,
   and a bounded safe error class.

Prefer transcription of the diagnostics card over a broad screenshot. If an
approved support process permits a screenshot, review and tightly crop it so it
contains none of the forbidden material below.

### Forbidden evidence — privacy/redaction firewall

Never capture, transcribe, paste, log, upload, or attach:

- passwords; Bearer/access tokens; refresh tokens; Authorization headers;
- Guest bearer credentials; Pickup Codes; Dynamic QR proofs; handoff proofs;
- payment/card data, payment credentials, or payment/provider secrets;
- raw request or response bodies;
- raw request URLs, paths, or query strings;
- plate text as telemetry/support diagnostics (unless a separate already-
  authorized business process requires it, outside this evidence package);
- customer/guest free text, phone, or email as diagnostics;
- Incident descriptions;
- image bytes/base64, local camera image URIs, or raw OCR/provider responses;
- provider tokens/hashes, FCM/Firebase credentials, or Firebase project secrets;
- database credentials or URLs;
- signing keys, certificates, or signing material; or
- secret environment-variable values.

No secret-bearing screenshot is acceptable. Never ask for a “full request,”
“full response,” environment dump, database URL, provider response, or token to
make diagnosis easier. For secret-backed configuration, record only the
expected key name/class, presence or absence, and bounded safe error class —
never the value.

## 4. Universal first-response procedure

Use this sequence before the scenario-specific procedure:

1. **Protect people and custody.** If physical vehicle/key ownership is unclear,
   pause the affected handoff/movement and follow the operating company’s safe
   physical containment process.
2. **Stop repeated protected actions.** Disable rapid taps and tell affected
   employees not to repeat an ambiguous mutation.
3. **Preserve only bounded evidence.** Before restarting the app, transcribe the
   minimum sanitized diagnostics still visible. Restart will erase the ring.
4. **Identify the failing layer using reads.** Compare Native and Employee Web
   only with authorized read/refetch behavior. Do not send a synthetic mutation
   to test availability.
5. **Classify scope.** One device/network suggests local failure; multiple
   clients on different approved networks suggests API/dependency failure;
   endpoint-specific reads failing while others work suggests partial
   degradation. These are triage indicators, not proof.
6. **Escalate to the owning role.** Technical recovery follows the environment’s
   approved deployment procedure. Do not invent commands or credentials.
7. **Rehydrate after recovery.** Authenticate/restore normally, establish current
   Organization/Location/Shift context, and refetch current Tasks plus the
   affected ValetSession and independent custody/payment/Incident state.
8. **Resume only after exit criteria pass.** A healthy screen alone is not enough
   when an earlier mutation was ambiguous.

## 5. Scenario runbooks

### 5.1 API outage or partial API failure

**Symptoms**

- Operational stop or degraded: Native cannot reach the API, times out, shows
  network-level failure, returns repeated `5xx`, or only one endpoint family is
  degraded.
- Reads and mutations may fail differently. A timeout after a mutation leaves
  its commit outcome unknown.

**First safe checks**

1. Stop repeated mutations on the affected flow.
2. Check whether the device has general network access using approved operating
   procedures; do not inspect tokens or raw URLs.
3. Use authenticated canonical reads from the same Native client if possible.
4. From a second approved device/network, test Employee Web with read/refetch
   only. If Web and Native fail similarly, suspect the shared API or dependency.
   If Web reads work and only one Native device fails, suspect local network,
   build, or runtime configuration.
5. Compare multiple safe `operation`/`outcome`/`errorCode` rows. If some
   authorized reads work and one operation repeatedly fails, classify partial
   endpoint degradation and contain only the affected workflow.

**Safe evidence to gather**

- The minimum package in section 3, including affected operation classes,
  bounded request IDs/error codes, durations, client scope, and whether reads
  remain available.
- Approved backend operators may use existing environment observability, but
  this runbook does not claim MOB-024A provides a remote query surface.

**Forbidden evidence**

- All section 3 forbidden material, especially Authorization, raw paths/query
  strings, request/response bodies, and business payloads.

**Containment**

- Stop ambiguous or repeatedly failing mutations. For partial degradation,
  stop only commands that depend on the failing endpoint, while allowing
  verified safe reads or unrelated flows that remain authoritative.
- Do not use Web as a bypass if Web reaches the same failing API.

**Recovery / fallback**

- The API/backend owner restores the authoritative API/dependency using the
  already approved environment procedure, or operators wait for authoritative
  recovery. No generic restart/deployment command is defined here.
- Employee Web is permitted only if read checks prove the backend is healthy
  and the failure is Native-client-specific; then use section 5.11.

**Authoritative verification**

- After recovery, re-authenticate/restore and refetch current context and Task
  queue. For every affected operation, re-read ValetSession state/version, Task
  status/owner, and key/custody state. Before release, also re-read current
  payment/release and handoff state. For Incident ambiguity, use section 5.9.

**Escalation**

- API/backend owner; add database/infrastructure owner if database dependency
  signals are present; authentication/security owner for auth-only failures.
  Provide only the safe package and the read-versus-mutation scope.

**Exit criteria**

- Required canonical reads succeed from the intended client/environment;
  repeated `5xx`/timeouts are no longer observed; every ambiguous protected
  operation has been reconciled; and current authority/versions permit the next
  explicit action.

**Evidence level / remaining gap**

- DOCUMENTED + STATIC/TABLETOP VERIFIED. The section 8 bounded local
  development-cohort API interruption/recovery path is LOCAL COMMAND VERIFIED +
  RUNTIME VERIFIED. Partial-endpoint, remote environment, Native device, and
  ambiguous-mutation outage drills remain open.

### 5.2 Database outage or degraded database

**Symptoms**

- Operational stop: both clients lose API operations because PostgreSQL is
  unavailable; the API fails startup/preflight or returns bounded unavailable/
  server errors; or database-dependent behavior is intermittently degraded.
- A database connectivity, deployment, TLS, role, or configuration problem may
  present as API failure. Client symptoms alone do not prove the root cause.

**First safe checks**

1. Stop protected mutations and compare authorized reads across Native and Web.
2. The API/backend and database/infrastructure owners check existing deployment
   health and the provider-neutral checklist in
   `docs/16_PRODUCTION_DATABASE_DEPLOYMENT_CHECKLIST.md` without exposing
   credentials.
3. Distinguish API process health from database connection/preflight health and
   record only bounded safe error classes.

**Safe evidence to gather**

- Minimum package from section 3; whether all database-backed operations or only
  a dependency path is affected; safe preflight/connection class; and checklist
  evidence references that contain no secrets.

**Forbidden evidence**

- Database URLs, usernames/passwords, CA/certificate content, secret environment
  values, SQL payloads containing business data, raw rows, or dumps.

**Containment**

- Treat Native and Web as unavailable for authoritative mutations when the
  shared database authority is unavailable. Do not retry in a tight loop.
- Never edit tables, delete history, force session state, rewrite custody, or
  alter AuditEvents.

**Recovery / fallback**

- The database/infrastructure owner restores the authoritative service through
  the approved deployment/backup/restore process. This document does not assert
  that a production backup restore drill has passed.
- Web fallback is not a solution to a canonical database outage.

**Authoritative verification**

- Confirm API database preflight/approved health checks pass, then re-read
  operational context, Task, ValetSession, key/custody, Incident, and payment/
  release state as applicable. Reconcile every unknown mutation separately.

**Escalation**

- Database/infrastructure owner plus API/backend owner. Include safe connection/
  preflight class and affected read classes, not credentials or raw SQL data.

**Exit criteria**

- Authoritative reads and required guarded commands operate through the normal
  runtime role; no manual domain/history repair was used; ambiguous outcomes are
  reconciled; and recent approved service evidence shows stable dependency health.

**Evidence level / remaining gap**

- DOCUMENTED + STATIC/TABLETOP VERIFIED. Production topology, backup restore,
  and outage recovery: NOT PERFORMED — downstream operational evidence remains
  open.

### 5.3 Authentication failure or revocation

**Symptoms**

- **Transient:** network error, timeout, DNS/connectivity problem, temporary
  `5xx`, or explicit temporary API failure. Native has no restored access token
  and presents restoration unavailable/retry; this is not automatic logout.
- **Definitive:** authoritative invalid/expired/replayed/revoked refresh state,
  revoked Staff session, malformed stored refresh state, disabled User, or a
  definitive credential rejection. Native purges/fences the identity and
  returns to login under DEC-072.
- A `403` Location/role/Shift/Task denial is authorization/scope, not
  automatically credential loss.

**First safe checks**

1. Record the bounded auth `classification`, `outcome`, request ID, error code,
   and build provenance if visible. Never inspect the credential.
2. Determine whether the failure is transport/temporary or an authoritative
   definitive rejection. Do not classify every `4xx`/`5xx` as logout.
3. Check whether other API reads are unavailable and whether Employee Web has
   the same infrastructure symptom.
4. If the app has already purged and requests login, do not attempt to recover a
   prior token from logs, storage, screenshots, or history.

**Safe evidence to gather**

- Minimum package from section 3; transient versus definitive category; local
  logout/purge confirmation status where the UI exposes it; and whether server
  revocation was confirmed or remains unconfirmed.

**Forbidden evidence**

- Email/phone as diagnostic content, password, access/refresh token,
  Authorization/Cookie header, secure-storage content, token hash, or full auth
  request/response.

**Containment**

- Transient: pause protected work and preserve the secure refresh entry through
  the app’s existing behavior; do not force logout or clear credentials.
- Definitive: accept the app’s purge/login boundary. Do not bypass a restore
  block or continue from cached identity/context.

**Recovery / fallback**

- Transient: retry restoration explicitly after infrastructure recovery. On
  success, load fresh operational context.
- Definitive: authenticate normally at login. A disabled User or revoked access
  requires the Authentication/security owner and authorized account process;
  support cannot reactivate credentials locally.
- Employee Web requires its own normal authentication and offers no auth bypass.

**Authoritative verification**

- Re-read current User/session result, membership, Organization, Location
  access, role, Shift, and Task context. No stale screen or prior eligibility
  carries forward.

**Escalation**

- Authentication/security owner; add API/backend owner for broad temporary
  failures and Operational / Location support owner for scope/Shift issues.

**Exit criteria**

- A current server-authorized identity is established; current context is
  reloaded; old identity-scoped work is absent after purge/account switch; and
  no ambiguous mutation remains unresolved.

**Evidence level / remaining gap**

- DOCUMENTED + STATIC/TABLETOP VERIFIED. No auth outage/revocation or secure-
  storage physical drill was performed for this task.

### 5.4 Network loss and reconnect

**Symptoms**

- Offline/unknown connectivity indication, transport timeout, connection loss,
  or a response that never arrives. The connectivity indication is a hint only.
- A mutation may be uncommitted, committed with response lost, or rejected by
  state/authorization that changed during the outage.

**First safe checks**

1. Stop repeated taps. Record whether the last action was a read or mutation and
   whether any authoritative response was received.
2. Restore an approved network, but do not treat “online” as API health or
   operation success.
3. Identify the operation’s accepted DEC-063 class:
   `ONLINE_ONLY`, `REHYDRATE_BEFORE_RETRY`, or
   `MANUAL_RETRY_EXISTING_IDEMPOTENCY`.

**Safe evidence to gather**

- Network source/classification/outcome, safe operation, request ID/error code/
  duration if present, operator-observed time, and operation policy class.

**Forbidden evidence**

- Raw network captures containing credentials, raw URLs/bodies, proofs,
  customer data, plate data, or provider secrets.

**Containment**

- Never fabricate server success, create a generic queue, promise automatic
  sync, or blind-replay a protected command.

**Recovery / fallback**

Use this operator decision procedure:

1. `ONLINE_ONLY`: wait for live server availability, re-authenticate and
   rehydrate. The employee must be actively present and issue a new action only
   if current state allows it. Pickup/QR verification, supervisor override, and
   final release are never queued or background-replayed.
2. `REHYDRATE_BEFORE_RETRY`: first refetch canonical context and affected
   Task/ValetSession/custody state. If the prior effect already committed, adopt
   it. If not, issue a new explicit command only with fresh authority/version and
   only if the owning flow permits it.
3. `MANUAL_RETRY_EXISTING_IDEMPOTENCY`: after canonical recovery, the employee
   may explicitly retry the same logical intake or Incident only with its
   already-accepted stable operation identity and exact command contract. This
   is not permission for a generic queue or a new ID to hide ambiguity.

**Authoritative verification**

- Reload current identity/scope, Shift, queue, Task/version, ValetSession/
  version, resource/key custody, and proof/payment/release state as applicable.

**Escalation**

- Operational / Location support owner for field containment; Native/mobile
  owner for device/network handling; API/backend owner when multiple clients or
  networks show the same failure.

**Exit criteria**

- Connectivity and API reads are restored, current authority is loaded, the
  prior outcome is reconciled, and the next command follows its exact policy.

**Evidence level / remaining gap**

- DOCUMENTED + STATIC/TABLETOP VERIFIED. Real disconnect/reconnect evidence was
  not produced here; MOB-023B’s separate physical/full-shift gaps remain open.

### 5.5 Camera failure

**Symptoms**

- Permission denied/revoked, camera unavailable or already in use, camera never
  becomes ready, still capture fails, or background/lock/navigation interrupts
  capture.

**First safe checks**

1. Identify the workflow: plate OCR, QR/resource scan, condition photo, or
   handoff proof scan. Do not generalize one workflow’s fallback to another.
2. Confirm current app foreground state and Android camera permission through
   normal OS settings. Do not request broad storage/media permission as a fix.
3. Close/reopen the current camera through normal UI only after stale capture
   work is cancelled. If identity/scope changed, return to canonical context.

**Safe evidence to gather**

- Build/platform provenance; camera/lifecycle/OCR safe classification and
  outcome; bounded error code; permission state class; no image or URI.

**Forbidden evidence**

- Image bytes/base64, preview screenshots containing vehicle/customer data,
  camera file URI, raw plate, QR/proof content, or device secrets.

**Containment**

- Stop repeated capture attempts and leave the camera surface if lifecycle or
  identity changed. Never treat a scan/capture as authorization or workflow
  completion.

**Recovery / fallback**

- Plate camera: use manual plate entry or the accepted no-plate/unreadable path.
- QR resource scan: use the existing manual resource identifier only where that
  specific accepted flow offers it; current server scope and guards still apply.
- Handoff proof: use another currently accepted proof-entry path only when the
  live flow and policy allow it; verification remains `ONLINE_ONLY`.
- Required condition photo: there is no camera bypass. Use a healthy approved
  device/client path that can satisfy the current policy, or stop and escalate.
- If the defect is Native-only and backend/Web remain healthy, section 5.11 may
  be used where Employee Web supports the required current flow.

**Authoritative verification**

- Refetch the affected Task/ValetSession and policy before continuing. Confirm
  that no late capture/scan result changed a draft or launched a command.

**Escalation**

- Native/mobile owner; Operational / Location support owner for alternate
  device/client; Release/configuration owner if the failure affects one build.

**Exit criteria**

- Camera permission/readiness is restored or an accepted manual/alternate path
  is active; stale captures are cancelled; current server state/policy is loaded;
  and no authorization/custody guard was bypassed.

**Evidence level / remaining gap**

- DOCUMENTED + STATIC/TABLETOP VERIFIED. Android permission/camera and future
  iOS permission behavior were not physically tested here.

### 5.6 OCR failure

**Symptoms**

- Provider unconfigured/unavailable, timeout, transport or quota failure,
  unsupported region, no match/low-confidence-only result, or provider-neutral
  `UNAVAILABLE`.
- In production, real OCR intentionally fails closed before provider I/O while
  the accepted shared/durable cost guard is unavailable. Provider credentials
  alone do not enable it.

**First safe checks**

1. Confirm the camera itself is usable; separate capture failure from API/
   provider outcome where bounded classifications allow.
2. Confirm production fail-closed status versus a development/test smoke
   environment. Never ask for the provider credential.
3. Confirm Manual Entry and No Plate remain visible and usable under the current
   check-in flow.

**Safe evidence to gather**

- Build/platform, `ocr` classification/outcome, bounded operation/error code/
  duration, country/region support class without plate text, and configuration
  presence/absence only.

**Forbidden evidence**

- Plate text, image/URI/base64, provider request/response, bounding boxes,
  provider token/hash/credential, endpoint URL, account/quota details, or raw
  payload.

**Containment**

- Stop repeated automatic scans after the bounded attempt generation. Do not
  loosen the cost guard, call a provider directly from Native, or fabricate a
  candidate.

**Recovery / fallback**

- Continue with employee-confirmed manual plate entry or the accepted no-plate
  flow. OCR failure must not block an otherwise valid manual/no-plate check-in.
- OCR/provider owner may restore an already approved non-production/provider
  configuration. Production enablement remains outside this task and must keep
  the current fail-closed rule until an Accepted shared guard exists.

**Authoritative verification**

- Before intake/recognition, the employee explicitly reviews/confirms the
  authoritative input. Then re-read current server continuation; OCR confidence
  never proves Vehicle identity or returning-customer match.

**Escalation**

- OCR/provider owner plus Native/mobile owner for camera/client failures and
  API/backend owner for API transport failures.

**Exit criteria**

- Manual/no-plate operation proceeds safely, or approved OCR availability is
  restored without bypassing the production cost boundary; no plate/image/
  credential leaked into evidence.

**Evidence level / remaining gap**

- DOCUMENTED + STATIC/TABLETOP VERIFIED. Production OCR remains fail-closed;
  real provider and production shared-cost-guard evidence remain open.

### 5.7 Push failure

**Symptoms**

- Permission denied/revoked; Android operational channel unavailable/disabled;
  registration absent/stale/failed; provider or deployment configuration
  failure; delayed, lost, duplicated, or reordered notification; or app/OS/Doze/
  OEM settings suppress presentation.

**First safe checks**

1. Open/authenticate the app and refetch the canonical Task queue. Never test
   correctness by waiting for another notification.
2. Separate client permission/channel state, registration outcome, provider/
   configuration class, and OS presentation behavior.
3. For provider incidents, use existing
   `docs/21_STAFF_PUSH_WORKER_OPERATIONS.md`; do not manually advance delivery
   rows or extend TTL/attempts.
4. Treat `PROVIDER_ACCEPTED` only as provider acceptance, never proof that the OS
   displayed the notification.

**Safe evidence to gather**

- Build/platform, safe push classification/outcome, permission/channel state
  class, bounded registration/provider configuration result class, and request
  correlation where present. Provider-side operators use only approved bounded
  aggregates.

**Forbidden evidence**

- Provider token or hash, installation/registration/intent IDs, FCM credentials,
  Firebase service-account content/project secrets, notification payload dumps,
  tenant/domain IDs, or provider raw body.

**Containment**

- Keep canonical Task queue/refetch operating. If a provider/configuration
  incident requires disabling push, the authorized push owner follows the
  existing independent creation/sending switches and current worker runbook.
  Push containment must not mutate domain truth.

**Recovery / fallback**

- Permission/channel: the user may opt in through normal Android settings; if
  not, continue authenticated queue/refetch.
- Registration: allow the existing authenticated desired-state reconciliation;
  do not forge or copy a token.
- Provider/configuration: Push/provider and Release/configuration owners restore
  approved server-side configuration/credentials. Durable bounded recovery may
  retry within DEC-075 TTL/attempt limits; duplicates remain possible.
- Lost/delayed/duplicate/OS-suppressed presentation: ignore the notification as
  authority and use the current queue.

**Authoritative verification**

- Re-authenticate/restore and refetch the exact-Location Task queue. Confirm
  current Task status/ownership before any explicit action. Verify that
  RetrievalRequest, ValetSession, Dispatch, and Audit truth did not change merely
  because push failed or duplicated.

**Escalation**

- Push/provider owner; Native/mobile owner for permission/channel/lifecycle;
  Release/configuration owner for deployment configuration; API/backend or
  database/infrastructure owner for worker persistence failures.

**Exit criteria**

- Canonical queue is current and usable regardless of push; any restored push
  path remains attention-only; registration/provider secrets stayed protected;
  and no domain repair was performed.

**Evidence level / remaining gap**

- DOCUMENTED + STATIC/TABLETOP VERIFIED. No physical notification, FCM sandbox,
  OS/OEM suppression, provider outage, or runtime worker drill was performed.

### 5.8 Bad Location configuration or wrong operational scope

**Symptoms**

- Wrong selected Location, removed Location access, inactive Location, missing/
  ended Shift, stale effective configuration, or an unexpected typed Location
  policy (for example photo, handoff, tracking, or payment/release behavior).

**First safe checks**

1. Stop protected actions and refresh authoritative operational context.
2. Confirm the selected Organization/Location and active Shift from current
   server state. A prior screen is not proof of access or eligibility.
3. Distinguish scope loss from typed policy behavior. Do not treat an expected
   policy guard as API outage.
4. For the ten DEC-058 settings, only an active `LOCATION_MANAGER` with explicit
   access to the exact active Location may use the current typed read/write path;
   no active Shift is required for that management action. `VALET_EMPLOYEE`,
   `VALET_SUPERVISOR`, and password-only `ORG_ADMIN` have no authority on that
   surface.

**Safe evidence to gather**

- Selected scope status, access/Shift outcome class, typed setting key,
  default/override-present/effective status where an authorized reader can see
  it, configuration version/conflict class, and bounded request/error IDs. Avoid
  customer or vehicle data.

**Forbidden evidence**

- Credentials, broad configuration dumps, secret values, customer/session
  payloads, or screenshots containing operational secrets/PII.

**Containment**

- Leave the wrong/stale workspace and stop its mutations. Do not ask an
  Employee/Supervisor to mutate configuration, reuse stale authority, or start/
  continue work against an inactive or unauthorized Location.

**Recovery / fallback**

- Wrong selection: select an authorized Location through the normal client flow
  and establish the correct Shift context.
- Missing/ended Shift: use the accepted Shift flow if current server eligibility
  permits; do not fabricate or reopen a Shift locally.
- Removed/inactive access: an authorized operational/account owner resolves the
  persisted access/status through existing management processes.
- Typed policy: an authorized Location Manager may SET/CLEAR one accepted
  Location override at a time through the current configuration path with its
  optimistic token. No bulk patch or Company-default mutation is available.

**Authoritative verification**

- Re-read effective Company-default/Location-override configuration and then
  re-read operational context, Shift, Tasks, affected ValetSession/custody, and
  payment/release state. Configuration applies prospectively and must not
  rewrite historical facts.

**Escalation**

- Operational / Location support owner; authorized Location Manager for
  DEC-058 settings; Authentication/security owner for membership/access;
  Release/configuration owner for non-Location runtime configuration.

**Exit criteria**

- Exact authorized Location and Shift context is current; effective typed
  configuration is freshly read; current domain guards allow continuation; and
  no history was rewritten.

**Evidence level / remaining gap**

- DOCUMENTED + STATIC/TABLETOP VERIFIED. No production Location/Shift or typed
  configuration mutation was performed.

### 5.9 Incident or custody ambiguity after outage/process failure

**Symptoms**

- A protected mutation was sent but its response was lost, the API/database
  failed, or Native was killed/backgrounded before publishing the outcome.
- Task, ValetSession, key/custody, Incident, handoff, payment, or release state
  shown before failure may now be stale.

**First safe checks**

1. Stop the affected mutation and physically contain any uncertain vehicle/key/
   release handling.
2. Do not issue the command again, generate a replacement operation ID, or
   reconstruct a lost proof/reason/body.
3. Restore authentication and current workspace, then use canonical reads from
   a fresh process/client owner.
4. For the DEC-077 Incident flow, use the existing in-app recovery result:
   `FOUND` is authoritative success; `RESERVED` is unresolved and blocks a new
   submission; `RETIRED` is definitive non-success for that ID; protocol-safe
   `UNKNOWN` means the reservation protocol was not established, not a generic
   claim that arbitrary legacy work cannot arrive. Recovery unavailable remains
   ambiguous. Cold start/reconnect never auto-reserves, auto-retires, or auto-
   posts. Retirement is an explicit foreground action by the original actor.

**Safe evidence to gather**

- Safe operation/outcome/request ID/error code/build fields; whether the failure
  was before response, response-lost, rollback, disconnect, or unknown if known;
  and bounded recovery outcome class. Do not collect the Incident description or
  command body.

**Forbidden evidence**

- Pickup/QR/handoff proof, payment material, Incident description, plate/key/
  customer data as diagnostics, raw command/response, database rows, or recovery
  marker/store content.

**Containment**

- No blind retry, manual DB/history repair, forced transition, AuditEvent
  deletion, proof re-use, or release based on the prior Native screen.

**Recovery / fallback**

- Rehydrate the exact command’s authority. Adopt a committed current state; if
  uncommitted, retry only when the command’s accepted policy and fresh authority
  explicitly permit it. For `ONLINE_ONLY` proof/override/release, the employee
  must be present online with current verification and guards.
- Employee Web may perform the same canonical read/recovery only when the backend
  is healthy and the Web flow supports it; Web does not inherit Native-local
  transient data.

**Authoritative verification**

- Always re-read Task status/owner/version and ValetSession state/version. As
  applicable also verify parking spot/key assignment and custody events,
  RetrievalRequest, Incident recovery state, current handoff verification,
  payment/validation/release eligibility, and append-only audit outcome through
  authorized application views. Do not query/alter raw tables as a support fix.

**Escalation**

- Operational / Location support owner immediately for physical ambiguity;
  API/backend owner for command/recovery behavior; database/infrastructure owner
  for service failure; Authentication/security owner for scope loss; and the
  owning flow specialist when proof/payment/provider state is involved.

**Exit criteria**

- Physical custody and canonical server state agree; every affected Task/session/
  key/payment/Incident fact is known through authorized reads; the prior command
  is reconciled; and any next action uses fresh authority/version/proof.

**Evidence level / remaining gap**

- DOCUMENTED + STATIC/TABLETOP VERIFIED. MOB-023B has extensive local command/
  PostgreSQL evidence recorded separately, but its physical process-death and
  representative full-shift evidence remains open. No physical drill occurred
  here.

### 5.10 Broken Native build or bad Native runtime configuration

**Symptoms**

- Crash/start failure, widespread client errors after installing a build,
  incorrect API environment/configuration, auth/camera/push behavior broken only
  on one build, or multiple devices with the same `appBuild` fail while Employee
  Web and backend reads remain healthy.

**First safe checks**

1. Stop affected Native mutations and capture the visible sanitized build/
   platform fields before restart when safe.
2. Prove the backend layer with authenticated Employee Web read/refetch and an
   unaffected approved client/network. Do not use a mutation as a health probe.
3. Compare affected `appVersion`/`appBuild`/`platform` and safe outcome classes.
4. For runtime configuration, record only expected key/class and presence/
   absence; never values. Do not invent a release channel or signing location.

**Safe evidence to gather**

- Minimum package from section 3; affected build/platform set; last known safe
  client class if actually verified; configuration presence/absence and bounded
  safe error class; no unsupported crash dump claim.

**Forbidden evidence**

- Secret configuration values, API/database/provider URLs carrying secrets,
  signing keys/certificates, Firebase credentials/tokens, raw logs/bodies, or
  secret-bearing screenshots.

**Containment**

- Mark the affected Native build/configuration unusable for the impacted cohort
  and stop further Native mutations. Do not attempt an improvised signing/
  distribution action or enable OTA; OTA is disabled for the initial pilot.

**Recovery / fallback**

- If and only if API/database authority remains healthy, switch the affected
  operators to Employee Web using section 5.11.
- Native/mobile and Release/configuration owners diagnose and correct the defect
  through later approved release work. This task defines no channel, build
  promotion, signing custody, or deployment command.

**Authoritative verification**

- On Web fallback and later Native restoration, authenticate normally, reload
  exact Location/Shift context, refetch Tasks and affected ValetSession/custody/
  payment state, and reconcile all ambiguous Native mutations.

**Escalation**

- Native/mobile owner and Release/configuration owner; add API/backend or
  Authentication/security owner when safe evidence shows those layers are also
  affected. Release ownership details remain open under U-006.

**Exit criteria**

- Either Employee Web is safely operating against a healthy backend with Native
  stopped, or a corrected approved Native build/configuration satisfies the
  switch-back criteria in section 5.11. No ambiguous mutation remains.

**Evidence level / remaining gap**

- DOCUMENTED + STATIC/TABLETOP VERIFIED. No broken-build simulation, runtime
  configuration mutation, crash/ANR collection, signed build, or device drill
  was performed.

### 5.11 Employee Web fallback and safe switch-back

**Symptoms**

- Local/device-only or Native-client-wide failure while authenticated canonical
  API/database reads remain healthy. Typical triggers are a broken Native build,
  Native runtime configuration defect, camera/permission limitation where Web
  supports the needed flow, or an unresolved Native-only lifecycle defect.

**First safe checks**

1. Confirm the failing layer is Native, not shared API/database authority, using
   authorized canonical reads on Employee Web and another approved path.
2. Identify and stop any ambiguous Native mutation before switching.
3. Confirm Employee Web is the canonical `apps/valet` client for the intended
   environment. It is not a WebView or an alternate/offline authority.

**Safe evidence to gather**

- Native build/platform and bounded diagnostics; proof class that Web canonical
  reads succeeded; affected operation/outcome; and switch time/cohort without
  customer details or secrets.

**Forbidden evidence**

- Any section 3 forbidden material. Never copy Native local drafts, proofs,
  tokens, images, request bodies, or internal storage into Web.

**Containment**

- Stop further Native mutations on affected devices. Keep Native stopped until
  the specific client/configuration defect is understood and switch-back
  criteria pass.

**Recovery / fallback**

Safe Web handoff:

1. Decide Native is unusable while canonical API/database authority is healthy.
2. Stop further Native mutations on the affected device.
3. Open the canonical Employee Web client — not a WebView.
4. Authenticate normally; do not transfer Native credentials.
5. Re-establish the correct Organization, Location, and Shift context.
6. Re-read current Tasks and affected ValetSession/key/custody state from the
   server; also read Incident and payment/release state where applicable.
7. Discard assumptions from the last Native screen. There is no Native-to-Web
   data migration/import.
8. Resume only from current canonical Web/server state and its authorized
   actions.
9. Record only the safe support correlation package.
10. Keep affected Native use stopped until the defect is resolved.

Web fallback cannot bypass authentication, Location access, Shift/Task
eligibility, custody, payment, handoff, or policy guards. It cannot solve an
API or database outage.

**Authoritative verification**

- Before first Web mutation, refresh current context, queue, affected
  ValetSession/version and custody. For release/handoff, verify live proof and
  payment/release state. Reconcile any Native unknown outcome first.

**Escalation**

- Operational / Location support owner coordinates handoff; Native/mobile owner
  owns the Native defect; API/backend owner confirms shared authority health;
  Release/configuration owner owns build/configuration concerns.

**Exit criteria**

- Web fallback: correct identity/Location/Shift and canonical operational state
  are current; backend is healthy; Native is stopped; no ambiguous mutation
  remains.
- Switch back to Native only when the specific defect/configuration is resolved,
  the correct `appVersion`/`appBuild` is confirmed, normal authentication works,
  correct Location/Shift context is restored, canonical Tasks/session/custody
  state is refreshed, and no ambiguous mutation remains. Stop Web mutations
  during the handoff, then resume only from freshly read Native/server state.

**Evidence level / remaining gap**

- DOCUMENTED + STATIC/TABLETOP VERIFIED. No real Web-fallback cohort drill was
  performed. Native-primary cutover remains MOB-027B and is deferred by owner
  direction.

### 5.12 Broken release and rollback boundary

**Symptoms**

- A distributed Native candidate has a reproducible hard-zero, operational,
  configuration, install/update, auth, camera, push, or workflow defect; or its
  build provenance/configuration is not trustworthy.

**First safe checks**

1. Stop expansion/use of the affected build and capture safe build/platform/
   operation correlation.
2. Determine whether backend authority remains healthy. If so, use Employee Web
   fallback; if not, use the API/database outage procedures.
3. Identify affected build/cohort and the last compatible signed build only from
   accepted release records when they exist. Do not guess a channel or artifact.

**Safe evidence to gather**

- Build/version/platform, bounded failures, affected cohort class, backend
  health class, and approved release evidence reference. No signing material.

**Forbidden evidence**

- Signing/upload keys, certificates, store/Firebase credentials, provider
  secrets, secret environment values, or raw release configuration.

**Containment**

- Stop use/expansion of the broken Native build and further ambiguous Native
  mutations. Preserve canonical server/audit history. OTA remains disabled for
  the initial pilot and must not be improvised as rollback.

**Recovery / fallback**

- Current accepted facts are deterministic native binaries, OTA disabled for the
  initial pilot, and organization-controlled signing/release ownership.
- Exact distribution channel, accountable release owner, signing custody,
  approved rollback artifact, and cohort are **OPEN — U-006 / deferred release
  ownership**.
- Actual signed distribution and rollback rehearsal belong to deferred
  MOB-026A/B. Until those inputs exist, contain with Employee Web when the
  backend is healthy; do not claim or execute an invented signed rollback.

**Authoritative verification**

- After any later approved rollback/install or current Web fallback, authenticate
  normally and re-read Location/Shift, Task, ValetSession, custody, Incident, and
  payment/release state. A binary downgrade never rolls back server truth.

**Escalation**

- Release/configuration owner and Native/mobile owner, with Operational /
  Location support owner coordinating field containment. Exact named ownership
  is **OPEN — U-006 / deferred release ownership**.

**Exit criteria**

- For current containment: affected Native use is stopped and healthy Employee
  Web operation is established, or operations remain safely paused.
- A signed rollback can be declared complete only after the later approved
  artifact/channel/custodian drill and canonical state verification. Current
  signed rollback status: **EVIDENCE OPEN**.

**Evidence level / remaining gap**

- DOCUMENTED + STATIC/TABLETOP VERIFIED for containment only. SIGNED ROLLBACK
  VERIFIED: not claimed. NOT PERFORMED — downstream operational evidence remains
  open. MOB-026A/B and MOB-027A/B remain deferred by owner direction.

## 6. Escalation matrix

Use role names, never invented people. An incident may require multiple owners.
The Operational / Location support owner remains the field coordinator; each
technical owner stays within their approved access and deployment process.

| Role | Primary trigger | Required safe evidence | Authorized outcome boundary |
| --- | --- | --- | --- |
| Operational / Location support owner | Physical/custody ambiguity, Location/Shift issue, client fallback coordination | Impact, observed time, client scope, safe correlation, whether mutations stopped | Coordinate field containment and Web handoff; no domain/DB repair |
| Native/mobile owner | Device-only, build, lifecycle, camera, local telemetry, Native auth presentation | Build/version/platform, safe classifications/outcomes, reproducibility class | Diagnose Native behavior; no server authority or ad hoc release |
| API/backend owner | Broad/partial API failure, command ambiguity, server error | Safe operations, request IDs/error codes/durations, read-vs-mutation scope | Restore approved API service and validate canonical reads; no manual state forcing |
| Database/infrastructure owner | DB connectivity/preflight/degradation, claim/finalization persistence | Safe dependency/preflight class and approved checklist references | Restore authoritative database/service via approved procedure; no table/history edits |
| Authentication/security owner | Definitive auth loss, disabled User, session revocation/replay, access boundary | Transient/definitive class, safe auth outcome/request ID, purge confirmation class | Follow accepted identity/account recovery; never request credentials |
| OCR/provider owner | OCR unconfigured/unavailable/timeout/region/provider failure | Provider-neutral outcome, duration, environment class, config presence/absence | Restore approved provider boundary where permitted; production stays fail-closed without shared guard |
| Push/provider owner | Registration/provider/config/result/backlog issue | Safe permission/registration/provider class and bounded aggregates | Follow DEC-075/current worker runbook; push remains attention-only |
| Release/configuration owner | Broken build, runtime config, signing/distribution/rollback concern | Build provenance, safe config presence/error class, cohort/impact | Contain current build; exact ownership/channel is OPEN under U-006 |

No matrix row grants a role access it does not already have. In particular, only
the current authorized Location Manager path may change DEC-058 Location
overrides; technical support role labels do not confer tenant application roles.

## 7. Documentation-level tabletop record

Each row was checked against current repository semantics for: (1) symptom
detection, (2) safe evidence, (3) containment, (4) recovery/fallback, (5)
canonical re-read, (6) recovery verification, (7) escalation, and (8) remaining
gap. “Verified” below means static/tabletop review only.

| Scenario | Detection | Safe evidence | Containment | Recovery/fallback | Canonical re-read and verification | Escalation | Evidence / remaining gap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| API outage/partial API | Verified | Bounded operation/request/error/build fields | Stop affected mutations | Restore/wait; Web only for Native-only failure | Context, Task, session, custody, payment/release as applicable | API; DB/auth as indicated | STATIC/TABLETOP VERIFIED; bounded local API interruption/recovery LOCAL COMMAND + RUNTIME VERIFIED; other outage paths open |
| Database outage/degradation | Verified | Safe dependency/preflight class | Stop both clients’ authoritative mutations | Restore authoritative DB; no Web bypass | Full affected state after service recovery | DB/infrastructure + API | STATIC/TABLETOP VERIFIED; no restore/outage drill |
| Authentication/revocation | Verified | Transient/definitive class, no credential | Preserve transient state or accept definitive purge | Retry transient; normal login after definitive loss | Identity, membership, Location, Shift, Task | Auth/security | STATIC/TABLETOP VERIFIED; no revocation/device drill |
| Network loss/reconnect | Verified | Network/operation/policy class | No queue, fake success, or replay | DEC-063 class procedure | Fresh versions/authority and affected domain state | Operations + Native/API | STATIC/TABLETOP VERIFIED; no disconnect drill |
| Camera failure | Verified | Permission/error/build only | Stop stale capture | Accepted manual/alternate path; no required-photo bypass | Current policy and workflow state | Native + Operations | STATIC/TABLETOP VERIFIED; no physical camera drill |
| OCR failure | Verified | Provider-neutral outcome only | Bound attempts; no fabricated plate | Manual plate/no-plate | Human confirmation + current continuation | OCR + Native/API | STATIC/TABLETOP VERIFIED; production OCR remains fail-closed |
| Push failure | Verified | Permission/channel/registration/provider class | Preserve queue; approved push disable only | Queue/refetch; bounded provider recovery | Current Task/ownership; domain unchanged by push | Push + Native/Release/API | STATIC/TABLETOP VERIFIED; no provider/device drill |
| Bad Location config/scope | Verified | Scope/status/key/effective class | Leave stale/wrong workspace | Authorized scope/Shift/config correction | Effective config plus operational state | Operations/authorized Manager/Auth | STATIC/TABLETOP VERIFIED; no config mutation |
| Incident/custody ambiguity | Verified | Safe operation/recovery class | Physical containment; no retry/DB edit | Command-specific recovery/DEC-077 | Task/session/key/Incident/payment/release | Operations + owning technical roles | STATIC/TABLETOP VERIFIED; physical/full-shift gap remains |
| Broken Native build/config | Verified | Build/platform/config presence class | Stop affected Native | Web if backend healthy; approved later repair | Full context and affected state | Native + Release | STATIC/TABLETOP VERIFIED; no broken-build drill |
| Employee Web fallback | Verified | Backend-read health + build correlation | Stop Native mutations | Ten-step same-backend handoff | Fresh Web context/state before action | Operations + Native/API | STATIC/TABLETOP VERIFIED; no cohort drill |
| Broken release/rollback | Verified | Build/cohort/backend class | Stop expansion/use | Web containment; future approved signed rollback | Server state after any client/build change | Release + Native/Operations | STATIC/TABLETOP VERIFIED; U-006 open; signed rollback EVIDENCE OPEN |

Except for the single API interruption/recovery path recorded below, every
scenario remains: **NOT PERFORMED — downstream operational evidence remains
open**. No Native device/UI path is RUNTIME VERIFIED, and nothing is PHYSICAL
VERIFIED or SIGNED ROLLBACK VERIFIED by MOB-024B.

## 8. Actual bounded test-cohort drill

**Identity and scope**

- Performed at operator-observed time `2026-09-13T16:07:17.514Z` on branch
  `codex/mob-024b-support-outage-runbooks` at
  `94904d70d2eba9e333b88344ac9f8c87debaccc9`.
- Cohort class: repository-guarded loopback development PostgreSQL plus the
  existing managed local API service. The repository local-development guard
  accepted the target before use. Current API artifacts were built from the
  tested SHA. Required non-secret Staff Push policy classes used the checked-in
  development defaults with intent creation and sending disabled; no
  repository or `.env` configuration file was changed.
- Scenario: Option A, one bounded development API interruption and recovery.
  This was read-only apart from normal test-staff authentication/session
  creation. No protected domain command, production resource, or real customer
  or vehicle was used.

**Precondition and safe evidence**

The healthy baseline returned `200` for authentication, operational context,
Task queue, vehicle directory, and the authorized ValetSession detail read. The
server proved one `VALET_EMPLOYEE` context with an ACTIVE Shift. The selected
synthetic custody-bearing record was a completed PARKING Task at version `5`, a
`PARKED` ValetSession at version `4`, and an assigned Key Slot. A read-only
runtime-role reconciliation counted two custody events and nine AuditEvents for
that session.

Only bounded correlations were retained:

- `mob024b-before-login`, `mob024b-before-context`,
  `mob024b-before-queue`, `mob024b-before-directory`, and
  `mob024b-before-session`;
- build/source evidence: exact tested Git SHA above; and
- platform class `local-development`. Native `appVersion`/`appBuild` from a
  running binary were not available because this was not a Native device drill.

No raw body, raw URL, token, credential, customer/guest field, plate, Key Slot
code/identifier, or domain identifier was recorded in this evidence.

**Failure, detection, and containment**

The operator stopped only the managed test API, then issued exactly one
authenticated Task-queue read. It failed in `12 ms` with the bounded evidence
`source=http`, `operation=task-queue`, `classification=network-failure`, and
`outcome=unknown`. No response existed, so `requestId` and `errorCode` were
correctly absent rather than fabricated.

No mutation was in flight or ambiguous. Protected mutation attempts were zero;
the failed read was not replayed while unavailable, no queue was created, and
no server-owned success was claimed.

**Restoration, authoritative re-read, and recovery verification**

The operator restarted the existing managed test API and waited for its health
read to return `200` (the seventh 250 ms probe). The cohort was then
re-authenticated normally. Correlations
`mob024b-after-login`, `mob024b-after-context`,
`mob024b-after-queue`, `mob024b-after-directory`, and
`mob024b-after-session` each accompanied successful authoritative reads.

The fresh context again proved the ACTIVE Shift. API reads and the independent
read-only runtime-role reconciliation proved all of the following unchanged:

- the same Task, `COMPLETED` at version `5`;
- the same ValetSession, `PARKED` at version `4`;
- the same assigned Key Slot;
- two custody events; and
- nine AuditEvents.

The API service remained active and returned `200` after the drill. Recovery
therefore passed without fabricated state, blind replay, direct database edit,
history repair, or protected domain mutation.

**Evidence level and limitations**

This exact path is **LOCAL COMMAND VERIFIED + RUNTIME VERIFIED** against the
running guarded local development cohort. It fulfills the MOB-024B bounded
test-cohort chain for representative API loss: detection, sanitized
build/request evidence, containment, service restoration, reauthentication,
context restoration, authoritative Task/ValetSession/key-custody re-read, and
recovery verification.

It does not promote any other scenario. Native UI/support-card behavior,
physical device/network switching, an ambiguous committed mutation, partial
endpoint failure, Employee Web fallback, database restore, auth revocation,
camera/OCR/push/provider failure, bad Location configuration, release rollback,
iOS, and production execution remain **NOT PERFORMED — downstream operational
evidence remains open**.

## 9. Platform separation

Shared and platform-neutral:

- API/database/auth authority and outage triage;
- DEC-063 reconnect/retry decisions;
- canonical Task/ValetSession/custody/payment/Incident rehydration;
- Employee Web fallback and switch-back;
- privacy firewall and safe telemetry vocabulary; and
- release containment and U-006 boundary.

Android-specific current considerations:

- Android camera and notification permission states;
- dedicated Android notification channel and OS/OEM/Doze suppression;
- Android Development Build/install behavior and the DEC-071 Android matrix;
- FCM is the current Android push provider adapter.

Future iOS considerations:

- iOS camera and notification permission/presentation equivalents;
- APNs provider adapter and token lifecycle;
- Keychain/process lifecycle and distribution/signing behavior; and
- same-source iOS configuration/build smoke required by later release work.

No iOS physical behavior, APNs delivery, Keychain recovery, distribution, or
signed install was tested or is claimed here.

## 10. Evidence and release honesty

Evidence vocabulary is strict:

- **DOCUMENTED** — the procedure is written;
- **STATIC/TABLETOP VERIFIED** — checked against repository authority/code
  without executing the failure;
- **LOCAL COMMAND VERIFIED** — a named local command actually ran; formatting and
  path checks do not prove an outage scenario;
- **RUNTIME VERIFIED** — observed in a running environment;
- **PHYSICAL VERIFIED** — performed on required physical hardware; and
- **SIGNED ROLLBACK VERIFIED** — a later approved signed rollback actually ran.

This task contributes documentation, tabletop proof, and the section 8 bounded
test-cohort drill to G7 but does **not** close G7. MOB-023B’s physical
process-death/full-shift evidence remains separately open as recorded in its
evidence file. MOB-024A also explicitly claims no runtime/device/physical/CI
crash or ANR evidence and provides no crash/ANR collector. The section 8 API
runtime evidence does not promote those gaps or any undrilled scenario.

Release ownership status is **OPEN — U-006 / deferred release ownership**.
Signed rollback status is **EVIDENCE OPEN**. Owner-deferred MOB-026A/B and
MOB-027A/B are not activated by this runbook.

## 11. Authority and implementation references

- [`AGENTS.md`](../../AGENTS.md)
- [`docs/00_SOURCE_OF_TRUTH.md`](../00_SOURCE_OF_TRUTH.md)
- [`docs/01_PRODUCT_SCOPE.md`](../01_PRODUCT_SCOPE.md)
- [`docs/04_VALET_SESSION_STATE_MACHINE.md`](../04_VALET_SESSION_STATE_MACHINE.md)
- [`docs/05_ENGINEERING_RULES.md`](../05_ENGINEERING_RULES.md)
- [`docs/06_SECURITY_AND_DATA_RULES.md`](../06_SECURITY_AND_DATA_RULES.md)
- [`docs/16_PRODUCTION_DATABASE_DEPLOYMENT_CHECKLIST.md`](../16_PRODUCTION_DATABASE_DEPLOYMENT_CHECKLIST.md)
- [`docs/20_EMPLOYEE_NATIVE_EXECUTION_PLAN.md`](../20_EMPLOYEE_NATIVE_EXECUTION_PLAN.md)
- [`docs/21_STAFF_PUSH_WORKER_OPERATIONS.md`](../21_STAFF_PUSH_WORKER_OPERATIONS.md)
- [`docs/decisions/DEC-058_PHASE7_TYPED_LOCATION_CONFIGURATION_AUTHORITY.md`](../decisions/DEC-058_PHASE7_TYPED_LOCATION_CONFIGURATION_AUTHORITY.md)
- [`docs/decisions/DEC-063_EMPLOYEE_OFFLINE_OPERATION_POLICY.md`](../decisions/DEC-063_EMPLOYEE_OFFLINE_OPERATION_POLICY.md)
- [`docs/decisions/DEC-071_MOBILE_PLATFORM_REPOSITORY_ARCHITECTURE.md`](../decisions/DEC-071_MOBILE_PLATFORM_REPOSITORY_ARCHITECTURE.md)
- [`docs/decisions/DEC-072_NATIVE_STAFF_AUTHENTICATION_ARCHITECTURE.md`](../decisions/DEC-072_NATIVE_STAFF_AUTHENTICATION_ARCHITECTURE.md)
- [`docs/decisions/DEC-073_NATIVE_PUSH_ARCHITECTURE.md`](../decisions/DEC-073_NATIVE_PUSH_ARCHITECTURE.md)
- [`docs/decisions/DEC-074_NATIVE_ASSISTIVE_PLATE_OCR_ANPR.md`](../decisions/DEC-074_NATIVE_ASSISTIVE_PLATE_OCR_ANPR.md)
- [`docs/decisions/DEC-075_STAFF_PUSH_OPERATIONAL_POLICY.md`](../decisions/DEC-075_STAFF_PUSH_OPERATIONAL_POLICY.md)
- [`docs/decisions/DEC-077_EMPLOYEE_INCIDENT_PROCESS_DEATH_RECOVERY.md`](../decisions/DEC-077_EMPLOYEE_INCIDENT_PROCESS_DEATH_RECOVERY.md)
- [`docs/reference/employee-native-mob-023b-evidence.md`](employee-native-mob-023b-evidence.md)
- [`docs/reference/employee-native-mob-024a-evidence.md`](employee-native-mob-024a-evidence.md)

`docs/14_PROJECT_STATUS.md` was read as informational only. Git and accepted
repository authority win over stale status text.
