# Repository Structure

Status: Binding  
Version: 0.1

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
    └── 13_COLLABORATION_WORKFLOW.md
```

## Module ownership

### auth
Staff authentication, token lifecycle and guards.

### organizations
Organization configuration and tenant boundary.

### locations
Physical operating locations and policies.

### staff
Memberships, roles and location access.

### shifts
Employee shift lifecycle.

### customers
Minimal guest/customer contact model.

### vehicles
Reusable vehicle identity.

### valet-sessions
Core aggregate and legal state transitions.

### vehicle-photos
Evidence metadata and object-storage integration.

### parking
Parking spots/zones and occupancy rules.

### keys
Key slots and custody/location rules.

### retrieval
Retrieval request/assignment lifecycle.

### handoff
OTP/verification and release authorization.

### notifications
SMS/WhatsApp/email abstraction.

### payments
Payment lifecycle and provider adapters.

### incidents
Operational exceptions/disputes.

### audit
Append-only operational evidence.

### reporting
Read/query layer for operational dashboard metrics.

## Dependency rule

Modules may collaborate through explicit application/domain interfaces.

Do not create circular dependencies simply to make an implementation convenient.

UI apps call the API; they do not connect directly to PostgreSQL.
