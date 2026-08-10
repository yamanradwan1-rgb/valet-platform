# Requirements Traceability

Status: Reference bridge between approved product sources and implementation docs.

## Current approved product source

Latest approved product direction:

- VAYLET Founder & Product Blueprint v1.0 — August 2026
- repository-native bridge: `docs/15_BLUEPRINT_V1_REBASELINE.md`

Historical source:

- `docs/reference/Valet_Project_Concept_Arabic.pdf`

The historical concept remains useful for original intent but is superseded where Blueprint v1.0 or a later Accepted decision changes the contract.

## Blueprint v1.0 traceability

| Blueprint requirement | Project representation |
|---|---|
| B2B SaaS software-only base model | `00_SOURCE_OF_TRUTH.md`, DEC-010 |
| Primary ICP: valet operators with multi-location pain | `01_PRODUCT_SCOPE.md` |
| Multi-tenant Company/Location | `02_DOMAIN_MODEL.md`, `03_DATABASE_SCHEMA.md` |
| Guest without mandatory account/app | `01_PRODUCT_SCOPE.md`, DEC-002 |
| Phone -> WhatsApp/SMS secure link, QR fallback | Customer access/Notification modules, `01_PRODUCT_SCOPE.md` |
| Valet Employee app/web terminal | `apps/valet`, employee/task/session modules |
| Valet Supervisor | `OrganizationMembership` role contract, DEC-011 |
| Location Manager | tenant membership + location access |
| Company Admin | internal `ORG_ADMIN`, DEC-011 |
| Venue Client restricted visibility | approved actor; schema/access model explicitly deferred |
| VAYLET Super Admin | platform-level role; tenant membership prohibited; persistence deferred |
| Check-in lifecycle | `04_VALET_SESSION_STATE_MACHINE.md` CHECKING_IN/AWAITING_PARKING; locked `complete-check-in` command contract |
| Complete check-in authorization | VAL-004H implements active authenticated staff + same Organization + explicit Location access + ordinary `VALET_EMPLOYEE`/`VALET_SUPERVISOR`; active Shift is not required and completing actor may differ from checked-in actor |
| Complete check-in concurrency | VAL-004H locks the session, applies version-before-state error precedence and conditionally performs `CHECKING_IN -> AWAITING_PARKING` with exactly one version increment |
| Complete check-in Black Box | VAL-004H commits `VALET_SESSION_CHECK_IN_COMPLETED` atomically with the transition using the same database timestamp and safe state/version metadata only |
| Complete check-in retry boundary | Old-version retry returns `VERSION_CONFLICT`; refreshed-version retry returns `INVALID_STATE_TRANSITION`; neither replays mutation or audit, while transparent original-response replay remains deferred |
| Complete check-in Vehicle guard | VAL-004H accepts either the complete persisted known-plate triple or DEC-020 temporary-descriptor fallback and never mutates Vehicle identity |
| Intake session creation | VAL-004E internal command atomically creates optional minimal Customer, resolves/creates Vehicle and creates ValetSession exactly at `CHECKING_IN`, version 1; no controller/public API |
| Intake authorization | Target Location derives Organization; authenticated user derives active employee/supervisor membership with explicit Location access; active Shift is not required |
| Intake retry safety | Organization-scoped durable operation ID + normalized request fingerprint; exact retry returns the original session with no duplicate rows/audit, mismatched reuse returns `IDEMPOTENCY_CONFLICT` |
| Intake guest-access boundary | Required session fields hold an expired+revoked disabled marker with no bearer credential generated or returned; secure issuance remains VAL-004F |
| Guest access token security | VAL-004F uses 32 CSPRNG bytes encoded as base64url, returns raw only from successful issue/rotate, and stores only versioned SHA-256 with a fixed 24-hour server-owned expiry |
| Guest access rotation/revocation | Row-locked atomic issue/rotate/revoke; ordinary rotation cannot clear revocation, and explicit authorized `REISSUE_REVOKED` requires the exact previously observed persisted `revokedAt` optimistic-concurrency token so stale reissue cannot become valid after a concurrent revoke |
| Guest access resolution | Internal token-only resolver uses one non-disclosing invalid result and returns only session ID/state plus Vehicle make/model/color; no tenant/location/parking/key/staff/audit/token internals |
| Check-in API contract | VAL-004I dedicated staff routes invoke VAL-004E–H through strict shared Zod schemas; authority fields and generic session PATCH behavior are absent |
| Staff transport authentication | Injectable principal resolver with production default fail-closed; test-only opaque bearer mapping is isolated in integration tests; no `X-User-Id` shortcut |
| Guest HTTP access | `GET /v1/guest/session` accepts bearer only from Authorization and preserves the single non-disclosing invalid result and guest-safe projection; rate limiting remains later reliability work |
| Check-in HTTP correlation/errors | Every new response has a bounded/generated `X-Request-Id`; centralized stable errors include the same ID and redact internal failures |
| Check-in performance evidence | Exactly one safe monotonic operation metric per route; successful Complete Check-In may include persisted `created_at` to `checking_in_completed_at` elapsed time; 15–20 seconds remains a KPI, not a rejection threshold |
| Customer intake identity | Optional contact uses general E.164-compatible normalization; new operations create distinct minimal Customer rows because phone equality is not an approved reuse/merge policy |
| OCR/ANPR scan + confirm/edit + manual fallback | VAL-004D internal command persists only explicit human-confirmed/manual plate input; OCR/ANPR remains optional candidate provenance with no vendor integration, DEC-012 |
| No plate/unreadable fallback | VAL-004D internal command persists a bounded trimmed temporary descriptor and clears grouped plate fields; stable Vehicle UUID remains distinct, DEC-020 |
| Vehicle identity correction/concurrency | Explicit authorized correction through persisted ValetSession scope; Vehicle `updated_at` optimistic token rejects stale writes; DB partial unique index maps same-tenant collision to `VEHICLE_IDENTITY_CONFLICT`; no automatic merge |
| Vehicle identity Black Box | Vehicle mutation + one safe Vehicle-scoped AuditEvent commit atomically; event distinguishes confirmed-plate versus temporary-descriptor and set versus correction without plate/descriptor/OCR payload |
| Intake Vehicle resolution | Human-confirmed known plate reuses the same-Organization Vehicle under the existing partial unique index; temporary descriptor always creates a distinct Vehicle; no automatic merge |
| Condition check | VAL-004G adds authorized session-locked append/correction commands over VAL-004C ConditionNote persistence; completion permits zero notes and records the explicit condition marker without changing physical state/version |
| Photos optional by default/configurable required | VAL-004G implements typed Organization default -> nullable Location override evaluation, private CHECK_IN_CONDITION metadata registration and an exact-session current-policy guard; object upload/byte validation remain pending |
| Condition/photo concurrency and retry | ValetSession row locking serializes new evidence/completion; correction chains allow one direct successor, exact photo retries return one row/audit, and repeated completion preserves the first marker without another audit |
| Complete check-in condition guard | VAL-004H reuses the VAL-004G locked guard: marker required, ConditionNote optional, and current effective policy requires an exact-session photo only when configured |
| QR key slots | KeySlot + later KeyCustodyEvent |
| One active vehicle per key slot | DB partial-unique/integrity protection |
| Parking zones/spots | ParkingZone/ParkingSpot modules |
| Optional QR parking zone/spot | Parking task UX/configuration |
| Maps + task-scoped session tracking | Maps/GPS task, DEC-013 |
| Geofence/route events when configured | future Maps persistence task; privacy rules in `06_SECURITY_AND_DATA_RULES.md` |
| Hybrid Dispatch basic | Task/Dispatch lifecycle, DEC-014 |
| Supervisor reassignment | DispatchEvent + reason/audit when required |
| Vehicle request/queue | RetrievalRequest + Task/Dispatch |
| Duplicate request prevention | idempotency + one active request/task invariant |
| Canonical physical vehicle lifecycle | `04_VALET_SESSION_STATE_MACHINE.md`, DEC-015 |
| Secure Dynamic QR or 4-digit pickup code | HandoffVerification, DEC-016 |
| Supervisor handoff override | permission + reason + AuditEvent |
| Black Box timeline | AuditEvent + custody/task/payment/incident events |
| Append-only corrections | Audit/Black Box rule across domain/security docs; runtime DB enforcement remains an explicit Phase 2 security dependency from VAL-003P |
| Basic incident reporting | Incident entity/module |
| Evidence Lock / full ClaimShield | basic evidence integrity in MVP; full ClaimShield V2 |
| Customer Pays / Venue Pays | Payment `service_payer`; financial responsibility only, DEC-021 |
| No/full/partial validation | First-class superseding Validation history with one current row, DEC-021 |
| Tips | Payment `tip_amount` for cash/digital; distribution/payroll deferred, DEC-021 |
| Cash receipt/reconciliation | Append-only CashEntry receipt/adjustments; shift close/settlement deferred, DEC-021 |
| Digital payment callback retry safety | Payment creation idempotency + unique provider-event receipt, DEC-021 |
| Authorized partial/full refunds | Separate append-only Refund lifecycle + transactional aggregate guard, DEC-021 |
| Historical payment currency | Immutable Location-currency snapshot on Payment, DEC-021 |
| No raw PAN/CVV | `06_SECURITY_AND_DATA_RULES.md` |
| Configuration First | DEC-017 + Dashboard/configuration tasks |
| Company default -> Location override | DEC-017 |
| Location timezone/currency | `03_DATABASE_SCHEMA.md`, DEC-018 |
| Arabic/English + RTL/LTR | frontend design/implementation requirement |
| E.164 phones | DB/application normalization convention |
| Multi-country plate formats | VAL-004D deterministic Unicode NFKC/trim/case/separator normalization boundary; country-specific legal rules remain deferred |
| Offline-friendly employee actions | reliability/idempotency/offline phase; command-level retry boundaries start in Phase 2 |
| Reports + CSV/PDF export | Reporting/Dashboard scope |
| Basic subscription/admin controls | later sellable-MVP admin task |
| White label | configuration/commercial capability; advanced white label V2 |
| VAYLET Qualified | V2 deferred |
| ClaimShield full | V2 deferred |
| POS/PMS integrations | V2 unless specific pilot requires them |
| Enterprise SSO | later/enterprise deferred |
| Smart Key Vault/custom hardware | Enterprise deferred |
| Predictive/optimization AI | deferred until clean measured operational data, DEC-019 |
| Pilot measures baseline vs after | `01_PRODUCT_SCOPE.md` pilot validation |
| Full-shift paid-customer readiness | `AGENTS.md` core success criterion |

## Historical concept mapping still preserved

| Historical concept requirement | Current representation |
|---|---|
| Digital valet from arrival to release | `01_PRODUCT_SCOPE.md` + state machine |
| Three product surfaces | employee, guest/customer, dashboard apps |
| Parking/key traceability | controlled entities + custody/audit history |
| Bring My Car | RetrievalRequest + Dispatch + session transition |
| Secure handoff | Dynamic QR / pickup code + audited override |
| Chain of Custody | Black Box/AuditEvent + specialized custody events |
| Multi-location dashboard | Organization -> Location tenancy model |
| Fast check-in | speed-first UX; ~15–20 second normal path target when photos not required |
| Liability/audit concerns | security, evidence, incident and Black Box rules |

## Change rule

If implementation would contradict Blueprint v1.0, an Accepted decision, or the binding docs, stop and update the product contracts before coding.

Do not use this traceability file to silently fill gaps that the Blueprint does not specify. Explicitly unresolved details remain unresolved until a focused decision/task closes them.
