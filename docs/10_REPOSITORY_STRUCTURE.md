# Repository Structure

Status: Binding  
Version: 0.2

```text
valet-platform/
├── AGENTS.md
├── .github/
│   ├── workflows/
│   │   └── ci.yml
│   ├── ISSUE_TEMPLATE/
│   │   ├── feature_task.yml
│   │   ├── bug_report.yml
│   │   ├── decision_request.yml
│   │   └── config.yml
│   └── pull_request_template.md
├── CONTRIBUTING.md
├── README.md
├── PROJECT_TREE.txt
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── docker-compose.yml
├── .env.example
│
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── common/
│   │   │   └── modules/
│   │   │       ├── auth/
│   │   │       ├── organizations/
│   │   │       ├── locations/
│   │   │       ├── staff/
│   │   │       ├── shifts/
│   │   │       ├── customers/
│   │   │       ├── vehicles/
│   │   │       ├── valet-sessions/
│   │   │       ├── vehicle-photos/
│   │   │       ├── parking/
│   │   │       ├── keys/
│   │   │       ├── retrieval/
│   │   │       ├── handoff/
│   │   │       ├── notifications/
│   │   │       ├── payments/
│   │   │       ├── incidents/
│   │   │       ├── audit/
│   │   │       └── reporting/
│   │   └── test/
│   │
│   ├── valet/
│   │   └── src/
│   │       ├── app/
│   │       ├── features/
│   │       ├── components/
│   │       └── lib/
│   │
│   ├── customer/
│   │   └── src/
│   │       ├── app/
│   │       ├── features/
│   │       ├── components/
│   │       └── lib/
│   │
│   └── dashboard/
│       └── src/
│           ├── app/
│           ├── features/
│           ├── components/
│           └── lib/
│
├── packages/
│   ├── database/
│   │   └── prisma/
│   ├── contracts/
│   ├── ui/
│   ├── config/
│   └── testing/
│
├── infra/
│   ├── docker/
│   ├── nginx/
│   └── scripts/
│
└── docs/
    ├── reference/
    │   └── Valet_Project_Concept_Arabic.pdf
    ├── 00_SOURCE_OF_TRUTH.md
    ├── 01_PRODUCT_SCOPE.md
    ├── 02_DOMAIN_MODEL.md
    ├── 03_DATABASE_SCHEMA.md
    ├── 04_VALET_SESSION_STATE_MACHINE.md
    ├── 05_ENGINEERING_RULES.md
    ├── 06_SECURITY_AND_DATA_RULES.md
    ├── 07_DEFINITION_OF_DONE.md
    ├── 08_DECISIONS_LOG.md
    ├── 09_TECH_STACK.md
    ├── 10_REPOSITORY_STRUCTURE.md
    ├── 11_REQUIREMENTS_TRACEABILITY.md
    ├── 12_AGENT_EXECUTION_PLAN.md
    ├── 13_COLLABORATION_WORKFLOW.md
    ├── 14_PROJECT_STATUS.md
    └── 15_BLUEPRINT_V1_REBASELINE.md
```

The Founder & Product Blueprint v1.0 PDF is the newest approved product source supplied by the project owner. Until the binary PDF is committed under `docs/reference`, `docs/15_BLUEPRINT_V1_REBASELINE.md` is the repository-native implementation bridge.

## Current module ownership

### auth
Staff authentication, session/token lifecycle and guards.

### organizations
Organization/Company tenant boundary and Company-level defaults as typed configuration is introduced.

### locations
Physical operating Locations and Location-owned operational context such as timezone/currency plus approved typed policy overrides.

### staff
Organization memberships, roles and location access.

Current tenant membership roles are:

- `ORG_ADMIN`
- `LOCATION_MANAGER`
- `VALET_SUPERVISOR`
- `VALET_EMPLOYEE`

Venue Client and VAYLET Super Admin persistence are not to be invented inside this module without their dedicated accepted schema decisions.

### shifts
Employee shift lifecycle at a Location.

### customers
Minimal Guest/customer contact model and secure access relationship where implemented. No mandatory persistent customer account in sellable MVP.

### vehicles
Reusable vehicle identity with multi-country plate assumptions. OCR/ANPR remains assistive input with confirm/edit/manual fallback.

### valet-sessions
Core physical-custody aggregate and explicit legal state transitions.

Hybrid Dispatch assignment/acceptance/reassignment is not a ValetSession state.

### vehicle-photos
Private condition/evidence metadata and object-storage integration. Photo requirement is policy-driven and optional by default.

### parking
Parking Zones/Spots and occupancy/location rules. Exact Zone/Map persistence is introduced by focused tasks.

### keys
QR Key Slots and key-custody/location rules. Append-only custody-event persistence may be added in the focused Operations task.

### retrieval
RetrievalRequest lifecycle, duplicate-request protection and customer/staff request semantics.

Task assignment/reassignment belongs to a separate Dispatch/Task responsibility when that module is introduced; do not place assignment state in ValetSession or RetrievalRequest merely because a dedicated module does not exist yet.

### handoff
Dynamic one-time QR / 4-digit pickup-code verification, supervisor override controls and secure completion authorization.

### notifications
SMS/WhatsApp/email abstraction and delivery records.

### payments
Payment lifecycle and provider adapters. Focused later work may add validation, tips, cash reconciliation and refunds without putting those states into ValetSession.

### incidents
Operational exceptions/disputes and basic incident evidence integrity. Full ClaimShield remains later work.

### audit
Append-only Black Box/audit history.

### reporting
Read/query layer for operational Dashboard metrics/reports.

## Planned focused capabilities do not require premature folders

Blueprint v1.0 adds approved concepts such as:

- Hybrid Dispatch Task/DispatchEvent
- Maps/GPS/geofence tracking
- typed Configuration First policies
- Validation/Tip/CashReconciliation/Refund
- subscription/admin controls

Do not create empty speculative modules only to mirror the Blueprint list. Add/rename modules through focused implementation tasks when ownership/interfaces are concrete.

## Dependency rule

Modules may collaborate through explicit application/domain interfaces.

Do not create circular dependencies simply to make an implementation convenient.

UI apps call the API; they do not connect directly to PostgreSQL.

Provider-specific messaging/payment/maps/OCR/object-storage behavior should stay behind application boundaries/adapters where practical.
