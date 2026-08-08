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
| Check-in lifecycle | `04_VALET_SESSION_STATE_MACHINE.md` CHECKING_IN/AWAITING_PARKING |
| OCR/ANPR scan + confirm/edit + manual fallback | DEC-012, Core Check-in task/provider adapter |
| No plate/unreadable fallback | Core Check-in requirement; persistence details explicitly unresolved before implementation |
| Condition check | ConditionNote/session intake contract |
| Photos optional by default/configurable required | VehiclePhoto + configured policy guard, DEC-012 |
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
| Append-only corrections | Audit/Black Box rule across domain/security docs |
| Basic incident reporting | Incident entity/module |
| Evidence Lock / full ClaimShield | basic evidence integrity in MVP; full ClaimShield V2 |
| Customer Pays / Venue Pays / full/partial validation | Payments/Validation focused task |
| Tips | financial model/reporting task |
| Cash reconciliation | Payments/reconciliation focused task |
| No raw PAN/CVV | `06_SECURITY_AND_DATA_RULES.md` |
| Configuration First | DEC-017 + Dashboard/configuration tasks |
| Company default -> Location override | DEC-017 |
| Location timezone/currency | `03_DATABASE_SCHEMA.md`, DEC-018 |
| Arabic/English + RTL/LTR | frontend design/implementation requirement |
| E.164 phones | DB/application normalization convention |
| Multi-country plate formats | Vehicle/input normalization rules |
| Offline-friendly employee actions | reliability/idempotency/offline phase |
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